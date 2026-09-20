import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function planCleanup() {
  console.log('=== INSPECTING DUPLICATES TO CLEAN ===');
  
  // 1. Rukmini Bai
  const rukminiBais = await prisma.patient.findMany({
    where: { name: { contains: 'Rukmini Bai', mode: 'insensitive' } },
    include: {
      user: true,
      consultations: true,
      referrals: true,
      consentEntries: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Found ${rukminiBais.length} Rukmini Bai records:`);
  for (const rb of rukminiBais) {
    console.log(`- ID: ${rb.id}, HealthID: ${rb.healthId}, Phone: ${rb.phone}, UserID: ${rb.userId}, Consults: ${rb.consultations.length}, Consents: ${rb.consentEntries.length}`);
  }

  // 2. Rukmini Devi
  const rukminiDevis = await prisma.patient.findMany({
    where: { name: { contains: 'Rukmini Devi', mode: 'insensitive' } },
    include: {
      user: true,
      consultations: true,
      referrals: true,
      consentEntries: true,
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`\nFound ${rukminiDevis.length} Rukmini Devi records:`);
  for (const rd of rukminiDevis) {
    console.log(`- ID: ${rd.id}, HealthID: ${rd.healthId}, Phone: ${rd.phone}, UserID: ${rd.userId}, Consults: ${rd.consultations.length}, Consents: ${rd.consentEntries.length}`);
  }

  // 3. Test patients (Alpha, Beta, Gamma)
  const testPatients = await prisma.patient.findMany({
    where: {
      OR: [
        { name: { contains: 'Alpha', mode: 'insensitive' } },
        { name: { contains: 'Beta', mode: 'insensitive' } },
        { name: { contains: 'Gamma', mode: 'insensitive' } },
      ]
    },
    include: { user: true }
  });
  console.log(`\nFound ${testPatients.length} test patients (Alpha/Beta/Gamma):`);
  for (const tp of testPatients) {
    console.log(`- ID: ${tp.id}, Name: "${tp.name}", HealthID: ${tp.healthId}`);
  }
}

planCleanup().catch(console.error).finally(() => prisma.$disconnect());

