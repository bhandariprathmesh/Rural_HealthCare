import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { Prisma, Role, ConsentStatus, RiskLevel, ReferralStatus } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { abhaService } from '../services/abdm/abha.service.js';
import { AppError } from '../middleware/error.js';
import { checkPatientAccess, isScopePermitted } from '../services/accessControl.service.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';

function generateHealthId(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

  let randomPart = '';

  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return `RHC-${new Date().getFullYear()}-${randomPart}`;
}

async function generateUniqueHealthId(): Promise<string> {
  let healthId = '';
  let exists = true;
  let attempts = 0;

  while (exists && attempts < 10) {
    attempts++;

    healthId = generateHealthId();

    const found = await prisma.patient.findUnique({
      where: { healthId },
    });

    if (!found) {
      exists = false;
    }
  }

  return healthId;
}

function calculateAge(
  dobString: string,
  fallbackAge?: number
): number {
  if (fallbackAge && fallbackAge > 0) {
    return fallbackAge;
  }

  const birth = new Date(dobString);

  if (isNaN(birth.getTime())) {
    return 0;
  }

  const today = new Date();

  let age =
    today.getFullYear() -
    birth.getFullYear();

  const monthDifference =
    today.getMonth() -
    birth.getMonth();

  if (
    monthDifference < 0 ||
    (
      monthDifference === 0 &&
      today.getDate() < birth.getDate()
    )
  ) {
    age--;
  }

  return Math.max(0, age);
}

const registerPatientSchema = z.object({
  name: z.string().min(2, 'Full Name must be at least 2 characters'),
  nameHi: z.string().optional(),

  dob: z.string().min(4, 'Date of Birth is required'),

  age: z.number().int().positive().optional(),

  gender: z.enum([
    'M',
    'F',
    'O',
    'Male',
    'Female',
    'Other',
    'm',
    'f',
    'o',
    'male',
    'female',
    'other',
  ]).default('Female'),

  bloodGroup: z.string().optional(),

  phone: z
    .string()
    .regex(
      /^[6-9]\d{9}$/,
      'Invalid Indian mobile number (must be 10 digits starting with 6-9)'
    ),

  village: z.string().min(2, 'Village is required'),

  district: z.string().min(2, 'District is required'),

  state: z.string().min(2, 'State is required'),

  address: z.string().optional(),

  emergencyContact: z
    .object({
      name: z.string().optional(),
      relation: z.string().optional(),
      phone: z.string().optional(),
    })
    .optional()
    .nullable()
    .transform((val) => {
      if (!val || (!val.name?.trim() && !val.phone?.trim())) return undefined;
      return val;
    }),

  allergies: z.array(z.string()).optional(),

  chronicConditions: z.array(z.string()).optional(),

  currentMedications: z.array(z.string()).optional(),

  pin: z.string().min(4, 'PIN must be at least 4 digits').optional().default('1234'),

  abhaAddress: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() ? val.trim() : undefined)),

  abhaNumber: z
    .string()
    .optional()
    .nullable()
    .transform((val) => (val && val.trim() ? val.trim() : undefined)),

  healthWorkerId: z.string().optional(),

  healthWorkerName: z.string().optional(),

  consent: z
    .object({
      granted: z.boolean().default(true),
      purpose: z.string().optional(),
      dataScope: z.array(z.string()).optional(),
    })
    .default({ granted: true }),
});

/**
 * Register a new patient with ABDM ABHA verification / creation workflow.
 * POST /api/v1/patients/register
 */
