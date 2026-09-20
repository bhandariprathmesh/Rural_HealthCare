import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function cleanup() {
  console.log('--- STARTING PATIENT DEDUPLICATION & CLEANUP ---');

  // 1. Clean up test patients (Alpha, Beta, Gamma)
  const testPatients = await prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: 'Alpha', mode: 'insensitive' } },
        { name: { contains: 'Beta', mode: 'insensitive' } },
        { name: { contains: 'Gamma', mode: 'insensitive' } },
      ]
    },
    select: { id: true, userId: true }
  });

  for (const tp of testPatients) {
    await prisma.consentArtifact.deleteMany({ where: { patientId: tp.id } });
    await prisma.auditLog.deleteMany({ where: { patientId: tp.id } });
    await prisma.consultation.deleteMany({ where: { patientId: tp.id } });
    await prisma.referral.deleteMany({ where: { patientId: tp.id } });
    await prisma.patient.delete({ where: { id: tp.id } });
    if (tp.userId) {
      await prisma.user.delete({ where: { id: tp.userId } }).catch(() => {});
    }
  }
  console.log(`Removed ${testPatients.length} test patients.`);

  // 2. Consolidate Rukmini Bai
  const canonicalRukminiBaiId = '8869a574-5f79-4c72-bd92-6aa22ad310c8';
  const duplicateRukminiBais = await prisma.patient.findMany({
    where: {
      name: { contains: 'Rukmini Bai', mode: 'insensitive' },
      id: { not: canonicalRukminiBaiId }
    },
    select: { id: true, userId: true }
  });

  for (const dup of duplicateRukminiBais) {
    // Re-link consultations and referrals to canonical patient
    await prisma.consultation.updateMany({
      where: { patientId: dup.id },
      data: { patientId: canonicalRukminiBaiId }
    });
    await prisma.referral.updateMany({
      where: { patientId: dup.id },
      data: { patientId: canonicalRukminiBaiId }
    });
    // Delete duplicate consents, audits, and patient
    await prisma.consentArtifact.deleteMany({ where: { patientId: dup.id } });
    await prisma.auditLog.deleteMany({ where: { patientId: dup.id } });
    await prisma.patient.delete({ where: { id: dup.id } });
    if (dup.userId) {
      await prisma.user.delete({ where: { id: dup.userId } }).catch(() => {});
    }
  }
  console.log(`Consolidated ${duplicateRukminiBais.length} duplicate Rukmini Bai records to ${canonicalRukminiBaiId}.`);

  // 3. Consolidate Rukmini Devi
  const canonicalRukminiDeviId = 'ea842078-c2a4-47eb-be5a-c90a9ed416d5';
  const duplicateRukminiDevis = await prisma.patient.findMany({
    where: {
      name: { contains: 'Rukmini Devi', mode: 'insensitive' },
      id: { not: canonicalRukminiDeviId }
    },
    select: { id: true, userId: true }
  });

  for (const dup of duplicateRukminiDevis) {
    await prisma.consultation.updateMany({
      where: { patientId: dup.id },
      data: { patientId: canonicalRukminiDeviId }
    });
    await prisma.referral.updateMany({
      where: { patientId: dup.id },
      data: { patientId: canonicalRukminiDeviId }
    });
    await prisma.consentArtifact.deleteMany({ where: { patientId: dup.id } });
    await prisma.auditLog.deleteMany({ where: { patientId: dup.id } });
    await prisma.patient.delete({ where: { id: dup.id } });
    if (dup.userId) {
      await prisma.user.delete({ where: { id: dup.userId } }).catch(() => {});
    }
  }
  console.log(`Consolidated ${duplicateRukminiDevis.length} duplicate Rukmini Devi records to ${canonicalRukminiDeviId}.`);

  // 4. Reset all Doctor consents so every patient starts clean requiring consent from doctor
  const deletedDoctorConsents = await prisma.consentArtifact.deleteMany({
    where: {
      role: { in: ['Doctor', 'DOCTOR', 'Physician', 'Medical Officer'] }
    }
  });
  console.log(`Reset ${deletedDoctorConsents.count} stale doctor consent records.`);

  // 5. Verify remaining patients
  const remaining = await prisma.patient.findMany({
    select: { id: true, name: true, healthId: true, phone: true },
    orderBy: { name: 'asc' }
  });
  console.log(`\nRemaining unique patients in DB (${remaining.length}):`);
  for (const p of remaining) {
    console.log(`- ${p.name.padEnd(20)} | HealthID: ${p.healthId} | Phone: ${p.phone}`);
  }

  console.log('\n--- CLEANUP COMPLETE ---');
}

cleanup().catch(console.error).finally(() => prisma.$disconnect());

