import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function checkRamesh() {
  const ref = await prisma.referral.findFirst({
    where: { patient: { name: 'Ramesh Kumar' } }
  });
  console.log('Ramesh Referral:', ref);
}

checkRamesh().catch(console.error).finally(() => prisma.$disconnect());