export async function registerPatient(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = registerPatientSchema.parse(req.body);

    const normalizedGender =
      input.gender === 'Male'
        ? 'M'
        : input.gender === 'Female'
          ? 'F'
          : input.gender === 'Other'
            ? 'O'
            : input.gender;

    const existingPatientByPhone =
      await prisma.patient.findFirst({
        where: {
          phone: input.phone,
        },
      });

    if (existingPatientByPhone) {
      throw new AppError(
        `A patient is already registered with mobile number +91 ${input.phone}. Health ID: ${existingPatientByPhone.healthId}`,
        409
      );
    }

    let finalAbhaAddress: string | null = null;
    let finalAbhaNumber: string | null = null;

    let abhaSource:
      | 'existing'
      | 'mock-created' = 'mock-created';

    let verifiedAbhaProfile: any = null;

    if (
      input.abhaAddress &&
      input.abhaAddress.trim()
    ) {
      const cleanAbha =
        input.abhaAddress
          .trim()
          .toLowerCase();

      const duplicateAbha =
        await prisma.patient.findFirst({
          where: {
            OR: [
              { abhaAddress: cleanAbha },
              { abhaNumber: cleanAbha },
            ],
          },
        });

      if (duplicateAbha) {
        throw new AppError(
          'This ABHA is already linked to an existing patient account.',
          409
        );
      }

      const verification =
        await abhaService.verifyAbhaAddress(
          cleanAbha
        );

      if (!verification.exists) {
        throw new AppError(
          `ABHA address '${cleanAbha}' not found in ABDM registry. You can create a new mock ABHA instead.`,
          404
        );
      }

      verifiedAbhaProfile =
        await abhaService.getProfileById(
          cleanAbha
        );

      finalAbhaAddress =
        verifiedAbhaProfile?.abhaAddress ||
        cleanAbha;

      finalAbhaNumber =
        verifiedAbhaProfile?.abhaNumber ||
        null;

      abhaSource = 'existing';
    } else {
      const newMockProfile =
        await abhaService.createMockProfile({
          fullName: input.name,
          fullNameHi: input.nameHi,
          gender: normalizedGender,
          dob: input.dob,
          mobile: `+91 ${input.phone}`,
          address:
            input.address ||
            input.village,
          village: input.village,
          district: input.district,
          state: input.state,
          pincode: '412205',
        });

      finalAbhaAddress =
        newMockProfile.abhaAddress;

      finalAbhaNumber =
        newMockProfile.abhaNumber;

      abhaSource = 'mock-created';

      verifiedAbhaProfile =
        newMockProfile;
    }

    const healthId =
      await generateUniqueHealthId();

    const age =
      calculateAge(
        input.dob,
        input.age
      );

    const now = new Date();

    const registeredAtDateStr =
      now.toLocaleDateString(
        'en-GB',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }
      );

    const timestampStr =
      now.toISOString();

    const callerUser = (req as any).user;
    let assignedWorkerId = input.healthWorkerId;
    let assignedWorkerName = input.healthWorkerName;

    if (callerUser && (callerUser.role === 'WORKER' || callerUser.workerId)) {
      if (!assignedWorkerId && callerUser.workerId) {
        assignedWorkerId = callerUser.workerId;
      }
      if (!assignedWorkerName && callerUser.fullName) {
        assignedWorkerName = callerUser.fullName;
      }
    }

    if (assignedWorkerId && !assignedWorkerName) {
      const w = await prisma.worker.findUnique({ where: { id: assignedWorkerId } });
      if (w) assignedWorkerName = w.name;
    } else if (!assignedWorkerId && assignedWorkerName) {
      const w = await prisma.worker.findFirst({
        where: { name: { contains: assignedWorkerName, mode: 'insensitive' } },
      });
      if (w) assignedWorkerId = w.id;
    }

    const pin = input.pin || '1234';

    const result =
      await prisma.$transaction(
        async (tx) => {
          const pinHash = await bcrypt.hash(pin, 10);
          const defaultEmail = `${input.phone}@ruralcare.in`;

          let user = await tx.user.findFirst({
            where: { phone: input.phone },
          });

          if (!user) {
            const existingEmail = await tx.user.findUnique({ where: { email: defaultEmail } });
            const finalEmail = existingEmail
              ? `patient.${Date.now()}.${input.phone}@ruralcare.in`
              : defaultEmail;

            user = await tx.user.create({
              data: {
                email: finalEmail,
                phone: input.phone,
                fullName: input.name,
                role: Role.PATIENT,
                pinHash,
                passwordHash: pinHash,
              },
            });
          } else {
            user = await tx.user.update({
              where: { id: user.id },
              data: {
                fullName: input.name,
                role: Role.PATIENT,
                pinHash,
                passwordHash: pinHash,
              },
            });
          }

          const patient =
            await tx.patient.create({
              data: {
                healthId,

                userId: user.id,

                abhaAddress:
                  finalAbhaAddress,

                abhaNumber:
                  finalAbhaNumber,

                name: input.name,

                nameHi:
                  input.nameHi ||
                  input.name,

                age,

                dob: input.dob,

                gender:
                  normalizedGender,

                bloodGroup:
                  input.bloodGroup ||
                  'Not known',

                phone: input.phone,

                village:
                  input.village,

                district:
                  input.district,

                state:
                  input.state,

                address:
                  input.address ||
                  `${input.village}, ${input.district}, ${input.state}`,

                emergencyContact:
                  input.emergencyContact ??
                  Prisma.JsonNull,

                allergies:
                  input.allergies ||
                  [],

                chronicConditions:
                  input.chronicConditions ||
                  [],

                currentMedications:
                  input.currentMedications ||
                  [],

                riskLevel:
                  RiskLevel.LOW,

                healthWorkerId:
                  assignedWorkerId ||
                  null,

                healthWorkerName:
                  assignedWorkerName ||
                  'Community Health Worker',

                registeredAt:
                  registeredAtDateStr,

                consentStatus:
                  ConsentStatus.TEMPORARY,

                vaccinationStatus:
                  'Fully vaccinated',
              },
            });

          if (
            verifiedAbhaProfile?.id
          ) {
            await tx.mockABHAProfile.update(
              {
                where: {
                  id:
                    verifiedAbhaProfile.id,
                },
                data: {
                  linkedPatientId:
                    patient.id,

                  linkedHealthId:
                    patient.healthId,
                },
              }
            );
          }

          const auditCode =
            `AUD-${Date.now()
              .toString(36)
              .toUpperCase()}-${Math.floor(
              100 +
              Math.random() * 900
            )}`;

          await tx.auditLog.create({
            data: {
              auditCode,

              patientId:
                patient.id,

              accessorName:
                input.healthWorkerName ||
                'System Registration Agent',

              accessorRole:
                'HEALTH_WORKER',

              organization:
                'RuralCare Primary Health Network',

              action:
                'PATIENT_REGISTERED',

              dataAccessed:
                ['Identity', 'Demographics'],

              timestamp:
                timestampStr,

              purpose:
                'Patient account creation and assigned care team linkage in ABDM network',
            },
          });

          return patient;
        }
      );

    res.status(201).json({
      success: true,

      message:
        'Patient registered successfully with ABDM identity linkage',

      data: {
        patient: {
          id: result.id,

          healthId:
            result.healthId,

          name:
            result.name,

          nameHi:
            result.nameHi,

          dob:
            result.dob,

          age:
            result.age,

          gender:
            result.gender,

          phone:
            result.phone,

          village:
            result.village,

          district:
            result.district,

          state:
            result.state,

          abhaAddress:
            result.abhaAddress,

          abhaNumber:
            result.abhaNumber,

          abhaSource,

          registeredAt:
            result.registeredAt,

          healthWorkerId:
            result.healthWorkerId,

          healthWorkerName:
            result.healthWorkerName,

          consentStatus:
            result.consentStatus,
        },
        credentials: {
          phone: input.phone,
          pin: pin,
          healthId: result.healthId,
          name: result.name,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * List all patients with optional search and risk filter.
 * GET /api/v1/patients
 */
export async function getPatients(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const qRaw = req.query.q || req.query.search;
    const q =
      typeof qRaw === 'string'
        ? qRaw.trim()
        : '';

    const risk =
      typeof req.query.risk === 'string'
        ? req.query.risk.toUpperCase()
        : '';

    const where: any = {};

    if (q) {
      where.OR = [
        {
          name: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          healthId: {
            contains: q,
            mode: 'insensitive',
          },
        },
        {
          phone: {
            contains: q,
          },
        },
        {
          village: {
            contains: q,
            mode: 'insensitive',
          },
        },
      ];
    }

    if (
      risk &&
      [
        'LOW',
        'MODERATE',
        'HIGH',
        'CRITICAL',
      ].includes(risk)
    ) {
      where.riskLevel =
        risk as RiskLevel;
    }

    const patients =
      await prisma.patient.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        include: {
          healthWorker: true,
        },
      });

    res.status(200).json({
      success: true,
      data: { patients },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get patient by ID, Health ID or ABHA address.
 * GET /api/v1/patients/:id
 */
export async function getPatientById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;

    const id =
      Array.isArray(rawId)
        ? rawId[0]
        : rawId;

    const patient =
      await prisma.patient.findFirst({
        where: {
          OR: [
            { id },
            { healthId: id },
            { abhaAddress: id },
          ],
        },

        include: {
          familyDoctor: {
            include: {
              facility: true,
            },
          },
          healthWorker: true,
          consentEntries: {
            orderBy: {
              createdAt: 'desc',
            },
          },
          auditEntries: {
            orderBy: {
              createdAt: 'desc',
            },
          },
          consultations: {
            take: 20,
            orderBy: {
              createdAt: 'desc',
            },
          },
          referrals: {
            take: 20,
            orderBy: {
              createdAt: 'desc',
            },
          },
          aiAssessments: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

    if (!patient) {
      throw new AppError(
        `Patient '${id}' not found`,
        404
      );
    }

    const user = (req as any).user;
    const emergencyToken = (req.headers['x-emergency-token'] || req.headers['emergency-token']) as string | undefined;

    const accessResult = await checkPatientAccess({
      user,
      patientIdOrHealthId: id,
      emergencyToken,
    });

    const hasAccess = accessResult.hasAccess;
    const activeConsent = accessResult.activeConsent;
    const pendingRequest = accessResult.pendingRequest;

    if (!hasAccess) {
      const sanitizedPatient = {
        ...patient,
        allergies: [],
        chronicConditions: [],
        currentMedications: [],
        consultations: [],
        referrals: [],
        consentEntries: [],
        auditEntries: [],
        hasAccess: false,
        activeConsent: null,
        pendingRequest: pendingRequest
          ? {
              id: pendingRequest.id,
              consentCode: pendingRequest.consentCode,
              purpose: pendingRequest.purpose,
              dataScope: pendingRequest.dataScope,
              expiresAt: pendingRequest.expiresAt,
              createdAt: pendingRequest.createdAt,
            }
          : null,
      };

      res.status(200).json({
        success: true,
        data: {
          patient: sanitizedPatient,
          hasAccess: false,
          activeConsent: null,
          pendingRequest: sanitizedPatient.pendingRequest,
          consultations: [],
          referrals: [],
          consents: [],
          auditLogs: [],
        },
      });
      return;
    }

    let filteredConsultations = patient.consultations;
    const hasConsultScope = isScopePermitted(accessResult.allowedScopes, 'Consultations');
    if (!hasConsultScope) {
      filteredConsultations = [];
    }

    res.status(200).json({
      success: true,
      data: {
        patient: {
          ...patient,
          hasAccess: true,
          activeConsent: activeConsent
            ? {
                id: activeConsent.id,
                consentCode: activeConsent.consentCode,
                grantedTo: activeConsent.grantedTo,
                purpose: activeConsent.purpose,
                dataScope: activeConsent.dataScope,
                expiresAt: activeConsent.expiresAt,
              }
            : null,
          pendingRequest: null,
        },
        hasAccess: true,
        activeConsent: activeConsent
          ? {
              id: activeConsent.id,
              consentCode: activeConsent.consentCode,
              grantedTo: activeConsent.grantedTo,
              purpose: activeConsent.purpose,
              dataScope: activeConsent.dataScope,
              expiresAt: activeConsent.expiresAt,
            }
          : null,
        pendingRequest: null,
        consultations: filteredConsultations,
        referrals: patient.referrals,
        consents: patient.consentEntries,
        auditLogs: patient.auditEntries,
      },
    });
  } catch (err) {
    next(err);
  }
}

const requestPatientAccessSchema = z.object({
  duration: z.enum(['1 day', '1 week', '1 month', '3 months']).default('1 month'),
  reason: z.string().min(2, 'Reason for access is required'),
  dataScope: z.array(z.string()).min(1, 'At least one data scope item is required'),
});

/**
 * Request access to a patient record.
 * POST /api/v1/patients/:id/access-requests
 */
export async function requestPatientAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = (req as any).user;

    if (!user) {
      throw new AppError('Authentication required to request patient access.', 401);
    }

    const { duration, reason, dataScope } = requestPatientAccessSchema.parse(req.body);

    const patient = await prisma.patient.findFirst({
      where: {
        OR: [{ id }, { healthId: id }, { abhaAddress: id }],
      },
    });

    if (!patient) {
      throw new AppError(`Patient '${id}' not found`, 404);
    }

    const now = new Date();
    let days = 30;
    if (duration === '1 day') days = 1;
    else if (duration === '1 week') days = 7;
    else if (duration === '1 month') days = 30;
    else if (duration === '3 months') days = 90;

    const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
    const timestampStr = now.toISOString();

    const consentRandomSuffix = Math.floor(1000 + Math.random() * 9000);
    const consentCode = `REQ-2026-${consentRandomSuffix}`;

    const consentArtifact = await prisma.consentArtifact.create({
      data: {
        consentCode,
        patientId: patient.id,
        grantedTo: user.fullName || 'Health Worker',
        role: user.role === 'DOCTOR' ? 'Doctor' : 'Community Health Worker',
        organization: 'RuralCare Primary Health Network',
        status: ConsentStatus.TEMPORARY,
        purpose: reason,
        dataScope,
        grantedAt: timestampStr,
        expiresAt,
        hiuId: 'HIU-RURALCARE-01',
        hipId: 'HIP-HFR-MH-00103',
        consentManagerId: 'mock-abdm-cm@sbx',
        isMock: true,
      },
    });

    const auditCode = `AUD-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    await prisma.auditLog.create({
      data: {
        auditCode,
        patientId: patient.id,
        accessorId: user.id,
        accessorName: user.fullName || 'Health Worker',
        accessorRole: user.role || 'WORKER',
        organization: 'RuralCare Primary Health Network',
        action: 'ACCESS_REQUESTED',
        dataAccessed: dataScope,
        timestamp: timestampStr,
        purpose: reason,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Access request submitted successfully. Awaiting patient approval.',
      data: { request: consentArtifact },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get patient by phone number.
 * GET /api/v1/patients/by-phone/:phone
 */
export async function getPatientByPhone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawPhone = req.params.phone;

    const phone =
      Array.isArray(rawPhone)
        ? rawPhone[0]
        : rawPhone;

    const patient =
      await prisma.patient.findFirst({
        where: {
          phone,
        },

        include: {
          aiAssessments: {
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

    if (!patient) {
      res.status(404).json({
        success: false,
        message:
          'No record found for this phone number',
      });

      return;
    }

    res.status(200).json({
      success: true,
      data: { patient },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update patient profile (demographics, emergency info, Family Doctor, ASHA worker).
 * PATCH /api/v1/patients/:id
 */
export async function updatePatient(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = (req as any).user;

    const existing = await prisma.patient.findFirst({
      where: {
        OR: [{ id }, { healthId: id }, { abhaAddress: id }],
      },
    });

    if (!existing) {
      throw new AppError(`Patient '${id}' not found`, 404);
    }

    // Scoped Auth check: If caller is a PATIENT, verify ownership
    if (user && user.role === 'PATIENT' && existing.userId && user.id !== existing.userId) {
      throw new AppError('Unauthorized: You can only edit your own profile.', 403);
    }

    const {
      bloodGroup,
      allergies,
      chronicConditions,
      currentMedications,
      emergencyContact,
      familyDoctorId,
      healthWorkerId,
      phone,
      village,
      district,
      state,
      address,
    } = req.body;

    let familyDoctorName = existing.familyDoctorName;
    if (familyDoctorId !== undefined) {
      if (familyDoctorId) {
        const doc = await prisma.doctor.findUnique({ where: { id: familyDoctorId } });
        if (doc) {
          familyDoctorName = doc.name;
        }
      } else {
        familyDoctorName = null;
      }
    }

    let healthWorkerName = existing.healthWorkerName;
    if (healthWorkerId !== undefined) {
      if (healthWorkerId) {
        const wrk = await prisma.worker.findUnique({ where: { id: healthWorkerId } });
        if (wrk) {
          healthWorkerName = wrk.name;
        }
      } else {
        healthWorkerName = null;
      }
    }

    const updated = await prisma.patient.update({
      where: { id: existing.id },
      data: {
        ...(bloodGroup !== undefined ? { bloodGroup } : {}),
        ...(allergies !== undefined ? { allergies } : {}),
        ...(chronicConditions !== undefined ? { chronicConditions } : {}),
        ...(currentMedications !== undefined ? { currentMedications } : {}),
        ...(emergencyContact !== undefined ? { emergencyContact } : {}),
        ...(familyDoctorId !== undefined ? { familyDoctorId: familyDoctorId || null, familyDoctorName } : {}),
        ...(healthWorkerId !== undefined ? { healthWorkerId: healthWorkerId || null, healthWorkerName } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(village !== undefined ? { village } : {}),
        ...(district !== undefined ? { district } : {}),
        ...(state !== undefined ? { state } : {}),
        ...(address !== undefined ? { address } : {}),
      },
      include: {
        familyDoctor: { include: { facility: true } },
        healthWorker: true,
        consentEntries: { orderBy: { createdAt: 'desc' } },
        auditEntries: { orderBy: { createdAt: 'desc' } },
        consultations: { orderBy: { createdAt: 'desc' } },
        referrals: { orderBy: { createdAt: 'desc' } },
      },
    });

    res.status(200).json({
      success: true,
      message: 'Patient profile updated successfully',
      data: {
        patient: updated,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get patient audit logs.
 * GET /api/v1/patients/:id/audit-logs
 */
export async function getPatientAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = (req as any).user;

    const patient = await prisma.patient.findFirst({
      where: {
        OR: [{ id }, { healthId: id }, { abhaAddress: id }],
      },
    });

    if (!patient) {
      throw new AppError(`Patient '${id}' not found`, 404);
    }

    if (user && user.role === 'PATIENT' && patient.userId && user.id !== patient.userId) {
      throw new AppError('Unauthorized to view this audit log.', 403);
    }

    const auditLogs = await prisma.auditLog.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: { auditLogs },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get pending access requests for patient.
 * GET /api/v1/patients/:id/access-requests
 */
export async function getPatientAccessRequests(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const user = (req as any).user;

    const patient = await prisma.patient.findFirst({
      where: {
        OR: [{ id }, { healthId: id }, { abhaAddress: id }],
      },
    });

    if (!patient) {
      throw new AppError(`Patient '${id}' not found`, 404);
    }

    if (user && user.role === 'PATIENT' && patient.userId && user.id !== patient.userId) {
      throw new AppError('Unauthorized to view access requests.', 403);
    }

    const requests = await prisma.consentArtifact.findMany({
      where: {
        patientId: patient.id,
        status: ConsentStatus.TEMPORARY,
      },
      include: {
        facility: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      success: true,
      data: { requests },
    });
  } catch (err) {
    next(err);
  }
}