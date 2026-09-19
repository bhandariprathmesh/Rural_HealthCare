import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { hfrService } from '../../services/abdm/hfr.service.js';
import { hprService } from '../../services/abdm/hpr.service.js';
import { workerDirectoryService } from '../../services/abdm/worker.service.js';
import { abhaService } from '../../services/abdm/abha.service.js';
import { consentService } from '../../services/abdm/consent.service.js';
import { fhirService } from '../../services/abdm/fhir.service.js';
import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../middleware/error.js';

function getParam(val: string | string[] | undefined): string {
  if (Array.isArray(val)) return val[0] || '';
  return val || '';
}

function generateHprIdString(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(10000 + Math.random() * 90000);
  return `HPR-${year}-${num}`;
}

// ─── Status & Metadata ────────────────────────────────────────────────────────

export async function getMockStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [
      facilities,
      professionals,
      workers,
      abhaProfiles,
      consents,
    ] = await Promise.all([
      prisma.mockHFRFacility.count(),
      prisma.mockHPRProfessional.count(),
      prisma.mockWorkerDirectory.count(),
      prisma.mockABHAProfile.count(),
      prisma.consentArtifact.count(),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        mode: process.env.ABDM_MODE || 'mock',
        isMock: true,
        registryNotice:
          'RuralCare currently uses a local mock registry interface designed for future ABDM integration.',
        timestamp: new Date().toISOString(),
        counts: {
          mockFacilities: facilities,
          mockProfessionals: professionals,
          mockWorkers: workers,
          mockABHAProfiles: abhaProfiles,
          consentArtifacts: consents,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── HFR Handlers ─────────────────────────────────────────────────────────────

export async function getFacilities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const facilities = await hfrService.getAllFacilities({
      facilityType: req.query.type as string,
      district: req.query.district as string,
      state: req.query.state as string,
      hasEmergency: req.query.emergency
        ? req.query.emergency === 'true'
        : undefined,
      q: req.query.q as string,
    });

    res.status(200).json({
      status: 'success',
      isMock: true,
      count: facilities.length,
      data: facilities,
    });
  } catch (err) {
    next(err);
  }
}

export async function getFacilityById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const facility = await hfrService.getFacilityById(id);

    if (!facility) {
      throw new AppError(
        `Facility with ID or HFR-ID '${id}' not found`,
        404
      );
    }

    res.status(200).json({
      status: 'success',
      isMock: true,
      data: facility,
    });
  } catch (err) {
    next(err);
  }
}

export async function searchFacilities(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const facilities = await hfrService.searchFacilities({
      q: req.query.q as string,
      facilityType: req.query.type as string,
      district: req.query.district as string,
    });

    res.status(200).json({
      status: 'success',
      isMock: true,
      count: facilities.length,
      data: facilities,
    });
  } catch (err) {
    next(err);
  }
}

// ─── HPR Handlers ─────────────────────────────────────────────────────────────

export async function getProfessionals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const professionals = await hprService.getAllProfessionals({
      specialty: req.query.specialty as string,
      district: req.query.district as string,
      facilityHfrId: req.query.facilityId as string,
      q: req.query.q as string,
    });

    res.status(200).json({
      status: 'success',
      isMock: true,
      count: professionals.length,
      data: professionals,
    });
  } catch (err) {
    next(err);
  }
}

export async function getProfessionalById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const professional = await hprService.getProfessionalById(id);

    if (!professional) {
      throw new AppError(
        `Professional with ID or HPR-ID '${id}' not found`,
        404
      );
    }

    res.status(200).json({
      status: 'success',
      isMock: true,
      data: professional,
    });
  } catch (err) {
    next(err);
  }
}

