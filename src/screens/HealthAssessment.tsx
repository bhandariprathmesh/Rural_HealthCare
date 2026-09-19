import { useState, useEffect } from 'react';
import { Icon, Card, HealthIDCard } from '../components/shared';
import {
  createConsultation,
  getPatients,
  getCurrentUser,
  getPatientByHealthId,
  requestPatientAccess,
} from '../api/client';

interface Props {
  navigate: (s: string) => void;
}

const SYMPTOMS = [
  'Fever',
  'Cough',
  'Cold / Runny nose',
  'Shortness of breath',
  'Chest tightness',
  'Chest pain',
  'Fatigue / Weakness',
  'Dizziness',
  'Headache',
  'Nausea / Vomiting',
  'Abdominal pain',
  'Diarrhoea',
  'Loss of appetite',
  'Joint pain',
  'Back pain',
  'Swelling (oedema)',
  'Skin rash',
  'Blurred vision',
  'Fainting',
  'Palpitations',
];

export default function HealthAssessment({ navigate }: Props) {
  const [step, setStep] = useState<'patient' | 'vitals' | 'symptoms' | 'review'>('patient');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [duration, setDuration] = useState('');
  const [vitals, setVitals] = useState({ temp: '', bp: '', hr: '', spo2: '', weight: '' });
  const [obs, setObs] = useState('');
  const [realPatients, setRealPatients] = useState<any[]>([]);
  const [dbUser, setDbUser] = useState<any>(null);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Consent & access verification state
  const [patientSearch, setPatientSearch] = useState('');
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessBlockedPatient, setAccessBlockedPatient] = useState<any>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setDbUser(user);
        if (user?.role === 'PATIENT' && user.patientProfile) {
          setSelectedPatient(user.patientProfile);
          setStep('vitals');
        } else {
          getPatients().then(setRealPatients).catch(() => {});
        }
      })
      .catch(() => {
        getPatients().then(setRealPatients).catch(() => {});
      });
  }, []);

  function toggleSymptom(s: string) {
    setSelectedSymptoms((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
  }

  const inputClass =
    'w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white font-mono';

  function isAbnormal(field: string, val: string): boolean {
    if (!val) return false;
    const n = parseFloat(val);
    if (field === 'temp' && (n < 36 || n > 37.5)) return true;
    if (field === 'hr' && (n < 60 || n > 100)) return true;
    if (field === 'spo2' && n < 95) return true;
    return false;
  }

  const steps = ['Patient', 'Vitals', 'Symptoms', 'Review'];
  const stepIdx = { patient: 0, vitals: 1, symptoms: 2, review: 3 }[step];

  const filteredPatients = realPatients.filter((p: any) => {
    if (!patientSearch.trim()) return true;
    const q = patientSearch.toLowerCase().trim();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.healthId && p.healthId.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.village && p.village.toLowerCase().includes(q))
    );
  });

  async function handleSelectPatientForAssessment(p: any) {
    setCheckingAccess(true);
    setAccessBlockedPatient(null);
    setRequestSent(false);
    setSubmitError('');

    try {
      const res = await getPatientByHealthId(p.healthId || p.id);
      if (res?.hasAccess === false || res?.patient?.hasAccess === false) {
        setAccessBlockedPatient(res?.patient || p);
      } else {
        setSelectedPatient(res?.patient || p);
        setStep('vitals');
      }
    } catch {
      setAccessBlockedPatient(p);
    } finally {
      setCheckingAccess(false);
    }
  }

  async function handleSubmit() {
    if (step === 'patient') {
      if (!selectedPatient) return;
      setStep('vitals');
      return;
    }
    if (step === 'vitals') {
      setStep('symptoms');
      return;
    }
    if (step === 'symptoms') {
      setStep('review');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      await createConsultation({
        patientId: selectedPatient?.healthId || selectedPatient?.id,
        workerName: dbUser?.fullName || dbUser?.workerProfile?.name || 'Health Worker',
        symptoms: selectedSymptoms,
        vitals: {
          temperature: vitals.temp,
          bloodPressure: vitals.bp,
          heartRate: vitals.hr,
          spo2: vitals.spo2,
          weight: vitals.weight,
        },
        notes: obs,
        riskLevel:
          isAbnormal('temp', vitals.temp) ||
          isAbnormal('hr', vitals.hr) ||
          isAbnormal('spo2', vitals.spo2)
            ? 'high'
            : 'moderate',
      });
      navigate('ai-risk');
    } catch (e: any) {
      console.error(e);
      setSubmitError(
        e?.message || 'Patient consent required to record clinical consultation and assessment.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('worker-dashboard')}
          className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
        >
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">New Health Assessment</h1>
          <p className="text-xs text-gray-500">Guided assessment with AI-assisted risk evaluation</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => {
          const isCurrent = i === stepIdx;
          const isDone = i < stepIdx;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all
                ${
                  isDone
                    ? 'bg-brand-600 text-white'
                    : isCurrent
                    ? 'bg-brand-600 text-white ring-4 ring-brand-100'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isDone ? <Icon name="check" size={13} /> : i + 1}
              </div>
              <span
                className={`text-xs hidden sm:block ${
                  isCurrent ? 'text-brand-700 font-semibold' : 'text-gray-400'
                }`}
              >
                {s}
              </span>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-px ${isDone ? 'bg-brand-400' : 'bg-gray-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      <Card className="p-6 shadow-sm">
        {step === 'patient' && (
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-gray-800">Select Patient</h2>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Search by Name or Health ID
              </label>
              <div className="relative">
                <Icon
                  name="search"
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="RHC-2026-... or Patient Name"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                />
              </div>
            </div>

            {checkingAccess && (
              <div className="p-3 bg-brand-50 border border-brand-100 rounded-xl text-xs text-brand-700 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                <span>Checking patient consent and authorization status…</span>
              </div>
            )}

            {/* Access Blocked Banner */}
            {accessBlockedPatient && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                    <Icon name="shield" size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-amber-950">
                      Patient Consent Required for Clinical Assessment
                    </div>
                    <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                      Under DPDP Act regulations, recording health assessments, vitals, or clinical symptoms for <strong>{accessBlockedPatient.name}</strong> requires active, patient-authorized consent.
                    </p>
                  </div>
                </div>

                {requestSent ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <Icon name="check" size={16} className="text-emerald-600 shrink-0" />
                    <span>Access request sent successfully! Once {accessBlockedPatient.name} authorizes from their RuralCare mobile portal, return here to record their assessment.</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setAccessBlockedPatient(null)}
                      className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                    >
                      Choose another patient
                    </button>
                    <button
                      type="button"
                      disabled={requestSubmitting}
                      onClick={async () => {
                        setRequestSubmitting(true);
                        try {
                          await requestPatientAccess(
                            accessBlockedPatient.healthId || accessBlockedPatient.id,
                            {
                              duration: '1 month',
                              reason: 'Health assessment, vital signs triage, and AI risk evaluation',
                              dataScope: [
                                'Basic Information',
                                'HEALTH_ASSESSMENT',
                                'SYMPTOMS & VITALS',
                                'Consultations',
                              ],
                            }
                          );
                          setRequestSent(true);
                        } catch (err: any) {
                          alert(err?.message || 'Failed to submit request');
                        } finally {
                          setRequestSubmitting(false);
                        }
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Icon name="key" size={14} />
                      {requestSubmitting ? 'Sending Request…' : 'Request Patient Access'}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredPatients.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  {patientSearch ? `No patients found matching "${patientSearch}"` : 'Loading patients from database…'}
                </div>
              ) : (
                filteredPatients.map((p: any) => (
                  <button
                    key={p.id || p.healthId}
                    onClick={() => handleSelectPatientForAssessment(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-brand-300 hover:bg-brand-50 transition-all text-left cursor-pointer"
                  >
                    <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
                      {String(p.name || 'P')
                        .split(' ')
                        .map((w: string) => w[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{p.name}</div>
                      <div className="text-xs text-gray-500">
                        {p.age || '--'} yrs · {p.village || p.address || 'N/A'}
                      </div>
                      <div className="font-mono text-[10px] text-gray-400">{p.healthId || p.id}</div>
                    </div>
                    <Icon name="chevron_right" size={15} className="text-gray-300" />
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === 'vitals' && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display font-semibold text-gray-800">Record Vitals</h2>
              <div className="mt-1">
                <HealthIDCard
                  id={selectedPatient?.healthId || selectedPatient?.id || '—'}
                  name={
                    selectedPatient
                      ? `${selectedPatient.name}, ${selectedPatient.age}${
                          selectedPatient.gender?.[0] || ''
                        }`
                      : ''
                  }
                  size="sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  Temperature (°C)
                  {vitals.temp && isAbnormal('temp', vitals.temp) && (
                    <span className="ml-2 text-amber-600 font-semibold">⚠ Abnormal</span>
                  )}
                </label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="37.0"
                  value={vitals.temp}
                  onChange={(e) => setVitals((v) => ({ ...v, temp: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  Blood Pressure (mmHg)
                </label>
                <input
                  type="text"
                  placeholder="120/80"
                  value={vitals.bp}
                  onChange={(e) => setVitals((v) => ({ ...v, bp: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  Heart Rate (bpm)
                  {vitals.hr && isAbnormal('hr', vitals.hr) && (
                    <span className="ml-2 text-amber-600 font-semibold">⚠ Abnormal</span>
                  )}
                </label>
                <input
                  type="number"
                  placeholder="72"
                  value={vitals.hr}
                  onChange={(e) => setVitals((v) => ({ ...v, hr: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  SpO2 (%)
                  {vitals.spo2 && isAbnormal('spo2', vitals.spo2) && (
                    <span className="ml-2 text-red-600 font-semibold">⚠ Critical</span>
                  )}
                </label>
                <input
                  type="number"
                  placeholder="98"
                  value={vitals.spo2}
                  onChange={(e) => setVitals((v) => ({ ...v, spo2: e.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 block mb-1.5">
                  Weight (kg)
                </label>
                <input
                  type="number"
                  step="0.5"
                  placeholder="65"
                  value={vitals.weight}
                  onChange={(e) => setVitals((v) => ({ ...v, weight: e.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep('patient')}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700"
              >
                Continue to Symptoms →
              </button>
            </div>
          </div>
        )}

        {step === 'symptoms' && (
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-gray-800">Select Symptoms</h2>
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
              {SYMPTOMS.map((s) => (
                <button
                  key={s}
                  onClick={() => toggleSymptom(s)}
                  className={`p-2.5 rounded-xl border text-xs text-left transition-all ${
                    selectedSymptoms.includes(s)
                      ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                      : 'border-gray-100 hover:border-gray-200 text-gray-700'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1.5">
                Clinical Observations / Notes
              </label>
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                placeholder="Additional notes, history, or context..."
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-400 focus:outline-none"
                rows={3}
              />
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep('vitals')}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                className="px-5 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700"
              >
                Review & Assess →
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-5">
            <h2 className="font-display font-semibold text-gray-800">Review Assessment Summary</h2>

            {submitError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                {submitError}
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-2xl space-y-3 text-xs">
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Patient:</span>
                <span className="font-bold text-gray-900">
                  {selectedPatient?.name} ({selectedPatient?.healthId})
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-200 pb-2">
                <span className="text-gray-500">Vitals Recorded:</span>
                <span className="font-mono text-gray-900">
                  {vitals.temp ? `${vitals.temp}°C` : ''} {vitals.bp ? `· BP ${vitals.bp}` : ''}{' '}
                  {vitals.hr ? `· HR ${vitals.hr}` : ''} {vitals.spo2 ? `· SpO2 ${vitals.spo2}%` : ''}
                </span>
              </div>
              <div>
                <span className="text-gray-500 block mb-1">Symptoms ({selectedSymptoms.length}):</span>
                <div className="flex flex-wrap gap-1">
                  {selectedSymptoms.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 bg-brand-100 text-brand-800 rounded-md text-[10px] font-medium"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {obs && (
                <div>
                  <span className="text-gray-500 block mb-0.5">Notes:</span>
                  <p className="text-gray-700 italic">{obs}</p>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={() => setStep('symptoms')}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                disabled={submitting}
                onClick={handleSubmit}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow"
              >
                <Icon name="brain" size={14} />
                {submitting ? 'Recording Assessment…' : 'Generate AI Risk & Save'}
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}