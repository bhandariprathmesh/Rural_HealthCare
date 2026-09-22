// Full verification suite matching frontend client.ts API calls exactly

const BASE = 'http://localhost:5000/api/v1';

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function get(path, token) {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { headers });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function runSuite() {
  console.log('====================================================');
  console.log('🔍 FULL RURALCARE FEATURE & ROLE VERIFICATION SUITE');
  console.log('====================================================\n');

  // 1. Health
  const hRes = await fetch('http://localhost:5000/api/health');
  console.log('1. Health Check:', hRes.status === 200 ? '✓ PASS' : '✗ FAIL', await hRes.json());

  // 2. Login All Roles
  console.log('\n2. Testing Authentication for all 4 Roles:');
  const roles = [
    { role: 'DOCTOR', email: 'doctor@ruralcare.in', password: 'password123' },
    { role: 'WORKER', email: 'asha.worker@ruralcare.in', password: 'password123' },
    { role: 'PATIENT', email: 'patient@ruralcare.in', password: 'password123' },
    { role: 'ADMIN', email: 'admin@ruralcare.in', password: 'password123' }
  ];

  const authData = {};
  for (const r of roles) {
    const res = await post('/auth/login', r);
    if (res.status === 200 && res.data.success && res.data.data?.token) {
      authData[r.role] = res.data.data;
      console.log(`   ✓ [${r.role}] SUCCESS -> User: "${res.data.data.user?.fullName}" (ID: ${res.data.data.user?.id})`);
    } else {
      console.error(`   ✗ [${r.role}] FAILED:`, res.status, res.data);
    }
  }

  // 3. DOCTOR FEATURES
  console.log('\n3. Testing Doctor Role Features:');
  const docToken = authData.DOCTOR?.token;
  const docProfile = authData.DOCTOR?.user?.doctorProfile;
  const docId = docProfile?.id || authData.DOCTOR?.user?.id;

  if (docToken) {
    // Doctor Dashboard
    const docDash = await get('/dashboards/doctor', docToken);
    console.log(`   - Doctor Dashboard (/dashboards/doctor): HTTP ${docDash.status}`, docDash.data?.success ? '✓ PASS' : docDash.data?.message);

    // Doctor Appointments
    const docAppts = await get(`/appointments/doctor/${docId}`, docToken);
    console.log(`   - Doctor OPD Queue (/appointments/doctor/${docId}): HTTP ${docAppts.status}`, docAppts.data?.success ? `✓ (${docAppts.data.data?.length || 0} slots)` : docAppts.data?.message);

    // Doctor Slots & Capacity
    const docCap = await get(`/appointments/doctor/${docId}/capacity`, docToken);
    console.log(`   - Doctor Slot Capacity: HTTP ${docCap.status}`, docCap.data?.success ? `✓ Available: ${docCap.data.data?.remainingSlots}` : docCap.data?.message);

    // Patients list
    const patients = await get('/patients', docToken);
    console.log(`   - Patient Directory: HTTP ${patients.status}`, patients.data?.success ? `✓ (${patients.data.data?.length || 0} patients)` : patients.data?.message);
  }

  // 4. WORKER / ASHA FEATURES
  console.log('\n4. Testing Worker/ASHA Role Features:');
  const workerToken = authData.WORKER?.token;
  if (workerToken) {
    // Worker Dashboard
    const workerDash = await get('/dashboards/worker', workerToken);
    console.log(`   - Worker Dashboard (/dashboards/worker): HTTP ${workerDash.status}`, workerDash.data?.success ? '✓ PASS' : workerDash.data?.message);

    // MCH Due List
    const mchList = await get('/mch/due-list', workerToken);
    console.log(`   - MCH Maternal & Child Due List: HTTP ${mchList.status}`, mchList.data?.success ? `✓ Beneficiaries: ${mchList.data.data?.stats?.totalBeneficiaries || 0}` : mchList.data?.message);

    // Medicines & Stock Availability
    const meds = await get('/medicines', workerToken);
    console.log(`   - Medicines Catalog (/medicines): HTTP ${meds.status}`, meds.data?.success ? `✓ (${meds.data.data?.medicines?.length || meds.data.data?.length || 0} medicines)` : meds.data?.message);

    // Diagnostic Kits
    const diag = await get('/diagnostics', workerToken);
    console.log(`   - Diagnostics Availability (/diagnostics): HTTP ${diag.status}`, diag.data?.success ? `✓ (${diag.data.data?.diagnosticItems?.length || diag.data.data?.length || 0} diagnostic kits)` : diag.data?.message);
  }

  // 5. PATIENT FEATURES
  console.log('\n5. Testing Patient Role Features:');
  const patToken = authData.PATIENT?.token;
  const patHealthId = authData.PATIENT?.user?.patientProfile?.healthId || 'RHC-2026-8F4K92';
  const patId = authData.PATIENT?.user?.patientProfile?.id || authData.PATIENT?.user?.id;

  if (patToken) {
    // Patient Profile
    const me = await get('/auth/me', patToken);
    console.log(`   - Patient Self Profile (/auth/me): HTTP ${me.status}`, me.data?.success ? `✓ ${me.data.data?.user?.fullName}` : me.data?.message);

    // Patient Dashboard
    const patDash = await get(`/dashboards/patient/${patHealthId}`, patToken);
    console.log(`   - Patient Dashboard (/dashboards/patient/${patHealthId}): HTTP ${patDash.status}`, patDash.data?.success ? '✓ PASS' : patDash.data?.message);

    // Patient Appointments
    const patAppts = await get(`/appointments/patient/${patId}`, patToken);
    console.log(`   - Patient Appointments (/appointments/patient/${patId}): HTTP ${patAppts.status}`, patAppts.data?.success ? `✓ (${patAppts.data.data?.length || 0} appointments)` : patAppts.data?.message);

    // Patient MCH Card
    const patMch = await get(`/mch/patient/${patHealthId}`, patToken);
    console.log(`   - Patient MCP / MCH Card: HTTP ${patMch.status}`, patMch.data?.success ? '✓ PASS' : patMch.data?.message);
  }

  // 6. ADMIN FEATURES
  console.log('\n6. Testing Admin Role Features:');
  const adminToken = authData.ADMIN?.token;
  if (adminToken) {
    // Admin Dashboard
    const adminDash = await get('/dashboards/admin', adminToken);
    console.log(`   - Admin Dashboard (/dashboards/admin): HTTP ${adminDash.status}`, adminDash.data?.success ? '✓ PASS' : adminDash.data?.message);

    // Emergency / SOS active incidents
    const sos = await get('/emergency/active', adminToken);
    console.log(`   - SOS / Emergency Incidents: HTTP ${sos.status}`, sos.data?.success ? '✓ PASS' : sos.data?.message);
  }

  console.log('\n====================================================');
  console.log('✅ BACKEND FEATURE VERIFICATION SUITE FINISHED');
  console.log('====================================================');
}

runSuite().catch(console.error);
