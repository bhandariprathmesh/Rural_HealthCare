import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function inspectReferrals() {
  const referrals = await prisma.referral.findMany({
    include: {
      patient: true,
      toDoctor: true,
    }
  });

  console.log(`Total referrals: ${referrals.length}`);
  for (const r of referrals) {
    console.log(`ID: ${r.id} | Patient: ${r.patient?.name} | toDoctor: ${r.toDoctor?.name || 'none'} | toDoctorId: ${r.toDoctorId} | toPHC: "${r.toPHC}" | status: ${r.status}`);
  }
}

inspectReferrals().catch(console.error).finally(() => prisma.$disconnect());

