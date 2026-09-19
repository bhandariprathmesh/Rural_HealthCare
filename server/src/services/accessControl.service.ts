import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { ConsentStatus, ReferralStatus } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';

export interface AccessCheckParams {
  user?: any;
  patientIdOrHealthId: string;
  requiredScope?: string;
  emergencyToken?: string;
}

export interface AccessCheckResult {
  hasAccess: boolean;
  reason?: string;
  patient: any;
  activeConsent?: any;
  pendingRequest?: any;
  allowedScopes: string[];
  accessType: 'OWNER' | 'EMERGENCY' | 'REFERRAL' | 'CONSENT' | 'NONE';
}

/**
 * Normalized scope checker: checks if a required clinical scope is permitted by granted scopes.
 */
export function isScopePermitted(grantedScopes: string[], requiredScope?: string): boolean {
  if (!requiredScope) return true;
  if (!Array.isArray(grantedScopes) || grantedScopes.length === 0) return false;

  const normalizedRequired = requiredScope.toLowerCase().trim();
  const normalizedGranted = grantedScopes.map((s) => s.toLowerCase().trim());

  if (normalizedGranted.includes('*') || normalizedGranted.includes('all')) {
    return true;
  }

  // Check direct or keyword inclusion
  return normalizedGranted.some((s) => {
    if (s === normalizedRequired) return true;

    // Consultation / clinical history mapping
    if (
      (normalizedRequired.includes('consult') || normalizedRequired.includes('clinical')) &&
      (s.includes('consult') || s.includes('clinical') || s.includes('prescription'))
    ) {
      return true;
    }

    // Health assessment mapping
    if (
      (normalizedRequired.includes('assessment') || normalizedRequired.includes('ai')) &&
      (s.includes('assessment') || s.includes('clinical') || s.includes('consult'))
    ) {
      return true;
    }

    // Symptoms mapping
    if (
      normalizedRequired.includes('symptom') &&
      (s.includes('symptom') || s.includes('clinical') || s.includes('consult') || s.includes('assessment'))
    ) {
      return true;
    }

    // Vitals mapping
    if (
      normalizedRequired.includes('vital') &&
      (s.includes('vital') || s.includes('clinical') || s.includes('consult') || s.includes('assessment'))
    ) {
      return true;
    }

    // Basic demographic info mapping
    if (
      normalizedRequired.includes('basic') &&
      (s.includes('basic') || s.includes('profile') || s.includes('demographic'))
    ) {
      return true;
    }

    return false;
  });
}

/**
 * Centralized Patient Access Engine.
 * Enforces Consent-First architecture across RuralCare:
 * - Patients can only access their own records.
 * - Emergency Break-Glass yields temporary scoped emergency summary.
 * - Doctors require active referral or unexpired granted consent.
 * - ASHA Workers require explicit unexpired granted consent (registration/assignment does NOT bypass).
 */
