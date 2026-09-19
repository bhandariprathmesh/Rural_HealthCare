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
 * List referrals with optional filtering.
 * GET /api/v1/referrals
 */
export async function getReferrals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
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

    const fromWorkerId =
      typeof req.query.fromWorkerId === 'string'
        ? req.query.fromWorkerId
        : typeof req.query.workerId === 'string'
          ? req.query.workerId
          : undefined;

    const fromWorker =
      typeof req.query.fromWorker === 'string'
        ? req.query.fromWorker
        : undefined;

    const where: any = {};

    if (status && Object.values(ReferralStatus).includes(status as ReferralStatus)) {
      where.status = status as ReferralStatus;
    }

    if (
      priority &&
      Object.values(ReferralPriority).includes(priority as ReferralPriority)
    ) {
      where.priority = priority as ReferralPriority;
    }

    if (patientId) {
      where.OR = [
        { patientId },
        { patient: { healthId: patientId } },
      ];
    }

    if (fromWorkerId) {
      where.fromWorkerId = fromWorkerId;
    }

    if (fromWorker) {
      where.fromWorker = {
        contains: fromWorker,
        mode: 'insensitive',
      };
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
        if (!resolvedToPHC) {
          resolvedToPHC = facility.name;
        }
      } else {
        throw new AppError(
          `Selected destination facility '${input.toFacilityId}' not found`,
          404
        );
      }
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

    if (!resolvedToPHC) {
      throw new AppError(
        'Destination facility or PHC is required for referral',
        400
      );
    }

    // Resolve Originating Health Worker / ASHA
    let resolvedWorkerId: string | null = null;
    let resolvedWorkerName = input.fromWorker || '';

    if (input.fromWorkerId) {
      const worker = await prisma.worker.findFirst({
        where: {
          OR: [
            { id: input.fromWorkerId },
            { userId: input.fromWorkerId },
            { workerCode: input.fromWorkerId },
          ],
        },
        include: { user: true },
      });

      if (worker) {
        resolvedWorkerId = worker.userId || worker.user?.id || null;
        if (!resolvedWorkerName) {
          resolvedWorkerName = worker.name;
        }
      } else {
        const user = await prisma.user.findUnique({
          where: { id: input.fromWorkerId },
        });
        if (user) {
          resolvedWorkerId = user.id;
          if (!resolvedWorkerName) {
            resolvedWorkerName = user.fullName;
          }
        }
      }
    }

    if (!resolvedWorkerName) {
      const defaultWorker = await prisma.worker.findFirst({
        include: { user: true },
      });
      if (defaultWorker) {
        resolvedWorkerName = defaultWorker.name;
        resolvedWorkerId = defaultWorker.userId;
      } else {
        resolvedWorkerName = 'Meena Kumari (ASHA)';
      }
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
        toDoctorId: input.toDoctorId || null,
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

    res.status(201).json({
      success: true,
      message: 'Referral order created and dispatched to receiving facility.',
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
      },
    });

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