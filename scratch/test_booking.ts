async function testBooking() {
  const patientRes = await (await fetch('http://localhost:5000/api/v1/patients?limit=1')).json();
  const patient = patientRes.data?.patients?.[0];
  console.log('Test Patient:', patient?.id, patient?.healthId, patient?.name);

  const docRes = await (await fetch('http://localhost:5000/api/v1/doctors')).json();
  const doctor = docRes.data?.doctors?.[0];
  console.log('Test Doctor:', doctor?.id, doctor?.name, doctor?.facilityId);

  // Test 1: book with patient.healthId
  const payload1 = {
    patientId: patient?.healthId,
    doctorId: doctor?.id,
    facilityId: doctor?.facilityId,
    scheduledDate: '2026-09-23',
    timeSlot: '10:00 AM - 10:30 AM',
    reason: 'Fever and headache',
    source: 'PATIENT',
  };

  console.log('\n--- Test 1: Booking with healthId ---');
  const res1 = await fetch('http://localhost:5000/api/v1/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload1),
  });
  console.log('Status 1:', res1.status);
  console.log('Data 1:', await res1.json());

  // Test 2: book with patient.id
  const payload2 = {
    patientId: patient?.id,
    doctorId: doctor?.id,
    scheduledDate: '2026-09-23',
    timeSlot: '11:00 AM - 11:30 AM',
    reason: 'Followup check',
    source: 'PATIENT',
  };

  console.log('\n--- Test 2: Booking with patient UUID ---');
  const res2 = await fetch('http://localhost:5000/api/v1/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload2),
  });
  console.log('Status 2:', res2.status);
  console.log('Data 2:', await res2.json());
}

testBooking().catch(console.error);
