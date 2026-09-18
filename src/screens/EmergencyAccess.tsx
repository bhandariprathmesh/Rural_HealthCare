import { useState, useEffect } from 'react';
import { Icon, Card, RiskBadge, HealthIDCard } from '../components/shared';
import { authorizeEmergency, getCurrentUser } from '../api/client';

interface Props { navigate: (s: string) => void; }

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
  const [timeLeft, setTimeLeft] = useState(900); // 15 min
  const [addlRequested, setAddlRequested] = useState(false);
  const [authorizing, setAuthorizing] = useState(false);

  useEffect(() => {
    if (step !== 'active') return;
    const t = setInterval(() => setTimeLeft(s => Math.max(0, s - 1)), 1000);
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

      {/* QR viewfinder mock */}
      <Card className="p-6 text-center">
        <div className="w-48 h-48 border-4 border-dashed border-brand-300 rounded-2xl mx-auto flex items-center justify-center bg-gray-50 relative">
          <div className="absolute inset-2 border-2 border-brand-200 rounded-xl opacity-50" />
          <div className="text-center">
            <Icon name="qr" size={36} className="text-brand-400 mx-auto mb-2" />
            <div className="text-xs text-gray-400">Point camera at QR code</div>
          </div>
        </div>
        <button onClick={() => setStep('identify')}
          className="mt-4 px-5 py-2 bg-brand-100 text-brand-700 rounded-xl text-sm font-medium hover:bg-brand-200">
          Simulate QR Scan
        </button>
      </Card>

      {/* Identity confirmed card */}
      <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
        <div className="text-xs font-bold text-brand-600 uppercase tracking-widest mb-3">Patient Identified</div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-brand-200 text-brand-800 flex items-center justify-center font-bold text-lg">PD</div>
          <div>
            <div className="font-display font-bold text-gray-900">Priya Devi</div>
            <div className="font-mono text-xs text-brand-700">RHC-2026-8F4K92</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="p-2 bg-white rounded-lg"><span className="text-xs text-gray-400 block">Age</span>28 years</div>
          <div className="p-2 bg-white rounded-lg"><span className="text-xs text-gray-400 block">Sex</span>Female</div>
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
        {[
          { placeholder: 'Health ID (e.g. RHC-2026-...)', icon: 'qr' },
          { placeholder: 'Registered mobile number', icon: 'phone' },
          { placeholder: 'Patient name', icon: 'user' },
        ].map(f => (
          <div key={f.placeholder} className="relative">
            <Icon name={f.icon} size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={f.placeholder.includes('name') ? searchQuery : ''}
              onChange={f.placeholder.includes('name') ? e => setSearchQuery(e.target.value) : undefined}
              placeholder={f.placeholder}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
        ))}
        <button onClick={() => setSearchDone(true)}
          className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors">
          Search
        </button>
      </Card>

      {searchDone && (
        <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
          <div className="text-xs font-semibold text-gray-500 mb-3">1 possible match found — verify identity before proceeding</div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-brand-200 text-brand-800 flex items-center justify-center font-bold text-lg">RK</div>
            <div>
              <div className="font-display font-bold text-gray-900">Ramesh Kumar</div>
              <div className="font-mono text-xs text-brand-700">RHC-2026-3M9P71</div>
              <div className="text-xs text-gray-500">45 yrs · Male · Khetolai</div>
            </div>
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded-lg flex items-start gap-1.5 mb-3">
            <Icon name="lock" size={11} className="shrink-0 mt-0.5" />
            Name-only match. Verify with additional info before confirming.
          </div>
          <button onClick={() => setStep('auth')}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors">
            Confirm Patient — Proceed to Authorization
          </button>
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

      <button onClick={() => setStep('active')}
        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
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
          <div className="w-10 h-10 rounded-xl bg-purple-200 text-purple-800 flex items-center justify-center font-bold">AS</div>
          <div>
            <div className="font-semibold text-sm text-gray-900">Dr. Ankit Sharma</div>
            <div className="text-xs text-gray-500">Doctor / PHC Staff · PHC Lunkaransar</div>
          </div>
          <div className="ml-auto flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-lg">
            <Icon name="shield" size={11} />
            Authenticated
          </div>
        </div>

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
          This authorization will be permanently logged in the patient's audit trail. Access is limited to minimum necessary medical information and is time-limited to 15 minutes.
        </div>
      </Card>

      <button
        onClick={async () => {
          if (!reason || !reasonNote) return;
          setAuthorizing(true);
          try {
            const user = await getCurrentUser().catch(() => null);
            await authorizeEmergency({
              patientHealthId: idMethod === 'temp' ? tempID : 'RHC-2026-8F4K92',
              patientName: idMethod === 'temp' ? 'Unknown Emergency Patient' : 'Priya Devi',
              doctorName: user?.fullName || 'Dr. Ankit Sharma',
              facilityName: user?.doctorProfile?.facility?.name || 'PHC Lunkaransar',
              reason,
              note: reasonNote,
              records: 'Emergency Medical Summary, Vitals, Medications',
            });
          } catch (err) {
            console.error('Failed to log emergency access to backend:', err);
          } finally {
            setAuthorizing(false);
            setStep('active');
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
            <div className="text-red-200 text-xs">Patient consent could not be obtained due to emergency</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-red-200 text-[10px] uppercase tracking-wide">Time Remaining</div>
          <div className="font-mono text-2xl font-bold">{mins}:{secs}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex-wrap">
        <Icon name="lock" size={13} className="shrink-0" />
        <span>Access limited to minimum necessary medical information · Read-only · All access is being logged</span>
        <button onClick={() => navigate('doctor-dashboard')}
          className="ml-auto px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold rounded-lg transition-colors text-xs">
          End Emergency Access
        </button>
      </div>

      {/* Patient identity row */}
      <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl">
        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold">PD</div>
        <div>
          <div className="font-medium text-gray-900">Priya Devi</div>
          <div className="font-mono text-xs text-gray-400">RHC-2026-8F4K92</div>
        </div>
        <div className="ml-auto">
          <RiskBadge level="moderate" />
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
            <div className="font-display text-2xl font-bold text-red-800">O+</div>
          </div>

          <div className="p-3 bg-red-50 border border-red-100 rounded-xl">
            <div className="text-[10px] font-bold text-red-600 uppercase tracking-wide mb-1.5">Allergies</div>
            <div className="flex flex-wrap gap-1">
              {['Penicillin', 'Sulfa drugs'].map(a => (
                <span key={a} className="px-2 py-0.5 bg-red-200 text-red-900 rounded font-semibold text-xs">{a}</span>
              ))}
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl sm:col-span-2">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1.5">Current Medications</div>
            <div className="space-y-0.5 text-xs text-gray-800">
              <div>· Thyronorm 25 mcg — once daily</div>
              <div>· Ferrous Sulphate 200 mg — three times daily</div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl sm:col-span-2">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">Major Medical Conditions</div>
            <div className="flex flex-wrap gap-1.5">
              {['Anaemia (mild)', 'Hypothyroidism'].map(c => (
                <span key={c} className="px-2 py-1 bg-amber-50 border border-amber-100 text-amber-800 rounded text-xs">{c}</span>
              ))}
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Recent Vitals</div>
            <div className="space-y-1 text-xs text-gray-700">
              <div>BP: 108/70 mmHg</div>
              <div>HR: 92 bpm</div>
              <div>SpO₂: 97%</div>
              <div>Temp: 37.1°C</div>
            </div>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">Emergency Contact</div>
            <div className="text-xs text-gray-700">
              <div className="font-medium">Rajendra Singh</div>
              <div className="text-gray-500">Husband</div>
              <div className="text-brand-600 font-mono mt-1">98290 17643</div>
            </div>
          </div>
        </div>
      </div>

      {/* Request additional records */}
      {!addlRequested ? (
        <button onClick={() => setAddlRequested(true)}
          className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-brand-400 hover:bg-brand-50 text-gray-600 hover:text-brand-700 font-medium rounded-xl text-sm transition-all flex items-center justify-center gap-2">
          <Icon name="document" size={16} />
          Request Additional Record Access (requires clinical justification)
        </button>
      ) : (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-800 flex items-start gap-2">
          <Icon name="info" size={13} className="shrink-0 mt-0.5" />
          Additional record access has been requested and logged. Authorized extended records are now accessible. This action has been added to the emergency audit log.
        </div>
      )}

      {/* Audit note */}
      <div className="text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
        <Icon name="shield" size={11} />
        Emergency audit log being recorded · Dr. Ankit Sharma · PHC Lunkaransar · {new Date().toLocaleString()}
      </div>
    </div>
  );
}
