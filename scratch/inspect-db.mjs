import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';
const prisma = new PrismaClient();

async function check() {
  const patients = await prisma.patient.findMany({
    select: {
      id: true,
      name: true,
      healthId: true,
      familyDoctorId: true,
      healthWorkerId: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });
  console.log(`Total patients in DB: ${patients.length}`);
  
  // Group by name
  const nameCounts = {};
  for (const p of patients) {
    nameCounts[p.name] = (nameCounts[p.name] || 0) + 1;
  }
  const duplicates = Object.entries(nameCounts).filter(([_, count]) => count > 1);
  console.log('Duplicate patient names in DB:', duplicates);

  const consents = await prisma.consentArtifact.findMany({
    select: {
      id: true,
      patientId: true,
      status: true,
      grantedTo: true,
      role: true,
      purpose: true,
      patient: { select: { name: true, healthId: true } }
    }
  });
  console.log(`\nTotal consents in DB: ${consents.length}`);
  for (const c of consents) {
    console.log(`- Patient: ${c.patient?.name} (${c.patient?.healthId}) | status: ${c.status} | grantedTo: "${c.grantedTo}" | role: ${c.role} | purpose: ${c.purpose}`);
  }

  const doctors = await prisma.doctor.findMany({
    select: { id: true, name: true, facilityId: true }
  });
  console.log(`\nDoctors in DB: ${doctors.length}`);
  for (const d of doctors) {
    console.log(`- Doctor: ${d.name} (id: ${d.id}, phone: ${d.phone}, facilityId: ${d.facilityId})`);
  }

  const users = await prisma.user.findMany({
    select: { id: true, fullName: true, phone: true, role: true }
  });
  console.log(`\nUsers in DB: ${users.length}`);
  for (const u of users) {
    console.log(`- User: ${u.fullName} (${u.role}, phone: ${u.phone}, id: ${u.id})`);
  }
}

check().catch(console.error).finally(() => prisma.$disconnect());
