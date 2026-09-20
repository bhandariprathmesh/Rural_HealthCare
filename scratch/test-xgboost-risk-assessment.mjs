import assert from 'node:assert';

const BASE_URL = 'http://localhost:5000/api/v1';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function login(phone, pin, role) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: phone, password: pin, role }),
  });
  if (!res.ok) {
    throw new Error(`Login failed for ${phone}: ${JSON.stringify(res.data)}`);
  }
  return {
    token: res.data.data.token,
    user: res.data.data.user,
  };
}

async function run() {
  console.log('================================================================');
  console.log('  RURALCARE — XGBOOST RISK & STANDARDIZED SYMPTOMS TEST SUITE   ');
  console.log('================================================================\n');

  // 1. TEST STANDARDIZED SYMPTOMS
  console.log('1. Testing Standardized Symptoms Controlled Vocabulary & Search...');
  
  // Search 'fev'
  const fevRes = await request('/symptoms?q=fev');
  assert.strictEqual(fevRes.status, 200, 'GET /symptoms?q=fev must return 200');
  const fevItems = fevRes.data.data.symptoms;
  assert(fevItems.length > 0, 'Must match at least 1 symptom for fev');
  assert.strictEqual(fevItems[0].code, 'SYM-FEV-01', 'Top match for fev must be SYM-FEV-01 Fever');
  console.log(`   [PASS] Query 'fev' -> Matched: ${fevItems[0].name} (${fevItems[0].nameHi}) [Code: ${fevItems[0].code}]`);

  // Search 'head'
  const headRes = await request('/symptoms?q=head');
  assert.strictEqual(headRes.status, 200);
  const headItems = headRes.data.data.symptoms;
  assert.strictEqual(headItems[0].code, 'SYM-HED-01', 'Top match for head must be SYM-HED-01 Headache');
  console.log(`   [PASS] Query 'head' -> Matched: ${headItems[0].name} (${headItems[0].nameHi}) [Code: ${headItems[0].code}]`);

  // Search Hindi synonym 'bukhar'
  const bukharRes = await request('/symptoms?q=bukhar');
  assert.strictEqual(bukharRes.status, 200);
  const bukharItems = bukharRes.data.data.symptoms;
  assert.strictEqual(bukharItems[0].code, 'SYM-FEV-01', 'Synonym bukhar must resolve to SYM-FEV-01 Fever');
  console.log(`   [PASS] Hindi synonym 'bukhar' -> Resolved to ${bukharItems[0].name} (${bukharItems[0].code})`);

  // 2. TEST REAL-TIME XGBOOST RISK INFERENCE (POST /api/v1/assessments/predict-risk)
  console.log('\n2. Testing Real-time XGBoost Multiclass Inference...');

  // Test Case A: Stable Ambulatory Patient (Low Risk)
  const lowRiskRes = await request('/assessments/predict-risk', {
    method: 'POST',
    body: JSON.stringify({
      age: 26,
      gender: 'F',
      vitals: { temp: 36.8, hr: 70, bp: '118/76', spo2: 99, weight: 58 },
      symptoms: ['Mild fatigue', 'Cold / Runny nose'],
      standardizedSymptomCodes: ['SYM-COL-01', 'SYM-FAT-01'],
    }),
  });
  assert.strictEqual(lowRiskRes.status, 200);
  const lowPred = lowRiskRes.data.data;
  assert.strictEqual(lowPred.riskLevel, 'LOW');
  assert(lowPred.probabilities.low > 0.85, 'Low probability should be high (>85%)');
  assert(lowPred.confidence >= 75);
  console.log(`   [PASS] Stable Vitals -> XGBoost Result: ${lowPred.riskLevel} (Prob: ${(lowPred.probabilities.low * 100).toFixed(1)}%, Confidence: ${lowPred.confidence}%)`);

  // Test Case B: Acute Cardiovascular / Hypertensive Warning (High Risk)
  const highRiskRes = await request('/assessments/predict-risk', {
    method: 'POST',
    body: JSON.stringify({
      age: 58,
      gender: 'M',
      vitals: { temp: 37.8, hr: 112, bp: '168/104', spo2: 93, weight: 78 },
      symptoms: ['Chest pain', 'Shortness of breath', 'Dizziness'],
      standardizedSymptomCodes: ['SYM-CHP-01', 'SYM-SOB-01', 'SYM-DIZ-01'],
    }),
  });
  assert.strictEqual(highRiskRes.status, 200);
  const highPred = highRiskRes.data.data;
  assert.strictEqual(highPred.riskLevel, 'HIGH');
  assert(highPred.probabilities.high + highPred.probabilities.critical > 0.60);
  console.log(`   [PASS] Hypertensive + Chest Pain -> Result: ${highPred.riskLevel} (Reasoning: ${highPred.reasoning})`);

  // Test Case C: Acute Respiratory Decompensation / Safety Guardrail (Critical Risk)
  const critRiskRes = await request('/assessments/predict-risk', {
    method: 'POST',
    body: JSON.stringify({
      age: 64,
      gender: 'M',
      vitals: { temp: 39.6, hr: 136, bp: '82/50', spo2: 85, weight: 68 },
      symptoms: ['Shortness of breath', 'Chest tightness', 'Fainting'],
      standardizedSymptomCodes: ['SYM-SOB-01', 'SYM-CHT-01', 'SYM-SNC-01'],
    }),
  });
  assert.strictEqual(critRiskRes.status, 200);
  const critPred = critRiskRes.data.data;
  assert.strictEqual(critPred.riskLevel, 'CRITICAL', 'Severe hypoxia (SpO2 < 90%) must enforce CRITICAL');
  assert(critPred.confidence >= 98);
  console.log(`   [PASS] Severe Hypoxia SpO2 85% -> Result: ${critPred.riskLevel} (Confidence: ${critPred.confidence}%)`);
  console.log(`          Safety Action: ${critPred.recommendedAction}`);

  // 3. TEST FULL AI ASSESSMENT GENERATION & POSTGRESQL PERSISTENCE
  console.log('\n3. Testing Assessment Generation with PostgreSQL Storage & Consent...');
  const asha = await login('9829000005', '1234', 'WORKER');
  console.log(`   ASHA authenticated: ${asha.user.fullName}`);

  // Get Priya Devi (who has granted consent CNS-001 to Meena Kumari)
  const patientsRes = await request('/patients', {
    headers: { Authorization: `Bearer ${asha.token}` },
  });
  const patients = patientsRes.data.data.patients;
  const priya = patients.find((p) => p.name.includes('Priya'));
  assert(priya, 'Priya Devi must exist');

  const genRes = await request('/assessments/generate', {
    method: 'POST',
    headers: { Authorization: `Bearer ${asha.token}` },
    body: JSON.stringify({
      patientId: priya.id,
      symptoms: ['Fever', 'Headache'],
      standardizedSymptomCodes: ['SYM-FEV-01', 'SYM-HED-01'],
      vitals: {
        temp: '37.8',
        bp: '124/82',
        hr: '84',
        spo2: '97',
        weight: '62',
      },
      obs: 'Patient reports 2-day fever with mild headache; responsive and oriented.',
    }),
  });
  if (genRes.status !== 201) {
    console.error('genRes failed:', genRes.status, genRes.data);
  }
  assert.strictEqual(genRes.status, 201, 'Assessment generation MUST return 201 Created');
  const createdAsmt = genRes.data.data.assessment;
  assert(createdAsmt.assessmentCode.startsWith('ASMT-2026-'));
  assert.strictEqual(createdAsmt.modelVersion, 'xgboost-v1.0');
  assert(createdAsmt.riskProbabilities !== null, 'riskProbabilities must be stored');
  assert(createdAsmt.standardizedSymptomCodes.includes('SYM-FEV-01'));
  assert(createdAsmt.standardizedSymptomCodes.includes('SYM-HED-01'));
  console.log(`   [PASS] Created AIAssessment in PostgreSQL -> Code: ${createdAsmt.assessmentCode}`);
  console.log(`          Model Version: ${createdAsmt.modelVersion} | Risk Level: ${createdAsmt.riskLevel}`);
  console.log(`          Probabilities: ${JSON.stringify(createdAsmt.riskProbabilities)}`);
  console.log(`          Standardized Codes: ${JSON.stringify(createdAsmt.standardizedSymptomCodes)}`);

  // Verify fetch via /ai-assessments
  const listRes = await request(`/ai-assessments?patientId=${priya.id}`, {
    headers: { Authorization: `Bearer ${asha.token}` },
  });
  assert.strictEqual(listRes.status, 200);
  const found = listRes.data.data.assessments.find((a) => a.id === createdAsmt.id);
  assert(found, 'Created assessment must appear in patient AI assessments list');
  console.log(`   [PASS] Verified persistent AIAssessment record retrieved from database for Priya Devi.`);

  console.log('\n================================================================');
  console.log('  🎉 ALL XGBOOST RISK & STANDARDIZED SYMPTOMS TESTS PASSED!     ');
  console.log('================================================================\n');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
