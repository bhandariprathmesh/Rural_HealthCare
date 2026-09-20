import { useState, useEffect } from 'react';
import { StatCard, RiskBadge, PriorityBadge, ReferralBadge, Card, SectionHeader, Icon, HPRBadge, HFRBadge, ABDMLayerLegend } from '../components/shared';
import { getDoctorDashboardData, updateDoctorDutyStatus, getCurrentUser } from '../api/client';

interface SOSAlert {
  id: string; from: string; role: string; patientId: string; location: string;
  ts: string; offline: boolean; dismissed: boolean;
  status: 'sent' | 'notified' | 'awaiting' | 'acknowledged' | 'declined' | 'escalated';
  escalationLevel: number;
}
interface Props {
  navigate: (s: string, patientId?: string) => void;
  sosAlerts?: SOSAlert[];
  onDismissSOS?: (id: string) => void;
  onAcknowledgeSOS?: (id: string) => void;
  onDeclineSOS?: (id: string) => void;
}

type DutyStatus = 'available' | 'busy' | 'offline';

const STATUS_OPTIONS: { value: DutyStatus; label: string; sub: string; dot: string; bg: string; text: string; border: string }[] = [
  { value: 'available', label: 'Available', sub: 'Accepting patients & SOS', dot: 'bg-green-500', bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-300' },
  { value: 'busy',      label: 'Busy',      sub: 'In consultation — limited', dot: 'bg-amber-500', bg: 'bg-amber-50',  text: 'text-amber-800', border: 'border-amber-300' },
  { value: 'offline',   label: 'Off Duty',  sub: 'Not available for SOS',     dot: 'bg-gray-400',  bg: 'bg-gray-50',   text: 'text-gray-700',  border: 'border-gray-300' },
];

export default function DoctorDashboard({ navigate, sosAlerts = [], onDismissSOS, onAcknowledgeSOS, onDeclineSOS }: Props) {
  const [patients, setPatients] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [quickLookupId, setQuickLookupId] = useState('');
  const [myStatus, setMyStatus] = useState<DutyStatus>('available');
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbUser, setDbUser] = useState<any>(null);

  const [dashboardStats, setDashboardStats] = useState<any>(null);

  const [referralFilter, setReferralFilter] = useState<'all' | 'pending' | 'accepted' | 'in-consultation'>('all');

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        setDbUser(user);
        const docId = user?.doctorProfile?.id;
        if (docId) {
          setDoctorId(docId);
        }
        setLoading(true);
        getDoctorDashboardData(docId)
          .then(data => {
            if (data) {
              if (data.stats) setDashboardStats(data.stats);
              if (data.patients) setPatients(data.patients);
              const refs = data.referrals || data.pendingReferrals;
              if (refs) setReferrals(refs);
              if (data.consultations) setConsultations(data.consultations);
              if (data.followUps) setFollowUps(data.followUps);
              if (data.doctor) {
                setDoctorId(data.doctor.id);
                if (data.doctor.dutyStatus) setMyStatus(data.doctor.dutyStatus.toLowerCase() as DutyStatus);
              }
              setIsLive(true);
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      })
      .catch(() => {
        getDoctorDashboardData()
          .then(data => {
            if (data?.referrals) setReferrals(data.referrals);
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      });
  }, []);

  function handleStatusChange(status: DutyStatus) {
    setMyStatus(status);
    setStatusPickerOpen(false);
    const targetDoctorId = doctorId || dbUser?.doctorProfile?.id || dbUser?.id;
    if (targetDoctorId) {
      updateDoctorDutyStatus(targetDoctorId, status.toUpperCase() as any).catch(() => {});
    }
  }

  function handleQuickLookup() {
    const q = quickLookupId.trim();
    if (!q) return;
    navigate('doctor-patient-view', q);
  }

  const isMock = !isLive;
  const displayReferrals = referrals.filter(r => {
    const s = String(r.status || '').toLowerCase().replace(/_/g, '-');
    if (referralFilter === 'all') return s === 'pending' || s === 'accepted' || s === 'in-consultation';
    return s === referralFilter;
  });
  const criticalPatients = patients.filter((p: any) => p.riskLevel === 'critical' || p.riskLevel === 'high');

  const filteredPatientsList = patients.filter((p: any) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.healthId && p.healthId.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.village && p.village.toLowerCase().includes(q))
    );
  });

  const doctorName = dbUser?.fullName || 'Doctor';
  const doctorProfile = dbUser?.doctorProfile;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="font-display text-2xl font-bold text-gray-900">{doctorName}</h1>
            <HPRBadge id={doctorProfile?.hprId || 'HPR-PENDING'} />
            <div className="relative">
              <button
                onClick={() => setStatusPickerOpen(o => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-semibold transition-colors ${STATUS_OPTIONS.find(s => s.value === myStatus)!.bg} ${STATUS_OPTIONS.find(s => s.value === myStatus)!.text} ${STATUS_OPTIONS.find(s => s.value === myStatus)!.border} hover:opacity-80`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_OPTIONS.find(s => s.value === myStatus)!.dot} ${myStatus === 'available' ? 'animate-pulse' : ''}`} />
                {STATUS_OPTIONS.find(s => s.value === myStatus)!.label}
                <Icon name="chevron_down" size={11} className={`transition-transform ${statusPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {statusPickerOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-56 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 overflow-hidden">
                  <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Set Your Availability</div>
                  {STATUS_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left ${myStatus === opt.value ? 'bg-gray-50' : ''}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">{opt.label}</div>
                        <div className="text-[10px] text-gray-500">{opt.sub}</div>
                      </div>
                      {myStatus === opt.value && <Icon name="check" size={14} className="text-brand-600 shrink-0" />}
                    </button>
                  ))}
                  <div className="px-3 py-2 border-t border-gray-100">
                    <p className="text-[9px] text-gray-400">Status is visible to ASHA workers and used for SOS routing. Logged in audit trail.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-gray-500">{doctorProfile?.facility?.name || 'PHC / Hospital'} · {doctorProfile?.specialty || 'General Medicine'} · {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <HFRBadge id={doctorProfile?.facility?.hfrId || 'HFR-PENDING'} compact />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('doctor-sos-inbox')}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded-xl text-xs font-bold transition-colors">
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            SOS Inbox
          </button>
          <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-semibold flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            PHC Staff Mode
          </div>
          <button onClick={() => navigate('emergency-access')}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors">
            <Icon name="alert" size={13} />
            Emergency Access
          </button>
        </div>
      </div>

      <ABDMLayerLegend />

      {sosAlerts.length > 0 && (
        <div className="space-y-3">
          {sosAlerts.map(sos => (
            <div key={sos.id} className={`rounded-2xl shadow-lg overflow-hidden ${sos.status === 'acknowledged' ? 'shadow-green-200' : 'shadow-red-200'}`}>
              <div className={`flex items-start gap-3 px-4 py-4 ${sos.status === 'acknowledged' ? 'bg-green-600' : 'bg-red-600 animate-pulse'} text-white`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${sos.status === 'acknowledged' ? 'bg-green-500' : 'bg-red-500'}`}>
                  <Icon name={sos.status === 'acknowledged' ? 'check' : 'alert'} size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-base">
                    {sos.status === 'acknowledged' ? '✓ SOS ACKNOWLEDGED — You are Responding' : '🚨 EMERGENCY SOS RECEIVED'}
                  </div>
                  <div className="text-red-100 text-xs mt-0.5">
                    <strong>{sos.from}</strong> · {sos.ts} · {sos.location}
                  </div>
                  <div className="font-mono text-xs text-red-200 mt-0.5">{sos.patientId}</div>
                  {sos.offline && <div className="text-xs text-red-200 mt-0.5">⚠ Transmitted from offline device — GPS approximate</div>}
                </div>
              </div>

              <div className="bg-white border-x border-b border-red-100 rounded-b-2xl px-4 py-3 space-y-3">
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                  <Icon name="info" size={13} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-amber-800">
                    <strong>HPR verifies doctor identity.</strong> RuralCare shows duty status. Being listed as on-duty does not guarantee physical presence — your acceptance confirms you are actively responding.
                  </p>
                </div>

                {sos.status === 'acknowledged' ? (
                  <div className="flex items-center gap-3">
                    <button onClick={() => navigate('emergency-access')}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2">
                      <Icon name="clipboard" size={14} />
                      Open Emergency Access
                    </button>
                    <button onClick={() => onDismissSOS?.(sos.id)}
                      className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs transition-colors">
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { onAcknowledgeSOS?.(sos.id); navigate('emergency-access'); }}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2">
                      <Icon name="check" size={14} />
                      ACCEPT — RESPOND
                    </button>
                    <button
                      onClick={() => onDeclineSOS?.(sos.id)}
                      className="flex-1 py-2.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 border border-gray-200 hover:border-red-200 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2">
                      <Icon name="x" size={14} />
                      Decline
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="New Referrals" value={displayReferrals.length} sub="Awaiting review" icon="share" color="amber" />
        <StatCard label="Today's Patients" value={String(dashboardStats?.activePatients ?? patients.length ?? 0)} sub="Live from PostgreSQL" icon="users" color="brand" />
        <StatCard label="High-risk Cases" value={String(dashboardStats?.highRiskCount ?? criticalPatients.length ?? 0)} sub="Under monitoring" icon="alert" color="red" />
        <StatCard label="Pending Follow-ups" value={String(dashboardStats?.pendingFollowUps ?? followUps.length ?? 0)} sub={followUps.length > 0 ? `${followUps.length} scheduled` : "No follow-ups yet"} icon="history" color="purple" />
      </div>

      <div className="relative">
        <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search patient by name or Health ID"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <div className="px-4 pt-4">
              <SectionHeader title="Referrals Queue" sub="Active clinical referrals" action={
                <button onClick={() => navigate('referral')} className="text-xs text-brand-600 font-medium hover:underline">View all</button>
              } />
              <div className="flex gap-1 mb-2 pb-1 overflow-x-auto">
                {[
                  { id: 'all', label: 'All Active' },
                  { id: 'pending', label: 'Pending' },
                  { id: 'accepted', label: 'Accepted' },
                  { id: 'in-consultation', label: 'In Consultation' },
                ].map(t => (
                  <button
                    key={t.id}
                    onClick={() => setReferralFilter(t.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${referralFilter === t.id ? 'bg-brand-50 text-brand-700 font-semibold border border-brand-200' : 'text-gray-500 hover:bg-gray-50'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {displayReferrals.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  {loading ? 'Loading live referrals…' : 'No pending referrals.'}
                </div>
              ) : displayReferrals.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => navigate('doctor-patient-view', r.patientId || r.patient?.healthId || r.patient?.id)}
                  className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left group"
                >
                  <div className={`w-2 h-12 rounded-full shrink-0 ${r.priority === 'emergency' ? 'bg-red-500' : r.priority === 'urgent' ? 'bg-amber-500' : 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm text-gray-900">{r.patientName || r.patient?.name || 'Patient'}</span>
                      <PriorityBadge priority={r.priority} />
                      <RiskBadge level={r.riskLevel || r.patient?.riskLevel} size="sm" />
                    </div>
                    <div className="text-xs text-gray-500 truncate">{r.reason}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <ReferralBadge status={r.status} />
                      <span className="text-[10px] text-gray-400 font-mono">{r.id} · {r.date}</span>
                    </div>
                  </div>
                  <Icon name="chevron_right" size={16} className="text-gray-300 group-hover:text-gray-500 shrink-0" />
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <div className="px-4 pt-4">
              <SectionHeader
                title="My Patients (View Patients)"
                sub="Consented and referred patients assigned to your care"
                action={
                  <button
                    onClick={() => navigate('doctor-patient-view')}
                    className="text-xs text-brand-600 font-semibold hover:underline"
                  >
                    Open Patient View →
                  </button>
                }
              />
            </div>
            <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
              {filteredPatientsList.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  {loading
                    ? 'Loading live patients…'
                    : search
                    ? `No patients matching "${search}"`
                    : 'No patients assigned or consented yet. Request access from New Health Assessment.'}
                </div>
              ) : (
                filteredPatientsList.map((p: any) => (
                  <div
                    key={p.id || p.healthId}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                  >
                    <div
                      className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => navigate('doctor-patient-view', p.healthId || p.id)}
                    >
                      <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0">
                        {String(p.name || 'P')
                          .split(' ')
                          .map((w: string) => w[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900 truncate">
                            {p.name}
                          </span>
                          <RiskBadge level={p.riskLevel} size="sm" />
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active Consent
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 truncate mt-0.5">
                          {p.age} yrs · {p.gender === 'F' || p.gender === 'Female' ? 'Female' : 'Male'} · {p.village || p.district || 'Rural Center'} · <span className="font-mono text-[10px] text-gray-400">{p.healthId || p.id}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate('health-assessment', p.healthId || p.id)}
                        className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        + Assessment
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('doctor-patient-view', p.healthId || p.id)}
                        className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                      >
                        View Chart →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card>
            <div className="px-4 pt-4">
              <SectionHeader title="Today's Consultations" sub={new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} />
            </div>
            <div className="overflow-x-auto">
              {consultations.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  <Icon name="clipboard" size={24} className="mx-auto mb-2 text-gray-300" />
                  {loading ? 'Loading clinical records…' : 'No consultations recorded yet.'}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {['Time', 'Patient', 'Age/Gender', 'Purpose / Symptoms', 'Risk', 'Status'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {consultations.map((row: any, i: number) => (
                      <tr
                        key={row.id || i}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => navigate('doctor-patient-view', row.patientId || row.id)}
                      >
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{row.time}</td>
                        <td className="px-4 py-2.5 font-medium text-sm text-gray-900">{row.name}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{row.ag}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600 truncate max-w-xs">{row.purpose}</td>
                        <td className="px-4 py-2.5"><RiskBadge level={row.risk} size="sm" /></td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded ${row.status === 'Completed' ? 'bg-green-50 text-green-700' : row.status === 'In Progress' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="border-red-100">
            <div className="px-4 pt-4">
              <SectionHeader title="Critical Patients" />
            </div>
            <div className="px-4 pb-4 space-y-3">
              {criticalPatients.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3">
                  {loading ? 'Loading patients…' : 'No critical patients assigned.'}
                </div>
              ) : criticalPatients.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => navigate('doctor-patient-view', p.healthId || p.id)}
                  className="w-full text-left flex items-center gap-3 p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-red-200 text-red-800 flex items-center justify-center font-bold text-xs">
                      {String(p.name || 'P').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.age}{p.gender?.[0] || 'M'} · {p.village}</div>
                    <RiskBadge level={p.riskLevel} size="sm" />
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <SectionHeader title="Quick Lookup" sub="Enter patient Health ID or Name" />
            <div className="flex gap-2">
              <input
                value={quickLookupId}
                onChange={e => setQuickLookupId(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleQuickLookup(); }}
                placeholder="RHC-2026-..."
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
              <button
                onClick={handleQuickLookup}
                className="px-3 py-2 bg-brand-600 text-white rounded-xl hover:bg-brand-700 transition-colors"
              >
                <Icon name="search" size={14} />
              </button>
            </div>
          </Card>

          <Card className="p-4">
            <SectionHeader title="Follow-ups Due" />
            <div className="space-y-2">
              {followUps.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3">
                  {loading ? 'Checking schedule…' : 'No follow-ups scheduled yet.'}
                </div>
              ) : (
                followUps.map((f: any, i: number) => (
                  <div
                    key={f.id || i}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() => navigate('doctor-patient-view', f.patientId || f.id)}
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-gray-900">{f.name}</div>
                      <div className="text-[10px] text-gray-500">{f.date} · {f.type}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}