export async function searchProfessionals(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const professionals = await hprService.searchProfessionals({
      q: req.query.q as string,
      specialty: req.query.specialty as string,
      facilityHfrId: req.query.facilityId as string,
    });

    res.status(200).json({
      status: 'success',
      isMock: true,
      count: professionals.length,
      data: professionals,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Generate New HPR ID ──────────────────────────────────────────────────────

export async function generateHprId(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    let hprId = '';
    let attempts = 0;

    while (attempts < 20) {
      const candidate = generateHprIdString();

      const existing =
        await prisma.mockHPRProfessional.findUnique({
          where: {
            hprId: candidate,
          },
        });

      if (!existing) {
        hprId = candidate;
        break;
      }

      attempts++;
    }

    if (!hprId) {
      throw new AppError(
        'Unable to generate a unique HPR ID. Please try again.',
        500
      );
    }

    res.status(200).json({
      success: true,
      isMock: true,
      data: {
        hprId,
        verificationRequired: true,
        message:
          'New mock HPR ID generated. Enter this HPR ID in the verification field to continue.',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Verify HPR ID ────────────────────────────────────────────────────────────

const verifyHprSchema = z.object({
  hprId: z
    .string()
    .trim()
    .min(5, 'HPR ID is required'),
});

export async function verifyHpr(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { hprId } = verifyHprSchema.parse(req.body);

    const professional =
      await prisma.mockHPRProfessional.findUnique({
        where: {
          hprId,
        },
      });

    if (!professional) {
      res.status(404).json({
        success: false,
        isMock: true,
        verified: false,
        message:
          'HPR ID was not found in the RuralCare mock HPR registry.',
        data: null,
      });

      return;
    }

    res.status(200).json({
      success: true,
      isMock: true,
      verified: true,
      message: 'HPR ID verified successfully.',
      data: {
        id: professional.id,
        hprId: professional.hprId,
        fullName: professional.fullName,
        gender: professional.gender,
        professionalType:
          professional.professionalType,
        qualification:
          professional.qualification,
        specialties:
          professional.specialties,
        registrationNumber:
          professional.registrationNumber,
        registrationCouncil:
          professional.registrationCouncil,
        state: professional.state,
        district: professional.district,
        languages:
          professional.languages,
        contactPhone:
          professional.contactPhone,
        contactEmail:
          professional.contactEmail,
        primaryHfrId:
          professional.primaryHfrId ?? undefined,
        primaryFacilityName:
          professional.primaryFacilityName ??
          undefined,
        verificationStatus:
          professional.verificationStatus,
        isMock: professional.isMock,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Create Professional ──────────────────────────────────────────────────────

const createProfessionalSchema = z.object({
  hprId: z
    .string()
    .trim()
    .min(5, 'Verified HPR ID is required'),

  fullName: z
    .string()
    .min(2, 'Full name is required'),

  qualification: z
    .string()
    .min(1, 'Qualification is required'),

  specialties: z
    .array(z.string())
    .min(1, 'At least one specialty is required'),

  professionalType: z
    .string()
    .default('Doctor'),

  state: z
    .string()
    .default('Rajasthan'),

  district: z
    .string()
    .default('Bikaner'),

  contactEmail: z
    .string()
    .email('Valid email required'),

  contactPhone: z
    .string()
    .optional(),

  gender: z
    .string()
    .optional(),
});

export async function createProfessional(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body =
      createProfessionalSchema.parse(req.body);

    const existing =
      await prisma.mockHPRProfessional.findUnique({
        where: {
          hprId: body.hprId,
        },
      });

    if (existing) {
      throw new AppError(
        `HPR ID '${body.hprId}' is already registered in the mock HPR registry.`,
        409
      );
    }

    const regNum =
      `MCI-${Math.floor(100000 + Math.random() * 900000)}`;

    const professional =
      await prisma.mockHPRProfessional.create({
        data: {
          hprId: body.hprId,
          fullName: body.fullName,
          gender: body.gender || 'Unknown',
          professionalType:
            body.professionalType,
          qualification:
            body.qualification,
          specialties:
            body.specialties,
          registrationNumber:
            regNum,
          registrationCouncil:
            `${body.state} Medical Council`,
          state: body.state,
          district: body.district,
          languages: [
            'Hindi',
            'English',
          ],
          contactPhone:
            body.contactPhone || '',
          contactEmail:
            body.contactEmail,
          verificationStatus:
            'VERIFIED',
          isMock: true,
        },
      });

    res.status(201).json({
      success: true,
      isMock: true,
      message:
        'Doctor professional profile registered successfully.',
      data: {
        id: professional.id,
        hprId: professional.hprId,
        fullName:
          professional.fullName,
        gender:
          professional.gender,
        professionalType:
          professional.professionalType,
        qualification:
          professional.qualification,
        specialties:
          professional.specialties,
        registrationNumber:
          professional.registrationNumber,
        registrationCouncil:
          professional.registrationCouncil,
        state:
          professional.state,
        district:
          professional.district,
        primaryHfrId:
          professional.primaryHfrId ??
          undefined,
        primaryFacilityName:
          professional.primaryFacilityName ??
          undefined,
        verificationStatus:
          professional.verificationStatus,
        isMock:
          professional.isMock,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Worker Directory Handlers ────────────────────────────────────────────────

export async function getWorkers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const workers =
      await workerDirectoryService.getAllWorkers({
        workerType:
          req.query.type as string,
        village:
          req.query.village as string,
        district:
          req.query.district as string,
        q: req.query.q as string,
      });

    res.status(200).json({
      status: 'success',
      isMock: true,
      count: workers.length,
      data: workers,
    });
  } catch (err) {
    next(err);
  }
}

export async function getWorkerById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const worker =
      await workerDirectoryService.getWorkerById(id);

    if (!worker) {
      throw new AppError(
        `Worker with ID or code '${id}' not found`,
        404
      );
    }

    res.status(200).json({
      status: 'success',
      isMock: true,
      data: worker,
    });
  } catch (err) {
    next(err);
  }
}

export async function searchWorkers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const workers =
      await workerDirectoryService.searchWorkers({
        q: req.query.q as string,
        village:
          req.query.village as string,
        workerType:
          req.query.type as string,
        district:
          req.query.district as string,
      });

    res.status(200).json({
      status: 'success',
      isMock: true,
      count: workers.length,
      data: workers,
    });
  } catch (err) {
    next(err);
  }
}

// ─── ABHA Handlers ────────────────────────────────────────────────────────────

export async function getAbhaProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const profile =
      await abhaService.getProfileById(id);

    if (!profile) {
      throw new AppError(
        `ABHA profile '${id}' not found`,
        404
      );
    }

    res.status(200).json({
      status: 'success',
      isMock: true,
      data: profile,
    });
  } catch (err) {
    next(err);
  }
}

const verifyAbhaSchema = z.object({
  abhaAddress: z.string().min(3),
});

export async function verifyAbha(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { abhaAddress } =
      verifyAbhaSchema.parse(req.body);

    const result =
      await abhaService.verifyAbhaAddress(
        abhaAddress
      );

    res.status(200).json({
      status: 'success',
      isMock: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

// ─── Consent Handlers ─────────────────────────────────────────────────────────

const createConsentSchema = z.object({
  patientId: z.string().uuid('Invalid patient UUID'),
  grantedTo: z.string().min(2),
  role: z.string().min(2),
  organization: z.string().min(2),
  facilityId: z.string().uuid().optional(),
  purpose: z.string().min(3),
  dataScope: z.array(z.string()).min(1),
  expiresAt: z.string().optional(),
  hiuId: z.string().optional(),
  hipId: z.string().optional(),
});

export async function createConsent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const payload =
      createConsentSchema.parse(req.body);

    const consent =
      await consentService.requestConsent(
        payload
      );

    res.status(201).json({
      status: 'success',
      isMock: true,
      message:
        'Consent artifact generated and audit logged.',
      data: consent,
    });
  } catch (err) {
    next(err);
  }
}

export async function getConsentById(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const consent =
      await consentService.getConsentById(id);

    if (!consent) {
      throw new AppError(
        `Consent artifact '${id}' not found`,
        404
      );
    }

    res.status(200).json({
      status: 'success',
      isMock: true,
      data: consent,
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeConsent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const reason =
      req.body.reason as string | undefined;

    const consent =
      await consentService.revokeConsent(
        id,
        reason
      );

    res.status(200).json({
      status: 'success',
      isMock: true,
      message:
        'Consent revoked successfully and audit logged.',
      data: consent,
    });
  } catch (err) {
    next(err);
  }
}

export async function approveConsent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);
    const consent = await consentService.approveConsent(id);

    res.status(200).json({
      status: 'success',
      isMock: true,
      message: 'Consent approved and granted successfully.',
      data: consent,
    });
  } catch (err) {
    next(err);
  }
}

// ─── FHIR R4 Handlers ────────────────────────────────────────────────────────

export async function getFHIRPatient(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const resource =
      await fhirService.generatePatientResource(id);

    res.setHeader(
      'Content-Type',
      'application/fhir+json'
    );

    res.status(200).json(resource);
  } catch (err) {
    next(err);
  }
}

export async function getFHIREncounter(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const resource =
      await fhirService.generateEncounterResource(id);

    res.setHeader(
      'Content-Type',
      'application/fhir+json'
    );

    res.status(200).json(resource);
  } catch (err) {
    next(err);
  }
}

export async function getFHIRBundle(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const patientId =
      getParam(req.params.patientId);

    const bundle =
      await fhirService.generatePatientBundle(
        patientId
      );

    res.setHeader(
      'Content-Type',
      'application/fhir+json'
    );

    res.status(200).json(bundle);
  } catch (err) {
    next(err);
  }
}

export async function getFHIRServiceRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = getParam(req.params.id);

    const resource =
      await fhirService.generateServiceRequestResource(
        id
      );

    res.setHeader(
      'Content-Type',
      'application/fhir+json'
    );

    res.status(200).json(resource);
  } catch (err) {
    next(err);
  }
}