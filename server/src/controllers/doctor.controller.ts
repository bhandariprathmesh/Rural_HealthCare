import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { hprService } from '../services/abdm/hpr.service.js';
import { AppError } from '../middleware/error.js';
import { Role, DutyStatus } from '@prisma/client';
import { AuthUserPayload, UserRole } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(payload: AuthUserPayload): string {
  // @ts-expect-error jsonwebtoken type compatibility
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

const registerDoctorSchema = z.object({
  fullName: z.string().min(2, 'Full Name must be at least 2 characters'),
  email: z.string().email('Invalid email address').optional(),
  phone: z.string().regex(/^[6-9]\d{9}$/, 'Invalid Indian mobile number (must be 10 digits starting with 6-9)'),
  pin: z.string().length(4, 'Security PIN must be exactly 4 digits'),
  hprId: z.string().min(3, 'Healthcare Professionals Registry (HPR) ID is required'),
  facilityId: z.string().min(2, 'Healthcare Facility selection is required'),
  specialty: z.string().optional(),
});

/**
 * Register and verify a doctor against ABDM HPR Registry.
 * POST /api/v1/doctors/register
 */
export async function registerDoctor(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = registerDoctorSchema.parse(req.body);

    // Check duplicate phone
    const existingUser = await prisma.user.findUnique({
      where: { phone: input.phone },
    });

    if (existingUser) {
      throw new AppError(`A user account is already registered with mobile number +91 ${input.phone}.`, 409);
    }

    // Check if HPR ID already registered as doctor
    const existingDoctor = await prisma.doctor.findUnique({
      where: { hprId: input.hprId },
    });

    if (existingDoctor) {
      throw new AppError(`A doctor is already registered in RuralCare with HPR ID '${input.hprId}'.`, 409);
    }

    // HPR Verification Flow
    const hprRecord = await hprService.getProfessionalById(input.hprId);

    if (!hprRecord) {
      throw new AppError(
        `Practitioner with HPR ID '${input.hprId}' could not be verified in the Healthcare Professionals Registry (HPR). Doctor registration rejected.`,
        422
      );
    }

    // Facility Association Validation
    const facility = await prisma.facility.findFirst({
      where: {
        OR: [
          { id: input.facilityId },
          { hfrId: input.facilityId },
          { name: { contains: input.facilityId, mode: 'insensitive' } },
        ],
      },
    });

    if (!facility) {
      throw new AppError(
        `Selected healthcare facility '${input.facilityId}' not found. Please choose an authorized PHC or CHC.`,
        400
      );
    }

    const pinHash = await bcrypt.hash(input.pin, 10);
    const resolvedSpecialty = input.specialty || hprRecord.specialties[0] || 'General Medicine';
    const email = input.email || `${input.phone}@ruralcare.local`;

    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          phone: input.phone,
          role: Role.DOCTOR,
          fullName: hprRecord.fullName || input.fullName,
          pinHash,
        },
      });

      // Create doctor profile
      const doctor = await tx.doctor.create({
        data: {
          userId: user.id,
          hprId: hprRecord.hprId,
          name: user.fullName,
          specialty: resolvedSpecialty,
          facilityId: facility.id,
          dutyStatus: DutyStatus.AVAILABLE,
          isPreferred: true,
          recommendationReasons: [
            'HPR Verified Practitioner',
            `Council Reg: ${hprRecord.registrationNumber}`,
            `Specialist in ${resolvedSpecialty}`,
          ],
        },
        include: {
          facility: true,
        },
      });

      // Link HPR record to Doctor
      await tx.mockHPRProfessional.update({
        where: { id: hprRecord.id },
        data: {
          linkedDoctorId: doctor.id,
        },
      });

      return { user, doctor };
    });

    // Issue JWT Token
    const payload: AuthUserPayload = {
      id: result.user.id,
      phone: input.phone,
      role: result.user.role as UserRole,
      fullName: result.user.fullName,
      doctorId: result.doctor.id,
      facilityId: result.doctor.facilityId,
    };

    const token = generateToken(payload);

    res.status(201).json({
      success: true,
      message: 'Doctor account created and verified against ABDM HPR Registry',
      data: {
        token,
        user: {
          id: result.user.id,
          phone: result.user.phone,
          role: result.user.role,
          fullName: result.user.fullName,
          email: result.user.email,
        },
        doctor: {
          id: result.doctor.id,
          hprId: result.doctor.hprId,
          name: result.doctor.name,
          specialty: result.doctor.specialty,
          facilityId: result.doctor.facilityId,
          facilityName: result.doctor.facility.name,
          qualification: hprRecord.qualification,
          registrationNumber: hprRecord.registrationNumber,
          registrationCouncil: hprRecord.registrationCouncil,
          verificationStatus: 'HPR_VERIFIED',
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List all doctors with their facility and duty status.
 * GET /api/v1/doctors
 */
export async function getDoctors(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const facilityId = typeof req.query.facilityId === 'string' ? req.query.facilityId : undefined;
    const specialty = typeof req.query.specialty === 'string' ? req.query.specialty : undefined;
    const dutyStatus = typeof req.query.dutyStatus === 'string'
      ? req.query.dutyStatus.toUpperCase()
      : undefined;

    const where: any = {};

    if (facilityId) where.facilityId = facilityId;

    if (specialty) {
      where.specialty = {
        contains: specialty,
        mode: 'insensitive',
      };
    }

    if (dutyStatus && ['AVAILABLE', 'BUSY', 'OFFLINE'].includes(dutyStatus)) {
      where.dutyStatus = dutyStatus as DutyStatus;
    }

    const doctors = await prisma.doctor.findMany({
      where,
      include: {
        facility: true,
        user: {
          select: {
            phone: true,
            active: true,
          },
        },
      },
      orderBy: {
        isPreferred: 'desc',
      },
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
 * Update doctor duty status.
 * PATCH /api/v1/doctors/:id/duty-status
 */
export async function updateDutyStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const rawInput = req.body.dutyStatus || req.body.status;
    const { status } = z.object({
      status: z.enum(['AVAILABLE', 'BUSY', 'OFFLINE', 'available', 'busy', 'offline']),
    }).parse({ status: rawInput });

    const normalizedStatus = status.toUpperCase() as DutyStatus;

    // Support updating by doctor ID or by userId
    let doctor = await prisma.doctor.findFirst({
      where: {
        OR: [{ id }, { userId: id }],
      },
    });

    if (!doctor) {
      throw new AppError(`Doctor '${id}' not found`, 404);
    }

    doctor = await prisma.doctor.update({
      where: { id: doctor.id },
      data: {
        dutyStatus: normalizedStatus,
      },
      include: {
        facility: true,
      },
    });

    res.status(200).json({
      success: true,
      message: `Duty status updated to ${normalizedStatus}`,
      data: { doctor },
    });
  } catch (err) {
    next(err);
  }
}