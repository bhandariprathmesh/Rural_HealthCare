import { useState, useEffect } from 'react';
import {
  RiskBadge,
  ConsentBadge,
  HealthIDCard,
  Tabs,
  Card,
  Icon,
  SectionHeader,
  AIDisclaimer,
  PermissionBadge,
} from '../components/shared';
import {
  getPatientByHealthId,
  getPatients,
  getConsultations,
  createConsultation,
  updateConsultation,
  getMedicines,
  updateReferralStatus,
  getCurrentUser,
  requestPatientAccess,
} from '../api/client';

interface Props {
  navigate: (s: string, patientId?: string) => void;
  patientId?: string | null;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'vitals', label: 'Vitals & Symptoms' },
  { id: 'history', label: 'Medical History' },
  { id: 'ai', label: 'AI Assessment' },
  { id: 'actions', label: 'Actions' },
];

export default function DoctorPatientView({ navigate, patientId }: Props) {
  const [activeTab, setActiveTab] = useState('overview');
  const [addingDiagnosis, setAddingDiagnosis] = useState(false);
  const [diagnosis, setDiagnosis] = useState('');
  const [treatment, setTreatment] = useState('');
  const [prescriptionList, setPrescriptionList] = useState<string[]>([]);
  const [prescriptionInput, setPrescriptionInput] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [patient, setPatient] = useState<any>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<any[]>([]);
  const [activeReferral, setActiveReferral] = useState<any>(null);
  const [dbUser, setDbUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Access Control State
  const [hasAccess, setHasAccess] = useState(true);
  const [pendingRequest, setPendingRequest] = useState<any>(null);
  const [activeConsentInfo, setActiveConsentInfo] = useState<any>(null);
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [requestDuration, setRequestDuration] = useState('1 month');
  const [requestReason, setRequestReason] = useState('Outpatient consultation and clinical evaluation');
  const [requestScopes, setRequestScopes] = useState<string[]>(['Basic Information', 'Consultation History']);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestMsg, setRequestMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dynamic Patient Switcher State
  const [patientSearch, setPatientSearch] = useState('');
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null | undefined>(patientId);

  useEffect(() => {
    if (patientId) {
      setSelectedTargetId(patientId);
    }
  }, [patientId]);

  useEffect(() => {
    getCurrentUser()
      .then(setDbUser)
      .catch(() => {});
  }, []);

  async function handlePatientSearch(q: string) {
    setPatientSearch(q);
    if (!q.trim()) {
      setPatientSearchResults([]);
      return;
    }
    const patients = await getPatients(q.trim()).catch(() => []);
    const seen = new Set<string>();
    const unique = (patients || []).filter((p: any) => {
      const k = (p.name || '').trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    setPatientSearchResults(unique);
  }

  function handleSelectPatient(p: any) {
    setPatientSearch('');
    setPatientSearchResults([]);
    setSelectedTargetId(p.healthId || p.id);
  }

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function loadData() {
      try {
        let targetId: string | undefined = selectedTargetId || undefined;

        // If no targetId passed, fetch the patient list and pick the first one
        if (!targetId) {
          const patientList = await getPatients().catch(() => []);
          if (patientList && patientList.length > 0) {
            targetId = patientList[0].healthId || patientList[0].id;
          }
        }

        if (targetId) {
          const res = await getPatientByHealthId(targetId);
          if (mounted && res?.patient) {
            const p = res.patient;
            const accessAllowed = res.hasAccess !== false && p.hasAccess !== false;
            setHasAccess(accessAllowed);
            setPendingRequest(res.pendingRequest || p.pendingRequest || null);
            setActiveConsentInfo(res.activeConsent || p.activeConsent || null);

            setPatient({
              id: p.healthId || p.id,
              rawId: p.id,
              name: p.name || 'Patient',
              nameHi: p.nameHi || '',
              age: p.age || 30,
              gender: p.gender === 'F' || p.gender === 'Female' ? 'Female' : 'Male',
              bloodGroup: p.bloodGroup || 'O+',
              allergies: Array.isArray(p.allergies) ? p.allergies : [],
              chronicConditions: Array.isArray(p.chronicConditions) ? p.chronicConditions : [],
              currentMedications: Array.isArray(p.currentMedications) ? p.currentMedications : [],
              village: p.village || 'Govindpur',
              district: p.district || 'Bikaner',
              emergencyContact: p.emergencyContact || { name: 'Family Contact', relation: 'Relative', phone: p.phone || '' },
              riskLevel: (p.riskLevel || 'LOW').toLowerCase(),
              consentStatus: (p.consentStatus || 'GRANTED').toLowerCase(),
            });

            const fetchedCons = res.consultations || p.consultations || [];
            setConsultations(fetchedCons);

            // Populate active referral if present
            const fetchedRefs = res.referrals || p.referrals || [];
            if (fetchedRefs.length > 0) {
              const pendingOrAccepted = fetchedRefs.find((r: any) =>
                String(r.status || '').toLowerCase() === 'pending' ||
                String(r.status || '').toLowerCase() === 'accepted' ||
                String(r.status || '').toLowerCase() === 'in-consultation'
              );
              setActiveReferral(pendingOrAccepted || fetchedRefs[0]);
            }
          }
        }

        // Fetch medicine inventory for prescription suggestions
        const medList = await getMedicines().catch(() => []);
        if (mounted && medList) {
          setMedicines(medList);
        }
      } catch (err) {
        console.error('Failed to load patient record from PostgreSQL:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [selectedTargetId]);

  const latestConsultation = consultations.length > 0 ? consultations[0] : null;

  function handleAddPrescription(medName: string) {
    const trimmed = medName.trim();
    if (!trimmed) return;
    if (!prescriptionList.includes(trimmed)) {
      setPrescriptionList(prev => [...prev, trimmed]);
    }
    setPrescriptionInput('');
  }

  function handleRemovePrescription(medName: string) {
    setPrescriptionList(prev => prev.filter(m => m !== medName));
  }

  async function handleSendAccessRequest() {
    const rawTargetId = patient?.rawId || patient?.id;
    if (!rawTargetId) return;
    setRequestSubmitting(true);
    setRequestMsg(null);
    try {
      const res = await requestPatientAccess(rawTargetId, {
        duration: requestDuration,
        reason: requestReason.trim() || 'Outpatient consultation and clinical evaluation',
        dataScope: requestScopes,
      });
      setRequestMsg({
        type: 'success',
        text: 'Access request submitted successfully! Waiting for patient authorization.',
      });
      if (res?.request) {
        setPendingRequest(res.request);
      }
      setTimeout(() => {
        setRequestModalOpen(false);
      }, 1500);
    } catch (err: any) {
      setRequestMsg({
        type: 'error',
        text: err?.message || 'Failed to submit access request.',
      });
    } finally {
      setRequestSubmitting(false);
    }
  }

  async function handleSaveClinicalNote() {
    if (!diagnosis.trim() && !treatment.trim() && prescriptionList.length === 0) return;
    setSaving(true);
    setSaveSuccess(null);

    try {
      const doctorName = dbUser?.fullName || dbUser?.doctorProfile?.name || 'Doctor';
      const doctorId = dbUser?.doctorProfile?.id || dbUser?.id;

      if (latestConsultation && latestConsultation.id) {
        // Update existing consultation with doctor's clinical findings
        const res = await updateConsultation(latestConsultation.id, {
          referralId: activeReferral?.id,
          diagnosis: diagnosis.trim() || undefined,
          treatment: treatment.trim() || undefined,
          prescription: prescriptionList.length > 0 ? prescriptionList : undefined,
          notes: clinicalNotes.trim() || undefined,
          doctorId,
          doctorName,
          referralStatus: 'completed',
        });

        if (res?.consultation) {
          setConsultations(prev =>
            prev.map(c => (c.id === latestConsultation.id ? { ...c, ...res.consultation } : c))
          );
        }
      } else {
        // Create a new consultation recorded by this doctor
        const res = await createConsultation({
          patientId: patient?.rawId || patient?.id,
          referralId: activeReferral?.id,
          doctorId,
          doctorName,
          diagnosis: diagnosis.trim(),
          treatment: treatment.trim(),
          prescription: prescriptionList,
          notes: clinicalNotes.trim(),
          riskLevel: 'moderate',
          referralStatus: 'completed',
        });

        if (res?.consultation) {
          setConsultations(prev => [res.consultation, ...prev]);
        }
      }

      if (activeReferral?.id) {
        await updateReferralStatus(activeReferral.id, 'COMPLETED', 'Completed consultation by doctor').catch(() => {});
        setActiveReferral((prev: any) => prev ? { ...prev, status: 'completed' } : null);
      }

      setSaveSuccess('Clinical diagnosis and prescription saved successfully in PostgreSQL.');
      setAddingDiagnosis(false);
      setDiagnosis('');
      setTreatment('');
      setPrescriptionList([]);
      setClinicalNotes('');
    } catch (err: any) {
      console.error('Failed to save clinical note:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleCompleteReferral() {
    if (!activeReferral?.id) return;
    try {
      await updateReferralStatus(activeReferral.id, 'COMPLETED', 'Completed consultation by doctor');
      setActiveReferral((prev: any) => prev ? { ...prev, status: 'completed' } : null);
      setSaveSuccess('Referral marked as completed in database.');
    } catch (err) {
      console.error('Failed to complete referral:', err);
    }
  }

  if (loading) {
    return (
      <div className="p-12 text-center max-w-4xl mx-auto space-y-3">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500 font-medium">Loading clinical record from PostgreSQL…</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center">
        <Icon name="user" size={36} className="text-gray-300 mx-auto mb-2" />
        <h2 className="text-lg font-bold text-gray-800">Patient Not Found</h2>
        <p className="text-sm text-gray-500 mb-4">No record matching Health ID or patient could not be loaded.</p>
        <button
          onClick={() => navigate('doctor-dashboard')}
          className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700"
        >
          ← Return to Doctor Dashboard
        </button>
      </div>
    );
  }

  const doctorDisplayName = dbUser?.fullName || dbUser?.doctorProfile?.name || 'Dr. Ankit Sharma';

  // ── ACCESS RESTRICTED VIEW (Flow B: Direct Patient Arrival without Referral / Consent) ──
  if (!hasAccess) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('doctor-dashboard')}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold text-gray-900">Patient Identification</h1>
            <p className="text-xs text-gray-500">Direct Visit · ABDM Consent Protocol · {doctorDisplayName}</p>
          </div>
          <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-semibold text-amber-800">
            <Icon name="lock" size={12} className="text-amber-600" />
            ACCESS RESTRICTED
          </div>
        </div>

        {/* Patient Switcher Bar */}
        <div className="relative">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3.5 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-400">
            <Icon name="search" size={15} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={patientSearch}
              onChange={(e) => handlePatientSearch(e.target.value)}
              placeholder="Search and switch patient by Name, Phone, or Health ID..."
              className="w-full text-xs focus:outline-none bg-transparent font-medium"
            />
            {patientSearch && (
              <button
                type="button"
                onClick={() => {
                  setPatientSearch('');
                  setPatientSearchResults([]);
                }}
                className="text-gray-400 hover:text-gray-600 text-xs px-1"
              >
                ✕
              </button>
            )}
          </div>
          {patientSearchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-gray-100">
              {patientSearchResults.map((p) => (
                <button
                  key={p.id || p.healthId}
                  type="button"
                  onClick={() => handleSelectPatient(p)}
                  className="w-full px-4 py-2.5 text-left hover:bg-brand-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
                >
                  <div>
                    <span className="font-semibold text-gray-900">{p.name}</span>
                    <span className="text-gray-500 ml-2 font-mono text-[11px]">{p.healthId || p.id}</span>
                  </div>
                  <span className="text-gray-400 text-[10px]">{p.age || '--'} yrs · {p.village || p.district || ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Minimal Demographic ID Card (Public identifiers only) */}
        <Card className="overflow-hidden border-amber-200">
          <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-5 text-white">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-display font-bold shrink-0">
                {String(patient.name || 'P').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap mb-1">
                  <h2 className="font-display text-xl font-bold">{patient.name}</h2>
                  {patient.nameHi && <span className="text-amber-100 text-sm">· {patient.nameHi}</span>}
                </div>
                <div className="text-amber-100 text-sm">
                  {patient.age} yrs · {patient.gender} · {patient.village}, {patient.district}
                </div>
                <div className="font-mono text-xs text-amber-200 mt-1">Health ID: {patient.id}</div>
              </div>
            </div>
          </div>
          <div className="px-6 py-3 bg-amber-50/70 border-t border-amber-100 flex items-center gap-2 text-xs text-amber-800 font-medium">
            <Icon name="shield" size={13} className="text-amber-600 shrink-0" />
            Direct patient arrival without active referral. Clinical records protected under ABDM consent framework.
          </div>
        </Card>

        {/* Access Locked Card & Request Action */}
        <Card className="p-6 border-2 border-dashed border-amber-300 bg-gradient-to-b from-amber-50/40 to-white text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-sm">
            <Icon name="lock" size={28} />
          </div>

          <div className="max-w-md mx-auto space-y-1">
            <h3 className="font-display font-bold text-gray-900 text-base">Protected Clinical Record</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Medical history, past consultations, allergies, current medications, and diagnostic notes are locked. The patient must grant explicit digital consent before these records can be accessed.
            </p>
          </div>

          {pendingRequest ? (
            <div className="max-w-md mx-auto p-4 bg-amber-50 border border-amber-200 rounded-2xl text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 uppercase tracking-wider">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Access Request Pending Patient Approval
              </div>
              <div className="text-xs text-gray-700 space-y-1 font-mono">
                <div><span className="text-gray-400 font-sans">Request Code:</span> {pendingRequest.consentCode || pendingRequest.id}</div>
                <div><span className="text-gray-400 font-sans">Purpose:</span> {pendingRequest.purpose || 'Clinical consultation'}</div>
                <div><span className="text-gray-400 font-sans">Requested Scope:</span> {Array.isArray(pendingRequest.dataScope) ? pendingRequest.dataScope.join(', ') : 'Basic Info & Consultation History'}</div>
                {pendingRequest.createdAt && (
                  <div><span className="text-gray-400 font-sans">Submitted:</span> {new Date(pendingRequest.createdAt).toLocaleString('en-IN')}</div>
                )}
              </div>
              <p className="text-[11px] text-amber-700 pt-1 border-t border-amber-100">
                Please ask the patient to approve the request on their RuralCare app, or enter the OTP received on their phone.
              </p>
            </div>
          ) : (
            <div className="pt-2">
              <button
                onClick={() => setRequestModalOpen(true)}
                className="px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-brand-200 hover:shadow-lg flex items-center justify-center gap-2 mx-auto active:scale-95"
              >
                <Icon name="key" size={16} />
                Request Patient Access
              </button>
              <p className="text-[11px] text-gray-400 mt-2">
                Sends an ABDM consent request specifying duration, purpose, and required scopes.
              </p>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex items-center justify-center gap-4 text-xs text-gray-400">
            <button
              onClick={() => navigate('emergency-access')}
              className="text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 hover:underline"
            >
              <Icon name="alert" size={12} />
              Life-threatening Emergency? Use Break-Glass Access
            </button>
          </div>
        </Card>

        {/* REQUEST ACCESS MODAL */}
        {requestModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <Card className="max-w-lg w-full p-6 space-y-4 shadow-2xl border-2 border-brand-200">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
                    <Icon name="key" size={16} />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-gray-900 text-base">Request Patient Access</h3>
                    <p className="text-[11px] text-gray-400">ABDM Time-Limited Consent Artifact</p>
                  </div>
                </div>
                <button
                  onClick={() => setRequestModalOpen(false)}
                  className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
                >
                  ✕
                </button>
              </div>

              {requestMsg && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    requestMsg.type === 'success'
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  <Icon name={requestMsg.type === 'success' ? 'check' : 'alert'} size={14} />
                  <span>{requestMsg.text}</span>
                </div>
              )}

              {/* Patient info reminder */}
              <div className="p-3 bg-gray-50 rounded-xl text-xs space-y-1">
                <div className="text-gray-500 font-medium">Requesting Access For:</div>
                <div className="font-bold text-gray-900">{patient.name} · {patient.age}y/{patient.gender}</div>
                <div className="font-mono text-gray-500 text-[11px]">{patient.id}</div>
              </div>

              {/* Duration selector */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Access Duration *</label>
                <div className="grid grid-cols-4 gap-2">
                  {['1 day', '1 week', '1 month', '3 months'].map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setRequestDuration(d)}
                      className={`py-2 px-2 text-xs font-semibold rounded-xl border transition-all ${
                        requestDuration === d
                          ? 'border-brand-600 bg-brand-50 text-brand-700'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Reason input */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Reason for Access *</label>
                <input
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="e.g. Outpatient consultation for acute symptoms"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                />
              </div>

              {/* Scope selection */}
              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">Information Scope *</label>
                <div className="space-y-2">
                  {[
                    { id: 'Basic Information', desc: 'Demographics, emergency contact, blood group' },
                    { id: 'Consultation History', desc: 'Past diagnoses, prescriptions, clinical notes' },
                  ].map(s => {
                    const isChecked = requestScopes.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isChecked ? 'border-brand-300 bg-brand-50/50' : 'border-gray-100 hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setRequestScopes(prev => [...prev, s.id]);
                            } else {
                              setRequestScopes(prev => prev.filter(x => x !== s.id));
                            }
                          }}
                          className="mt-0.5 accent-brand-600"
                        />
                        <div>
                          <div className="text-xs font-bold text-gray-800">{s.id}</div>
                          <div className="text-[11px] text-gray-500">{s.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setRequestModalOpen(false)}
                  className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendAccessRequest}
                  disabled={requestSubmitting || !requestReason.trim() || requestScopes.length === 0}
                  className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Icon name="check" size={14} />
                  {requestSubmitting ? 'Sending Request…' : 'Submit Access Request'}
                </button>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('doctor-dashboard')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">Patient Record</h1>
          <p className="text-xs text-gray-500">Authenticated clinical view · {doctorDisplayName}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-100 rounded-xl text-xs text-green-700 font-semibold">
          <Icon name="shield" size={12} />
          {activeReferral ? 'Active ASHA Referral' : activeConsentInfo ? 'Patient Consent Granted' : 'Authorized Access'}
        </div>
      </div>

      {/* Patient Switcher Bar */}
      <div className="relative">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-2xl px-3.5 py-2.5 shadow-sm focus-within:ring-2 focus-within:ring-brand-400">
          <Icon name="search" size={15} className="text-gray-400 shrink-0" />
          <input
            type="text"
            value={patientSearch}
            onChange={(e) => handlePatientSearch(e.target.value)}
            placeholder="Switch patient: Search by Name, Phone, or Health ID..."
            className="w-full text-xs focus:outline-none bg-transparent font-medium"
          />
          {patientSearch && (
            <button
              type="button"
              onClick={() => {
                setPatientSearch('');
                setPatientSearchResults([]);
              }}
              className="text-gray-400 hover:text-gray-600 text-xs px-1"
            >
              ✕
            </button>
          )}
        </div>
        {patientSearchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-gray-100">
            {patientSearchResults.map((p) => (
              <button
                key={p.id || p.healthId}
                type="button"
                onClick={() => handleSelectPatient(p)}
                className="w-full px-4 py-2.5 text-left hover:bg-brand-50 flex items-center justify-between text-xs transition-colors cursor-pointer"
              >
                <div>
                  <span className="font-semibold text-gray-900">{p.name}</span>
                  <span className="text-gray-500 ml-2 font-mono text-[11px]">{p.healthId || p.id}</span>
                </div>
                <span className="text-gray-400 text-[10px]">{p.age || '--'} yrs · {p.village || p.district || ''}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {saveSuccess && (
        <div className="p-3 bg-green-50 border border-green-200 text-green-800 rounded-xl text-xs flex items-center justify-between">
          <span>✓ {saveSuccess}</span>
          <button onClick={() => setSaveSuccess(null)} className="text-green-600 hover:text-green-800 font-bold ml-2">×</button>
        </div>
      )}

      {/* Patient header */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-red-700 to-red-600 px-6 py-5 text-white">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-display font-bold shrink-0">
              {String(patient.name || 'P').split(' ').map((w: string)=>w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h2 className="font-display text-xl font-bold">{patient.name}</h2>
                {patient.nameHi && <span className="text-red-200 text-sm">· {patient.nameHi}</span>}
              </div>
              <div className="text-red-100 text-sm">
                {patient.age} yrs · {patient.gender} · Blood: <strong className="text-white">{patient.bloodGroup}</strong>
              </div>
              <div className="font-mono text-xs text-red-200 mt-0.5">{patient.id}</div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <RiskBadge level={patient.riskLevel} />
                <ConsentBadge status={patient.consentStatus} />
              </div>
            </div>
          </div>
        </div>
        <div className="px-6 py-3 bg-red-50 border-t border-red-100 flex flex-wrap gap-x-8 gap-y-1 text-xs text-gray-600">
          <span className="flex items-center gap-1 text-red-700 font-semibold">
            <Icon name="alert" size={11} />
            ALLERGIES: {patient.allergies && patient.allergies.length > 0 ? patient.allergies.join(', ') : 'None known'}
          </span>
          <span className="flex items-center gap-1">
            <Icon name="map_pin" size={11} className="text-gray-400" />
            {patient.village}, {patient.district}
          </span>
          <span>Emergency: {patient.emergencyContact?.name} ({patient.emergencyContact?.relation})</span>
        </div>
      </Card>

      {/* Active ASHA Referral Banner (Flow A) */}
      {activeReferral && (
        <Card className="p-4 border-amber-200 bg-amber-50/50 space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                <Icon name="share" size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm text-gray-900">ASHA Clinical Referral</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    activeReferral.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                    activeReferral.priority === 'urgent' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-700'
                  }`}>
                    {activeReferral.priority || 'routine'}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    activeReferral.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {activeReferral.status || 'pending'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Referred by <strong>{activeReferral.fromWorker || 'ASHA Worker'}</strong> · {activeReferral.toPHC || 'Primary Health Centre'} · {activeReferral.date || 'Recent'}
                </p>
              </div>
            </div>
            {activeReferral.status !== 'completed' && (
              <button
                onClick={handleCompleteReferral}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-xs transition-colors flex items-center gap-1 shrink-0"
              >
                <Icon name="check" size={12} />
                Mark Completed
              </button>
            )}
          </div>
          <div className="text-xs text-gray-700 bg-white/80 border border-amber-100 p-2.5 rounded-xl">
            <div className="font-semibold text-gray-900 mb-0.5">Reason: {activeReferral.reason}</div>
            {activeReferral.notes && <div className="text-gray-600 italic">ASHA Notes: "{activeReferral.notes}"</div>}
            {activeReferral.aiSummary && <div className="text-gray-600 mt-1"><strong className="text-brand-700">AI Triage:</strong> {activeReferral.aiSummary}</div>}
          </div>
        </Card>
      )}

      <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <SectionHeader title="Chronic Conditions" />
              <div className="flex flex-wrap gap-2">
                {patient.chronicConditions && patient.chronicConditions.length > 0 ? (
                  patient.chronicConditions.map((c: string) => (
                    <span key={c} className="px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl text-sm font-medium">
                      {c}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">No chronic conditions recorded</span>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Current Medications" />
              <div className="space-y-2.5">
                {patient.currentMedications && patient.currentMedications.length > 0 ? (
                  patient.currentMedications.map((m: string, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                        <Icon name="pill" size={14} className="text-blue-600" />
                      </div>
                      <div className="text-sm text-gray-800 font-medium">{m}</div>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-gray-400">No current medications listed</span>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Previous Consultations" sub="Consultation records from PostgreSQL" />
              <div className="space-y-3">
                {consultations.length === 0 ? (
                  <p className="text-xs text-gray-400">No prior consultations recorded for this patient.</p>
                ) : (
                  consultations.map((c: any) => (
                    <div key={c.id} className="p-3 bg-gray-50 rounded-xl">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-sm font-medium">{c.date || 'Recent'}</div>
                        <RiskBadge level={c.riskLevel} size="sm" />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-[10px] text-gray-500">Recorded by: <strong>{c.workerName || 'Health Worker'}</strong></span>
                        <PermissionBadge type="asha-recorded" />
                      </div>
                      {c.doctorName && (
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-[10px] text-gray-500">Reviewed by: <strong>{c.doctorName}</strong></span>
                          <PermissionBadge type="doctor-editable" />
                        </div>
                      )}
                      {c.diagnosis && (
                        <div className="text-xs text-brand-800 font-medium mt-1">Diagnosis: {c.diagnosis}</div>
                      )}
                      {c.symptoms && Array.isArray(c.symptoms) && c.symptoms.length > 0 && (
                        <div className="text-xs text-gray-700 mt-1">Symptoms: {c.symptoms.join(', ')}</div>
                      )}
                      {c.treatment && (
                        <div className="text-xs text-gray-600 mt-1">Treatment: {c.treatment}</div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <HealthIDCard id={patient.id} name={patient.name} size="md" />

            {activeReferral && (
              <Card className="p-4 border-red-100 bg-red-50">
                <div className="flex items-start gap-2">
                  <Icon name="alert" size={16} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-red-700">Active Referral · {activeReferral.priority || 'Normal'}</div>
                    <div className="text-xs text-red-600 mt-0.5">{activeReferral.reason || 'Referral pending doctor review'}</div>
                    <div className="text-[10px] text-red-500 mt-1">From: {activeReferral.fromWorker || 'ASHA'} → {activeReferral.toPHC || 'PHC'}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => navigate('referral', patient?.id || patient?.healthId)} className="text-xs text-red-700 font-semibold hover:underline">
                        View Referral →
                      </button>
                      {String(activeReferral.status || '').toLowerCase() !== 'completed' && (
                        <button
                          onClick={handleCompleteReferral}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            )}

            <Card className="p-4">
              <div className="text-xs font-semibold text-gray-500 mb-2">EMERGENCY CONTACT</div>
              <div className="text-sm font-medium text-gray-900">{patient.emergencyContact?.name}</div>
              <div className="text-xs text-gray-500">{patient.emergencyContact?.relation}</div>
              <div className="text-xs text-brand-600 font-mono mt-1">{patient.emergencyContact?.phone}</div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'vitals' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg font-semibold text-gray-900">Latest Vitals</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {latestConsultation ? `Recorded: ${latestConsultation.date || 'Recent'}, ${latestConsultation.time || ''}` : 'No vitals recorded yet'}
                </p>
              </div>
              <PermissionBadge type="asha-recorded" />
            </div>

            {latestConsultation?.vitals ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Temperature', value: `${latestConsultation.vitals.temperature || '37.0'}°C`, abnormal: Number(latestConsultation.vitals.temperature) > 37.5 },
                  { label: 'Blood Pressure', value: latestConsultation.vitals.bloodPressure || '120/80', abnormal: String(latestConsultation.vitals.bloodPressure || '').startsWith('14') },
                  { label: 'Heart Rate', value: `${latestConsultation.vitals.heartRate || '75'} bpm`, abnormal: Number(latestConsultation.vitals.heartRate) > 100 },
                  { label: 'SpO₂', value: `${latestConsultation.vitals.spo2 || '98'}%`, abnormal: Number(latestConsultation.vitals.spo2) < 95 },
                ].map(v => (
                  <div key={v.label} className={`p-4 rounded-2xl text-center border-2 ${v.abnormal ? 'border-red-200 bg-red-50' : 'border-gray-100 bg-gray-50'}`}>
                    <div className={`font-mono text-xl font-bold ${v.abnormal ? 'text-red-700' : 'text-gray-800'}`}>{v.value}</div>
                    <div className="text-xs text-gray-500 mt-1">{v.label}</div>
                    {v.abnormal && <div className="text-[10px] text-red-500 font-bold mt-1 uppercase">Abnormal</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400 text-sm">
                No clinical vitals recorded yet. Record vitals via "Actions" tab or Health Assessment.
              </div>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold text-gray-900">Reported Symptoms</h2>
              <PermissionBadge type="asha-recorded" />
            </div>
            <div className="flex flex-wrap gap-2">
              {latestConsultation?.symptoms && latestConsultation.symptoms.length > 0 ? (
                latestConsultation.symptoms.map((s: string) => (
                  <span key={s} className="px-3 py-1.5 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl text-sm font-medium">
                    {s}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">No acute symptoms reported</span>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'history' && (
        <Card className="p-5 space-y-4">
          <SectionHeader title="Complete Longitudinal History" sub="Records persisted in PostgreSQL database" />
          <div className="divide-y divide-gray-100">
            {consultations.length === 0 ? (
              <p className="text-xs text-gray-400 py-4">No consultation history available.</p>
            ) : (
              consultations.map((c: any) => (
                <div key={c.id} className="py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-gray-900">{c.consultationCode || c.id} · {c.date}</span>
                    <RiskBadge level={c.riskLevel} size="sm" />
                  </div>
                  <div className="text-xs text-gray-600">
                    <strong>Diagnosis:</strong> {c.diagnosis || 'Clinical evaluation'}
                  </div>
                  {c.treatment && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      <strong>Treatment:</strong> {c.treatment}
                    </div>
                  )}
                  {c.prescription && Array.isArray(c.prescription) && c.prescription.length > 0 && (
                    <div className="text-xs text-brand-700 mt-0.5">
                      <strong>Prescription:</strong> {c.prescription.join(', ')}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-1">
                    Recorded by {c.workerName || 'ASHA Worker'} {c.doctorName ? `· Reviewed by ${c.doctorName}` : ''}
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      {activeTab === 'ai' && (
        <div className="space-y-4">
          <AIDisclaimer />
          <Card className="p-5 border-blue-200 bg-blue-50">
            <div className="flex items-center justify-between mb-3">
              <div className="font-display text-lg font-bold text-gray-900">AI Risk Assessment</div>
              <RiskBadge level={patient.riskLevel} size="lg" />
            </div>
            <div className="p-4 bg-white rounded-xl border border-blue-100 mb-3">
              <div className="text-xs font-bold text-gray-500 mb-1">RECOMMENDED CLINICAL ACTION</div>
              <p className="text-sm font-semibold text-brand-800">
                {patient.riskLevel === 'critical' || patient.riskLevel === 'high'
                  ? 'Urgent clinical evaluation required. Order comprehensive blood work and ECG.'
                  : 'Routine monitoring and lifestyle counselling. Schedule regular follow-up.'}
              </p>
            </div>
            <div className="text-xs text-gray-600 bg-white p-3 rounded-xl leading-relaxed">
              Longitudinal analysis based on patient vitals, reported symptoms, and known chronic conditions.
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'actions' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 px-4 py-3 bg-purple-50 border border-purple-100 rounded-xl">
            <Icon name="shield" size={14} className="text-purple-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-xs font-bold text-purple-800">Doctor Clinical Actions</div>
              <div className="text-[10px] text-purple-600 mt-0.5">
                Clinical records entered here are saved directly to PostgreSQL under {doctorDisplayName} and form part of the permanent patient record.
              </div>
            </div>
            <PermissionBadge type="doctor-editable" />
          </div>

          {!addingDiagnosis ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'Add Diagnosis / Rx', icon: 'clipboard', action: () => setAddingDiagnosis(true), color: 'bg-brand-600 text-white hover:bg-brand-700' },
                { label: 'Add Treatment Plan', icon: 'pill', action: () => setAddingDiagnosis(true), color: 'bg-purple-600 text-white hover:bg-purple-700' },
                { label: 'Refer to Specialist / CHC', icon: 'share', action: () => navigate('referral', patient?.id || patient?.healthId), color: 'bg-amber-500 text-white hover:bg-amber-600' },
                { label: 'View Longitudinal History', icon: 'history', action: () => setActiveTab('history'), color: 'bg-green-600 text-white hover:bg-green-700' },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={a.action}
                  className={`p-4 rounded-2xl flex items-center gap-3 font-semibold text-sm transition-all active:scale-95 ${a.color}`}
                >
                  <Icon name={a.icon} size={18} />
                  {a.label}
                </button>
              ))}
            </div>
          ) : (
            <Card className="p-5">
              <SectionHeader
                title="Clinical Entry · Doctor Review"
                action={
                  <button onClick={() => setAddingDiagnosis(false)} className="text-gray-400 hover:text-gray-600">
                    <Icon name="x" size={18} />
                  </button>
                }
              />
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5">Diagnosis *</label>
                  <textarea
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    rows={2}
                    placeholder="e.g. Acute Coronary Syndrome – NSTEMI (suspected) or Essential Hypertension"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5">Treatment Plan</label>
                  <textarea
                    value={treatment}
                    onChange={e => setTreatment(e.target.value)}
                    rows={2}
                    placeholder="e.g. Start dual antiplatelet therapy, bed rest, monitor vitals Q4H"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5">Prescription / Medications (Rx)</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      value={prescriptionInput}
                      onChange={e => setPrescriptionInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddPrescription(prescriptionInput); } }}
                      placeholder="Type medicine name (e.g. Paracetamol 500mg) and press Add"
                      className="flex-1 px-3.5 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddPrescription(prescriptionInput)}
                      className="px-4 py-2 bg-gray-800 text-white rounded-xl text-xs font-bold hover:bg-gray-900"
                    >
                      + Add
                    </button>
                  </div>

                  {medicines.length > 0 && (
                    <div className="mb-3">
                      <div className="text-[10px] text-gray-400 mb-1">Quick Select from Pharmacy Inventory:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {medicines.slice(0, 6).map((m: any) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => handleAddPrescription(`${m.name} ${m.strength || ''}`)}
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-medium border border-blue-100 transition-colors"
                          >
                            + {m.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {prescriptionList.length > 0 && (
                    <div className="flex flex-wrap gap-2 p-2 bg-gray-50 rounded-xl border border-gray-100">
                      {prescriptionList.map((item, idx) => (
                        <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-gray-200 rounded-lg text-xs text-gray-800 font-medium">
                          💊 {item}
                          <button
                            type="button"
                            onClick={() => handleRemovePrescription(item)}
                            className="text-gray-400 hover:text-red-600 font-bold ml-1"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1.5">Doctor Clinical Notes</label>
                  <textarea
                    value={clinicalNotes}
                    onChange={e => setClinicalNotes(e.target.value)}
                    rows={2}
                    placeholder="Additional clinical observations, follow-up instructions..."
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setAddingDiagnosis(false)}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={handleSaveClinicalNote}
                    className="flex-1 py-2.5 bg-brand-600 text-white font-semibold rounded-xl text-sm hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving to PostgreSQL…
                      </>
                    ) : (
                      'Save & Update Record'
                    )}
                  </button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
