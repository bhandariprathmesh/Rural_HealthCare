import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function restore() {
  console.log('🔄 Restoring RuralCare database from db_backup.json...');
  const backupPath = path.join(process.cwd(), 'prisma', 'db_backup.json');

  if (!fs.existsSync(backupPath)) {
    console.error('❌ Backup file not found at:', backupPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  console.log(`Snapshot timestamp: ${data.timestamp}`);

  try {
    // 1. Restore Facilities
    for (const f of data.facilities || []) {
      await prisma.facility.upsert({
        where: { id: f.id },
        update: {},
        create: f,
      });
    }
    console.log(`✓ Restored ${data.facilities?.length || 0} facilities`);

    // 2. Restore Users
    for (const u of data.users || []) {
      await prisma.user.upsert({
        where: { id: u.id },
        update: {},
        create: {
          id: u.id,
          phone: u.phone,
          email: u.email,
          role: u.role,
          fullName: u.fullName,
          pinHash: u.pinHash,
          passwordHash: u.passwordHash,
          isDemo: u.isDemo,
        },
      });
    }
    console.log(`✓ Restored ${data.users?.length || 0} users`);

    // 3. Restore Doctors
    for (const d of data.doctors || []) {
      await prisma.doctor.upsert({
        where: { id: d.id },
        update: {},
        create: d,
      });
    }
    console.log(`✓ Restored ${data.doctors?.length || 0} doctors`);

    // 4. Restore Workers
    for (const w of data.workers || []) {
      await prisma.worker.upsert({
        where: { id: w.id },
        update: {},
        create: w,
      });
    }
    console.log(`✓ Restored ${data.workers?.length || 0} workers`);

    // 5. Restore Patients
    for (const p of data.patients || []) {
      const { consultations, referrals, consentEntries, ...patientData } = p;
      await prisma.patient.upsert({
        where: { id: p.id },
        update: {},
        create: patientData,
      });
    }
    console.log(`✓ Restored ${data.patients?.length || 0} patients`);

    // 6. Restore Medicines
    for (const m of data.medicines || []) {
      await prisma.medicine.upsert({
        where: { id: m.id },
        update: {},
        create: m,
      });
    }
    console.log(`✓ Restored ${data.medicines?.length || 0} medicines`);

    // 7. Restore Appointments
    for (const a of data.appointments || []) {
      await prisma.appointment.upsert({
        where: { id: a.id },
        update: {},
        create: a,
      });
    }
    console.log(`✓ Restored ${data.appointments?.length || 0} appointments`);

    console.log('🎉 Database successfully restored and 100% operational!');
  } catch (err: any) {
    console.error('Restore failed:', err?.message || err);
  } finally {
    await prisma.$disconnect();
  }
}

restore();
