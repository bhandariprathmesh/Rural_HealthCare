import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  try {
    const users = await prisma.user.findMany({
      include: {
        doctorProfile: { select: { id: true, name: true, specialty: true } },
        patientProfile: { select: { id: true, name: true, healthId: true } },
        workerProfile: { select: { id: true, name: true, workerType: true, village: true } },
      },
      orderBy: { role: 'asc' }
    });

    console.log('TOTAL_USERS:', users.length);
    for (const u of users) {
      console.log(JSON.stringify({
        id: u.id,
        phone: u.phone,
        email: u.email,
        name: u.fullName,
        role: u.role,
        hasPin: Boolean(u.pinHash),
        hasPassword: Boolean(u.passwordHash),
        isDemo: u.isDemo,
        profile: u.doctorProfile?.name || u.patientProfile?.name || u.workerProfile?.name || 'Admin',
        extra: u.patientProfile?.healthId || u.doctorProfile?.specialty || u.workerProfile?.village || ''
      }));
    }
  } catch (err: any) {
    console.error('DB ERROR:', err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
