const API_BASE = 'http://localhost:5000/api/v1';

async function post(endpoint: string, body: any, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(endpoint: string, token?: string) {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
  const data = await res.json();
  return { status: res.status, data };
}

async function runFeatureAudit() {
  console.log('================================================================');
  console.log('🩺 COMPREHENSIVE ROLE & FEATURE VALIDATION SUITE (SIH 26133)');
  console.log('================================================================\n');

  const results: Record<string, { role: string; feature: string; status: 'PASS' | 'FAIL'; latencyMs: number; details: string }> = {};

  async function check(key: string, role: string, feature: string, fn: () => Promise<string>) {
    const start = Date.now();
    try {
      const details = await fn();
      const latencyMs = Date.now() - start;
      results[key] = { role, feature, status: 'PASS', latencyMs, details };
      console.log(`✅ [${role}] ${feature} (${latencyMs}ms): ${details}`);
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      results[key] = { role, feature, status: 'FAIL', latencyMs, details: err.message || String(err) };
      console.error(`❌ [${role}] ${feature} (${latencyMs}ms) FAILED: ${err.message || String(err)}`);
    }
  }

  // -------------------------------------------------------------
  // 1. AUTHENTICATION (ALL 4 ROLES)
  // -------------------------------------------------------------
  let adminToken = '';
  let docToken = '';
  let workerToken = '';
  let patientToken = '';
  let patientHealthId = 'RHC-2026-8F4K92';
  let doctorId = '';

  await check('AUTH_ADMIN', 'ADMIN', 'Admin Login (9829000001 / 1234)', async () => {
    const res = await post('/auth/login', { email: '9829000001', password: '1234', role: 'ADMIN' });
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Login failed');
    adminToken = res.data.data.token;
    return `Authenticated as ${res.data.data.user.fullName}`;
  });

  await check('AUTH_DOCTOR', 'DOCTOR', 'Doctor Login (9829000002 / 1234)', async () => {
    const res = await post('/auth/login', { email: '9829000002', password: '1234', role: 'DOCTOR' });
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Login failed');
    docToken = res.data.data.token;
    doctorId = res.data.data.user.doctorProfile?.id || '';
    return `Authenticated as ${res.data.data.user.fullName} (${res.data.data.user.doctorProfile?.specialty})`;
  });

  await check('AUTH_WORKER', 'WORKER', 'Worker Login (9829000005 / 1234)', async () => {
    const res = await post('/auth/login', { email: '9829000005', password: '1234', role: 'WORKER' });
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Login failed');
    workerToken = res.data.data.token;
    return `Authenticated as ${res.data.data.user.fullName} (${res.data.data.user.workerProfile?.workerType})`;
  });

  await check('AUTH_PATIENT', 'PATIENT', 'Patient Login (9414158392 / 1234)', async () => {
    const res = await post('/auth/login', { email: '9414158392', password: '1234', role: 'PATIENT' });
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Login failed');
    patientToken = res.data.data.token;
    patientHealthId = res.data.data.user.patientProfile?.healthId || patientHealthId;
    return `Authenticated as ${res.data.data.user.fullName} (Health ID: ${patientHealthId})`;
  });

  // -------------------------------------------------------------
  // 2. DOCTOR ROLE FEATURES
  // -------------------------------------------------------------
  await check('DOC_DASHBOARD', 'DOCTOR', 'OPD Doctor Dashboard & Clinical Metrics', async () => {
    const res = await get('/dashboards/doctor', docToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    const d = res.data.data;
    return `Loaded: ${d.patients?.length ?? 0} patients, ${d.appointments?.length ?? 0} upcoming OPD, ${d.consultations?.length ?? 0} recent consults`;
  });

  await check('DOC_PATIENTS', 'DOCTOR', 'Patient Directory & Health Records', async () => {
    const res = await get('/patients', docToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    return `Loaded ${res.data.data?.length ?? 0} patients`;
  });

  await check('DOC_PHC_STOCK', 'DOCTOR', 'Dispensary & Medicine Inventory', async () => {
    const res = await get('/medicines', docToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    return `Loaded ${res.data.data?.length ?? 0} stock items in PHC dispensary`;
  });

  await check('DOC_CONSULTATION', 'DOCTOR', 'Teleconsultation Rx Save to PostgreSQL', async () => {
    const res = await post('/teleconsultation/consultations', {
      sessionId: `tc-audit-${Date.now()}`,
      patientId: patientHealthId,
      symptoms: ['Fever', 'Mild headache'],
      diagnosis: 'Viral Upper Respiratory Infection',
      clinicalNotes: 'Rest, hydrate, oral paracetamol for 3 days',
      prescriptions: [
        { medicine: 'Paracetamol 500mg', dosage: '1 tablet', frequency: 'TDS', duration: '3 days', timing: 'After food' },
        { medicine: 'Cetirizine 10mg', dosage: '1 tablet', frequency: 'OD', duration: '3 days', timing: 'At bedtime' }
      ],
      vitals: { bloodPressure: '120/80', heartRate: '76', temperature: '98.6' },
      followUpDate: '2026-10-01'
    }, docToken);
    if (res.status !== 200 && res.status !== 201) throw new Error(res.data.message || 'Save failed');
    return `Prescription saved to DB (Consultation ID: ${res.data.data?.id || res.data.data?.consultation?.id || 'OK'})`;
  });

  // -------------------------------------------------------------
  // 3. PATIENT ROLE FEATURES
  // -------------------------------------------------------------
  await check('PAT_DASHBOARD', 'PATIENT', 'Personal Health Record & ABHA Dashboard', async () => {
    const res = await get(`/dashboards/patient/${patientHealthId}`, patientToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    const d = res.data.data;
    return `ABHA: ${d.patient?.healthId}, ${d.consultations?.length ?? 0} consults, ${d.medicines?.length ?? 0} active meds`;
  });

  await check('PAT_BOOK_APPT', 'PATIENT', 'Book OPD Appointment (Self / Assisted)', async () => {
    const res = await post('/appointments', {
      patientId: patientHealthId,
      doctorId: doctorId || 'dfc6849f-e573-459c-aad5-fec565e0a3ff',
      facilityId: 'PHC Lunkaransar',
      scheduledDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      timeSlot: '10:00 AM - 10:30 AM',
      reason: 'Routine Health Checkup',
      source: 'PATIENT'
    }, patientToken);
    if (res.status !== 200 && res.status !== 201) throw new Error(res.data.message || 'Booking failed');
    return `Appointment Confirmed: Token #${res.data.data?.appointment?.tokenNumber ?? 1}`;
  });

  await check('PAT_APPOINTMENTS', 'PATIENT', 'Patient Appointments List', async () => {
    const res = await get(`/appointments/patient/${patientHealthId}`, patientToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    return `Retrieved ${res.data.data?.length ?? 0} booked appointments`;
  });

  // -------------------------------------------------------------
  // 4. WORKER (ASHA) ROLE FEATURES
  // -------------------------------------------------------------
  await check('WRK_DASHBOARD', 'WORKER', 'Field Care & MCH Dashboard', async () => {
    const res = await get('/dashboards/worker', workerToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    const d = res.data.data;
    return `Total Registered: ${d.stats?.registeredPatients ?? 0}, High Risk: ${d.stats?.highRiskCount ?? 0}, Doctors On Duty: ${d.onDutyDoctors?.length ?? 0}`;
  });

  await check('WRK_REGISTER', 'WORKER', 'Register New Rural Citizen (ABDM ABHA)', async () => {
    const rand = Math.floor(10000 + Math.random() * 90000);
    const res = await post('/patients/register', {
      name: `Citizen ${rand}`,
      dob: '1992-05-15',
      gender: 'F',
      bloodGroup: 'B+',
      phone: `98291${rand}`,
      village: 'Govindpur',
      district: 'Bikaner',
      state: 'Rajasthan',
      allergies: [],
      chronicConditions: ['Anaemia (mild)'],
      consentStatus: 'GRANTED'
    }, workerToken);
    if (res.status !== 200 && res.status !== 201) throw new Error(res.data.message || JSON.stringify(res.data.errors) || 'Registration failed');
    return `Patient Registered: Health ID ${res.data.data?.healthId || 'Created'}`;
  });

  await check('WRK_REFERRAL', 'WORKER', 'Specialist Care Referral Submission', async () => {
    const res = await post('/referrals', {
      patientId: patientHealthId,
      toPHC: 'CHC Bikaner',
      reason: 'Specialist consultation for persistent headache',
      priority: 'URGENT',
      riskLevel: 'HIGH',
      notes: 'BP 140/90, referral to CHC Bikaner'
    }, workerToken);
    if (res.status !== 200 && res.status !== 201) throw new Error(res.data.message || 'Referral failed');
    return `Referral Created: Priority URGENT, Risk HIGH`;
  });

  // -------------------------------------------------------------
  // 5. ADMIN ROLE FEATURES
  // -------------------------------------------------------------
  await check('ADM_DASHBOARD', 'ADMIN', 'District Operations & Epidemiology Metrics', async () => {
    const res = await get('/dashboards/admin', adminToken);
    if (res.status !== 200 || !res.data.success) throw new Error(res.data.message || 'Fetch failed');
    const d = res.data.data;
    return `Coverage: ${d.stats?.totalPatients ?? 0} patients, ${d.stats?.facilitiesCount ?? 0} facilities, ${d.phcActivity?.length ?? 0} PHCs tracked`;
  });

  console.log('\n================================================================');
  console.log('📊 AUDIT SUMMARY: ALL FEATURES ACROSS ALL 4 ROLES TESTED');
  console.log('================================================================');
  let passCount = 0;
  let failCount = 0;
  for (const [k, v] of Object.entries(results)) {
    if (v.status === 'PASS') passCount++;
    else failCount++;
  }
  console.log(`TOTAL CHECKS: ${passCount + failCount} | PASSED: ${passCount} | FAILED: ${failCount}`);
}

runFeatureAudit().catch(console.error);
