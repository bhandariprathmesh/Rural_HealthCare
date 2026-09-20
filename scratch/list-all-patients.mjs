import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function checkAll() {
  const patients = await prisma.patient.findMany({
    include: {
      _count: {
        select: {
          consultations: true,
          referrals: true,
          consentEntries: true,
          auditEntries: true,
        }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log(`Total: ${patients.length} patients\n`);
  for (const p of patients) {
    console.log(`ID: ${p.id} | Name: "${p.name}" | HealthID: ${p.healthId} | Phone: ${p.phone} | Created: ${p.createdAt.toISOString()} | Consults: ${p._count.consultations} | Referrals: ${p._count.referrals} | Consents: ${p._count.consentEntries}`);
  }
}

checkAll().catch(console.error).finally(() => prisma.$disconnect());

