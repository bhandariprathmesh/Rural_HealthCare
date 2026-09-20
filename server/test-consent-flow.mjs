// End-to-End Automated Verification Script for:
// Doctor Dashboard — Fix New Assessment → Consent → View Patient Flow
// Tests complete cycle with at least 2 distinct patients dynamically:
// 1. Doctor login & authentication
// 2. Doctor requests access for Patient A (dynamic, unhardcoded)
// 3. Patient A approves consent request
// 4. Doctor queries dashboard & patient list -> Patient A now appears with active consent
// 5. Doctor can view Patient A's chart & access records within approved scope
// 6. Repeat for Patient B (dynamic, second distinct patient)
// 7. Verify non-consented patient remains restricted
// 8. Verify revoking consent removes patient from active list

import http from 'http';

const API_BASE = 'http://localhost:5000/api/v1';

async function api(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.message || `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }
  return json;
}

async function runTest() {
  console.log('===============================================================');
  console.log('🔍 RUNNING COMPREHENSIVE VERIFICATION FOR DOCTOR DASHBOARD FLOW');
  console.log('===============================================================\n');

  // 1. Authenticate Doctor 1 (Dr. Ankit Sharma)
  console.log('1. Authenticating Doctor (Dr. Ankit Sharma, 9829000002)...');
  const docLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: '9829000002', password: '1234', role: 'DOCTOR' }),
  });
  const docToken = docLogin.data.token;
  const docUser = docLogin.data.user;
  console.log(`   ✓ Authenticated doctor: ${docUser.fullName} (ID: ${docUser.id})\n`);

  // 2. Query initial Doctor Dashboard to see current patient baseline
  console.log('2. Fetching baseline Doctor Dashboard data...');
  const initialDashboard = await api('/dashboards/doctor', {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const initialPatients = initialDashboard.data.patients || [];
  console.log(`   ✓ Initial patients count: ${initialPatients.length}`);
  const initialPatientIds = new Set(initialPatients.map(p => p.id));

  // 3. Fetch all system patients to choose 2 distinct dynamic test patients
  console.log('\n3. Fetching patients list to select 2 distinct test patients...');
  const allPatientsRes = await api('/patients');
  const allPatients = allPatientsRes.data.patients || [];
  
  // Pick 2 patients that are NOT currently in initialPatients (i.e. not family doctor / referral)
  const candidatePatients = allPatients.filter(p => !initialPatientIds.has(p.id));
  if (candidatePatients.length < 2) {
    throw new Error(`Need at least 2 distinct unlinked candidate patients, found ${candidatePatients.length}`);
  }

  const patientA = candidatePatients[0];
  const patientB = candidatePatients[1];
  console.log(`   ✓ Selected Patient A: "${patientA.name}" (HealthID: ${patientA.healthId}, ID: ${patientA.id})`);
  console.log(`   ✓ Selected Patient B: "${patientB.name}" (HealthID: ${patientB.healthId}, ID: ${patientB.id})\n`);

  // 4. Verify Doctor has NO access to Patient A initially
  console.log('4. Verifying Doctor initial access to Patient A is RESTRICTED...');
  const initialAccessA = await api(`/patients/${patientA.healthId}?purpose=health_assessment`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  if (initialAccessA.data.hasAccess !== false) {
    throw new Error(`Expected hasAccess=false for Patient A before consent, got: ${initialAccessA.data.hasAccess}`);
  }
  console.log('   ✓ Doctor access to Patient A correctly restricted initially (Consent Required).\n');

  // 5. DOCTOR REQUESTS ACCESS FOR PATIENT A
  console.log('5. Doctor requests access for Patient A (duration: 1 month, scope: Basic Info, Consultations)...');
  const requestResA = await api(`/patients/${patientA.id}/access-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      duration: '1 month',
      reason: 'Health assessment and outpatient triage',
      dataScope: ['Basic Information', 'Consultation History', 'HEALTH_ASSESSMENT'],
    }),
  });
  const consentRecordA = requestResA.data.request;
  console.log(`   ✓ Access request created for Patient A: Code ${consentRecordA.consentCode} (Status: ${consentRecordA.status})\n`);

  // 6. PATIENT A APPROVES CONSENT
  console.log('6. Patient A approves the consent request...');
  const approveResA = await api(`/abdm/mock/consents/${consentRecordA.id}/approve`, {
    method: 'POST',
  });
  console.log(`   ✓ Consent approved! Status: ${approveResA.data.status}, GrantedAt: ${approveResA.data.grantedAt}\n`);

  // 7. VERIFY DOCTOR DASHBOARD NOW INCLUDES PATIENT A
  console.log("7. Checking Doctor Dashboard ('Doctor -> View Patients')...");
  const updatedDashboardA = await api('/dashboards/doctor', {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const updatedPatientsA = updatedDashboardA.data.patients || [];
  const foundA = updatedPatientsA.find(p => p.id === patientA.id || p.healthId === patientA.healthId);
  if (!foundA) {
    throw new Error(`FAILURE: Patient A (${patientA.name}) NOT found in Doctor Dashboard after consent approval!`);
  }
  console.log(`   ✓ SUCCESS: Patient A "${foundA.name}" is now visible in Doctor's patient list!`);
  console.log(`   ✓ Total active patients on dashboard: ${updatedPatientsA.length} (was ${initialPatients.length})\n`);

  // 8. VERIFY DOCTOR CAN NOW VIEW PATIENT A'S CHART & CLINICAL RECORDS
  console.log("8. Doctor views Patient A's clinical record...");
  const recordA = await api(`/patients/${patientA.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  if (recordA.data.hasAccess !== true) {
    throw new Error(`FAILURE: Doctor should have hasAccess=true for Patient A, got: ${recordA.data.hasAccess}`);
  }
  console.log(`   ✓ Access granted! Doctor can view full record for: ${recordA.data.patient.name}`);
  console.log(`   ✓ Active consent code: ${recordA.data.activeConsent?.consentCode || recordA.data.activeConsent?.id}\n`);

  // 9. REPEAT FOR PATIENT B (DYNAMIC DISTINCT PATIENT 2)
  console.log('---------------------------------------------------------------');
  console.log('9. TESTING SECOND DISTINCT PATIENT: Patient B ("' + patientB.name + '")');
  console.log('---------------------------------------------------------------');
  
  // Verify initially restricted
  const initialAccessB = await api(`/patients/${patientB.healthId}?purpose=health_assessment`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  if (initialAccessB.data.hasAccess !== false) {
    throw new Error(`Expected hasAccess=false for Patient B before consent, got: ${initialAccessB.data.hasAccess}`);
  }
  console.log('   ✓ Doctor access to Patient B correctly restricted initially.');

  // Doctor requests access for Patient B
  const requestResB = await api(`/patients/${patientB.id}/access-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      duration: '1 week',
      reason: 'Specialist evaluation and risk assessment',
      dataScope: ['Basic Information', 'Consultation History'],
    }),
  });
  const consentRecordB = requestResB.data.request;
  console.log(`   ✓ Access request created for Patient B: Code ${consentRecordB.consentCode}`);

  // Patient B approves
  await api(`/abdm/mock/consents/${consentRecordB.id}/approve`, { method: 'POST' });
  console.log(`   ✓ Patient B approved consent.`);

  // Verify Doctor Dashboard now has BOTH Patient A and Patient B
  const updatedDashboardB = await api('/dashboards/doctor', {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const updatedPatientsB = updatedDashboardB.data.patients || [];
  const foundB = updatedPatientsB.find(p => p.id === patientB.id || p.healthId === patientB.healthId);
  if (!foundB) {
    throw new Error(`FAILURE: Patient B (${patientB.name}) NOT found in Doctor Dashboard after approval!`);
  }
  console.log(`   ✓ SUCCESS: Patient B "${foundB.name}" is now ALSO visible in Doctor's patient list!`);
  console.log(`   ✓ Both Patient A and Patient B dynamically confirmed on Doctor Dashboard.\n`);

  // 10. TEST RECORDING AN ASSESSMENT FOR PATIENT A
  console.log('10. Recording Health Assessment for Patient A by Doctor...');
  const consultRes = await api('/consultations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      patientId: patientA.healthId,
      doctorId: docUser.doctorProfile?.id,
      doctorName: docUser.fullName,
      symptoms: ['Fever', 'Headache'],
      vitals: { temperature: '38.2', bloodPressure: '120/80', heartRate: '88', spo2: '98', weight: '65' },
      notes: 'Assessment performed after patient consent granted.',
      riskLevel: 'moderate',
    }),
  });
  console.log(`   ✓ Consultation recorded for Patient A: Code ${consultRes.data.consultation.consultationCode}\n`);

  // 11. VERIFY REVOCATION / EXPIRY HANDLING
  console.log('11. Testing Consent Revocation: Patient A revokes consent...');
  await api(`/abdm/mock/consents/${consentRecordA.id}/revoke`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Patient revoked access' }),
  });
  console.log('   ✓ Consent revoked.');

  // Check Doctor Dashboard again: Patient A must disappear from active consented patients
  const dashboardAfterRevoke = await api('/dashboards/doctor', {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  const patientsAfterRevoke = dashboardAfterRevoke.data.patients || [];
  const stillFoundA = patientsAfterRevoke.find(p => p.id === patientA.id || p.healthId === patientA.healthId);
  if (stillFoundA) {
    throw new Error(`FAILURE: Revoked Patient A still appears in Doctor Dashboard!`);
  }
  console.log('   ✓ SUCCESS: Revoked Patient A automatically removed from active Doctor Dashboard patient list.');

  // Verify Patient A record access is once again restricted
  const accessAfterRevoke = await api(`/patients/${patientA.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  if (accessAfterRevoke.data.hasAccess !== false) {
    throw new Error(`FAILURE: Patient A record should be restricted after revocation!`);
  }
  console.log('   ✓ SUCCESS: Patient A record is once again RESTRICTED to Doctor.');

  // Patient B should STILL be accessible and present in dashboard
  const stillFoundB = patientsAfterRevoke.find(p => p.id === patientB.id || p.healthId === patientB.healthId);
  if (!stillFoundB) {
    throw new Error(`FAILURE: Patient B was unexpectedly removed when Patient A was revoked!`);
  }
  console.log('   ✓ SUCCESS: Patient B remains active and accessible independently.');

  console.log('\n===============================================================');
  console.log('🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!');
  console.log('===============================================================');
}

runTest().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});

