import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const patients = await prisma.patient.findMany({
    where: { name: { contains: 'Rukmini', mode: 'insensitive' } },
    include: {
      user: true,
      healthWorker: true,
      familyDoctor: true,
      consentEntries: { orderBy: { createdAt: 'desc' } },
      consultations: { orderBy: { createdAt: 'desc' } },
      aiAssessments: { orderBy: { createdAt: 'desc' } },
      auditEntries: { orderBy: { createdAt: 'desc' } }
    },
    orderBy: { createdAt: 'desc' },
    take: 3
  });

  console.log(`=== FOUND ${patients.length} RUKMINI BAI RECORDS ===`);
  for (const p of patients) {
    console.log('---------------------------------------------------------');
    console.log(`Health ID:        ${p.healthId}`);
    console.log(`Patient Name:     ${p.name} (${p.gender}, age ${p.age})`);
    console.log(`Phone:            ${p.phone}`);
    console.log(`Village:          ${p.village}, ${p.district}, ${p.state}`);
    console.log(`ABHA:             ${p.abhaAddress || 'None'} / ${p.abhaNumber || 'None'}`);
    console.log(`Linked User ID:   ${p.userId || 'NONE'}`);
    console.log(`User Login Phone: ${p.user?.phone || 'NONE'}`);
    console.log(`User Login Email: ${p.user?.email || 'NONE'}`);
    console.log(`User Role:        ${p.user?.role || 'NONE'}`);
    console.log(`Has Password/PIN: ${!!p.user?.password}`);
    console.log(`Assigned Worker:  ${p.healthWorkerName || 'None'} (${p.healthWorkerId || 'None'})`);
    console.log(`Family Doctor:    ${p.familyDoctorName || 'None'} (${p.familyDoctorId || 'None'})`);
    console.log(`Allergies:        ${JSON.stringify(p.allergies)}`);
    console.log(`Conditions:       ${JSON.stringify(p.chronicConditions)}`);
    console.log(`Medications:      ${JSON.stringify(p.currentMedications)}`);
    console.log(`Emergency Contact:${JSON.stringify(p.emergencyContact)}`);
    console.log(`Consents (${p.consentEntries?.length}):`);
    for (const c of p.consentEntries) {
      console.log(`  - [${c.status}] ${c.consentCode} -> Granted To: ${c.grantedTo} (${c.role}), Expires: ${c.expiresAt}`);
    }
    console.log(`Consultations:    ${p.consultations?.length}`);
    for (const cons of p.consultations) {
      console.log(`  - ${cons.consultationCode}: by ${cons.workerName}, notes: "${cons.notes || cons.diagnosis || ''}"`);
    }
    console.log(`Assessments:      ${p.aiAssessments?.length}`);
    console.log(`Audit Logs:       ${p.auditEntries?.length}`);
  }

  await prisma.$disconnect();
}

check().catch(console.error);
