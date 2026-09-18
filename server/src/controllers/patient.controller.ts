import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Prisma, ConsentStatus, RiskLevel } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { abhaService } from '../services/abdm/abha.service.js';
import { AppError } from '../middleware/error.js';

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

  abhaAddress: z.string().optional(),

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

    const result =
      await prisma.$transaction(
        async (tx) => {
          const patient =
            await tx.patient.create({
              data: {
                healthId,

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
                  input.healthWorkerId ||
                  null,

                healthWorkerName:
                  input.healthWorkerName ||
                  'Community Health Worker',

                registeredAt:
                  registeredAtDateStr,

                consentStatus:
                  ConsentStatus.GRANTED,

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

          const consentRandomSuffix =
            Math.floor(
              1000 +
              Math.random() * 9000
            );

          const consentCode =
            `CA-2026-${consentRandomSuffix}`;

          const consentPurpose =
            input.consent.purpose ||
            'General healthcare coordination and longitudinal health record';

          const consentScope =
            input.consent.dataScope ||
            [
              'Consultations',
              'Vitals',
              'Prescriptions',
              'DiagnosticReports',
            ];

          await tx.consentArtifact.create({
            data: {
              consentCode,

              patientId:
                patient.id,

              grantedTo:
                input.healthWorkerName ||
                'RuralCare Clinical Network',

              role:
                'Community Health Worker',

              organization:
                'RuralCare Primary Health Network',

              status:
                ConsentStatus.GRANTED,

              purpose:
                consentPurpose,

              dataScope:
                consentScope,

              grantedAt:
                timestampStr,

              expiresAt:
                new Date(
                  Date.now() +
                  365 *
                  24 *
                  60 *
                  60 *
                  1000
                ).toISOString(),

              hiuId:
                'HIU-RURALCARE-01',

              hipId:
                'HIP-HFR-MH-00103',

              consentManagerId:
                'mock-abdm-cm@sbx',

              signature:
                `MOCK_SHA256_SIG_${Buffer.from(
                  consentCode +
                  timestampStr
                )
                  .toString('hex')
                  .slice(0, 32)}`,

              isMock: true,
            },
          });

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
                'PATIENT_REGISTERED_CONSENT_GRANTED',

              dataAccessed:
                consentScope,

              timestamp:
                timestampStr,

              purpose:
                consentPurpose,
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

          consentStatus:
            result.consentStatus,
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
    const q =
      typeof req.query.q === 'string'
        ? req.query.q.trim()
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
          consentEntries: {
            take: 5,
            orderBy: {
              createdAt: 'desc',
            },
          },

          consultations: {
            take: 5,
            orderBy: {
              createdAt: 'desc',
            },
          },

          referrals: {
            take: 5,
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

    res.status(200).json({
      success: true,
      data: {
        patient,
        consultations: patient.consultations,
        referrals: patient.referrals,
      },
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