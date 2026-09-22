import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    // 1. Meena Kumari (ASHA)
    const asha = await prisma.user.findFirst({ where: { email: 'asha.worker@ruralcare.in' } });
    if (asha) {
      await prisma.user.update({
        where: { id: asha.id },
        data: { phone: '9829000005' },
      });
      console.log('✓ Updated Meena Kumari phone to 9829000005');
    }

    // 2. Doctor 2 / Dr. Priya Mehta / Krishna
    const doc2 = await prisma.user.findFirst({ where: { email: 'krishna@gmail.com' } });
    if (doc2) {
      await prisma.user.update({
        where: { id: doc2.id },
        data: { phone: '9829000003' },
      });
      console.log('✓ Updated Krishna/Doc phone to 9829000003');
    }

    // 3. Worker 2: Anita pansare
    const w2 = await prisma.user.findFirst({ where: { email: 'anita@gmail.com' } });
    if (w2) {
      await prisma.user.update({
        where: { id: w2.id },
        data: { phone: '9829000006' },
      });
      console.log('✓ Updated Anita pansare phone to 9829000006');
    }

    // 4. Worker 3: radha devi
    const w3 = await prisma.user.findFirst({ where: { email: 'radha@gmail.com' } });
    if (w3) {
      await prisma.user.update({
        where: { id: w3.id },
        data: { phone: '9829000007' },
      });
      console.log('✓ Updated Radha devi phone to 9829000007');
    }

    console.log('DONE UPDATING PHONES');
  } catch (err: any) {
    console.error('Error updating phones:', err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
