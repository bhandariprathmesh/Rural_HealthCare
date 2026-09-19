import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';
import {
  initializeSosAlert,
  acceptSosAlert,
  declineSosAlert,
  cancelSosAlert,
  getSosAlertStatus,
  getDoctorSosInbox,
} from '../services/sosEscalation.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';

const authorizeEmergencySchema = z.object({
  sosAlertId: z.string().optional(),
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
  facilityId: z.string().optional(),
  location: z.string().min(1, 'Location is required'),
  targetedDoctorId: z.string().optional(),
  vitalsSnapshot: z.any().optional(),
});

/**
 * T3 Tier Emergency Access Authorization (Break-Glass Protocol)
 * Issues a 15-minute time-limited emergency JWT token and records immutable audit log.
 * Optionally links to an active SOS alert.
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
        sosAlertId: data.sosAlertId || null,
        patientHealthId: data.patientHealthId,
        doctorName: data.doctorName,
        facilityName: data.facilityName,
        scope: 'READ_EMERGENCY_SUMMARY',
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    const started = new Date().toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Validate facilityId to avoid FK constraint violation
    let resolvedFacilityId: string | null = null;
    if (data.facilityId) {
      const facilityExists = await prisma.facility.findUnique({ where: { id: data.facilityId } });
      resolvedFacilityId = facilityExists ? data.facilityId : null;
    }

    const logEntry = await prisma.emergencyAccessLog.create({
      data: {
        logCode,
        sosAlertId: data.sosAlertId || null,
        patientId: data.patientId || null,
        patientHealthId: data.patientHealthId,
        patientName: data.patientName,
        doctorId: data.doctorId || null,
        doctorName: data.doctorName,
        facilityId: resolvedFacilityId,
        facilityName: data.facilityName,
        reason: data.reason,
        note: data.note,
        started,
        duration: '15 min',
        records: data.records,
        status: 'Active',
      },
      include: {
        sosAlert: true,
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
 * Retrieve immutable Emergency Access Logs (with optional linked SOS alert)
 */
export async function getEmergencyLogs(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = await prisma.emergencyAccessLog.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        sosAlert: {
          select: {
            id: true,
            sosCode: true,
            status: true,
            fromName: true,
            role: true,
            location: true,
          },
        },
      },
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
 * T3 Tier SOS Alert Dispatch (ASHA / Worker / Patient triggers)
 * Initializes escalation roster, sets 90s deadline for Roster[0], logs NOTIFIED.
 *
 * TODO (Phase 2 — Capacitor): Add native SMS dual-dispatch fallback (T2),
 * encrypted SMS with HMAC (T1), and offline BLE mesh peer relay (T0).
 */
export async function dispatchSosAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createSosSchema.parse(req.body);

    const result = await initializeSosAlert({
      fromName: data.fromName,
      role: data.role,
      senderId: data.senderId || (req as any).user?.id,
      patientId: data.patientId,
      patientHealthId: data.patientHealthId,
      facilityId: data.facilityId,
      location: data.location,
      targetedDoctorId: data.targetedDoctorId,
      vitalsSnapshot: data.vitalsSnapshot,
    });

    res.status(201).json({
      success: true,
      message: `Emergency SOS alert dispatched. Assigned to ${result.currentResponder.name}.`,
      data: {
        ...result.alert,
        currentResponderName: result.currentResponder.name,
        hopNumber: 1,
        totalHops: result.rosterLength,
        secondsRemaining: result.secondsRemaining,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Doctor SOS Inbox
 * Returns alerts assigned to the current doctor or control room with live seconds left.
 */
export async function getDoctorSosInboxController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user;
    const isControlRoom = user?.role === 'ADMIN';

    // Doctor profile ID or User ID
    const doctorId = req.query.doctorId as string || user?.doctorProfile?.id;
    const userId = user?.id;

    const inbox = await getDoctorSosInbox(doctorId, userId, isControlRoom);

    res.status(200).json({
      success: true,
      data: inbox,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Atomic Accept SOS Alert by Doctor or Control Room
 * Second accepter receives 409 Conflict
 */
export async function acceptSosAlertController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const user = (req as any).user;
    const responderId = req.body.responderId || user?.doctorProfile?.id || user?.id || 'CONTROL_ROOM';
    const responderName = req.body.responderName || user?.fullName || user?.name || 'On-Duty Physician';

    const updated = await acceptSosAlert(id, responderId, responderName);

    res.status(200).json({
      success: true,
      message: `SOS alert accepted by ${responderName}.`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Doctor Declines SOS Alert -> Triggers immediate escalation to next doctor in roster
 */
export async function declineSosAlertController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const user = (req as any).user;
    const responderId = req.body.responderId || user?.doctorProfile?.id || user?.id || 'UNKNOWN';

    const updated = await declineSosAlert(id, responderId);

    res.status(200).json({
      success: true,
      message: 'SOS alert declined. Escalating to next responder...',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Worker Cancels SOS Alert
 */
export async function cancelSosAlertController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const updated = await cancelSosAlert(id);

    res.status(200).json({
      success: true,
      message: 'SOS alert cancelled.',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Status & Hop Info for a specific SOS Alert (polled every 5s by Worker)
 */
export async function getSosAlertStatusController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const statusData = await getSosAlertStatus(id);

    res.status(200).json({
      success: true,
      data: statusData,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieve active SOS alerts
 */
export async function getActiveSosAlerts(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const alerts = await prisma.sosAlert.findMany({
      where: {
        dismissed: false,
        status: { in: ['PENDING', 'ACCEPTED', 'SENT', 'NOTIFIED', 'AWAITING', 'ACKNOWLEDGED', 'DECLINED_ALL'] },
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
 * Legacy status update (for backward compatibility)
 */
export async function updateSosStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = String(req.params.id);
    const { status, respondingDoctorId } = req.body;

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
