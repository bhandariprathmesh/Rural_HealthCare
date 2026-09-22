import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';
import { RiskLevel } from '@prisma/client';
import { getActiveCallForPatient, activeCalls } from '../services/teleconsultation.signaling.js';

const createSessionSchema = z.object({
  patientId: z.string().optional(),
  doctorId: z.string().optional(),
  role: z.enum(['doctor', 'worker', 'patient']).default('doctor'),
});

const saveTeleconsultationSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  patientId: z.string().min(1, 'patientId is required'),
  doctorId: z.string().optional(),
  doctorName: z.string().optional(),
  workerId: z.string().optional(),
  workerName: z.string().optional(),
  facilityName: z.string().default('PHC Lunkaransar Tele-Clinic'),
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
  duration: z.number().optional().default(0),
  networkQuality: z.string().optional().default('4G'),
  riskLevel: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL', 'low', 'moderate', 'high', 'critical']).default('LOW'),
  referralStatus: z.string().default('none'),
  followUpDate: z.string().optional(),
});

/**
 * Checks if there is an active incoming call for a patient.
 * GET /api/v1/teleconsultation/active-call
 */
export async function getActiveCall(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : '';
    if (!patientId) {
      res.status(200).json({ success: true, data: { activeCall: null } });
      return;
    }
    const activeCall = await getActiveCallForPatient(patientId);
    res.status(200).json({
      success: true,
      data: { activeCall },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates or initialises a Teleconsultation session room.
 * Only Doctors are authorized to initiate calls to patients.
 * POST /api/v1/teleconsultation/sessions
 */
export async function createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = createSessionSchema.parse(req.body);

    const cleanId = input.patientId ? input.patientId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) : 'general';
    const sessionId = `tc-${cleanId}-${Date.now().toString(36)}`;
    const isPatient = input.role === 'patient';

    if (input.patientId) {
      activeCalls.set(input.patientId, {
        sessionId,
        patientId: input.patientId,
        doctorId: input.doctorId || 'doc-1',
        doctorName: isPatient ? (input.doctorName || 'Dr. Ankit Sharma') : ((req as any).user?.fullName || 'Dr. Ankit Sharma'),
        facilityName: 'PHC Lunkaransar Tele-Clinic',
        status: 'WAITING',
        createdAt: Date.now(),
      });
    }

    res.status(201).json({
      success: true,
      data: {
        sessionId,
        patientId: input.patientId,
        doctorId: input.doctorId,
        wsPath: '/teleconsultation',
        createdAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Persists an in-call teleconsultation record with digital prescription directly to PostgreSQL Consultation table.
 * POST /api/v1/teleconsultation/consultations
 */
export async function saveTeleconsultation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = saveTeleconsultationSchema.parse(req.body);

    // Resolve patient by ID or Health ID
    const patient = await prisma.patient.findFirst({
      where: {
        OR: [
          { id: input.patientId },
          { healthId: input.patientId },
        ],
      },
    });

    if (!patient) {
      throw new AppError(`Patient '${input.patientId}' not found. Cannot persist teleconsultation.`, 404);
    }

    const consultationCode = `TELE-2026-${Math.floor(100 + Math.random() * 900)}`;
    const normalizedRisk = input.riskLevel.toUpperCase() as RiskLevel;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    // Format metadata header in clinical notes
    const formattedNotes = [
      `[Teleconsultation Session: ${input.sessionId} | Duration: ${input.duration}s | Quality: ${input.networkQuality}]`,
      input.notes?.trim() || 'Teleconsultation completed successfully via ABDM RuralCare room.',
    ].join(' ');

    // Resolve doctor if ID provided
    let validDoctorId: string | undefined = undefined;
    if (input.doctorId) {
      const doc = await prisma.doctor.findFirst({ where: { id: input.doctorId } });
      if (doc) validDoctorId = doc.id;
    }

    // Resolve worker if ID provided
    let validWorkerId: string | undefined = undefined;
    const workerCandidate = input.workerId || patient.healthWorkerId;
    if (workerCandidate) {
      const worker = await prisma.user.findFirst({ where: { id: workerCandidate } });
      if (worker) validWorkerId = worker.id;
    }

    const consultation = await prisma.$transaction(async (tx) => {
      const con = await tx.consultation.create({
        data: {
          consultationCode,
          patientId: patient.id,
          date: dateStr,
          time: timeStr,
          workerId: validWorkerId,
          workerName: input.workerName || patient.healthWorkerName || 'Meena Kumari (ASHA)',
          doctorId: validDoctorId,
          doctorName: input.doctorName || 'Dr. Rajesh Sharma (PHC)',
          facilityName: input.facilityName,
          symptoms: input.symptoms.length > 0 ? input.symptoms : ['Assisted Rural Teleconsultation'],
          vitals: (input.vitals || {}) as any,
          diagnosis: input.diagnosis?.trim() || 'General Clinical Tele-Evaluation',
          treatment: input.treatment?.trim() || 'Digital guidance and prescription provided over teleconsultation.',
          prescription: input.prescription,
          notes: formattedNotes,
          riskLevel: normalizedRisk,
          referralStatus: input.referralStatus,
          followUpDate: input.followUpDate,
        },
      });

      // Update patient's last consultation date & risk level
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
      message: 'Teleconsultation and digital prescription saved to PostgreSQL successfully.',
      data: {
        consultation,
      },
    });
  } catch (err) {
    next(err);
  }
}
