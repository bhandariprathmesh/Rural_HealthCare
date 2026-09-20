import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const patients = await prisma.patient.findMany({
    where: { name: { contains: 'Rukmini', mode: 'insensitive' } },
    include: {
      user: true,
      healthWorker: true,
      familyDoctor: true,
      consentEntries: true,
      consultations: true,
      aiAssessments: true,
      auditEntries: true
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Found ${patients.length} Rukmini records:`);
  for (const p of patients) {
    console.log('-------------------------------------------');
    console.log(`ID: ${p.id}`);
    console.log(`Name: ${p.name}`);
    console.log(`Health ID: ${p.healthId}`);
    console.log(`Phone: ${p.phone}`);
    console.log(`ABHA: ${p.abhaAddress} / ${p.abhaNumber}`);
    console.log(`User ID: ${p.userId}`);
    console.log(`Linked User Email: ${p.user?.email}`);
    console.log(`Linked User Phone: ${p.user?.phone}`);
    console.log(`Linked User Role: ${p.user?.role}`);
    console.log(`Assigned Worker: ${p.healthWorkerName} (${p.healthWorkerId})`);
    console.log(`Family Doctor: ${p.familyDoctorName} (${p.familyDoctorId})`);
    console.log(`Allergies: ${JSON.stringify(p.allergies)}`);
    console.log(`Consents: ${p.consentEntries?.length} entries`);
    for (const c of p.consentEntries) {
      console.log(`  - [${c.status}] to ${c.grantedTo} (${c.role}), Code: ${c.consentCode}, Exp: ${c.expiresAt}`);
    }
    console.log(`Consultations: ${p.consultations?.length}`);
    console.log(`Assessments: ${p.aiAssessments?.length}`);
    console.log(`Audit Logs: ${p.auditEntries?.length}`);
  }

  await prisma.$disconnect();
}

check().catch(console.error);

