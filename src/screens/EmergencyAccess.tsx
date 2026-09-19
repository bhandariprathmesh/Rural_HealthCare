import { useState, useEffect } from 'react';
import { Icon, Card, RiskBadge, HealthIDCard } from '../components/shared';
import { authorizeEmergency, getCurrentUser, getPatients, getPatientByHealthId } from '../api/client';

interface Props { navigate: (s: string, patientId?: string) => void; }

type Step = 'entry' | 'identify' | 'qr-confirm' | 'search' | 'temp-id' | 'auth' | 'active';
type IDMethod = 'qr' | 'search' | 'temp';

const EMERGENCY_REASONS = [
  'Patient unconscious',
  'Life-threatening condition',
  'Patient unable to provide consent',
  'Other emergency',
];

export default function EmergencyAccess({ navigate }: Props) {
  const [step, setStep] = useState<Step>('entry');
  const [idMethod, setIdMethod] = useState<IDMethod>('qr');
  const [reason, setReason] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchDone, setSearchDone] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(900); // 15 min
  const [addlRequested, setAddlRequested] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser().then(setCurrentUser).catch(() => {});

    const storedSosId = sessionStorage.getItem('active_sos_alert_id');
    const storedPatientId = sessionStorage.getItem('active_sos_patient_id');

    if (storedSosId) {
      setActiveSosId(storedSosId);
      setReason('Life-threatening condition');
      setReasonNote('Emergency SOS broadcast initiated by field worker. Expedited clinical review.');
      if (storedPatientId) {
        getPatientByHealthId(storedPatientId)
          .then(res => {
            if (res?.patient) {
              setSelectedPatient(res.patient);
            }
          })
          .catch(() => {});
      }
      setStep('auth');
    }
  }, []);

  useEffect(() => {
    if (step !== 'active') return;
    const t = setInterval(() => {
      setTimeLeft(s => {
        if (s <= 1) {
          sessionStorage.removeItem('rc_emergency_token');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [step]);

  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');

  const tempID = 'TEMP-ER-2026-0047';

  // ── Entry ──────────────────────────────────────────────────────────────
  if (step === 'entry') return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('doctor-dashboard')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">Emergency Medical Access</h1>
          <p className="text-xs text-gray-500">Break-Glass Emergency Protocol</p>
        </div>
      </div>

      {/* Warning banner */}
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 bg-red-200 rounded-xl flex items-center justify-center shrink-0">
            <Icon name="alert" size={20} className="text-red-800" />
          </div>
          <div>
            <div className="font-display font-bold text-red-900 text-base">Emergency Use Only</div>
            <p className="text-sm text-red-800 mt-1 leading-relaxed">
              Use this only when the patient is unable to provide consent and immediate medical attention is required.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <button onClick={() => { setIdMethod('qr'); setStep('qr-confirm'); }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white border-2 border-red-200 hover:border-red-400 hover:bg-red-50 rounded-xl transition-all text-left">
            <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="qr" size={18} className="text-red-700" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900">Scan Health ID QR</div>
              <div className="text-xs text-gray-500">Scan patient's QR card to identify</div>
            </div>
            <Icon name="chevron_right" size={15} className="text-gray-300 ml-auto" />
          </button>

          <button onClick={() => { setIdMethod('search'); setStep('search'); }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white border-2 border-red-200 hover:border-red-400 hover:bg-red-50 rounded-xl transition-all text-left">
            <div className="w-9 h-9 bg-red-100 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="search" size={18} className="text-red-700" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900">Search Patient</div>
              <div className="text-xs text-gray-500">By Health ID, phone number or name</div>
            </div>
            <Icon name="chevron_right" size={15} className="text-gray-300 ml-auto" />
          </button>

          <button onClick={() => { setIdMethod('temp'); setStep('temp-id'); }}
            className="w-full flex items-center gap-3 px-4 py-3 bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-xl transition-all text-left">
            <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
              <Icon name="plus" size={18} className="text-gray-600" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900">Create Temporary Emergency ID</div>
              <div className="text-xs text-gray-500">If patient identity cannot be established</div>
            </div>
            <Icon name="chevron_right" size={15} className="text-gray-300 ml-auto" />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-xs text-red-600">
          <Icon name="shield" size={12} />
          All emergency access is authenticated, time-limited and logged.
        </div>
      </div>
    </div>
  );

  // ── QR Confirm ─────────────────────────────────────────────────────────
  if (step === 'qr-confirm') return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('entry')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <h1 className="font-display text-xl font-bold text-gray-900">Scan Health ID QR</h1>
      </div>

      {/* QR viewfinder */}
      <Card className="p-6 text-center">
        <div className="w-48 h-48 border-4 border-dashed border-brand-300 rounded-2xl mx-auto flex items-center justify-center bg-gray-50 relative">
          <div className="absolute inset-2 border-2 border-brand-200 rounded-xl opacity-50" />
          <div className="text-center">
            <Icon name="qr" size={36} className="text-brand-400 mx-auto mb-2" />
            <div className="text-xs text-gray-400">Point camera at QR code</div>
          </div>
        </div>
        <button
          onClick={async () => {
            try {
              const list = await getPatients();
              if (list && list.length > 0) {
                setSelectedPatient(list[0]);
              } else {
                setSelectedPatient({
                  id: 'RHC-2026-8F4K92',
                  healthId: 'RHC-2026-8F4K92',
                  name: 'Priya Devi',
                  age: 28,
                  gender: 'Female',
                  village: 'Govindpur',
                  bloodGroup: 'O+',
                });
              }
            } catch {
              // fallback
            }
            setStep('identify');
          }}
          className="mt-4 px-5 py-2 bg-brand-100 text-brand-700 rounded-xl text-sm font-medium hover:bg-brand-200"
        >
          Simulate QR Scan
        </button>
      </Card>

      {/* Identity confirmed card */}
      <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
        <div className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-3">Patient Identified</div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-brand-200 text-brand-800 flex items-center justify-center font-bold text-lg">
            {selectedPatient?.name ? String(selectedPatient.name).slice(0, 2).toUpperCase() : 'PD'}
          </div>
          <div>
            <div className="font-display font-bold text-gray-900">{selectedPatient?.name || 'Priya Devi'}</div>
            <div className="font-mono text-xs text-brand-700">{selectedPatient?.healthId || 'RHC-2026-8F4K92'}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 bg-white rounded-lg"><span className="text-xs text-gray-400 block">Age</span>{selectedPatient?.age || 28} years</div>
          <div className="p-2 bg-white rounded-lg"><span className="text-xs text-gray-400 block">Sex</span>{selectedPatient?.gender || 'Female'}</div>
        </div>
        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-start gap-1.5">
          <Icon name="lock" size={11} className="shrink-0 mt-0.5" />
          Medical records are NOT yet accessible. Doctor authentication required.
        </div>
      </div>

      <button onClick={() => setStep('auth')}
        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
        <Icon name="shield" size={16} />
        Confirm Patient — Proceed to Authorization
      </button>
    </div>
  );

  // ── Search ─────────────────────────────────────────────────────────────
  if (step === 'search') return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('entry')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <h1 className="font-display text-xl font-bold text-gray-900">Search Patient</h1>
      </div>

      <Card className="p-5 space-y-3">
        <div className="relative">
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={async e => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                setSearching(true);
                setSearchDone(true);
                try {
                  const list = await getPatients(searchQuery.trim());
                  setSearchResults(list || []);
                } catch {
                  setSearchResults([]);
                } finally {
                  setSearching(false);
                }
              }
            }}
            placeholder="Patient Name, Health ID (RHC-2026-...), or Phone"
            className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <button
          onClick={async () => {
            if (!searchQuery.trim()) return;
            setSearching(true);
            setSearchDone(true);
            try {
              const list = await getPatients(searchQuery.trim());
              setSearchResults(list || []);
            } catch {
              setSearchResults([]);
            } finally {
              setSearching(false);
            }
          }}
          disabled={searching || !searchQuery.trim()}
          className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
        >
          <Icon name="search" size={14} />
          {searching ? 'Searching Database…' : 'Search Patient'}
        </button>
      </Card>

      {searchDone && (
        <div className="space-y-3">
          {searchResults.length === 0 ? (
            <Card className="p-6 text-center text-gray-500 text-xs">
              No matching patient found in PostgreSQL. You can create a Temporary Emergency ID if identity cannot be established.
            </Card>
          ) : (
            searchResults.map(p => (
              <div key={p.id} className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-4 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-200 text-brand-800 flex items-center justify-center font-bold text-sm">
                    {String(p.name || 'P').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-bold text-gray-900">{p.name}</div>
                    <div className="font-mono text-xs text-brand-700">{p.healthId || p.id}</div>
                    <div className="text-xs text-gray-500">{p.age} yrs · {p.gender} · {p.village || 'Govindpur'}</div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedPatient(p);
                    setStep('auth');
                  }}
                  className="w-full py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <Icon name="shield" size={14} />
                  Select Patient — Proceed to Authorization
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );

  // ── Temp ID ─────────────────────────────────────────────────────────────
  if (step === 'temp-id') return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('entry')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <h1 className="font-display text-xl font-bold text-gray-900">Temporary Emergency ID</h1>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800 flex items-start gap-2">
        <Icon name="info" size={15} className="shrink-0 mt-0.5" />
        Patient identity could not be established. Emergency treatment can continue using a temporary emergency record.
      </div>

      <Card className="p-5 text-center">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Temporary Emergency ID Generated</div>
        <div className="font-mono text-2xl font-bold text-red-700 bg-red-50 rounded-xl py-3 px-4">{tempID}</div>
        <div className="text-xs text-gray-400 mt-2">Link to existing Health ID later after identity is verified</div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="font-semibold text-sm text-gray-700">Record Emergency Information</div>
        {[
          { label: 'Current Vitals', placeholder: 'BP, HR, SpO₂, Temp...' },
          { label: 'Presenting Symptoms', placeholder: 'Chief complaint...' },
          { label: 'Emergency Observations', placeholder: 'Clinical observations...' },
          { label: 'Treatment / Interventions', placeholder: 'Medications given, procedures...' },
        ].map(f => (
          <div key={f.label}>
            <label className="text-xs font-medium text-gray-600 block mb-1">{f.label}</label>
            <textarea rows={2} placeholder={f.placeholder}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
          </div>
        ))}
      </Card>

      <button
        onClick={() => {
          setSelectedPatient({
            id: tempID,
            healthId: tempID,
            name: 'Unknown Emergency Patient',
            age: 35,
            gender: 'Unknown',
            village: 'Emergency Intake',
            bloodGroup: 'Unknown',
            allergies: [],
            chronicConditions: [],
            currentMedications: [],
          });
          setStep('auth');
        }}
        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
      >
        <Icon name="alert" size={16} />
        Create Emergency Record & Begin Access
      </button>
    </div>
  );

  // ── Doctor Auth ─────────────────────────────────────────────────────────
  if (step === 'auth') return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => setStep('entry')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <h1 className="font-display text-xl font-bold text-gray-900">Emergency Access Authorization</h1>
      </div>

      <Card className="p-5 space-y-4">
        {/* Doctor info */}
        <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl">
          <div className="w-10 h-10 rounded-xl bg-purple-200 text-purple-800 flex items-center justify-center font-bold">
            {String(currentUser?.fullName || 'AS').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold text-sm text-gray-900">{currentUser?.fullName || 'Dr. Ankit Sharma'}</div>
            <div className="text-xs text-gray-500">{currentUser?.doctorProfile?.specialty || 'General Medicine'} · {currentUser?.doctorProfile?.facility?.name || 'PHC Lunkaransar'}</div>
          </div>
          <div className="ml-auto flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg">
            <Icon name="shield" size={11} />
            Authenticated
          </div>
        </div>

        {/* Selected Patient Banner */}
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
          <div className="text-red-700 font-bold uppercase tracking-wider text-[10px]">Patient to Access</div>
          <div className="text-sm font-bold text-gray-900">{selectedPatient?.name || (idMethod === 'temp' ? 'Unknown Emergency Patient' : 'Priya Devi')}</div>
          <div className="font-mono text-xs text-red-800">Health ID: {selectedPatient?.healthId || (idMethod === 'temp' ? tempID : 'RHC-2026-8F4K92')}</div>
        </div>

        {authError && (
          <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center gap-2">
            <Icon name="alert" size={14} />
            <span>{authError}</span>
          </div>
        )}

        {/* Emergency reason */}
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-2">Emergency Reason *</label>
          <div className="space-y-2">
            {EMERGENCY_REASONS.map(r => (
              <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${reason === r ? 'border-red-400 bg-red-50' : 'border-gray-100 hover:border-gray-200'}`}>
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-red-600" />
                <span className="text-sm text-gray-800">{r}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1.5">Brief Clinical Note *</label>
          <textarea rows={2} value={reasonNote} onChange={e => setReasonNote(e.target.value)}
            placeholder="e.g. Patient found unresponsive, suspected cardiac event, referred by ASHA..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
        </div>

        <div className="p-3 bg-gray-50 rounded-xl text-xs text-gray-500 flex items-start gap-2">
          <Icon name="info" size={12} className="shrink-0 mt-0.5" />
          This authorization will be permanently logged in the patient's audit trail in PostgreSQL. Access is limited to minimum necessary medical information and is time-limited to 15 minutes.
        </div>
      </Card>

      <button
        onClick={async () => {
          if (!reason || !reasonNote) return;
          setAuthorizing(true);
          setAuthError(null);
          try {
            const user = currentUser || await getCurrentUser().catch(() => null);
            const docName = user?.fullName || 'Dr. Ankit Sharma';
            const facName = user?.doctorProfile?.facility?.name || 'PHC Lunkaransar';
            const patHealthId = selectedPatient?.healthId || (idMethod === 'temp' ? tempID : 'RHC-2026-8F4K92');
            const patName = selectedPatient?.name || (idMethod === 'temp' ? 'Unknown Emergency Patient' : 'Priya Devi');
            const patId = selectedPatient?.rawId || selectedPatient?.id;

            const res = await authorizeEmergency({
              sosAlertId: activeSosId || undefined,
              patientId: patId,
              patientHealthId: patHealthId,
              patientName: patName,
              doctorName: docName,
              facilityName: facName,
              reason,
              note: reasonNote,
              records: 'Emergency Medical Summary, Vitals, Medications',
            });

            const token = res?.token || (res as any)?.data?.token;
            if (token) {
              sessionStorage.setItem('rc_emergency_token', token);
            }
            setStep('active');
          } catch (err: any) {
            console.error('Failed to log emergency access to backend:', err);
            setAuthError(err?.message || 'Failed to authorize emergency session');
          } finally {
            setAuthorizing(false);
          }
        }}
        disabled={!reason || !reasonNote || authorizing}
        className="w-full py-3.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 active:scale-95">
        <Icon name="shield" size={16} />
        {authorizing ? 'Authorizing Emergency Token...' : 'Authorize Emergency Access (Break-Glass)'}
      </button>
    </div>
  );

  // ── Active Emergency Access ─────────────────────────────────────────────
  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Active banner */}
      <div className="rounded-2xl bg-red-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-red-500 rounded-xl flex items-center justify-center">
            <Icon name="alert" size={18} />
          </div>
          <div>
            <div className="font-display font-bold text-base">EMERGENCY ACCESS ACTIVE</div>
            <div className="text-red-200 text-xs">Patient consent could not be obtained due to emergency · 15 min window</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-red-200 text-[10px] uppercase tracking-wide">Time Remaining</div>
          <div className="font-mono text-2xl font-bold">{mins}:{secs}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex-wrap">
        <Icon name="lock" size={13} className="shrink-0" />
        <span>Access limited to minimum necessary medical information · Read-only · Logged in PostgreSQL</span>
        <button onClick={() => {
          sessionStorage.removeItem('rc_emergency_token');
          sessionStorage.removeItem('active_sos_alert_id');
          sessionStorage.removeItem('active_sos_patient_id');
          navigate('doctor-dashboard');
        }}
          className="ml-auto px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold rounded-lg transition-colors text-xs">
          End Emergency Access
        </button>
      </div>

      {/* Patient identity row */}
      <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl">
        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold">
          {String(selectedPatient?.name || 'PD').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-medium text-gray-900">{selectedPatient?.name || 'Priya Devi'}</div>
          <div className="font-mono text-xs text-gray-400">{selectedPatient?.healthId || 'RHC-2026-8F4K92'}</div>
        </div>
        <div className="ml-auto">
          <RiskBadge level={selectedPatient?.riskLevel || 'moderate'} />
        </div>
      </div>

      {/* Emergency Medical Summary */}
      <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
        <div className="bg-red-50 border-b border-red-100 px-5 py-3 flex items-center gap-2">
          <Icon name="activity" size={16} className="text-red-600" />
          <div className="font-display font-bold text-red-900 text-sm">Emergency Medical Summary</div>
          <span className="ml-auto text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-medium uppercase tracking-wide">Critical Info Only</span>
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <div className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1">Blood Group</div>
            <div className="font-display text-2xl font-bold text-red-800">{selectedPatient?.bloodGroup || 'O+'}</div>
          </div>

          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <div className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1.5">Allergies</div>
            <div className="flex flex-wrap gap-1">
              {(selectedPatient?.allergies && selectedPatient.allergies.length > 0
                ? selectedPatient.allergies
                : ['Penicillin', 'Sulfa drugs']
              ).map((a: string) => (
                <span key={a} className="px-2 py-0.5 bg-red-200 text-red-900 rounded font-semibold text-xs">{a}</span>
              ))}
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl sm:col-span-2">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1.5">Current Medications</div>
            <div className="space-y-0.5 text-xs text-gray-800">
              {(selectedPatient?.currentMedications && selectedPatient.currentMedications.length > 0
                ? selectedPatient.currentMedications
                : ['Thyronorm 25 mcg — once daily', 'Ferrous Sulphate 200 mg — three times daily']
              ).map((m: string) => (
                <div key={m}>· {m}</div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl sm:col-span-2">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Major Medical Conditions</div>
            <div className="flex flex-wrap gap-1.5">
              {(selectedPatient?.chronicConditions && selectedPatient.chronicConditions.length > 0
                ? selectedPatient.chronicConditions
                : ['Anaemia (mild)', 'Hypothyroidism']
              ).map((c: string) => (
                <span key={c} className="px-2 py-1 bg-amber-50 border border-amber-100 text-amber-800 rounded text-xs">{c}</span>
              ))}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Recent Vitals</div>
            <div className="space-y-1 text-xs text-gray-700 font-mono">
              <div>BP: 110/72 mmHg</div>
              <div>HR: 88 bpm</div>
              <div>SpO₂: 98%</div>
              <div>Temp: 37.0°C</div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Emergency Contact</div>
            <div className="text-xs text-gray-700">
              <div className="font-medium">{selectedPatient?.emergencyContact?.name || 'Relative Contact'}</div>
              <div className="text-gray-500">{selectedPatient?.emergencyContact?.relation || 'Family'}</div>
              <div className="text-brand-600 font-mono mt-1">{selectedPatient?.emergencyContact?.phone || selectedPatient?.phone || '98290 17643'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => navigate('doctor-patient-view', selectedPatient?.healthId || selectedPatient?.id)}
          className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
        >
          <Icon name="clipboard" size={15} />
          Open Full Clinical Record (Authorized Break-Glass Session)
        </button>
        <button
          onClick={() => {
            sessionStorage.removeItem('rc_emergency_token');
            sessionStorage.removeItem('active_sos_alert_id');
            sessionStorage.removeItem('active_sos_patient_id');
            navigate('doctor-dashboard');
          }}
          className="px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs transition-colors"
        >
          Close Session
        </button>
      </div>

      {/* Audit note */}
      <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
        <Icon name="shield" size={11} />
        Permanent PostgreSQL audit record logged · {currentUser?.fullName || 'Dr. Ankit Sharma'} · {new Date().toLocaleString('en-IN')}
      </div>

      {/* Auto-Revocation Modal on Expiry */}
      {timeLeft === 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="p-6 max-w-md w-full text-center space-y-4 shadow-2xl border-2 border-red-300">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Icon name="lock" size={24} />
            </div>
            <h3 className="font-bold text-gray-900 text-base">Emergency Access Window Expired</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              The 15-minute emergency access period has concluded. In accordance with ABDM break-glass security protocols, patient records have been automatically sealed and access revoked.
            </p>
            <button
              onClick={() => {
                sessionStorage.removeItem('rc_emergency_token');
                sessionStorage.removeItem('active_sos_alert_id');
                sessionStorage.removeItem('active_sos_patient_id');
                navigate('doctor-dashboard');
              }}
              className="w-full py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-sm transition-colors"
            >
              Return to Doctor Dashboard
            </button>
          </Card>
        </div>
      )}
    </div>
  );
}