export async function checkPatientAccess(params: AccessCheckParams): Promise<AccessCheckResult> {
  const { user, patientIdOrHealthId, requiredScope, emergencyToken } = params;

  // 1. Resolve Patient
  const patient = await prisma.patient.findFirst({
    where: {
      OR: [
        { id: patientIdOrHealthId },
        { healthId: patientIdOrHealthId },
        { abhaAddress: patientIdOrHealthId },
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
        take: 30,
        orderBy: {
          createdAt: 'desc',
        },
      },
      referrals: {
        take: 30,
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
    return {
      hasAccess: false,
      reason: `Patient '${patientIdOrHealthId}' not found`,
      patient: null,
      allowedScopes: [],
      accessType: 'NONE',
    };
  }

  if (!user) {
    return {
      hasAccess: false,
      reason: 'Authentication required',
      patient,
      allowedScopes: [],
      accessType: 'NONE',
    };
  }

  const nowIso = new Date().toISOString();

  // 2. Patient Role: Self-access only
  if (user.role === 'PATIENT') {
    if (patient.userId && user.id === patient.userId) {
      return {
        hasAccess: true,
        patient,
        allowedScopes: ['*'],
        accessType: 'OWNER',
      };
    }
    return {
      hasAccess: false,
      reason: 'Patients are strictly limited to viewing and editing their own records',
      patient,
      allowedScopes: [],
      accessType: 'NONE',
    };
  }

  // 3. Admin Role: System management
  if (user.role === 'ADMIN') {
    return {
      hasAccess: true,
      patient,
      allowedScopes: ['*'],
      accessType: 'OWNER',
    };
  }

  // 4. Emergency Break-Glass Access Check
  if (emergencyToken) {
    try {
      const decoded = jwt.verify(emergencyToken, JWT_SECRET) as any;
      if (
        decoded.accessType === 'BREAK_GLASS_EMERGENCY' &&
        (decoded.patientHealthId === patient.healthId || decoded.patientHealthId === patient.id)
      ) {
        const emergencyScopes = [
          'Basic Information',
          'Emergency Medical Summary',
          'Vitals',
          'Allergies',
          'Medications',
          'Chronic Conditions',
        ];

        if (isScopePermitted(emergencyScopes, requiredScope)) {
          return {
            hasAccess: true,
            patient,
            activeConsent: {
              id: decoded.logCode || 'EMERGENCY-SESSION',
              consentCode: decoded.logCode || 'EMERGENCY-SESSION',
              grantedTo: decoded.doctorName || 'Attending Emergency Physician',
              purpose: 'Emergency Break-Glass Access (15-min emergency session)',
              dataScope: emergencyScopes,
              expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
            },
            allowedScopes: emergencyScopes,
            accessType: 'EMERGENCY',
          };
        } else {
          return {
            hasAccess: false,
            reason: `Emergency access scope restricted to basic emergency summary. Scope '${requiredScope}' is not permitted in emergency mode.`,
            patient,
            allowedScopes: emergencyScopes,
            accessType: 'EMERGENCY',
          };
        }
      }
    } catch (_err) {
      // Invalid emergency token, fall through to regular role checks
    }
  }

  // 5. Doctor Role: Referral OR Granted Consent
  if (user.role === 'DOCTOR') {
    // 5A. Check active referral
    const activeReferral = await prisma.referral.findFirst({
      where: {
        patientId: patient.id,
        status: {
          in: [ReferralStatus.PENDING, ReferralStatus.ACCEPTED, ReferralStatus.IN_CONSULTATION],
        },
        OR: [
          ...(user.doctorId ? [{ toDoctorId: user.doctorId }] : []),
          ...(user.facilityId ? [{ toFacilityId: user.facilityId }] : []),
          { toDoctor: { name: { contains: user.fullName || '', mode: 'insensitive' } } },
          { toPHC: { contains: user.facilityName || '', mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (activeReferral) {
      const referralScopes = [
        'Basic Information',
        'Consultation History',
        'Clinical Notes',
        'Vitals',
        'HEALTH_ASSESSMENT',
        'Prescriptions',
        'Referrals',
        'Symptoms',
      ];

      if (isScopePermitted(referralScopes, requiredScope)) {
        return {
          hasAccess: true,
          patient,
          activeConsent: {
            id: activeReferral.id,
            consentCode: activeReferral.referralCode,
            grantedTo: user.fullName || 'Attending Doctor',
            purpose: `Referral Care: ${activeReferral.reason}`,
            dataScope: referralScopes,
            expiresAt: null,
          },
          allowedScopes: referralScopes,
          accessType: 'REFERRAL',
        };
      }
    }

    // 5B. Check unexpired GRANTED ConsentArtifact
    const validConsent = await prisma.consentArtifact.findFirst({
      where: {
        patientId: patient.id,
        status: ConsentStatus.GRANTED,
        OR: [
          { grantedTo: { contains: user.fullName || '', mode: 'insensitive' } },
          { role: { in: ['Doctor', 'DOCTOR', 'Physician', 'Medical Officer'] } },
          {
            grantedTo: {
              in: [
                user.fullName || '',
                'RuralCare Clinical Network',
                'Primary Health Centre',
                'PHC Staff',
              ],
            },
          },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: nowIso } }],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (validConsent) {
      const scopes = Array.isArray(validConsent.dataScope) ? validConsent.dataScope : [];
      if (isScopePermitted(scopes, requiredScope)) {
        return {
          hasAccess: true,
          patient,
          activeConsent: validConsent,
          allowedScopes: scopes,
          accessType: 'CONSENT',
        };
      } else {
        return {
          hasAccess: false,
          reason: `Requested scope '${requiredScope}' is outside the patient's approved consent scope (${scopes.join(', ')})`,
          patient,
          activeConsent: validConsent,
          allowedScopes: scopes,
          accessType: 'CONSENT',
        };
      }
    }

    // 5C. Check pending request
    const pendingRequest = await prisma.consentArtifact.findFirst({
      where: {
        patientId: patient.id,
        status: ConsentStatus.TEMPORARY,
        OR: [
          { grantedTo: { contains: user.fullName || '', mode: 'insensitive' } },
          { role: { in: ['Doctor', 'DOCTOR', 'Physician'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasAccess: false,
      reason: 'Patient consent or referral required for doctor access',
      patient,
      pendingRequest: pendingRequest || null,
      allowedScopes: [],
      accessType: 'NONE',
    };
  }

  // 6. Worker Role (ASHA / Health Worker): Explicit unexpired GRANTED consent only
  if (user.role === 'WORKER') {
    const workerName = typeof user.fullName === 'string' ? user.fullName : '';
    const workerCode = user.workerProfile?.workerCode ? String(user.workerProfile.workerCode) : '';

    const validConsent = await prisma.consentArtifact.findFirst({
      where: {
        patientId: patient.id,
        status: ConsentStatus.GRANTED,
        OR: [
          { grantedTo: { contains: workerName, mode: 'insensitive' as const } },
          ...(workerCode ? [{ grantedTo: { contains: workerCode, mode: 'insensitive' as const } }] : []),
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: nowIso } }],
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (validConsent) {
      const scopes = Array.isArray(validConsent.dataScope) ? validConsent.dataScope : [];
      if (isScopePermitted(scopes, requiredScope)) {
        return {
          hasAccess: true,
          patient,
          activeConsent: validConsent,
          allowedScopes: scopes,
          accessType: 'CONSENT',
        };
      } else {
        return {
          hasAccess: false,
          reason: `Requested scope '${requiredScope}' is outside the patient's approved consent scope (${scopes.join(', ')})`,
          patient,
          activeConsent: validConsent,
          allowedScopes: scopes,
          accessType: 'CONSENT',
        };
      }
    }

    // Check pending request
    const pendingRequest = await prisma.consentArtifact.findFirst({
      where: {
        patientId: patient.id,
        status: ConsentStatus.TEMPORARY,
        OR: [
          { grantedTo: { contains: workerName, mode: 'insensitive' as const } },
          { role: { in: ['WORKER', 'Community Health Worker', 'ASHA'] } },
        ],
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      hasAccess: false,
      reason: 'Patient consent required. ASHA worker does not have active granted authorization for this patient.',
      patient,
      pendingRequest: pendingRequest || null,
      allowedScopes: [],
      accessType: 'NONE',
    };
  }

  return {
    hasAccess: false,
    reason: `Unsupported role '${user.role}'`,
    patient,
    allowedScopes: [],
    accessType: 'NONE',
  };
}
