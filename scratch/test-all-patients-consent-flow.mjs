import jwt from '../server/node_modules/jsonwebtoken/index.js';
import { PrismaClient } from '../server/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'ruralcare_jwt_super_secret_key_change_in_production_2026';
const API_BASE = 'http://localhost:5000/api/v1';

async function run() {
  console.log('================================================================');
  console.log('🧪 VERIFYING DEDUPLICATION & UNIVERSAL PATIENT CONSENT FLOW');
  console.log('================================================================\n');

  // Reset any doctor consents before running
  await prisma.consentArtifact.deleteMany({
    where: { role: { in: ['Doctor', 'DOCTOR', 'Physician', 'Medical Officer'] } }
  });

  // 1. Doctor token (Dr. Ankit Sharma)
  const doctorToken = jwt.sign(
    {
      id: 'b44751f9-2d31-48e5-b814-fa9742b4bcf6',
      phone: '9829000002',
      role: 'DOCTOR',
      fullName: 'Dr. Ankit Sharma',
      doctorId: '64701059-b506-47dd-9a43-50cf647628b5',
      facilityId: '00867472-14f1-474f-8e00-92f84c28aa63',
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // 2. Fetch all patients
  console.log('1. Fetching all patients from API...');
  const listRes = await fetch(`${API_BASE}/patients`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const listData = await listRes.json();
  const patients = listData.data.patients;
  console.log(`✓ Fetched ${patients.length} patients.`);

  // Verify uniqueness (each name appears only once)
  const names = patients.map((p) => p.name.trim().toLowerCase());
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    throw new Error(`Duplicate patient detected! Found ${names.length} patients but only ${uniqueNames.size} unique names.`);
  }
  console.log('✓ VERIFIED: Zero duplicate patients! Every patient is mentioned only once.\n');

  // 3. Verify ALL patients require consent initially
  console.log('2. Verifying ALL patients require consent for Health Assessment...');
  for (const p of patients) {
    const pRes = await fetch(`${API_BASE}/patients/${p.healthId}?purpose=health_assessment`, {
      headers: { Authorization: `Bearer ${doctorToken}` },
    });
    const pData = await pRes.json();
    const hasAccess = pData.data.hasAccess;
    const activeConsent = pData.data.activeConsent;
    if (hasAccess === true && activeConsent) {
      throw new Error(`Patient ${p.name} unexpectedly has access!`);
    }
    console.log(`  - ${p.name.padEnd(20)} (${p.healthId}): hasAccess = ${hasAccess} (CONSENT REQUIRED)`);
  }
  console.log('✓ VERIFIED: ALL patients require consent initially!\n');

  // 4. Doctor submits access request for Patient 1 (Rukmini Bai)
  const patient1 = patients.find((p) => p.name.includes('Rukmini Bai'));
  console.log(`3. Submitting consent request for ${patient1.name} (${patient1.healthId})...`);
  const req1Res = await fetch(`${API_BASE}/patients/${patient1.id}/access-requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${doctorToken}`,
    },
    body: JSON.stringify({
      duration: '1 month',
      reason: 'Health assessment, vital signs triage, and clinical evaluation',
      dataScope: ['Basic Information', 'Consultation History', 'HEALTH_ASSESSMENT'],
    }),
  });
  const req1Data = await req1Res.json();
  if (!req1Data.success) {
    throw new Error(`Failed to create access request: ${JSON.stringify(req1Data)}`);
  }
  const consentArtifact = req1Data.data.request || req1Data.data.consentArtifact;
  console.log(`✓ Request created: Code = ${consentArtifact.consentCode}, Status = ${consentArtifact.status}`);

  // 5. Verify Patient 1 now has pending request
  console.log('\n4. Verifying Patient 1 now shows pending request...');
  const p1Check = await fetch(`${API_BASE}/patients/${patient1.healthId}?purpose=health_assessment`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const p1CheckData = await p1Check.json();
  if (!p1CheckData.data.pendingRequest || p1CheckData.data.pendingRequest.consentCode !== consentArtifact.consentCode) {
    throw new Error('Pending request not returned for Patient 1');
  }
  console.log(`✓ Verified: Pending request ${p1CheckData.data.pendingRequest.consentCode} is returned for ${patient1.name}`);

  // 6. Verify other patients do NOT see Patient 1's pending request
  const patient2 = patients.find((p) => p.name.includes('Mohan Lal'));
  const p2Check = await fetch(`${API_BASE}/patients/${patient2.healthId}?purpose=health_assessment`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const p2CheckData = await p2Check.json();
  if (p2CheckData.data.pendingRequest) {
    throw new Error(`Patient 2 unexpectedly has pending request from Patient 1!`);
  }
  console.log(`✓ Verified: Patient 2 (${patient2.name}) has NO pending request (0 leakage).`);

  // 7. Patient 1 approves request
  console.log('\n5. Patient 1 approves Doctor request...');
  // Patient token for Rukmini Bai
  const p1Token = jwt.sign(
    {
      id: patient1.userId || 'test-user-id',
      phone: patient1.phone,
      role: 'PATIENT',
      fullName: patient1.name,
      patientId: patient1.id,
    },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  const approveRes = await fetch(`${API_BASE}/abdm/mock/consents/${consentArtifact.id}/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p1Token}`,
    },
    body: JSON.stringify({
      dataScope: ['Basic Information', 'Consultation History', 'HEALTH_ASSESSMENT'],
    }),
  });
  const approveData = await approveRes.json();
  if (approveData.status !== 'success' && !approveData.success) {
    throw new Error(`Failed to approve consent: ${JSON.stringify(approveData)}`);
  }
  const approvedConsent = approveData.data?.consent || approveData.data;
  console.log(`✓ Consent approved! Status = ${approvedConsent.status}`);

  // 8. Verify Doctor now HAS access to Patient 1, but STILL BLOCKED on Patient 2
  console.log('\n6. Verifying Doctor access unlocked ONLY for Patient 1...');
  const p1DocCheck = await fetch(`${API_BASE}/patients/${patient1.healthId}`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const p1DocData = await p1DocCheck.json();
  if (!p1DocData.data.hasAccess) {
    throw new Error('Doctor should have access to Patient 1 now!');
  }
  console.log(`✓ Doctor access to ${patient1.name}: GRANTED (hasAccess = true)`);

  const p2DocCheck = await fetch(`${API_BASE}/patients/${patient2.healthId}?purpose=health_assessment`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const p2DocData = await p2DocCheck.json();
  if (p2DocData.data.hasAccess) {
    throw new Error('Doctor should NOT have access to Patient 2!');
  }
  console.log(`✓ Doctor access to ${patient2.name}: STILL BLOCKED (hasAccess = false)`);

  // 9. Revoke Patient 1 consent to leave clean slate
  console.log('\n7. Patient 1 revokes Doctor consent...');
  const revokeRes = await fetch(`${API_BASE}/abdm/mock/consents/${consentArtifact.id}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${p1Token}`,
    },
  });
  const revokeData = await revokeRes.json();
  const revokedConsent = revokeData.data?.consent || revokeData.data;
  console.log(`✓ Consent revoked! Status = ${revokedConsent.status}`);

  // 10. Verify Doctor is blocked again
  const p1FinalCheck = await fetch(`${API_BASE}/patients/${patient1.healthId}?purpose=health_assessment`, {
    headers: { Authorization: `Bearer ${doctorToken}` },
  });
  const p1FinalData = await p1FinalCheck.json();
  if (p1FinalData.data.hasAccess) {
    throw new Error('Doctor should be blocked after revocation!');
  }
  console.log(`✓ Doctor access to ${patient1.name} after revocation: BLOCKED (hasAccess = false)`);

  console.log('\n================================================================');
  console.log('🎉 ALL TESTS PASSED (100%)! ZERO DUPLICATES, UNIVERSAL CONSENT VERIFIED!');
  console.log('================================================================');
  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error('❌ Test failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
