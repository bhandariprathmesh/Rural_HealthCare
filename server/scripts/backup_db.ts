import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function backup() {
  console.log('📦 Backing up RuralCare database records...');
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      facilities: await prisma.facility.findMany(),
      users: await prisma.user.findMany(),
      doctors: await prisma.doctor.findMany(),
      workers: await prisma.worker.findMany(),
      patients: await prisma.patient.findMany({
        include: {
          consultations: true,
          referrals: true,
          consentEntries: true,
        },
      }),
      medicines: await prisma.medicine.findMany(),
      appointments: await prisma.appointment.findMany(),
    };

    const outPath = path.join(process.cwd(), 'prisma', 'db_backup.json');
    fs.writeFileSync(outPath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`✅ Backup successfully saved to: ${outPath}`);
    console.log(`   Patients: ${backupData.patients.length} | Doctors: ${backupData.doctors.length} | Appointments: ${backupData.appointments.length}`);
  } catch (err: any) {
    console.error('Backup error:', err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

backup();
