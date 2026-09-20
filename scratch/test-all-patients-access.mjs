import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
import { checkPatientAccess } from '../server/src/services/accessControl.service.js';

const prisma = new PrismaClient();

async function run() {
  const doctors = await prisma.user.findMany({
    where: { role: 'DOCTOR' },
    include: { doctorProfile: true }
  });

  const patients = await prisma.patient.findMany({
    orderBy: { createdAt: 'desc' }
  });

  for (const docUser of doctors) {
    console.log(`\n==================================================`);
    console.log(`DOCTOR: ${docUser.fullName} (id: ${docUser.id}, doctorId: ${docUser.doctorProfile?.id})`);
    console.log(`==================================================`);

    for (const p of patients) {
      const userParam = {
        id: docUser.id,
        role: docUser.role,
        fullName: docUser.fullName,
        doctorId: docUser.doctorProfile?.id,
        facilityId: docUser.doctorProfile?.facilityId,
      };

      const result = await checkPatientAccess({
        user: userParam,
        patientIdOrHealthId: p.id,
      });

      console.log(`Patient: ${p.name.padEnd(20)} (${p.healthId}) -> hasAccess: ${result.hasAccess}, accessType: ${result.accessType}, pendingRequest: ${result.pendingRequest ? result.pendingRequest.consentCode : 'none'}`);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());

