import { PrismaClient, RiskLevel, ReferralPriority, ReferralStatus, DutyStatus, ConsentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function populateDemoData() {
  console.log('========================================================');
  console.log('🌱 POPULATING RURALCARE DEMONSTRATION DATA (PRESERVING LOGINS)');
  console.log('========================================================\n');

  const defaultPinHash = await bcrypt.hash('1234', 10);
  const todayStr = new Date().toISOString().split('T')[0]; // "YYYY-MM-DD"

  // 1. Identify Existing Doctor, Worker, and Patient
  console.log('1. Locating existing accounts to anchor demo data...');
  const doctor = await prisma.doctor.findFirst({
    include: { user: true, facility: true },
  });
  if (!doctor) {
    throw new Error('No doctor found in database. Please ensure seed or registration exists.');
  }
  console.log(`   ✓ Linked to Doctor: ${doctor.name} (${doctor.specialty} at ${doctor.facility.name})`);

  // Ensure slotCapacity is 5 for the capacity limit showcase
  await prisma.doctor.update({
    where: { id: doctor.id },
    data: { slotCapacity: 5, dutyStatus: DutyStatus.AVAILABLE },
  });
  console.log(`   ✓ Configured Doctor slotCapacity to 5 patients / 30-min window`);

  const worker = await prisma.worker.findFirst({
    include: { user: true },
  });
  if (!worker) {
    throw new Error('No healthcare worker found in database.');
  }
  console.log(`   ✓ Linked to ASHA Worker: ${worker.name} (${worker.village})`);

  const primaryPatient = await prisma.patient.findFirst({
    include: { user: true },
  });
  if (!primaryPatient) {
    throw new Error('No primary patient found in database.');
  }
  console.log(`   ✓ Linked to Primary Patient: ${primaryPatient.name} (Health ID: ${primaryPatient.healthId})`);

  // 2. Upsert Additional Demo Patients
  console.log('\n2. Creating demo patient personas (Maternal, NCD, Pediatric, Geriatric)...');

  const demoPatientsData = [
    {
      healthId: 'RHC-2026-3M9P71',
      name: 'Ramesh Kumar',
      nameHi: 'रमेश कुमार',
      age: 45,
      dob: '1981-06-07',
      gender: 'M',
      bloodGroup: 'B+',
      phone: '96729 44501',
      village: 'Khetolai',
      district: doctor.facility.district || 'Bikaner',
      state: 'Rajasthan',
      address: 'Near Shiv Temple, Khetolai',
      chronicConditions: ['Type 2 Diabetes', 'Hypertension'],
      allergies: [],
      currentMedications: ['Metformin 500mg', 'Amlodipine 5mg'],
      emergencyContact: { name: 'Sunita Devi', relation: 'Wife', phone: '98291 30012' },
      riskLevel: RiskLevel.HIGH,
      consentStatus: ConsentStatus.GRANTED,
    },
    {
      healthId: 'RHC-2026-7X2N44',
      name: 'Sunita Bai',
      nameHi: 'सुनीता बाई',
      age: 52,
      dob: '1973-11-19',
      gender: 'F',
      bloodGroup: 'A+',
      phone: '97999 28831',
      village: 'Lunkaransar',
      district: doctor.facility.district || 'Bikaner',
      state: 'Rajasthan',
      address: 'Mohalla Baniyon ka, Lunkaransar',
      chronicConditions: ['Osteoarthritis'],
      allergies: ['Aspirin'],
      currentMedications: ['Calcium 500mg', 'Paracetamol SOS'],
      emergencyContact: { name: 'Kishore Lal', relation: 'Son', phone: '97990 44120' },
      riskLevel: RiskLevel.LOW,
      consentStatus: ConsentStatus.GRANTED,
    },
    {
      healthId: 'RHC-2026-2K8Q15',
      name: 'Mohan Lal',
      nameHi: 'मोहन लाल',
      age: 67,
      dob: '1959-04-02',
      gender: 'M',
      bloodGroup: 'AB+',
      phone: '94620 91004',
      village: 'Deshnok',
      district: doctor.facility.district || 'Bikaner',
      state: 'Rajasthan',
      address: 'Purana Bazaar, Deshnok',
      chronicConditions: ['COPD', 'Hypertension Stage 3', 'CKD Stage 2'],
      allergies: ['Ibuprofen'],
      currentMedications: ['Tiotropium Inhaler', 'Losartan 50mg'],
      emergencyContact: { name: 'Geeta Devi', relation: 'Daughter', phone: '98288 77601' },
      riskLevel: RiskLevel.CRITICAL,
      consentStatus: ConsentStatus.GRANTED,
    },
    {
      healthId: 'RHC-2026-9R6T83',
      name: 'Kavita Sharma',
      nameHi: 'कविता शर्मा',
      age: 34,
      dob: '1992-08-28',
      gender: 'F',
      bloodGroup: 'O-',
      phone: '95291 60772',
      village: 'Govindpur',
      district: doctor.facility.district || 'Bikaner',
      state: 'Rajasthan',
      address: 'Ward No. 7, Govindpur',
      chronicConditions: ['Severe Pre-eclampsia (34 weeks pregnant)'],
      allergies: ['Sulfa drugs'],
      currentMedications: ['Labetalol 100mg BD', 'Iron & Folic Acid'],
      emergencyContact: { name: 'Ashok Sharma', relation: 'Husband', phone: '98294 50011' },
      riskLevel: RiskLevel.CRITICAL,
      consentStatus: ConsentStatus.GRANTED,
    },
  ];

  const createdPatients: any[] = [primaryPatient];

  for (const p of demoPatientsData) {
    let patientRecord = await prisma.patient.findUnique({
      where: { healthId: p.healthId },
    });

    if (!patientRecord) {
      // Create user first
      const cleanPhone = p.phone.replace(/\D/g, '').slice(-10);
      let user = await prisma.user.findFirst({ where: { phone: cleanPhone } });
      if (!user) {
        user = await prisma.user.create({
          data: {
            phone: cleanPhone,
            role: 'PATIENT',
            fullName: p.name,
            pinHash: defaultPinHash,
          },
        });
      }

      patientRecord = await prisma.patient.create({
        data: {
          healthId: p.healthId,
          userId: user.id,
          name: p.name,
          nameHi: p.nameHi,
          age: p.age,
          dob: p.dob,
          gender: p.gender,
          bloodGroup: p.bloodGroup,
          phone: p.phone,
          village: p.village,
          district: p.district,
          state: p.state,
          address: p.address,
          chronicConditions: p.chronicConditions,
          allergies: p.allergies,
          currentMedications: p.currentMedications,
          emergencyContact: p.emergencyContact,
          riskLevel: p.riskLevel,
          registeredAt: todayStr,
          consentStatus: p.consentStatus,
        },
      });
    }
    createdPatients.push(patientRecord);
    console.log(`   ✓ Patient ready: ${patientRecord.name} (${patientRecord.healthId}, ${patientRecord.riskLevel})`);
  }

  // 3. Populate OPD Appointments & Slot Capacity Queue
  console.log('\n3. Populating today\'s OPD Appointments across 3 capacity slots...');

  // Clean existing appointments for today for this doctor to avoid duplicate collisions
  await prisma.appointment.deleteMany({
    where: {
      doctorId: doctor.id,
      scheduledDate: todayStr,
    },
  });

  // Slot A: 10:00 AM - 10:30 AM (Active Queue: 3 patients booked, 2 spots left)
  const slotA = '10:00 AM - 10:30 AM';
  const slotAAppointments = [
    {
      patient: primaryPatient,
      tokenNumber: 1,
      priority: 'HIGH_RISK' as const,
      reason: 'Third trimester BP spike (155/98) & persistent morning headache',
    },
    {
      patient: createdPatients[1], // Ramesh Kumar
      tokenNumber: 2,
      priority: 'ROUTINE' as const,
      reason: 'Routine diabetic follow-up & fasting blood glucose review',
    },
    {
      patient: createdPatients[2], // Sunita Bai
      tokenNumber: 3,
      priority: 'ROUTINE' as const,
      reason: 'Joint stiffness & medication renewal',
    },
  ];

  for (const item of slotAAppointments) {
    await prisma.appointment.create({
      data: {
        appointmentCode: `APT-${Date.now().toString().slice(-4)}-${item.tokenNumber}`,
        patientId: item.patient.id,
        doctorId: doctor.id,
        facilityId: doctor.facilityId,
        scheduledDate: todayStr,
        timeSlot: slotA,
        tokenNumber: item.tokenNumber,
        priority: item.priority,
        status: 'CONFIRMED',
        reason: item.reason,
        source: 'PATIENT',
      },
    });
    console.log(`   ✓ Slot 10:00 AM: Token #${String(item.tokenNumber).padStart(2, '0')} - ${item.patient.name} (${item.priority})`);
  }

  // Slot B: 11:00 AM - 11:30 AM (FULL Slot demonstration: 5/5 capacity)
  const slotB = '11:00 AM - 11:30 AM';
  for (let i = 1; i <= 5; i++) {
    const p = createdPatients[(i % (createdPatients.length - 1)) + 1];
    await prisma.appointment.create({
      data: {
        appointmentCode: `APT-FL-${Date.now().toString().slice(-4)}-${i + 3}`,
        patientId: p.id,
        doctorId: doctor.id,
        facilityId: doctor.facilityId,
        scheduledDate: todayStr,
        timeSlot: slotB,
        tokenNumber: i + 3,
        priority: i === 1 ? 'HIGH_RISK' : 'ROUTINE',
        status: 'CONFIRMED',
        reason: `OPD Queue Consultation #${i + 3}`,
        source: 'ASHA',
        bookedByWorkerId: worker.id,
      },
    });
  }
  console.log(`   ✓ Slot 11:00 AM: 5 appointments created (Marks slot as [FULL 5/5])`);

  // Slot C: 02:00 PM - 02:30 PM (1 booked, 4 spots left for live demo booking)
  const slotC = '02:00 PM - 02:30 PM';
  await prisma.appointment.create({
    data: {
      appointmentCode: `APT-OP-${Date.now().toString().slice(-4)}-09`,
      patientId: createdPatients[3].id, // Mohan Lal
      doctorId: doctor.id,
      facilityId: doctor.facilityId,
      scheduledDate: todayStr,
      timeSlot: slotC,
      tokenNumber: 9,
      priority: 'ROUTINE',
      status: 'CONFIRMED',
      reason: 'Post-discharge respiratory monitoring',
      source: 'PATIENT',
    },
  });
  console.log(`   ✓ Slot 02:00 PM: 1 appointment created (Displays [4 spots left])`);

  // Clean old referrals for this doctor/patients or matching demo codes
  const refCodes = ['REF-2026-EM01', 'REF-2026-UR02', 'REF-2026-RT03'];
  await prisma.referral.deleteMany({
    where: {
      OR: [
        { toFacilityId: doctor.facilityId },
        { referralCode: { in: refCodes } },
      ],
    },
  });

  const demoReferrals = [
    {
      code: 'REF-2026-EM01',
      patient: createdPatients[4], // Kavita Sharma
      priority: ReferralPriority.EMERGENCY,
      reason: 'Severe Pre-eclampsia with BP 175/115 mmHg, epigastric pain & hyperreflexia — urgent teleconsultation required',
      riskLevel: RiskLevel.CRITICAL,
      status: ReferralStatus.ACCEPTED,
      aiSummary: 'AI Triage: 95% Confidence Emergency Pre-eclampsia. Immediate Labetalol & Obstetric Teleconsultation recommended.',
    },
    {
      code: 'REF-2026-UR02',
      patient: createdPatients[3], // Mohan Lal
      priority: ReferralPriority.URGENT,
      reason: 'Acute COPD exacerbation with SpO2 88% and bilateral wheezing — specialist guidance required',
      riskLevel: RiskLevel.CRITICAL,
      status: ReferralStatus.IN_CONSULTATION,
      aiSummary: 'AI Triage: Hypoxaemia and bronchial obstruction. Nebulization and oxygen titration advised.',
    },
    {
      code: 'REF-2026-RT03',
      patient: createdPatients[1], // Ramesh Kumar
      priority: ReferralPriority.ROUTINE,
      reason: 'Diabetic peripheral neuropathy and recurring microalbuminuria follow-up',
      riskLevel: RiskLevel.HIGH,
      status: ReferralStatus.ACCEPTED,
      aiSummary: 'AI Triage: Chronic microvascular complication check. Glycemic control review.',
    },
  ];

  for (const ref of demoReferrals) {
    await prisma.referral.create({
      data: {
        referralCode: ref.code,
        patientId: ref.patient.id,
        patientName: ref.patient.name,
        fromWorker: worker.name,
        fromWorkerId: worker.userId,
        toFacilityId: doctor.facilityId,
        toPHC: doctor.facility.name,
        reason: ref.reason,
        riskLevel: ref.riskLevel,
        status: ref.status,
        date: todayStr,
        priority: ref.priority,
        aiSummary: ref.aiSummary,
      },
    });
    console.log(`   ✓ Referral: [${ref.priority}] ${ref.patient.name} - ${ref.reason.slice(0, 45)}...`);
  }

  // 5. Populate Active Emergency SOS Alert
  console.log('\n5. Populating active SOS Emergency in DoctorSosInbox...');

  await prisma.sosAlert.deleteMany({
    where: { facilityId: doctor.facilityId },
  });

  const activeSos = await prisma.sosAlert.create({
    data: {
      sosCode: `SOS-2026-${Date.now().toString().slice(-4)}`,
      fromName: `${worker.name} (ASHA)`,
      role: 'ASHA',
      raisedByWorkerId: worker.id,
      patientId: createdPatients[4].id, // Kavita Sharma
      patientHealthId: createdPatients[4].healthId,
      facilityId: doctor.facilityId,
      targetedDoctorId: doctor.id,
      location: 'Govindpur Sub-Centre, Bikaner (28.5305° N, 73.7432° E)',
      ts: '3 mins ago',
      status: 'PENDING',
      escalationLevel: 1,
      escalationDeadline: new Date(Date.now() + 60 * 1000),
      timeoutSeconds: 90,
      vitalsSnapshot: 'BP: 80/50 mmHg, HR: 135 bpm, SpO2: 92% | Acute Maternal Shock & Bleeding',
      createdAt: new Date(Date.now() - 3 * 60 * 1000),
    },
  });
  console.log(`   ✓ Active SOS Alert created: ${activeSos.sosCode} for ${createdPatients[4].name} (Status: PENDING in Doctor SOS Inbox)`);

  // 6. Populate Past Clinical Consultations & Prescriptions
  console.log('\n6. Populating past clinical consultations & prescriptions...');

  const demoConsultations = [
    {
      patient: primaryPatient,
      symptoms: ['Fever', 'Mild headache', 'Nausea'],
      vitals: { bloodPressure: '120/80', temperature: 100.2, heartRate: 78, spo2: 98, weight: 54 },
      diagnosis: 'Seasonal Viral Pyrexia with mild dehydration',
      prescription: [
        'Paracetamol 650mg (1 TDS post meals × 3 days)',
        'Oral Rehydration Salts (ORS) (1 sachet in 1L water daily)',
        'Vitamin C 500mg (1 OD × 5 days)',
      ],
      notes: 'Patient advised oral hydration, bed rest. If fever persists beyond 3 days, review CBC.',
      risk: RiskLevel.LOW,
    },
    {
      patient: createdPatients[1], // Ramesh Kumar
      symptoms: ['Increased thirst', 'Frequent urination', 'Fatigue'],
      vitals: { bloodPressure: '138/88', temperature: 98.4, heartRate: 82, spo2: 97, weight: 78 },
      diagnosis: 'Suboptimally Controlled Type 2 Diabetes Mellitus',
      prescription: [
        'Metformin 500mg (1 BD post meals)',
        'Glimepiride 1mg (1 OD before breakfast)',
        'Amlodipine 5mg (1 OD at bedtime)',
      ],
      notes: 'Fasting blood glucose was 168 mg/dL. Strict dietary restriction advised.',
      risk: RiskLevel.MODERATE,
    },
    {
      patient: createdPatients[3], // Mohan Lal
      symptoms: ['Productive cough', 'Shortness of breath on exertion'],
      vitals: { bloodPressure: '144/92', temperature: 99.1, heartRate: 94, spo2: 91, weight: 64 },
      diagnosis: 'Chronic Obstructive Pulmonary Disease (COPD) Grade 2',
      prescription: [
        'Tiotropium 18mcg Rotacap (1 Inhalation OD)',
        'Formoterol + Budesonide Inhaler (2 puffs BD)',
        'Azithromycin 500mg (1 OD × 5 days)',
      ],
      notes: 'Chest auscultation revealed bilateral rhonchi. Oxygen saturation 91%. Inhaler technique demonstrated.',
      risk: RiskLevel.HIGH,
    },
  ];

  for (let i = 0; i < demoConsultations.length; i++) {
    const c = demoConsultations[i];
    const consultCode = `CON-2026-DEMO-${i + 1}`;

    const existing = await prisma.consultation.findUnique({
      where: { consultationCode: consultCode },
    });

    if (!existing) {
      await prisma.consultation.create({
        data: {
          consultationCode: consultCode,
          patientId: c.patient.id,
          doctorId: doctor.id,
          doctorName: doctor.name,
          workerId: worker.userId,
          workerName: worker.name,
          facilityName: doctor.facility.name,
          date: todayStr,
          time: `0${9 + i}:30 AM`,
          symptoms: c.symptoms,
          vitals: c.vitals,
          diagnosis: c.diagnosis,
          prescription: c.prescription,
          notes: c.notes,
          riskLevel: c.risk,
          referralStatus: 'completed',
          treatment: 'Prescription issued & lifestyle counselling provided',
          followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
      });
      console.log(`   ✓ Consultation #${i + 1}: ${c.patient.name} - ${c.diagnosis.slice(0, 40)}...`);
    }
  }

  // 7. Populate Emergency "Break-Glass" Access Log
  console.log('\n7. Populating Emergency Access Break-Glass audit log...');
  await prisma.emergencyAccessLog.deleteMany({
    where: { doctorId: doctor.id },
  });

  await prisma.emergencyAccessLog.create({
    data: {
      logCode: `EAL-${Date.now().toString().slice(-4)}`,
      patientId: createdPatients[4].id, // Kavita Sharma
      patientHealthId: createdPatients[4].healthId,
      patientName: createdPatients[4].name,
      doctorId: doctor.id,
      doctorName: doctor.name,
      facilityId: doctor.facilityId,
      facilityName: doctor.facility.name,
      reason: 'Life-threatening acute maternal emergency',
      note: 'Emergency Access invoked during SOS escalation to access baseline obstetric and blood group records.',
      started: `${todayStr}, 10:15 AM`,
      ended: `${todayStr}, 10:30 AM`,
      duration: '15 min',
      records: 'Complete Obstetric History, Vitals, Allergies',
      addlRequested: true,
      status: 'Completed',
    },
  });
  console.log(`   ✓ Emergency Break-Glass access logged for ${createdPatients[4].name}`);

  console.log('\n========================================================');
  console.log('🎉 ALL DEMONSTRATION DATA POPULATED SUCCESSFULLY!');
  console.log('========================================================\n');
  console.log('Demo Highlights Ready to Show on Camera:');
  console.log(`1. Doctor Dashboard (Tab 1: OPD Queue): 3 slots showing Token Queue, FULL slot (11:00 AM), and Available slot (02:00 PM)`);
  console.log(`2. Doctor Dashboard (Tab 2: Referrals): 3 clinical referrals with 1-click Teleconsult buttons`);
  console.log(`3. Doctor SOS Inbox: 1 active Emergency SOS alert with GPS and dispatch actions`);
  console.log(`4. Health Assessment: Booked OPD patients top-pinned with token chips and consent bypass`);
  console.log(`5. Patient Mobile Dashboard: Booked appointment with Token #01, active prescription, and vitals`);
}

populateDemoData()
  .catch((e) => {
    console.error('❌ Error populating demo data:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
