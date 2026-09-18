import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';

const authorizeEmergencySchema = z.object({
  patientId: z.string().optional(),
  patientHealthId: z.string().min(1, 'Patient Health ID or Temp ID is required'),
  patientName: z.string().min(1, 'Patient Name is required'),
  doctorId: z.string().optional(),
  doctorName: z.string().min(1, 'Doctor Name is required'),
  facilityId: z.string().optional(),
  facilityName: z.string().min(1, 'Facility Name is required'),
  reason: z.string().min(1, 'Emergency reason is required'),
  note: z.string().min(1, 'Clinical note is required'),
  records: z.string().optional().default('Emergency Medical Summary, Vitals'),
});

const createSosSchema = z.object({
  fromName: z.string().min(1, 'Sender name is required'),
  role: z.string().min(1, 'Role is required'),
  senderId: z.string().optional(),
  patientId: z.string().optional(),
  patientHealthId: z.string().min(1, 'Patient ID is required'),
  location: z.string().min(1, 'Location is required'),
  targetedDoctorId: z.string().optional(),
});

/**
 * T3 Tier Emergency Access Authorization (Break-Glass Protocol)
 * Issues a 15-minute time-limited emergency JWT token and records immutable audit log.
 *
 * NOTE: T2 (SMS parallel race), T1 (2G encrypted SMS), T0 (Bluetooth relay),
 * and LoRa radio relay are reserved for Phase 2 — Capacitor native implementation.
 */
export async function authorizeEmergencyAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = authorizeEmergencySchema.parse(req.body);

    const logCode = `EAL-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    // Issue 15-minute temporary emergency session token
    const emergencyToken = jwt.sign(
      {
        accessType: 'BREAK_GLASS_EMERGENCY',
        logCode,
        patientHealthId: data.patientHealthId,
        doctorName: data.doctorName,
        facilityName: data.facilityName,
        scope: 'READ_EMERGENCY_SUMMARY',
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Persist immutable audit log entry in PostgreSQL
    const started = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const logEntry = await prisma.emergencyAccessLog.create({
      data: {
        logCode,
        patientId: data.patientId || null,
        patientHealthId: data.patientHealthId,
        patientName: data.patientName,
        doctorId: data.doctorId || null,
        doctorName: data.doctorName,
        facilityId: data.facilityId || null,
        facilityName: data.facilityName,
        reason: data.reason,
        note: data.note,
        started,
        duration: '15 min',
        records: data.records,
        status: 'Active',
      },
    });

    res.status(201).json({
      success: true,
      message: 'Emergency break-glass access authorized. Valid for 15 minutes.',
      data: {
        token: emergencyToken,
        expiresInSeconds: 900,
        log: logEntry,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve immutable Emergency Access Logs
 */
export async function getEmergencyLogs(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = await prisma.emergencyAccessLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * T3 Tier SOS Alert Dispatch
 * Creates an urgent SOS notification record in PostgreSQL.
 *
 * TODO (Phase 2 — Capacitor): Add native SMS dual-dispatch fallback (T2) and
 * offline Bluetooth peer relay (T0) when native Android APIs become available.
 */
export async function dispatchSosAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSosSchema.parse(req.body);
    const sosCode = `SOS-2026-${Date.now().toString().slice(-6)}`;

    const alert = await prisma.sosAlert.create({
      data: {
        sosCode,
        fromName: data.fromName,
        role: data.role,
        senderId: data.senderId || null,
        patientId: data.patientId || null,
        patientHealthId: data.patientHealthId,
        location: data.location,
        ts: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        status: 'SENT',
        targetedDoctorId: data.targetedDoctorId || null,
        timeoutSeconds: 90,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Emergency SOS alert dispatched successfully (T3 Tier)',
      data: alert,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve active SOS alerts for on-duty medical officers
 */
export async function getActiveSosAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alerts = await prisma.sosAlert.findMany({
      where: {
        dismissed: false,
        status: { in: ['SENT', 'NOTIFIED', 'AWAITING', 'ACKNOWLEDGED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.status(200).json({
      success: true,
      data: alerts,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Acknowledge or Decline an SOS alert
 */
export async function updateSosStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { status, respondingDoctorId } = req.body;

    if (!['ACKNOWLEDGED', 'DECLINED', 'DISMISSED'].includes(status)) {
      throw new AppError('Invalid status update', 400);
    }

    const updated = await prisma.sosAlert.update({
      where: { id },
      data: {
        status: status as any,
        dismissed: status === 'DISMISSED',
        respondingDoctorId: respondingDoctorId || null,
      },
    });

    res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}
