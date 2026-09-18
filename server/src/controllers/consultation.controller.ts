import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';
import { RiskLevel } from '@prisma/client';

const createConsultationSchema = z.object({
  patientId: z.string().min(1, 'Patient ID or Health ID is required'),
  workerId: z.string().optional(),
  workerName: z.string().default('Meena Kumari (ASHA)'),
  doctorId: z.string().optional(),
  doctorName: z.string().optional(),
  facilityName: z.string().default('PHC Lunkaransar'),
  symptoms: z.array(z.string()).default([]),
  vitals: z.object({
    temperature: z.number().or(z.string()).optional(),
    bloodPressure: z.string().optional(),
    heartRate: z.number().or(z.string()).optional(),
    spo2: z.number().or(z.string()).optional(),
    weight: z.number().or(z.string()).optional(),
  }).passthrough().default({}),
  diagnosis: z.string().optional(),
  treatment: z.string().optional(),
  prescription: z.array(z.string()).default([]),
  notes: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'low', 'moderate', 'high', 'critical']).default('LOW'),
  referralStatus: z.string().default('none'),
  followUpDate: z.string().optional(),
});

/**
 * List consultations with optional filters.
 * GET /api/v1/consultations
 */
export async function getConsultations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;
    const doctorId = typeof req.query.doctorId === 'string' ? req.query.doctorId : undefined;
    const workerId = typeof req.query.workerId === 'string' ? req.query.workerId : undefined;

    const where: any = {};
    if (patientId) {
      where.OR = [
        { patientId },
        { patient: { healthId: patientId } },
      ];
    }
    if (doctorId) where.doctorId = doctorId;
    if (workerId) where.workerId = workerId;

    const consultations = await prisma.consultation.findMany({
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
          },
        },
        aiAssessments: true,
      },
    });

    res.status(200).json({
      success: true,
      data: { consultations },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get consultation by ID or code.
 * GET /api/v1/consultations/:id
 */
export async function getConsultationById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const consultation = await prisma.consultation.findFirst({
      where: {
        OR: [
          { id },
          { consultationCode: id },
        ],
      },
      include: {
        patient: true,
        aiAssessments: true,
      },
    });

    if (!consultation) {
      throw new AppError(`Consultation '${id}' not found`, 404);
    }

    res.status(200).json({
      success: true,
      data: { consultation },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new clinical consultation.
 * POST /api/v1/consultations
 */
export async function createConsultation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createConsultationSchema.parse(req.body);

    // Resolve patient by UUID or healthId
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { id: input.patientId },
          { healthId: input.patientId },
        ],
      },
    });

    if (!patient) {
      throw new AppError(`Patient '${input.patientId}' not found. Cannot create consultation.`, 404);
    }

    const consultationCode = `CON-2026-${Math.floor(100 + Math.random() * 900)}`;
    const normalizedRisk = input.riskLevel.toUpperCase() as RiskLevel;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    const consultation = await prisma.$transaction(async (tx) => {
      const con = await tx.consultation.create({
        data: {
          consultationCode,
          patientId: patient.id,
          date: dateStr,
          time: timeStr,
          workerId: input.workerId,
          workerName: input.workerName,
          doctorId: input.doctorId,
          doctorName: input.doctorName,
          facilityName: input.facilityName,
          symptoms: input.symptoms,
          vitals: (input.vitals || {}) as any,
          diagnosis: input.diagnosis,
          treatment: input.treatment,
          prescription: input.prescription,
          notes: input.notes,
          riskLevel: normalizedRisk,
          referralStatus: input.referralStatus,
          followUpDate: input.followUpDate,
        },
      });

      // Update patient's last consultation date and risk level
      await tx.patient.update({
        where: { id: patient.id },
        data: {
          lastConsultation: dateStr,
          riskLevel: normalizedRisk,
        },
      });

      return con;
    });

    res.status(201).json({
      success: true,
      message: 'Consultation recorded successfully in longitudinal health record.',
      data: { consultation },
    });
  } catch (err) {
    next(err);
  }
}

const updateConsultationSchema = z.object({
  diagnosis: z.string().optional(),
  treatment: z.string().optional(),
  prescription: z.array(z.string()).optional(),
  notes: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'low', 'moderate', 'high', 'critical']).optional(),
  referralStatus: z.string().optional(),
  followUpDate: z.string().optional(),
  doctorId: z.string().optional(),
  doctorName: z.string().optional(),
  symptoms: z.array(z.string()).optional(),
  vitals: z.record(z.any()).optional(),
});

/**
 * Update an existing consultation with doctor diagnosis, prescription, or status.
 * PATCH /api/v1/consultations/:id
 */
export async function updateConsultation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const input = updateConsultationSchema.parse(req.body);

    const existing = await prisma.consultation.findFirst({
      where: {
        OR: [{ id }, { consultationCode: id }],
      },
    });

    if (!existing) {
      throw new AppError(`Consultation '${id}' not found`, 404);
    }

    const updateData: any = {};
    if (input.diagnosis !== undefined) updateData.diagnosis = input.diagnosis;
    if (input.treatment !== undefined) updateData.treatment = input.treatment;
    if (input.prescription !== undefined) updateData.prescription = input.prescription;
    if (input.notes !== undefined) updateData.notes = input.notes;
    if (input.riskLevel !== undefined) updateData.riskLevel = input.riskLevel.toUpperCase() as RiskLevel;
    if (input.referralStatus !== undefined) updateData.referralStatus = input.referralStatus;
    if (input.followUpDate !== undefined) updateData.followUpDate = input.followUpDate;
    if (input.doctorId !== undefined) updateData.doctorId = input.doctorId;
    if (input.doctorName !== undefined) updateData.doctorName = input.doctorName;
    if (input.symptoms !== undefined) updateData.symptoms = input.symptoms;
    if (input.vitals !== undefined) updateData.vitals = input.vitals;

    const updated = await prisma.$transaction(async (tx) => {
      const con = await tx.consultation.update({
        where: { id: existing.id },
        data: updateData,
        include: {
          patient: true,
        },
      });

      if (updateData.riskLevel) {
        await tx.patient.update({
          where: { id: existing.patientId },
          data: { riskLevel: updateData.riskLevel },
        });
      }

      return con;
    });

    res.status(200).json({
      success: true,
      message: 'Consultation updated successfully in clinical record.',
      data: { consultation: updated },
    });
  } catch (err) {
    next(err);
  }
}

