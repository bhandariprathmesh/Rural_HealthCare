import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';
import { ReferralStatus, ReferralPriority, RiskLevel } from '@prisma/client';

const createReferralSchema = z.object({
  patientId: z.string().min(1, 'Patient identifier is required'),
  fromWorker: z.string().optional(),
  fromWorkerId: z.string().optional(),
  toPHC: z.string().optional(),
  toFacilityId: z.string().optional(),
  toDoctorId: z.string().optional(),
  reason: z.string().min(3, 'Clinical referral reason is required'),
  riskLevel: z
    .enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'low', 'moderate', 'high', 'critical'])
    .optional(),
  priority: z
    .enum(['ROUTINE', 'URGENT', 'EMERGENCY', 'routine', 'urgent', 'emergency'])
    .default('ROUTINE'),
  notes: z.string().optional(),
  aiSummary: z.string().optional(),
});

/**
 * List referrals scoped by the authenticated user's role and identity.
 * GET /api/v1/referrals
 */
export async function getReferrals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      throw new AppError('Authentication required to list referrals.', 401);
    }

    const status =
      typeof req.query.status === 'string'
        ? req.query.status.toUpperCase()
        : undefined;

    const priority =
      typeof req.query.priority === 'string'
        ? req.query.priority.toUpperCase()
        : undefined;

    const patientId =
      typeof req.query.patientId === 'string'
        ? req.query.patientId
        : undefined;

    const where: any = {};

    if (status && Object.values(ReferralStatus).includes(status as ReferralStatus)) {
      where.status = status as ReferralStatus;
    }

    if (priority && Object.values(ReferralPriority).includes(priority as ReferralPriority)) {
      where.priority = priority as ReferralPriority;
    }

    // Role-based scoping
    if (user.role === 'PATIENT') {
      // Patients see ONLY their own referrals
      where.OR = [
        { patient: { userId: user.id } },
        { patient: { phone: user.phone } },
      ];
    } else if (user.role === 'DOCTOR') {
      // Doctor sees:
      // 1. Incoming referrals directed to this doctor (toDoctorId)
      // 2. Incoming referrals directed to this doctor's facility (toFacilityId)
      // 3. Outgoing referrals created by this doctor (fromWorkerId = user.id)
      const docFilters: any[] = [
        ...(user.doctorId ? [{ toDoctorId: user.doctorId }] : []),
        ...(user.facilityId ? [{ toFacilityId: user.facilityId }] : []),
        { fromWorkerId: user.id },
      ];
      if (patientId) {
        where.AND = [
          { OR: [{ patientId }, { patient: { healthId: patientId } }] },
          { OR: docFilters },
        ];
      } else {
        where.OR = docFilters;
      }
    } else if (user.role === 'WORKER') {
      // Worker sees referrals created by this worker or for their assigned patients
      const workerFilters: any[] = [
        { fromWorkerId: user.id },
        ...(user.workerId ? [{ patient: { healthWorkerId: user.workerId } }] : []),
      ];
      if (patientId) {
        where.AND = [
          { OR: [{ patientId }, { patient: { healthId: patientId } }] },
          { OR: workerFilters },
        ];
      } else {
        where.OR = workerFilters;
      }
    } else if (user.role === 'ADMIN') {
      if (patientId) {
        where.OR = [
          { patientId },
          { patient: { healthId: patientId } },
        ];
      }
    }

    const referrals = await prisma.referral.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: {
          select: {
            id: true,
            healthId: true,
            name: true,
            nameHi: true,
            gender: true,
            age: true,
            bloodGroup: true,
            village: true,
            phone: true,
          },
        },
        toFacility: true,
        toDoctor: true,
      },
    });

    res.status(200).json({
      success: true,
      data: { referrals },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get referral by ID or referral code.
 * GET /api/v1/referrals/:id
 */
export async function getReferralById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = (req as any).user;

    const referral = await prisma.referral.findFirst({
      where: {
        OR: [
          { id },
          { referralCode: id },
        ],
      },
      include: {
        patient: true,
        toFacility: true,
        toDoctor: true,
      },
    });

    if (!referral) {
      throw new AppError(`Referral '${id}' not found`, 404);
    }

    // Patient role authorization check: cannot view other patients' referrals
    if (user && user.role === 'PATIENT') {
      const isOwner = referral.patient.userId === user.id || referral.patient.phone === user.phone;
      if (!isOwner) {
        throw new AppError('Access denied. You can only view your own referrals.', 403);
      }
    }

    res.status(200).json({
      success: true,
      data: { referral },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new clinical referral.
 * POST /api/v1/referrals
 */
export async function createReferral(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      throw new AppError('Authentication required to create a referral.', 401);
    }

    if (user.role === 'PATIENT') {
      throw new AppError(
        'Patients cannot create clinical referrals. Referrals must be initiated by an authorized healthcare provider (Doctor or ASHA).',
        403
      );
    }

    const input = createReferralSchema.parse(req.body);

    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { id: input.patientId },
          { healthId: input.patientId },
        ],
      },
    });

    if (!patient) {
      throw new AppError(
        `Patient '${input.patientId}' not found for referral`,
        404
      );
    }

    // Resolve Originating Provider (Doctor vs Health Worker)
    let resolvedWorkerId = user.id;
    let resolvedWorkerName = user.fullName || '';

    if (user.role === 'DOCTOR') {
      resolvedWorkerName = user.fullName
        ? (user.fullName.toLowerCase().startsWith('dr.') ? user.fullName : `Dr. ${user.fullName}`)
        : 'Doctor';
    } else if (user.role === 'WORKER') {
      resolvedWorkerName = user.fullName
        ? `${user.fullName} (ASHA)`
        : 'ASHA Health Worker';
    } else {
      resolvedWorkerName = input.fromWorker || user.fullName || 'Health Administrator';
    }

    // Resolve Destination Doctor (if specified)
    let resolvedToDoctorId: string | null = null;
    let targetDoctor: any = null;

    if (input.toDoctorId) {
      targetDoctor = await prisma.doctor.findFirst({
        where: {
          OR: [
            { id: input.toDoctorId },
            { name: { contains: input.toDoctorId, mode: 'insensitive' } },
          ],
        },
        include: { facility: true },
      });

      if (targetDoctor) {
        resolvedToDoctorId = targetDoctor.id;
      }
    }

    // Resolve Destination Facility & PHC Name
    let resolvedToFacilityId: string | null = null;
    let resolvedToPHC = input.toPHC || '';

    if (input.toFacilityId) {
      const facility = await prisma.facility.findFirst({
        where: {
          OR: [
            { id: input.toFacilityId },
            { hfrId: input.toFacilityId },
            { name: { contains: input.toFacilityId, mode: 'insensitive' } },
          ],
        },
      });

      if (facility) {
        resolvedToFacilityId = facility.id;
        resolvedToPHC = facility.name;
      } else {
        throw new AppError(
          `Selected destination facility '${input.toFacilityId}' not found`,
          404
        );
      }
    } else if (targetDoctor?.facility) {
      resolvedToFacilityId = targetDoctor.facility.id;
      resolvedToPHC = targetDoctor.facility.name;
    } else if (input.toPHC) {
      const facility = await prisma.facility.findFirst({
        where: {
          name: { contains: input.toPHC, mode: 'insensitive' },
        },
      });
      if (facility) {
        resolvedToFacilityId = facility.id;
        resolvedToPHC = facility.name;
      }
    }

    if (!resolvedToPHC && !resolvedToDoctorId) {
      throw new AppError(
        'Destination facility, PHC, or Doctor is required for referral',
        400
      );
    }

    if (!resolvedToPHC && targetDoctor) {
      resolvedToPHC = `${targetDoctor.name} (${targetDoctor.specialty || 'Specialist'})`;
    }

    // Generate Guaranteed Unique Referral Code
    let referralCode = '';
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 10) {
      attempts++;
      const timePart = Date.now().toString().slice(-4);
      const randSuffix = Math.floor(100 + Math.random() * 900);
      referralCode = `REF-2026-${timePart}-${randSuffix}`;
      const exists = await prisma.referral.findUnique({
        where: { referralCode },
      });
      if (!exists) {
        isUnique = true;
      }
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const resolvedRiskLevel =
      (input.riskLevel?.toUpperCase() as RiskLevel) ||
      patient.riskLevel ||
      RiskLevel.MODERATE;

    const referral = await prisma.referral.create({
      data: {
        referralCode,
        patientId: patient.id,
        patientName: patient.name,
        fromWorker: resolvedWorkerName,
        fromWorkerId: resolvedWorkerId,
        toPHC: resolvedToPHC,
        toFacilityId: resolvedToFacilityId,
        toDoctorId: resolvedToDoctorId,
        reason: input.reason,
        riskLevel: resolvedRiskLevel,
        priority: input.priority.toUpperCase() as ReferralPriority,
        status: ReferralStatus.PENDING,
        date: dateStr,
        notes: input.notes,
        aiSummary: input.aiSummary,
      },
      include: {
        patient: true,
        toFacility: true,
        toDoctor: true,
      },
    });

    // Write immutable DPDP audit trail for clinical referral dispatch
    await prisma.auditLog.create({
      data: {
        auditCode: `AUD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        patientId: patient.id,
        accessorName: resolvedWorkerName,
        accessorRole: user.role === 'DOCTOR' ? 'DOCTOR' : 'HEALTH_WORKER',
        organization: 'RuralCare Primary Health Network',
        action: 'REFERRAL_CREATED',
        dataAccessed: ['Clinical Referral', 'Vitals', 'Demographics'],
        timestamp: new Date().toISOString(),
        purpose: `Clinical referral dispatched: ${input.reason} -> ${resolvedToPHC}`,
      },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Referral order created and dispatched to receiving provider/facility.',
      data: { referral },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update referral status.
 * PATCH /api/v1/referrals/:id/status
 */
export async function updateReferralStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user) {
      throw new AppError('Authentication required.', 401);
    }
    if (user.role === 'PATIENT') {
      throw new AppError('Patients cannot update referral status.', 403);
    }

    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const { status, notes } = z
      .object({
        status: z.enum([
          'PENDING',
          'ACCEPTED',
          'IN_CONSULTATION',
          'REFERRED',
          'COMPLETED',
          'FOLLOW_UP',
          'pending',
          'accepted',
          'in-consultation',
          'referred',
          'completed',
          'follow-up',
        ]),
        notes: z.string().optional(),
      })
      .parse(req.body);

    const mappedStatus =
      status.replace('-', '_').toUpperCase() as ReferralStatus;

    const existing = await prisma.referral.findFirst({
      where: {
        OR: [
          { id },
          { referralCode: id },
        ],
      },
    });

    if (!existing) {
      throw new AppError(`Referral '${id}' not found`, 404);
    }

    const referral = await prisma.referral.update({
      where: { id: existing.id },
      data: {
        status: mappedStatus,
        notes: notes || existing.notes,
      },
      include: {
        patient: true,
        toFacility: true,
        toDoctor: true,
      },
    });

    // Write audit log entry
    await prisma.auditLog.create({
      data: {
        auditCode: `AUD-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        patientId: existing.patientId,
        accessorName: user.fullName || 'Attending Provider',
        accessorRole: user.role === 'DOCTOR' ? 'DOCTOR' : 'HEALTH_WORKER',
        organization: 'RuralCare Primary Health Network',
        action: 'REFERRAL_STATUS_UPDATED',
        dataAccessed: ['Referral Status'],
        timestamp: new Date().toISOString(),
        purpose: `Referral ${existing.referralCode} status updated to ${mappedStatus}`,
      },
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `Referral status updated to ${mappedStatus}`,
      data: { referral },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List available facilities for referral destination selection.
 * GET /api/v1/referrals/facilities
 */
export async function getReferralFacilities(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const facilities = await prisma.facility.findMany({
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: { facilities },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List available doctors/specialists for referral destination selection.
 * GET /api/v1/referrals/doctors
 */
export async function getReferralDoctors(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doctors = await prisma.doctor.findMany({
      include: { facility: true },
      orderBy: [{ isPreferred: 'desc' }, { name: 'asc' }],
    });

    res.status(200).json({
      success: true,
      data: { doctors },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List active healthcare workers for referral attribution.
 * GET /api/v1/referrals/workers
 */
export async function getReferralWorkers(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const workers = await prisma.worker.findMany({
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.status(200).json({
      success: true,
      data: { workers },
    });
  } catch (err) {
    next(err);
  }
}