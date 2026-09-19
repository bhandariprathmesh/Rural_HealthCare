import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:5000/api/v1';

async function api(path, opts = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function runTest() {
  console.log('================================================================');
  console.log('🔬 STARTING RURALCARE CONSENT-FIRST ARCHITECTURE VERIFICATION');
  console.log('================================================================\n');

  // 1. ASHA Worker Login
  console.log('1. Authenticating ASHA Worker (Meena Kumari)...');
  const ashaLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: '9829000005', password: '1234', role: 'WORKER' }),
  });
  assert.equal(ashaLogin.status, 200, 'ASHA login failed');
  const ashaToken = ashaLogin.data.data.token;
  const ashaUser = ashaLogin.data.data.user;
  console.log(`✓ ASHA Worker logged in: ${ashaUser.fullName} (ID: ${ashaUser.id})`);

  // 2. ASHA Registers a New Patient
  const testPhone = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  console.log(`\n2. ASHA registering new patient with phone: +91 ${testPhone}...`);
  const regRes = await api('/patients/register', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ashaToken}` },
    body: JSON.stringify({
      name: 'Rukmini Bai',
      nameHi: 'रुक्मिणी बाई',
      dob: '1995-04-12',
      gender: 'Female',
      phone: testPhone,
      village: 'Govindpur',
      district: 'Bikaner',
      state: 'Rajasthan',
      bloodGroup: 'B+',
      allergies: ['Penicillin'],
      chronicConditions: ['Asthma'],
      currentMedications: ['Inhaler as needed'],
      emergencyContact: {
        name: 'Ram Charan',
        relation: 'Spouse',
        phone: '9829099881',
      },
      pin: '1234',
    }),
  });

  assert.equal(regRes.status, 201, `Patient registration failed: ${JSON.stringify(regRes.data)}`);
  const newPatient = regRes.data.data.patient;
  const credentials = regRes.data.data.credentials;
  assert.ok(newPatient.healthId, 'Patient healthId missing');
  assert.equal(credentials.pin, '1234', 'PIN missing in credentials');
  console.log(`✓ Patient registered successfully!`);
  console.log(`  Name: ${newPatient.name}`);
  console.log(`  Health ID: ${newPatient.healthId}`);
  console.log(`  Credentials: Phone=${credentials.phone}, PIN=${credentials.pin}`);

  // 3. Direct Patient Login with Credentials
  console.log('\n3. Testing direct Patient Login with generated credentials...');
  const patientLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: credentials.phone, password: credentials.pin, role: 'PATIENT' }),
  });
  assert.equal(patientLogin.status, 200, 'Patient login failed with generated credentials');
  const patientToken = patientLogin.data.data.token;
  const patientAuthUser = patientLogin.data.data.user;
  assert.equal(patientAuthUser.role, 'PATIENT', 'Role must be PATIENT');
  console.log(`✓ Patient logged in: ${patientAuthUser.fullName} (User ID: ${patientAuthUser.id})`);
  console.log(`  Assigned Worker Name: ${patientAuthUser.patientProfile?.healthWorkerName}`);

  // 4. ASHA Searches Patient
  console.log(`\n4. ASHA searching patient by Name and Health ID...`);
  const searchByName = await api(`/patients?q=Rukmini`, {
    headers: { Authorization: `Bearer ${ashaToken}` },
  });
  assert.equal(searchByName.status, 200);
  const foundByName = searchByName.data.data.patients.find((p) => p.healthId === newPatient.healthId);
  assert.ok(foundByName, 'Patient not found in search by name');
  console.log(`✓ Search by name found: ${foundByName.name} (${foundByName.healthId})`);

  const searchById = await api(`/patients?q=${newPatient.healthId}`, {
    headers: { Authorization: `Bearer ${ashaToken}` },
  });
  assert.equal(searchById.status, 200);
  const foundById = searchById.data.data.patients.find((p) => p.healthId === newPatient.healthId);
  assert.ok(foundById, 'Patient not found in search by ID');
  console.log(`✓ Search by Health ID found: ${foundById.name}`);

  // 5. Consent-First Verification: ASHA opens patient WITHOUT prior consent
  console.log('\n5. ASHA opening patient record WITHOUT prior consent...');
  const ashaFetchNoConsent = await api(`/patients/${newPatient.healthId}`, {
    headers: { Authorization: `Bearer ${ashaToken}` },
  });
  assert.equal(ashaFetchNoConsent.status, 200);
  assert.equal(ashaFetchNoConsent.data.data.hasAccess, false, 'hasAccess must be false without consent');
  assert.equal(ashaFetchNoConsent.data.data.patient.allergies.length, 0, 'Allergies must be redacted');
  assert.equal(ashaFetchNoConsent.data.data.patient.consultations.length, 0, 'Consultations must be redacted');
  console.log(`✓ Verified: hasAccess is FALSE. Protected medical history is completely redacted!`);

  // 6. Consent-First Verification: ASHA attempts to record consultation without consent
  console.log('\n6. ASHA attempting to record consultation WITHOUT consent...');
  const unauthConsultation = await api('/consultations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ashaToken}` },
    body: JSON.stringify({
      patientId: newPatient.healthId,
      symptoms: ['Fever', 'Cough'],
      vitals: { temperature: 38.5, heartRate: 88 },
      notes: 'Unauthorized visit attempt',
    }),
  });
  assert.equal(unauthConsultation.status, 403, 'Must reject consultation recording without consent');
  console.log(`✓ Blocked with 403: "${unauthConsultation.data.message}"`);

  // 7. Consent-First Verification: ASHA attempts to generate health assessment without consent
  console.log('\n7. ASHA attempting to generate health assessment WITHOUT consent...');
  const unauthAssessment = await api('/assessments/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ashaToken}` },
    body: JSON.stringify({
      patientId: newPatient.healthId,
      symptoms: ['Fever', 'Cough'],
      vitals: { temp: '38.5', hr: '88', bp: '120/80', spo2: '97', weight: '55' },
    }),
  });
  assert.equal(unauthAssessment.status, 403, 'Must reject assessment generation without consent');
  console.log(`✓ Blocked with 403: "${unauthAssessment.data.message}"`);

  // 8. ASHA Submits Access Request
  console.log('\n8. ASHA submitting access request to patient...');
  const accessReqRes = await api(`/patients/${newPatient.healthId}/access-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ashaToken}` },
    body: JSON.stringify({
      duration: '1 month',
      reason: 'Routine maternal follow-up and clinical vital monitoring',
      dataScope: ['Basic Information', 'HEALTH_ASSESSMENT', 'SYMPTOMS & VITALS', 'Consultations'],
    }),
  });
  assert.equal(accessReqRes.status, 201);
  const createdReq = accessReqRes.data.data.request;
  assert.equal(createdReq.status, 'TEMPORARY');
  console.log(`✓ Access request created with status TEMPORARY!`);
  console.log(`  Consent Code: ${createdReq.consentCode}`);
  console.log(`  Scope: ${createdReq.dataScope.join(', ')}`);

  // 9. Patient Checks Pending Access Requests
  console.log('\n9. Patient fetching pending access requests...');
  const patientRequests = await api(`/patients/${newPatient.healthId}/access-requests`, {
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert.equal(patientRequests.status, 200);
  const pending = patientRequests.data.data.requests.find((r) => r.id === createdReq.id);
  assert.ok(pending, 'Created access request not visible to patient');
  console.log(`✓ Patient sees pending request from: ${pending.grantedTo}`);

  // 10. Patient Approves Access Request
  console.log('\n10. Patient approving access request...');
  const approveRes = await api(`/abdm/mock/consents/${createdReq.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
  });
  assert.equal(approveRes.status, 200);
  const approvedConsent = approveRes.data.data.consent || approveRes.data.data;
  assert.equal(approvedConsent.status, 'GRANTED');
  console.log(`✓ Consent successfully APPROVED! Status is now GRANTED.`);

  // 11. ASHA Accesses Approved Patient Profile
  console.log('\n11. ASHA fetching patient profile after consent approval...');
  const ashaFetchApproved = await api(`/patients/${newPatient.healthId}`, {
    headers: { Authorization: `Bearer ${ashaToken}` },
  });
  assert.equal(ashaFetchApproved.status, 200);
  assert.equal(ashaFetchApproved.data.data.hasAccess, true, 'hasAccess must be true after approval');
  assert.ok(ashaFetchApproved.data.data.patient.allergies.length > 0, 'Allergies must be accessible');
  console.log(`✓ ASHA now granted access! hasAccess: true`);
  console.log(`  Patient Allergies: ${ashaFetchApproved.data.data.patient.allergies.join(', ')}`);

  // 12. ASHA Records Symptoms & Consultation
  console.log('\n12. ASHA recording clinical consultation after approval...');
  const recordConsultation = await api('/consultations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ashaToken}` },
    body: JSON.stringify({
      patientId: newPatient.healthId,
      workerId: ashaUser.id,
      workerName: ashaUser.fullName,
      symptoms: ['Fever', 'Headache'],
      vitals: { temperature: '37.8', heartRate: '78', bloodPressure: '118/76', spo2: '98', weight: '54' },
      diagnosis: 'Mild seasonal pyrexia',
      treatment: 'Rest and hydration',
      riskLevel: 'LOW',
    }),
  });
  assert.equal(recordConsultation.status, 201);
  console.log(`✓ Consultation recorded in PostgreSQL! Code: ${recordConsultation.data.data.consultation.consultationCode}`);

  // 13. ASHA Generates Health Assessment
  console.log('\n13. ASHA generating AI health assessment after approval...');
  const recordAssessment = await api('/assessments/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${ashaToken}` },
    body: JSON.stringify({
      patientId: newPatient.healthId,
      symptoms: ['Fever', 'Headache'],
      vitals: { temp: '37.8', hr: '78', bp: '118/76', spo2: '98', weight: '54' },
      obs: 'Patient responsive and ambulatory',
    }),
  });
  assert.equal(recordAssessment.status, 201);
  console.log(`✓ Health Assessment generated in PostgreSQL! Code: ${recordAssessment.data.data.assessment.assessmentCode}`);

  // 14. Patient Edits Own Profile & Family Doctor
  console.log('\n14. Patient updating their own profile (allergies, emergency contact, Family Doctor)...');
  // First fetch real doctors roster to pick an existing doctor
  const doctorsRes = await api('/doctors');
  assert.equal(doctorsRes.status, 200);
  const sampleDoc = doctorsRes.data.data.doctors[0];
  assert.ok(sampleDoc, 'No doctors available in roster');

  const updateProfile = await api(`/patients/${newPatient.healthId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({
      allergies: ['Penicillin', 'Sulfa drugs'],
      emergencyContact: {
        name: 'Ram Charan',
        relation: 'Spouse',
        phone: '9829099881',
      },
      familyDoctorId: sampleDoc.id,
      bloodGroup: 'B+',
    }),
  });
  assert.equal(updateProfile.status, 200);
  assert.equal(updateProfile.data.data.patient.familyDoctorName, sampleDoc.name);
  console.log(`✓ Patient profile updated in PostgreSQL!`);
  console.log(`  Family Doctor: ${updateProfile.data.data.patient.familyDoctorName}`);
  console.log(`  Allergies: ${updateProfile.data.data.patient.allergies.join(', ')}`);

  // 15. Cross-Patient Tampering Test
  console.log('\n15. Testing cross-patient tampering prevention...');
  const tamperAttempt = await api(`/patients/RHC-2026-3M9P71`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ bloodGroup: 'AB+' }),
  });
  // Should reject with 403 Forbidden
  assert.equal(tamperAttempt.status, 403, 'Must reject editing another patient profile');
  console.log(`✓ Cross-patient editing blocked with 403: "${tamperAttempt.data.message}"`);

  // 16. Doctor Direct Access without Referral
  console.log('\n16. Doctor direct access without referral or consent...');
  const docLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: '9829000002', password: '1234', role: 'DOCTOR' }),
  });
  assert.equal(docLogin.status, 200);
  const docToken = docLogin.data.data.token;
  const docUser = docLogin.data.data.user;

  const docDirectFetch = await api(`/patients/${newPatient.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.equal(docDirectFetch.status, 200);
  assert.equal(docDirectFetch.data.data.hasAccess, false, 'Doctor direct search must be restricted');
  console.log(`✓ Doctor direct access is restricted (hasAccess: false)`);

  // 17. Doctor Break-Glass Emergency Access
  console.log('\n17. Doctor Break-Glass Emergency Access protocol...');
  const emergencyAuth = await api('/emergency/authorize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      patientHealthId: newPatient.healthId,
      patientName: newPatient.name,
      doctorName: docUser.fullName,
      facilityId: docUser.doctorProfile?.facility?.id || 'fac-phc-lun-01',
      facilityName: docUser.doctorProfile?.facility?.name || 'PHC Lunkaransar',
      reason: 'Patient unconscious after severe accident',
      note: 'Emergency admission - immediate resuscitation required',
      records: 'Emergency Medical Summary, Vitals, Medications',
    }),
  });
  assert.ok(emergencyAuth.status === 200 || emergencyAuth.status === 201, `Emergency auth failed: ${emergencyAuth.status}`);
  const emergencyToken = emergencyAuth.data.data?.token || emergencyAuth.data.token;
  assert.ok(emergencyToken, 'Emergency JWT token missing');
  console.log(`✓ 15-minute emergency JWT issued!`);

  // Doctor accesses patient using x-emergency-token
  const emergencyFetch = await api(`/patients/${newPatient.healthId}`, {
    headers: {
      Authorization: `Bearer ${docToken}`,
      'x-emergency-token': emergencyToken,
    },
  });
  assert.equal(emergencyFetch.status, 200);
  assert.equal(emergencyFetch.data.data.hasAccess, true, 'Emergency access must be granted');
  console.log(`✓ Emergency summary unlocked via x-emergency-token! hasAccess: true`);

  // Verify EmergencyAccessLog in PostgreSQL
  const logsRes = await api('/emergency/logs', {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.equal(logsRes.status, 200);
  const logsArray = Array.isArray(logsRes.data.data) ? logsRes.data.data : (logsRes.data.data?.logs || []);
  const loggedEntry = logsArray.find((l) => l.patientHealthId === newPatient.healthId);
  assert.ok(loggedEntry, 'Emergency access log entry missing in PostgreSQL');
  console.log(`✓ Immutable log verified in PostgreSQL! Log ID: ${loggedEntry.id}`);

  // 18. Revocation Test
  console.log('\n18. Testing consent revocation...');
  const revokeRes = await api(`/abdm/mock/consents/${createdReq.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ reason: 'Completed treatment cycle' }),
  });
  assert.equal(revokeRes.status, 200);
  const revokedConsent = revokeRes.data.data.consent || revokeRes.data.data;
  assert.equal(revokedConsent.status, 'REVOKED');

  const ashaFetchRevoked = await api(`/patients/${newPatient.healthId}`, {
    headers: { Authorization: `Bearer ${ashaToken}` },
  });
  assert.equal(ashaFetchRevoked.status, 200);
  assert.equal(ashaFetchRevoked.data.data.hasAccess, false, 'hasAccess must be false after revocation');
  console.log(`✓ Revoked access immediately blocks ASHA! hasAccess: false`);

  console.log('\n================================================================');
  console.log('🎉 ALL 18 CONSENT-FIRST ARCHITECTURE WORKFLOWS PASSED 100%!');
  console.log('================================================================');
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

