import assert from 'node:assert';

const BASE_URL = 'http://localhost:5000/api/v1';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  console.log('================================================================');
  console.log('🧪 VERIFYING DYNAMIC DOCTOR -> MULTI-PATIENT CONSENT SYSTEM');
  console.log('================================================================\n');

  // 1. Authenticate Doctor (Dr. Ankit Sharma)
  console.log('1. Authenticating Doctor (Dr. Ankit Sharma)...');
  const docLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: '9829000002', password: '1234', role: 'DOCTOR' }),
  });
  assert(docLogin.ok, 'Doctor login failed');
  const docToken = docLogin.data.data.token;
  const docName = docLogin.data.data.user.fullName;
  console.log(`✓ Doctor authenticated: ${docName}`);

  // 2. Register / Authenticate ASHA Worker to register 3 fresh, distinct patients
  console.log('\n2. Authenticating ASHA Worker...');
  const ashaLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: '9829000005', password: '1234', role: 'WORKER' }),
  });
  assert(ashaLogin.ok, 'ASHA login failed');
  const ashaToken = ashaLogin.data.data.token;

  // Helper to register a fresh patient
  async function registerFreshPatient(name, phone) {
    const regRes = await request('/patients/register', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ashaToken}` },
      body: JSON.stringify({
        name,
        phone,
        dob: '1995-05-12',
        gender: 'Female',
        village: 'Govindpur',
        district: 'Bikaner',
        state: 'Rajasthan',
        pin: '1234',
      }),
    });
    assert(regRes.ok, `Failed to register ${name}: ${regRes.data?.message}`);
    const patientData = regRes.data.data.patient;
    
    // Login as this patient to get their JWT token
    const pLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: phone, password: '1234', role: 'PATIENT' }),
    });
    assert(pLogin.ok, `Patient ${name} login failed`);
    
    return {
      name,
      phone,
      patientId: patientData.id,
      healthId: patientData.healthId,
      token: pLogin.data.data.token,
      userId: pLogin.data.data.user.id,
    };
  }

  const ts = Date.now().toString().slice(-4);
  console.log('\n3. Creating 3 distinct, fresh patients in PostgreSQL...');
  const patientA = await registerFreshPatient(`Patient Alpha ${ts}`, `98${Math.floor(10000000 + Math.random() * 90000000)}`);
  console.log(`✓ Patient A registered: ${patientA.name} (${patientA.healthId})`);

  const patientB = await registerFreshPatient(`Patient Beta ${ts}`, `98${Math.floor(10000000 + Math.random() * 90000000)}`);
  console.log(`✓ Patient B registered: ${patientB.name} (${patientB.healthId})`);

  const patientC = await registerFreshPatient(`Patient Gamma ${ts}`, `98${Math.floor(10000000 + Math.random() * 90000000)}`);
  console.log(`✓ Patient C registered: ${patientC.name} (${patientC.healthId})`);

  // 4. Verify Doctor has NO access to any of the 3 patients initially
  console.log('\n4. Verifying Doctor has NO access to Patients A, B, and C initially...');
  for (const p of [patientA, patientB, patientC]) {
    const chk = await request(`/patients/${p.healthId}`, {
      headers: { Authorization: `Bearer ${docToken}` },
    });
    assert(chk.ok, `Check failed for ${p.name}`);
    assert.strictEqual(chk.data.data.hasAccess, false, `Doctor should NOT have access to ${p.name}`);
    assert.strictEqual(chk.data.data.patient.hasAccess, false);
    console.log(`✓ ${p.name}: hasAccess = false (protected)`);
  }

  // 5. Doctor submits consent request for Patient A
  console.log('\n5. Doctor submitting access request for Patient A...');
  const reasonA = 'Clinical assessment for chronic fever evaluation';
  const reqARes = await request(`/patients/${patientA.healthId}/access-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      duration: '1 month',
      reason: reasonA,
      dataScope: ['Basic Information', 'Consultation History'],
    }),
  });
  assert.strictEqual(reqARes.status, 201, `Failed to submit request for A: ${reqARes.data?.message}`);
  const reqA = reqARes.data.data.request;
  assert.strictEqual(reqA.patientId, patientA.patientId, 'Request must match Patient A ID');
  assert.strictEqual(reqA.status, 'TEMPORARY', 'Status must be TEMPORARY (Pending)');
  assert.strictEqual(reqA.grantedTo, docName, 'Must be granted to authenticated Doctor');
  assert.strictEqual(reqA.purpose, reasonA);
  console.log(`✓ Request for Patient A created: Code=${reqA.consentCode}, PatientId=${reqA.patientId}`);

  // 6. Verify Request appears ONLY in Patient A's portal (NOT in B or C)
  console.log('\n6. Verifying Request isolation: Patient A sees it, Patients B & C do NOT...');
  const pAReqs = await request(`/patients/${patientA.healthId}/access-requests`, {
    headers: { Authorization: `Bearer ${patientA.token}` },
  });
  assert(pAReqs.ok, 'Failed to fetch Patient A requests');
  const foundInA = pAReqs.data.data.requests.find(r => r.consentCode === reqA.consentCode);
  assert(foundInA, 'Patient A MUST see their own pending request');
  console.log(`✓ Patient A successfully retrieved request ${foundInA.consentCode} from ${foundInA.grantedTo}`);

  const pBReqs = await request(`/patients/${patientB.healthId}/access-requests`, {
    headers: { Authorization: `Bearer ${patientB.token}` },
  });
  assert(pBReqs.ok, 'Failed to fetch Patient B requests');
  const foundInB = pBReqs.data.data.requests.find(r => r.consentCode === reqA.consentCode);
  assert(!foundInB, 'Patient B must NEVER see Patient A\'s request');
  console.log('✓ Verified: Patient B does NOT see Patient A\'s request (0 leakage)');

  const pCReqs = await request(`/patients/${patientC.healthId}/access-requests`, {
    headers: { Authorization: `Bearer ${patientC.token}` },
  });
  assert(pCReqs.ok, 'Failed to fetch Patient C requests');
  const foundInC = pCReqs.data.data.requests.find(r => r.consentCode === reqA.consentCode);
  assert(!foundInC, 'Patient C must NEVER see Patient A\'s request');
  console.log('✓ Verified: Patient C does NOT see Patient A\'s request (0 leakage)');

  // 7. Patient A Approves the Request
  console.log('\n7. Patient A approving Doctor request...');
  const approveRes = await request(`/abdm/mock/consents/${reqA.id}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientA.token}` },
  });
  assert(approveRes.ok, `Failed to approve consent: ${approveRes.data?.message}`);
  console.log('✓ Patient A approved consent! Status is now GRANTED.');

  // 8. Verify Doctor NOW has access to Patient A, but STILL NO ACCESS to B or C
  console.log('\n8. Verifying Doctor access unlocked ONLY for Patient A...');
  const chkAAfter = await request(`/patients/${patientA.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.strictEqual(chkAAfter.data.data.hasAccess, true, 'Doctor MUST have access to Patient A after approval');
  assert.strictEqual(chkAAfter.data.data.patient.hasAccess, true);
  console.log(`✓ Doctor access to Patient A (${patientA.name}): GRANTED`);

  const chkBAfterA = await request(`/patients/${patientB.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.strictEqual(chkBAfterA.data.data.hasAccess, false, 'Doctor must NOT have access to Patient B');
  console.log(`✓ Doctor access to Patient B (${patientB.name}): STILL BLOCKED (proper isolation)`);

  const chkCAfterA = await request(`/patients/${patientC.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.strictEqual(chkCAfterA.data.data.hasAccess, false, 'Doctor must NOT have access to Patient C');
  console.log(`✓ Doctor access to Patient C (${patientC.name}): STILL BLOCKED (proper isolation)`);

  // 9. Doctor requests access for Patient B
  console.log('\n9. Doctor submitting access request for Patient B...');
  const reasonB = 'Pediatric vitals check and follow-up';
  const reqBRes = await request(`/patients/${patientB.healthId}/access-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      duration: '1 week',
      reason: reasonB,
      dataScope: ['Basic Information', 'Consultation History'],
    }),
  });
  assert.strictEqual(reqBRes.status, 201);
  const reqB = reqBRes.data.data.request;
  assert.strictEqual(reqB.patientId, patientB.patientId);
  console.log(`✓ Request for Patient B created: Code=${reqB.consentCode}`);

  // 10. Patient B Rejects the request
  console.log('\n10. Patient B rejecting Doctor access request...');
  const rejectB = await request(`/abdm/mock/consents/${reqB.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientB.token}` },
    body: JSON.stringify({ reason: 'Declined by patient' }),
  });
  assert(rejectB.ok, 'Failed to reject consent');
  console.log('✓ Patient B rejected consent! Status is now REVOKED.');

  // 11. Verify Doctor remains BLOCKED from Patient B
  console.log('\n11. Verifying Doctor remains strictly blocked from Patient B after rejection...');
  const chkBAfterReject = await request(`/patients/${patientB.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.strictEqual(chkBAfterReject.data.data.hasAccess, false, 'Doctor must be BLOCKED after rejection');
  console.log(`✓ Doctor access to Patient B: BLOCKED (hasAccess = false)`);

  // 12. Doctor requests access for Patient C
  console.log('\n12. Doctor submitting access request for Patient C...');
  const reasonC = 'Antenatal care assessment';
  const reqCRes = await request(`/patients/${patientC.healthId}/access-requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${docToken}` },
    body: JSON.stringify({
      duration: '3 months',
      reason: reasonC,
      dataScope: ['Basic Information', 'HEALTH_ASSESSMENT'],
    }),
  });
  assert.strictEqual(reqCRes.status, 201);
  const reqC = reqCRes.data.data.request;
  assert.strictEqual(reqC.patientId, patientC.patientId);
  console.log(`✓ Request for Patient C created: Code=${reqC.consentCode}`);

  // 13. Verify Patient C sees request while Doctor remains blocked until approval
  console.log('\n13. Verifying Patient C sees request and Doctor cannot access until approved...');
  const pCReqsCheck = await request(`/patients/${patientC.healthId}/access-requests`, {
    headers: { Authorization: `Bearer ${patientC.token}` },
  });
  const foundInCCheck = pCReqsCheck.data.data.requests.find(r => r.consentCode === reqC.consentCode);
  assert(foundInCCheck, 'Patient C must see the request');
  console.log(`✓ Patient C has pending request: ${foundInCCheck.consentCode}`);

  const chkCBeforeApproval = await request(`/patients/${patientC.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.strictEqual(chkCBeforeApproval.data.data.hasAccess, false, 'Doctor must NOT have access before approval');
  console.log(`✓ Doctor access to Patient C: BLOCKED while pending`);

  // 14. Patient A Revokes earlier consent
  console.log('\n14. Testing Revocation: Patient A revokes Doctor access...');
  const revokeA = await request(`/abdm/mock/consents/${reqA.id}/revoke`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${patientA.token}` },
    body: JSON.stringify({ reason: 'Consultation complete' }),
  });
  assert(revokeA.ok, 'Failed to revoke consent');
  
  const chkAAfterRevoke = await request(`/patients/${patientA.healthId}`, {
    headers: { Authorization: `Bearer ${docToken}` },
  });
  assert.strictEqual(chkAAfterRevoke.data.data.hasAccess, false, 'Doctor access must be revoked immediately');
  console.log(`✓ Doctor access to Patient A after revocation: BLOCKED (immediate effect)`);

  console.log('\n================================================================');
  console.log('🎉 ALL MULTI-PATIENT DYNAMIC CONSENT WORKFLOWS PASSED 100%!');
  console.log('================================================================');
}

main().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

