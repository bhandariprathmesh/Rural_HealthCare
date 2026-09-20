import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
import { checkPatientAccess } from '../server/src/services/accessControl.service.js';

const prisma = new PrismaClient();

async function simulate() {
  // Check Dr. Ankit Sharma (9829000002)
  const user = await prisma.user.findFirst({
    where: { phone: '9829000002' },
    include: { doctorProfile: true }
  });

  console.log('Doctor User:', user?.fullName, user?.id, user?.doctorProfile?.id);

  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: 'desc' }
  });

  for (const p of patients) {
    const res = await checkPatientAccess({
      user: {
        id: user.id,
        role: user.role,
        fullName: user.fullName,
        doctorId: user.doctorProfile?.id,
        facilityId: user.doctorProfile?.facilityId,
      },
      patientIdOrHealthId: p.id,
      requiredScope: 'HEALTH_ASSESSMENT' // Notice scope
    });

    console.log(`Patient: ${p.name.padEnd(22)} (${p.healthId}) -> hasAccess: ${res.hasAccess}, accessType: ${res.accessType}, reason: ${res.reason || ''}`);
  }
}

simulate().catch(console.error).finally(() => prisma.$disconnect());

