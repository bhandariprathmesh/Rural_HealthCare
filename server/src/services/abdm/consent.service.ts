import { prisma } from '../../lib/prisma.js';
import { CreateConsentInput } from '../../types/abdm.types.js';
import { ConsentStatus } from '@prisma/client';

export class ConsentService {
  /**
   * Retrieves a consent artifact by UUID or consentCode.
   */
  async getConsentById(idOrCode: string) {
    return prisma.consentArtifact.findFirst({
      where: {
        OR: [
          { id: idOrCode },
          { consentCode: idOrCode },
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            healthId: true,
            name: true,
            abhaAddress: true,
            abhaNumber: true,
          },
        },
        facility: {
          select: {
            id: true,
            hfrId: true,
            name: true,
            facilityType: true,
          },
        },
      },
    });
  }

  /**
   * Creates a mock ABDM consent artifact and writes an entry to the AuditLog.
   */
  async requestConsent(input: CreateConsentInput) {
    // Generate human-readable code e.g. "CA-2026-XXXX"
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const consentCode = `CA-2026-${randomSuffix}`;
    const grantedAt = new Date().toISOString();

    const consent = await prisma.consentArtifact.create({
      data: {
        consentCode,
        patientId: input.patientId,
        grantedTo: input.grantedTo,
        role: input.role,
        organization: input.organization,
        facilityId: input.facilityId,
        status: ConsentStatus.GRANTED,
        purpose: input.purpose,
        dataScope: input.dataScope,
        grantedAt,
        expiresAt: input.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // default 30 days
        hiuId: input.hiuId || 'HIU-RURALCARE-01',
        hipId: input.hipId || 'HIP-HFR-MH-00103',
        consentManagerId: 'mock-abdm-cm@sbx',
        signature: `MOCK_SHA256_SIG_${Buffer.from(consentCode + grantedAt).toString('hex').slice(0, 32)}`,
        isMock: true,
      },
      include: {
        patient: true,
      },
    });

    // Write audit log entry
    const auditCode = `AUD-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    await prisma.auditLog.create({
      data: {
        auditCode,
        patientId: input.patientId,
        accessorName: input.grantedTo,
        accessorRole: input.role,
        organization: input.organization,
        action: 'CONSENT_GRANTED',
        dataAccessed: input.dataScope,
        timestamp: grantedAt,
        purpose: input.purpose,
      },
    });

    return consent;
  }

  /**
   * Revokes an active consent artifact and writes an entry to the AuditLog.
   */
  async revokeConsent(idOrCode: string, reason?: string) {
    const existing = await this.getConsentById(idOrCode);
    if (!existing) {
      throw new Error(`Consent artifact ${idOrCode} not found`);
    }

    const updated = await prisma.consentArtifact.update({
      where: { id: existing.id },
      data: {
        status: ConsentStatus.REVOKED,
      },
    });

    // Write audit log entry
    const auditCode = `AUD-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    await prisma.auditLog.create({
      data: {
        auditCode,
        patientId: existing.patientId,
        accessorName: existing.grantedTo,
        accessorRole: existing.role,
        organization: existing.organization,
        action: 'CONSENT_REVOKED',
        dataAccessed: existing.dataScope,
        timestamp: new Date().toISOString(),
        purpose: reason || 'Patient revoked consent for data sharing',
      },
    });

    return updated;
  }

  /**
   * Approves a pending consent request and writes an entry to the AuditLog.
   */
  async approveConsent(idOrCode: string) {
    const existing = await this.getConsentById(idOrCode);
    if (!existing) {
      throw new Error(`Consent artifact ${idOrCode} not found`);
    }

    const updated = await prisma.consentArtifact.update({
      where: { id: existing.id },
      data: {
        status: ConsentStatus.GRANTED,
        grantedAt: new Date().toISOString(),
      },
    });

    const auditCode = `AUD-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
    await prisma.auditLog.create({
      data: {
        auditCode,
        patientId: existing.patientId,
        accessorName: existing.grantedTo,
        accessorRole: existing.role,
        organization: existing.organization,
        action: 'CONSENT_GRANTED',
        dataAccessed: existing.dataScope,
        timestamp: new Date().toISOString(),
        purpose: existing.purpose || 'Patient approved clinical data access request',
      },
    });

    return updated;
  }
}

export const consentService = new ConsentService();

