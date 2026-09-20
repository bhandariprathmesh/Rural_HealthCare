import { useState, useEffect, useMemo } from 'react';
import { Icon, Card, HealthIDCard } from '../components/shared';
import {
  createConsultation,
  getPatients,
  getCurrentUser,
  getPatientByHealthId,
  requestPatientAccess,
  getSymptoms,
  predictRisk,
  generateAiAssessment,
  type StandardizedSymptom,
  type RiskPredictionResponse,
} from '../api/client';
import { saveOfflineConsultation, syncEngine } from '../services/syncEngine';

interface Props {
  navigate: (s: string) => void;
  patientId?: string;
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

export default function HealthAssessment({ navigate, patientId }: Props) {
  const [step, setStep] = useState<'patient' | 'vitals' | 'symptoms' | 'review'>('patient');
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [selectedSymptomCodes, setSelectedSymptomCodes] = useState<string[]>([]);
  const [duration, setDuration] = useState('1-3 days');
  const [symptomSeverity, setSymptomSeverity] = useState<'mild' | 'moderate' | 'severe'>('moderate');
  const [symptomCatalog, setSymptomCatalog] = useState<StandardizedSymptom[]>([]);
  const [symptomSearch, setSymptomSearch] = useState('');
  const [realtimeRisk, setRealtimeRisk] = useState<RiskPredictionResponse | null>(null);
  const [loadingRisk, setLoadingRisk] = useState(false);

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
  const [accessDuration, setAccessDuration] = useState<'1 day' | '1 week' | '1 month' | '3 months'>('1 month');
  const [accessReason, setAccessReason] = useState('');
  const [accessScope, setAccessScope] = useState<string[]>(['Basic Information', 'Consultation History']);

  useEffect(() => {
    getSymptoms().then(setSymptomCatalog).catch(() => {});
    getCurrentUser()
      .then((user) => {
        setDbUser(user);
        if (user?.role === 'PATIENT' && user.patientProfile) {
          setSelectedPatient(user.patientProfile);
          setStep('vitals');
        } else {
          getPatients().then((pts) => {
            setRealPatients(pts || []);
            if (patientId) {
              const matched = (pts || []).find(
                (x: any) => x.id === patientId || x.healthId === patientId
              );
              if (matched) {
                handleSelectPatientForAssessment(matched);
              }
            }
          }).catch(() => {});
        }
      })
      .catch(() => {
        getPatients().then(setRealPatients).catch(() => {});
      });
  }, [patientId]);

  function addSymptom(name: string, code?: string) {
    if (!selectedSymptoms.includes(name)) {
      setSelectedSymptoms((prev) => [...prev, name]);
      if (code && !selectedSymptomCodes.includes(code)) {
        setSelectedSymptomCodes((prev) => [...prev, code]);
      }
    }
    setSymptomSearch('');
  }

  function removeSymptom(name: string) {
    setSelectedSymptoms((prev) => prev.filter((x) => x !== name));
    const matched = symptomCatalog.find((s) => s.name === name);
    if (matched) {
      setSelectedSymptomCodes((prev) => prev.filter((c) => c !== matched.code));
    }
  }

  function toggleSymptom(s: string) {
    if (selectedSymptoms.includes(s)) {
      removeSymptom(s);
    } else {
      const matched = symptomCatalog.find((item) => item.name === s);
      addSymptom(s, matched?.code);
    }
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

  const filteredPatients = useMemo(() => {
    const seen = new Set<string>();
    const list: any[] = [];
    for (const p of realPatients) {
      const normName = (p.name || '').trim().toLowerCase();
      if (!normName || seen.has(normName)) continue;
      seen.add(normName);
      list.push(p);
    }
    if (!patientSearch.trim()) return list;
    const q = patientSearch.toLowerCase().trim();
    return list.filter((p: any) =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.healthId && p.healthId.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.village && p.village.toLowerCase().includes(q))
    );
  }, [realPatients, patientSearch]);

  async function handleSelectPatientForAssessment(p: any) {
    setCheckingAccess(true);
    setAccessBlockedPatient(null);
    setRequestSent(false);
    setAccessReason('Health assessment, vital signs triage, and clinical evaluation');
    setSubmitError('');

    try {
      const targetLookup = p.healthId || p.id;
      const res = await getPatientByHealthId(targetLookup, 'health_assessment');
      
      const isDoctor = dbUser?.role === 'DOCTOR';
      // For doctor, access requires explicit active consent; for worker, requires worker authorization
      const needsConsent = isDoctor
        ? (!res?.hasAccess || !res?.activeConsent)
        : (res?.hasAccess === false || res?.patient?.hasAccess === false);

      if (needsConsent) {
        const dynamicPatient = {
          ...p,
          ...(res?.patient || {}),
          id: p.id || res?.patient?.id,
          rawId: p.id || res?.patient?.id,
          healthId: p.healthId || res?.patient?.healthId,
          name: p.name || res?.patient?.name,
          age: p.age ?? res?.patient?.age,
          gender: p.gender || res?.patient?.gender,
          existingPendingRequest: res?.pendingRequest || null,
        };
        setAccessBlockedPatient(dynamicPatient);
        if (res?.pendingRequest) {
          setRequestSent(true);
        }
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
      setLoadingRisk(true);
      predictRisk({
        age: selectedPatient?.age,
        gender: selectedPatient?.gender,
        vitals,
        symptoms: selectedSymptoms,
        standardizedSymptomCodes: selectedSymptomCodes,
        obs: `Duration: ${duration} · Severity: ${symptomSeverity}. ${obs}`.trim(),
      })
        .then((res) => {
          setRealtimeRisk(res);
        })
        .catch((err) => {
          console.warn('Realtime XGBoost prediction warning:', err);
        })
        .finally(() => {
          setLoadingRisk(false);
          setStep('review');
        });
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    const targetPatientId = selectedPatient?.healthId || selectedPatient?.id;
    const combinedNotes = `Duration: ${duration} · Severity: ${symptomSeverity}. ${obs}`.trim();
    const mappedRiskLevel = (realtimeRisk?.riskLevel?.toLowerCase() as any) ||
      (isAbnormal('temp', vitals.temp) || isAbnormal('hr', vitals.hr) || isAbnormal('spo2', vitals.spo2)
        ? 'high'
        : 'moderate');

    const payload = {
      patientId: targetPatientId,
      workerName: dbUser?.fullName || dbUser?.workerProfile?.name || (dbUser?.role === 'DOCTOR' ? 'Attending Doctor' : 'Health Worker'),
      doctorId: dbUser?.doctorProfile?.id,
      doctorName: dbUser?.role === 'DOCTOR' ? (dbUser?.fullName || 'Doctor') : undefined,
      symptoms: selectedSymptoms,
      vitals: {
        temperature: vitals.temp,
        bloodPressure: vitals.bp,
        heartRate: vitals.hr,
        spo2: vitals.spo2,
        weight: vitals.weight,
      },
      notes: combinedNotes,
      riskLevel: mappedRiskLevel,
    };

    const isDeviceOffline =
      !syncEngine.isOnline() ||
      (typeof navigator !== 'undefined' && !navigator.onLine);

    if (isDeviceOffline) {
      try {
        await saveOfflineConsultation(payload);
      } catch (offlineErr) {
        console.error('Failed to save consultation offline:', offlineErr);
      } finally {
        setSubmitting(false);
        navigate('ai-risk');
      }
      return;
    }

    try {
      // 1. Generate and persist XGBoost AI Risk Assessment in PostgreSQL (when online)
      await generateAiAssessment({
        patientId: targetPatientId,
        symptoms: selectedSymptoms,
        standardizedSymptomCodes: selectedSymptomCodes,
        vitals,
        obs: combinedNotes,
      }).catch((e) => console.warn('AI Assessment auto-persistence notice:', e));

      // 2. Record consultation with mapped XGBoost risk level
      await createConsultation(payload);
      navigate('ai-risk');
    } catch (e: any) {
      console.error(e);
      const isNetworkError =
        !syncEngine.isOnline() ||
        (typeof navigator !== 'undefined' && !navigator.onLine) ||
        e.name === 'TypeError' ||
        e.message?.includes('Network error') ||
        e.message?.includes('Failed to fetch') ||
        e.message?.includes('network');

      if (isNetworkError) {
        try {
          await saveOfflineConsultation(payload);
          navigate('ai-risk');
          return;
        } catch (offlineErr) {
          console.error('Failed to fallback save consultation offline:', offlineErr);
        }
      }

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
          onClick={() => navigate(dbUser?.role === 'DOCTOR' ? 'doctor-dashboard' : 'worker-dashboard')}
          className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer"
        >
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">New Health Assessment</h1>
          <p className="text-xs text-gray-500">Guided assessment with AI-assisted risk evaluation</p>
        </div>
        {typeof navigator !== 'undefined' && !navigator.onLine && (
          <div className="ml-auto px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-semibold flex items-center gap-1">
            <Icon name="wifi_off" size={11} />
            Offline
          </div>
        )}
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

            {/* Access Blocked — Full Consent Request Form */}
            {accessBlockedPatient && (
              <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-4">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 shrink-0 mt-0.5">
                    <Icon name="shield" size={18} />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-amber-950">
                      Patient Consent Required
                    </div>
                    <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                      Under DPDP Act, you must request access before recording assessments for this patient.
                    </p>
                  </div>
                </div>

                {requestSent ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Icon name="check" size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        {accessBlockedPatient.existingPendingRequest
                          ? <>An access request (<strong>{accessBlockedPatient.existingPendingRequest.consentCode}</strong>) is already pending approval from <strong>{accessBlockedPatient.name}</strong>.</>
                          : <>Access request sent! Once <strong>{accessBlockedPatient.name}</strong> approves from their RuralCare portal, return here to proceed.</>}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAccessBlockedPatient(null);
                        setRequestSent(false);
                      }}
                      className="px-3 py-1 bg-white border border-emerald-300 text-emerald-700 rounded-lg text-xs hover:bg-emerald-50 cursor-pointer font-bold shrink-0"
                    >
                      Select Another Patient
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Patient Info */}
                    <div className="p-3 bg-white border border-amber-200 rounded-xl">
                      <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Requesting Access For</div>
                      <div className="font-semibold text-sm text-gray-900">{accessBlockedPatient.name}</div>
                      <div className="text-xs text-gray-500">
                        {accessBlockedPatient.age && `${accessBlockedPatient.age} yrs`}{accessBlockedPatient.gender && ` · ${accessBlockedPatient.gender === 'F' || accessBlockedPatient.gender === 'Female' ? 'Female' : accessBlockedPatient.gender === 'M' || accessBlockedPatient.gender === 'Male' ? 'Male' : accessBlockedPatient.gender}`}
                      </div>
                      <div className="font-mono text-[10px] text-gray-400 mt-0.5">{accessBlockedPatient.healthId || accessBlockedPatient.id}</div>
                    </div>

                    {/* Duration */}
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1.5">Access Duration <span className="text-red-500">*</span></label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {(['1 day', '1 week', '1 month', '3 months'] as const).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setAccessDuration(d)}
                            className={`py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              accessDuration === d
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1.5">Reason for Access <span className="text-red-500">*</span></label>
                      <textarea
                        value={accessReason}
                        onChange={(e) => setAccessReason(e.target.value)}
                        placeholder="e.g. Health assessment, vital signs triage, and AI risk evaluation..."
                        rows={2}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white resize-none"
                      />
                    </div>

                    {/* Scope */}
                    <div>
                      <label className="text-xs font-semibold text-gray-700 block mb-1.5">Information Scope <span className="text-red-500">*</span></label>
                      <div className="space-y-2">
                        {[
                          { id: 'Basic Information', label: 'Basic Information', sub: 'Demographics, emergency contact, blood group' },
                          { id: 'Consultation History', label: 'Consultation History', sub: 'Past diagnoses, prescriptions, clinical notes' },
                          { id: 'HEALTH_ASSESSMENT', label: 'Health Assessments', sub: 'AI risk assessments, vitals, symptoms' },
                        ].map(({ id, label, sub }) => (
                          <label key={id} className="flex items-start gap-2.5 p-2.5 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-amber-300 transition-colors">
                            <input
                              type="checkbox"
                              checked={accessScope.includes(id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setAccessScope((prev) => [...prev, id]);
                                } else {
                                  setAccessScope((prev) => prev.filter((s) => s !== id));
                                }
                              }}
                              className="mt-0.5 accent-amber-600"
                            />
                            <div>
                              <div className="text-xs font-semibold text-gray-800">{label}</div>
                              <div className="text-[10px] text-gray-500">{sub}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setAccessBlockedPatient(null);
                          setRequestSent(false);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer"
                      >
                        Choose another patient
                      </button>
                      <button
                        type="button"
                        disabled={requestSubmitting || !accessReason.trim() || accessScope.length === 0}
                        onClick={async () => {
                          setRequestSubmitting(true);
                          try {
                            const targetPatientId = accessBlockedPatient.rawId || accessBlockedPatient.id || accessBlockedPatient.healthId;
                            await requestPatientAccess(
                              targetPatientId,
                              {
                                duration: accessDuration,
                                reason: accessReason.trim() || 'Health assessment and clinical evaluation',
                                dataScope: accessScope,
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
                        {requestSubmitting ? 'Sending…' : 'Submit Access Request'}
                      </button>
                    </div>
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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display font-semibold text-gray-800">Standardized Symptom Input</h2>
                <p className="text-xs text-gray-500">Search controlled clinical vocabulary (supports English & Hindi terms)</p>
              </div>
              <span className="text-[11px] px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium">
                {selectedSymptoms.length} Selected
              </span>
            </div>

            {/* Standardized Autocomplete Search Bar */}
            <div className="relative">
              <div className="relative">
                <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={symptomSearch}
                  onChange={(e) => setSymptomSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && symptomSearch.trim()) {
                      e.preventDefault();
                      const query = symptomSearch.trim().toLowerCase();
                      const matched = symptomCatalog.find(
                        (s) =>
                          s.name.toLowerCase() === query ||
                          s.code.toLowerCase() === query ||
                          s.synonyms.some((syn) => syn.toLowerCase() === query)
                      );
                      if (matched) {
                        addSymptom(matched.name, matched.code);
                      } else {
                        addSymptom(symptomSearch.trim());
                      }
                    }
                  }}
                  placeholder="Type to search (e.g. 'fev', 'head', 'chest pain', 'bukhar')..."
                  className="w-full pl-9 pr-24 py-2.5 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-brand-400 focus:outline-none bg-white"
                />
                {symptomSearch.trim() && (
                  <button
                    type="button"
                    onClick={() => {
                      addSymptom(symptomSearch.trim());
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-[11px] font-semibold transition-all cursor-pointer"
                  >
                    + Add
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {symptomSearch.trim().length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto divide-y divide-gray-100">
                  {(() => {
                    const q = symptomSearch.trim().toLowerCase();
                    const matches = symptomCatalog.filter((s) => {
                      const name = s.name.toLowerCase();
                      const nameHi = s.nameHi ? s.nameHi.toLowerCase() : '';
                      const code = s.code.toLowerCase();
                      const syns = (s.synonyms || []).map((x) => x.toLowerCase());
                      return (
                        name.includes(q) ||
                        nameHi.includes(q) ||
                        code.includes(q) ||
                        syns.some((syn) => syn.includes(q))
                      );
                    });

                    if (matches.length === 0) {
                      return (
                        <div className="p-3 text-center text-xs text-gray-500">
                          <span>No catalog term matching "{symptomSearch}".</span>
                          <button
                            type="button"
                            onClick={() => addSymptom(symptomSearch.trim())}
                            className="mt-1.5 block w-full py-1.5 px-3 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-lg text-xs"
                          >
                            + Add custom manual symptom: "{symptomSearch}"
                          </button>
                        </div>
                      );
                    }

                    return matches.map((m) => {
                      const isSelected = selectedSymptoms.includes(m.name);
                      return (
                        <button
                          key={m.id || m.code}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              removeSymptom(m.name);
                            } else {
                              addSymptom(m.name, m.code);
                            }
                          }}
                          className={`w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-brand-50 transition-colors ${
                            isSelected ? 'bg-brand-50/60' : ''
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-900">{m.name}</span>
                              {m.nameHi && (
                                <span className="text-[11px] text-gray-500 font-medium">({m.nameHi})</span>
                              )}
                              <span className="text-[10px] font-mono px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                                {m.code}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {m.category} · Synonyms: {m.synonyms?.slice(0, 3).join(', ')}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-semibold px-2 py-0.5 rounded ${
                              isSelected ? 'text-brand-700' : 'text-gray-400'
                            }`}
                          >
                            {isSelected ? '✓ Added' : '+ Select'}
                          </span>
                        </button>
                      );
                    });
                  })()}
                </div>
              )}
            </div>

            {/* Selected Symptoms Chips */}
            {selectedSymptoms.length > 0 && (
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Active Clinical Symptoms
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selectedSymptoms.map((s) => {
                    const matched = symptomCatalog.find((item) => item.name === s);
                    return (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 border border-brand-200 text-brand-800 rounded-lg text-xs font-medium"
                      >
                        {matched?.code && (
                          <span className="font-mono text-[9px] text-brand-500 bg-brand-100/70 px-1 rounded">
                            {matched.code}
                          </span>
                        )}
                        <span>{s}</span>
                        {matched?.nameHi && <span className="text-brand-600 text-[10px]">({matched.nameHi})</span>}
                        <button
                          type="button"
                          onClick={() => removeSymptom(s)}
                          className="hover:text-red-600 font-bold ml-0.5 cursor-pointer text-gray-400"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick Select Popular Clinical Symptoms */}
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Frequently Selected Symptoms
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
                {symptomCatalog.slice(0, 18).map((s) => {
                  const isSelected = selectedSymptoms.includes(s.name);
                  return (
                    <button
                      key={s.code}
                      type="button"
                      onClick={() => toggleSymptom(s.name)}
                      className={`p-2 rounded-xl border text-xs text-left transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold shadow-xs'
                          : 'border-gray-100 hover:border-gray-300 text-gray-700 bg-white'
                      }`}
                    >
                      <span className="truncate">{s.name}</span>
                      {isSelected ? (
                        <span className="text-brand-600 font-bold">✓</span>
                      ) : (
                        <span className="text-gray-300 text-[10px]">+</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration & Severity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-gray-100">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Symptom Duration
                </label>
                <select
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none"
                >
                  <option value="< 24 hours">Less than 24 hours (Acute)</option>
                  <option value="1-3 days">1 to 3 days</option>
                  <option value="4-7 days">4 to 7 days (Sub-acute)</option>
                  <option value="1-2 weeks">1 to 2 weeks</option>
                  <option value="> 2 weeks">Greater than 2 weeks (Chronic / Persistent)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Symptom Severity
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['mild', 'moderate', 'severe'] as const).map((sev) => (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setSymptomSeverity(sev)}
                      className={`py-2 text-xs rounded-xl border capitalize font-medium transition-all ${
                        symptomSeverity === sev
                          ? sev === 'severe'
                            ? 'bg-red-50 border-red-400 text-red-700 font-bold'
                            : sev === 'moderate'
                            ? 'bg-amber-50 border-amber-400 text-amber-700 font-bold'
                            : 'bg-green-50 border-green-400 text-green-700 font-bold'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
              </div>
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
                rows={2}
              />
            </div>

            <div className="flex justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep('vitals')}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={loadingRisk}
                onClick={handleSubmit}
                className="px-5 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 cursor-pointer flex items-center gap-1.5"
              >
                {loadingRisk ? 'Calculating XGBoost Risk…' : 'Review & Assess →'}
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

            {/* Live XGBoost Risk Stratification Card */}
            {realtimeRisk && (
              <div
                className={`p-4 rounded-2xl border-2 transition-all ${
                  realtimeRisk.riskLevel === 'CRITICAL'
                    ? 'bg-red-50 border-red-300 text-red-900'
                    : realtimeRisk.riskLevel === 'HIGH'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : realtimeRisk.riskLevel === 'MODERATE'
                    ? 'bg-blue-50 border-blue-300 text-blue-900'
                    : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <span className="text-xs font-bold uppercase tracking-wider">
                      XGBoost Clinical Stratification
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 bg-white/70 rounded border border-gray-200">
                      {realtimeRisk.modelVersion}
                    </span>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wide ${
                      realtimeRisk.riskLevel === 'CRITICAL'
                        ? 'bg-red-600 text-white'
                        : realtimeRisk.riskLevel === 'HIGH'
                        ? 'bg-amber-600 text-white'
                        : realtimeRisk.riskLevel === 'MODERATE'
                        ? 'bg-blue-600 text-white'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {realtimeRisk.riskLevel} RISK ({realtimeRisk.confidence}%)
                  </span>
                </div>

                <p className="text-xs leading-relaxed mb-3 opacity-90">{realtimeRisk.reasoning}</p>

                {/* Softmax Probability Bars */}
                <div className="space-y-1.5 bg-white/80 p-2.5 rounded-xl border border-gray-200/60 text-[11px]">
                  <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Class Probabilities (MIETIC/ESI Softmax)
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div className="p-1 rounded bg-emerald-50 border border-emerald-100">
                      <div className="text-[10px] text-emerald-700 font-semibold">Low</div>
                      <div className="text-xs font-bold text-emerald-900">
                        {(realtimeRisk.probabilities.low * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-1 rounded bg-blue-50 border border-blue-100">
                      <div className="text-[10px] text-blue-700 font-semibold">Moderate</div>
                      <div className="text-xs font-bold text-blue-900">
                        {(realtimeRisk.probabilities.moderate * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-1 rounded bg-amber-50 border border-amber-100">
                      <div className="text-[10px] text-amber-700 font-semibold">High</div>
                      <div className="text-xs font-bold text-amber-900">
                        {(realtimeRisk.probabilities.high * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-1 rounded bg-red-50 border border-red-100">
                      <div className="text-[10px] text-red-700 font-semibold">Critical</div>
                      <div className="text-xs font-bold text-red-900">
                        {(realtimeRisk.probabilities.critical * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 flex items-start gap-1.5 text-xs font-medium">
                  <span className="font-bold">Next Action:</span>
                  <span>{realtimeRisk.recommendedAction}</span>
                </div>
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
                <span className="text-gray-500 block mb-1">Standardized Symptoms ({selectedSymptoms.length}):</span>
                <div className="flex flex-wrap gap-1">
                  {selectedSymptoms.map((s) => {
                    const matched = symptomCatalog.find((item) => item.name === s);
                    return (
                      <span
                        key={s}
                        className="px-2 py-0.5 bg-brand-100 text-brand-800 rounded-md text-[10px] font-medium flex items-center gap-1"
                      >
                        {matched?.code && <span className="font-mono text-[9px] text-brand-600">{matched.code}</span>}
                        <span>{s}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 text-[11px] text-gray-500">
                <span>Duration: <strong className="text-gray-800">{duration}</strong></span>
                <span>Severity: <strong className="text-gray-800 capitalize">{symptomSeverity}</strong></span>
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
                type="button"
                onClick={() => setStep('symptoms')}
                className="px-4 py-2 border border-gray-200 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmit}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Icon name="brain" size={14} />
                {submitting ? 'Recording Assessment…' : 'Generate AI Risk & Save'}
              </button>
            </div>
            {typeof navigator !== 'undefined' && !navigator.onLine && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                <Icon name="wifi_off" size={14} className="shrink-0 text-amber-700" />
                <span>Operating offline. Consultation will be saved to local offline database and synced when connectivity returns.</span>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}