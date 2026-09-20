import jwt from '../server/node_modules/jsonwebtoken/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

// Let's test with Dr. Ankit Sharma (9829000002)
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

async function testApi() {
  const res = await fetch('http://localhost:5000/api/v1/patients', {
    headers: { Authorization: `Bearer ${doctorToken}` }
  });
  const data = await res.json();
  const patients = data.data.patients;
  console.log(`Fetched ${patients.length} patients from API.\n`);

  for (const p of patients) {
    const detailRes = await fetch(`http://localhost:5000/api/v1/patients/${p.healthId}`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    const detail = await detailRes.json();
    const hasAccess = detail.data?.hasAccess;
    const pendingReq = detail.data?.pendingRequest;
    console.log(`Patient: ${p.name.padEnd(20)} (${p.healthId}) -> hasAccess: ${hasAccess} | pendingRequest: ${pendingReq ? pendingReq.consentCode : 'none'}`);
  }
}

testApi().catch(console.error);
