import { PrismaClient, Role, DutyStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedDemoUsers() {
  console.log('Ensuring all standard demo accounts exist in database...');
  const passwordHash = await bcrypt.hash('password123', 10);
  const pinHash = await bcrypt.hash('1234', 10);

  // 1. Ensure PHC Facility exists
  let facility = await prisma.facility.findFirst();
  if (!facility) {
    facility = await prisma.facility.create({
      data: {
        hfrId: 'HFR-2026-00891',
        name: 'PHC Lunkaransar',
        facilityType: 'PHC',
        district: 'Bikaner',
        state: 'Rajasthan',
        latitude: 28.5305,
        longitude: 73.7432,
      }
    });
  }

  // 2. Doctor: doctor@ruralcare.in and update rushi@gmail.com
  let doctorUser = await prisma.user.findFirst({
    where: { email: 'doctor@ruralcare.in' }
  });
  if (!doctorUser) {
    doctorUser = await prisma.user.create({
      data: {
        email: 'doctor@ruralcare.in',
        phone: '9829000002',
        role: Role.DOCTOR,
        fullName: 'Dr. Ankit Sharma',
        passwordHash,
        pinHash,
        isDemo: true,
        doctorProfile: {
          create: {
            name: 'Dr. Ankit Sharma',
            specialty: 'General Medicine',
            hprId: 'HPR-2026-00142',
            facilityId: facility.id,
            dutyStatus: DutyStatus.AVAILABLE,
          }
        }
      }
    });
    console.log('✓ Created doctor@ruralcare.in');
  } else {
    await prisma.user.update({
      where: { id: doctorUser.id },
      data: { passwordHash, pinHash, isDemo: true }
    });
    console.log('✓ Updated doctor@ruralcare.in password');
  }

  // Also update rushi@gmail.com so rushi's existing doctor account works with password123!
  const rushi = await prisma.user.findFirst({ where: { email: 'rushi@gmail.com' } });
  if (rushi) {
    await prisma.user.update({
      where: { id: rushi.id },
      data: { passwordHash, pinHash, isDemo: true }
    });
    console.log('✓ Updated rushi@gmail.com with password123 & isDemo=true');
  }

  // 3. Worker: asha.worker@ruralcare.in
  let workerUser = await prisma.user.findFirst({
    where: { email: 'asha.worker@ruralcare.in' }
  });
  if (!workerUser) {
    workerUser = await prisma.user.create({
      data: {
        email: 'asha.worker@ruralcare.in',
        phone: '9829000005',
        role: Role.WORKER,
        fullName: 'Meena Kumari (ASHA)',
        passwordHash,
        pinHash,
        isDemo: true,
        workerProfile: {
          create: {
            name: 'Meena Kumari',
            workerCode: 'ASHA-2026-001',
            workerType: 'ASHA',
            village: 'Govindpur',
            subCentre: 'Govindpur SC',
            assignedPhc: facility.name,
            district: 'Bikaner',
            state: 'Rajasthan',
            status: 'ACTIVE'
          }
        }
      }
    });
    console.log('✓ Created asha.worker@ruralcare.in');
  } else {
    await prisma.user.update({
      where: { id: workerUser.id },
      data: { passwordHash, pinHash, isDemo: true }
    });
    console.log('✓ Updated asha.worker@ruralcare.in password');
  }

  // 4. Patient: patient@ruralcare.in and vishwajeetpawade7@gmail.com
  let patientUser = await prisma.user.findFirst({
    where: { email: 'patient@ruralcare.in' }
  });
  if (!patientUser) {
    patientUser = await prisma.user.create({
      data: {
        email: 'patient@ruralcare.in',
        phone: '9414158392',
        role: Role.PATIENT,
        fullName: 'Priya Devi',
        passwordHash,
        pinHash,
        isDemo: true,
        patientProfile: {
          create: {
            healthId: 'RHC-2026-8F4K92',
            name: 'Priya Devi',
            nameHi: 'प्रिया देवी',
            dob: '1996-05-14',
            age: 30,
            gender: 'Female',
            bloodGroup: 'B+',
            phone: '9414158392',
            village: 'Govindpur',
            district: 'Bikaner',
            state: 'Rajasthan',
            address: 'Govindpur, Bikaner, Rajasthan',
            abhaAddress: 'priya.devi@abdm',
            abhaNumber: '91-8472-9103-4821',
            registeredAt: new Date().toISOString(),
            consentStatus: 'GRANTED',
            emergencyContact: { name: 'Ramesh Devi', relation: 'Spouse', phone: '9414158390' }
          }
        }
      }
    });
    console.log('✓ Created patient@ruralcare.in');
  } else {
    await prisma.user.update({
      where: { id: patientUser.id },
      data: { passwordHash, pinHash, isDemo: true }
    });
    console.log('✓ Updated patient@ruralcare.in password');
  }

  const vish = await prisma.user.findFirst({ where: { email: 'vishwajeetpawade7@gmail.com' } });
  if (vish) {
    await prisma.user.update({
      where: { id: vish.id },
      data: { passwordHash, pinHash, isDemo: true }
    });
    console.log('✓ Updated vishwajeetpawade7@gmail.com with password123 & isDemo=true');
  }

  // 5. Admin: admin@ruralcare.in
  let adminUser = await prisma.user.findFirst({
    where: { email: 'admin@ruralcare.in' }
  });
  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: 'admin@ruralcare.in',
        phone: '9829000001',
        role: Role.ADMIN,
        fullName: 'Rajiv Singh (District Admin)',
        passwordHash,
        pinHash,
        isDemo: true
      }
    });
    console.log('✓ Created admin@ruralcare.in');
  } else {
    await prisma.user.update({
      where: { id: adminUser.id },
      data: { passwordHash, pinHash, isDemo: true }
    });
    console.log('✓ Updated admin@ruralcare.in password');
  }

  console.log('All demo users successfully configured!');
  await prisma.$disconnect();
}

seedDemoUsers().catch(console.error);
