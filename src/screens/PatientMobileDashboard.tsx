import { useState, useEffect } from 'react';
import { Icon, ConsentBadge, RiskBadge, Card, PermissionBadge, RecordOwnershipBanner } from '../components/shared';
import {
  getCurrentUser,
  getPatientDashboardData,
  getPatientAccessRequests,
  approvePatientConsent,
  revokePatientConsent,
  getPatientMchRecord,
} from '../api/client';
import type { MchRecord, MchMilestone } from '../types';
import { MCH_RECORDS } from '../data';

interface Props {
  navigate: (s: string) => void;
  onSOS: () => void;
  loginPhone?: string;
}

function QRCodeSVG({ text, size = 180 }: { text: string; size?: number }) {
  const matrix: boolean[][] = Array.from({ length: 21 }, () => Array(21).fill(false));
  const drawFinder = (r: number, c: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) {
          matrix[r + i][c + j] = true;
        }
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, 14);
  drawFinder(14, 0);
  for (let i = 8; i < 13; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  for (let r = 0; r < 21; r++) {
    for (let c = 0; c < 21; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8)) continue;
      if (r === 6 || c === 6) continue;
      const seed = (hash ^ (r * 37 + c * 17)) >>> 0;
      matrix[r][c] = seed % 3 === 0;
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 21 21" className="rounded-xl bg-white p-2.5 shadow-sm border border-gray-100">
      {matrix.map((row, r) =>
        row.map((filled, c) =>
          filled ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#111827" /> : null
        )
      )}
    </svg>
  );
}

export default function PatientMobileDashboard({
  navigate,
  onSOS,
  loginPhone,
}: Props) {
  const [dbUser, setDbUser] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [medsList, setMedsList] = useState<any[]>([]);
  const [sosConfirm, setSosConfirm] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showMedsModal, setShowMedsModal] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [expandedConsultation, setExpandedConsultation] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [doctorConsents, setDoctorConsents] = useState<any[]>([]);
  const [consentActionInProgress, setConsentActionInProgress] = useState<string | null>(null);

  // Digital Mother & Child Protection (MCP) Card State
  const [mchRecord, setMchRecord] = useState<MchRecord | null>(null);
  const [mchActiveMode, setMchActiveMode] = useState<'maternal' | 'child'>('maternal');
  const [mchTimelineFilter, setMchTimelineFilter] = useState<'all' | 'completed' | 'due' | 'upcoming'>('all');
  const [showMcpModal, setShowMcpModal] = useState(false);
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getCurrentUser()
      .then(async (user) => {
        setDbUser(user);
        const healthId = user?.patientProfile?.healthId;
        const effectiveId = healthId || 'RHC-2026-8F4K92';

        if (healthId) {
          const data = await getPatientDashboardData(healthId).catch(() => null);

          if (data?.mchRecord) {
            setMchRecord(data.mchRecord);
          } else {
            getPatientMchRecord(healthId)
              .then((rec) => {
                if (rec) setMchRecord(rec);
              })
              .catch(() => {});
          }

          if (data?.medicines && Array.isArray(data.medicines)) {
            setMedsList(data.medicines);
          }

          if (data?.consultations?.length) {
            setHistory(
              data.consultations.map((c: any) => ({
                id: c.consultationCode || c.id,
                date: c.date,
                time: c.time,
                recordedBy: c.workerName || 'ASHA Worker',
                reviewedBy: c.doctorName,
                facility: c.facilityName || 'PHC',
                symptoms: c.symptoms || [],
                vitals: {
                  bp: c.vitals?.bloodPressure
                    ? `${c.vitals.bloodPressure} mmHg`
                    : '—',
                  hr: c.vitals?.heartRate
                    ? `${c.vitals.heartRate} bpm`
                    : '—',
                  temp: c.vitals?.temperature
                    ? `${c.vitals.temperature}°C`
                    : '—',
                  spo2: c.vitals?.spo2
                    ? `${c.vitals.spo2}%`
                    : '—',
                  wt: c.vitals?.weight
                    ? `${c.vitals.weight} kg`
                    : '—',
                },
                diagnosis: c.diagnosis || 'Clinical evaluation',
                prescription: c.prescription || [],
                notes: c.notes || '',
                risk: (c.riskLevel?.toLowerCase() || 'low') as any,
                followUp: c.followUpDate,
              }))
            );
          }

          // Fetch doctor consent entries
          getPatientAccessRequests(healthId)
            .then((reqs) => {
              const docConsents = (reqs || []).filter((r: any) =>
                String(r.role || '').toLowerCase().includes('doctor') ||
                String(r.role || '').toLowerCase() === 'physician'
              );
              setDoctorConsents(docConsents);
            })
            .catch(() => {});
        } else {
          // Default demo fallback for female / maternal profile
          getPatientMchRecord(effectiveId)
            .then((rec) => {
              if (rec) setMchRecord(rec);
            })
            .catch(() => {});
        }
      })
      .catch((e) => console.error('Failed to load user', e))
      .finally(() => setLoading(false));
  }, []);

  const pt = dbUser?.patientProfile;
  const patientName = pt?.name || dbUser?.fullName || 'Patient';
  const patientVillage = pt?.village || '';
  const patientDistrict = pt?.district || '';
  const patientHealthId = pt?.healthId || 'PENDING';
  const patientAge = pt?.age || pt?.dob || '--';
  const patientGender = pt?.gender || 'U';
  const patientBloodGroup = pt?.bloodGroup || '--';
  const patientRisk = pt?.riskLevel
    ? String(pt.riskLevel).toLowerCase()
    : 'low';
  const patientInitials = patientName
    .split(' ')
    .map((w: string) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const patientAllergies = pt?.allergies || [];
  const patientMeds = pt?.currentMedications || [];

  const isNewPatient = !!dbUser && history.length === 0;

  // Selected MCP profile (Maternal lifecycle vs Child immunization)
  const maternalRecord = (mchRecord?.pregnancyStatus === 'PREGNANT' ? mchRecord : MCH_RECORDS[0]);
  const childRecord = (mchRecord?.pregnancyStatus === 'POSTPARTUM' ? mchRecord : MCH_RECORDS[1]);
  const currentDisplayRecord: MchRecord = mchActiveMode === 'maternal' ? maternalRecord : childRecord;
  const milestonesList: MchMilestone[] = currentDisplayRecord?.milestones || [];
  const filteredMilestones = milestonesList.filter((m) => {
    if (mchTimelineFilter === 'completed') return m.status === 'completed';
    if (mchTimelineFilter === 'due') return m.status === 'due' || m.status === 'overdue';
    if (mchTimelineFilter === 'upcoming') return m.status === 'upcoming';
    return true;
  });

  if (loading) {
    return (
      <div className="p-4 max-w-md mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">
            Loading your health records…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {sosConfirm && !sosSent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <Icon name="alert" size={28} className="text-red-600" />
            </div>

            <div>
              <h3 className="font-display text-xl font-bold text-gray-900">
                Send Emergency SOS?
              </h3>

              <p className="text-sm text-gray-500 mt-1">
                This will immediately alert your ASHA worker and duty doctor
                with your Health ID and GPS location.
              </p>

              <p className="text-xs text-brand-600 bg-brand-50 rounded-xl px-3 py-2 mt-2">
                Works offline — SOS is stored locally and sent as soon as
                connectivity is available.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSosConfirm(false)}
                className="py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600"
              >
                Cancel
              </button>

              <button
                onClick={() => {
                  onSOS();
                  setSosSent(true);
                  setSosConfirm(false);
                }}
                className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm"
              >
                Send SOS
              </button>
            </div>
          </div>
        </div>
      )}

      {sosSent && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />

          <p className="flex-1 text-xs text-red-700 font-medium">
            SOS sent — your ASHA worker and duty doctor have been alerted.
          </p>

          <button onClick={() => setSosSent(false)}>
            <Icon name="x" size={13} className="text-gray-400" />
          </button>
        </div>
      )}

      <RecordOwnershipBanner />

      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">
            {patientName}
          </h1>

          <p className="text-xs text-gray-500">
            Patient
            {patientVillage
              ? ` · ${patientVillage}, ${patientDistrict}`
              : ''}
          </p>

          {loginPhone && (
            <p className="text-xs text-gray-500 mt-0.5">
              Phone: <span className="font-medium">{loginPhone}</span>
            </p>
          )}

          <button
            onClick={() => navigate('patient-profile-edit')}
            className="mt-1.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 border border-brand-200 text-brand-700 text-xs font-semibold rounded-xl hover:bg-brand-100 transition-colors cursor-pointer shadow-2xs"
          >
            <Icon name="edit" size={12} />
            Edit Profile
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Icon name="bell" size={18} className="text-gray-600" />
          </button>

          <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
            {patientInitials}
          </div>

          <button
            onClick={() => setSosConfirm(true)}
            className="relative flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md shadow-red-200 transition-all"
          >
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-400 rounded-full animate-ping" />
            <Icon name="alert" size={14} />
            SOS
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-brand-700 to-brand-600 rounded-3xl p-5 text-white">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-brand-200 text-xs font-medium mb-1">
              My Health ID
            </div>

            <div className="font-mono text-lg font-bold tracking-wider">
              {patientHealthId}
            </div>

            <div className="text-brand-200 text-xs mt-1">
              {patientName} · {patientAge}
              {patientGender} · {patientBloodGroup}
            </div>
          </div>

          <div className="w-16 h-16 bg-white rounded-xl p-1.5 shrink-0">
            <div className="grid grid-cols-5 gap-px h-full">
              {Array.from({ length: 25 }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-sm ${
                    [0, 1, 2, 5, 10, 14, 15, 16, 20, 24, 6, 7, 8, 22, 23].includes(i)
                      ? 'bg-gray-900'
                      : 'bg-transparent'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <RiskBadge level={patientRisk as any} />
          <ConsentBadge status="granted" />
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowQR(true)}
            className="flex-1 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon name="qr" size={13} />
            Show QR
          </button>

          <button
            onClick={() => {
              const shareText = `RuralCare Health ID Card\nPatient: ${patientName}\nHealth ID: ${patientHealthId}\nABHA: ${pt?.abhaNumber || 'N/A'}\nVillage: ${patientVillage || 'N/A'}\nBlood Group: ${patientBloodGroup}`;
              if (navigator.share) {
                navigator.share({ title: 'RuralCare Health ID', text: shareText }).catch(() => {});
              } else {
                navigator.clipboard.writeText(shareText);
                setShareToast('Health ID card copied to clipboard!');
                setTimeout(() => setShareToast(null), 2500);
              }
            }}
            className="flex-1 py-2 bg-white/15 hover:bg-white/25 text-white text-xs font-medium rounded-xl flex items-center justify-center gap-1.5 transition-colors"
          >
            <Icon name="share" size={13} />
            Share
          </button>
        </div>
      </div>

      {/* Assigned Care Team / ASHA Worker Card */}
      <div className="bg-white border border-gray-100 rounded-2xl p-3.5 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
            <Icon name="user" size={20} />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-teal-700 tracking-wider">
              Assigned ASHA / Health Worker
            </div>
            <div className="text-sm font-bold text-gray-900 mt-0.5">
              {pt?.healthWorkerName || pt?.healthWorker?.name || 'Meena Kumari (ASHA)'}
            </div>
            <div className="text-[11px] text-gray-500">
              Community Health Center · {patientVillage || 'Local Area'}
            </div>
          </div>
        </div>
        <div className="px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-full text-[10px] font-bold text-teal-800">
          Assigned
        </div>
      </div>

      <button
        onClick={() => setSosConfirm(true)}
        className="relative w-full py-4 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-2xl text-base shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-3"
      >
        <span className="absolute top-2 right-3 w-2.5 h-2.5 bg-red-400 rounded-full animate-ping" />

        <Icon name="alert" size={22} />

        EMERGENCY SOS

        <span className="text-red-200 text-xs font-normal">
          · Works offline
        </span>
      </button>

      <div className="grid grid-cols-5 gap-1.5">
        {[
          {
            label: 'MCP Card',
            icon: 'clipboard',
            color: 'bg-rose-50 text-rose-700 ring-1 ring-rose-300 font-bold shadow-xs',
            action: () => {
              const el = document.getElementById('mcp-card-pass');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
              else setShowMcpModal(true);
            },
          },
          {
            label: 'Records',
            icon: 'clipboard',
            color: 'bg-brand-50 text-brand-700',
            action: () => navigate('patient-profile'),
          },
          {
            label: 'Medicines',
            icon: 'pill',
            color: 'bg-purple-50 text-purple-700',
            action: () => setShowMedsModal(true),
          },
          {
            label: 'Consent',
            icon: 'shield',
            color: 'bg-green-50 text-green-700',
            action: () => navigate('consent'),
          },
          {
            label: 'Access Log',
            icon: 'eye',
            color: 'bg-amber-50 text-amber-700',
            action: () => navigate('access-history'),
          },
        ].map(item => (
          <button
            key={item.label}
            onClick={item.action}
            className={`flex flex-col items-center gap-1.5 p-2 rounded-2xl ${item.color} hover:opacity-80 transition-opacity cursor-pointer`}
          >
            <Icon name={item.icon} size={18} />
            <span className="text-[10px] font-semibold text-center leading-tight">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* ─── DIGITAL MOTHER & CHILD PROTECTION (MCP) CARD PASS ─────────── */}
      <div id="mcp-card-pass" className="scroll-mt-4 bg-white rounded-3xl border-2 border-rose-100 shadow-sm overflow-hidden">
        {/* Official Header with National Health Mission / RMNCH+A Branding */}
        <div className="bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 p-4 text-white">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-xl shadow-inner shrink-0">
                🤰
              </div>
              <div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] font-extrabold uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded-md text-rose-50">
                    National Health Mission · RMNCH+A
                  </span>
                  <span className="text-[9px] font-bold bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded">
                    Govt of India
                  </span>
                </div>
                <h2 className="font-display text-base font-bold text-white mt-1 leading-tight">
                  Mother &amp; Child Protection Card
                </h2>
                <p className="text-[11px] text-rose-100 font-medium">
                  माता एवं बाल सुरक्षा कार्ड · Digital Beneficiary Pass
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowMcpModal(true)}
              className="px-2.5 py-1.5 bg-white/20 hover:bg-white/30 active:scale-95 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 backdrop-blur-xs transition-all cursor-pointer shrink-0"
            >
              <Icon name="qr" size={13} />
              Pass QR
            </button>
          </div>

          {/* Identification Sub-bar */}
          <div className="mt-3 pt-2.5 border-t border-white/20 flex items-center justify-between text-[11px] text-rose-100">
            <div>
              <span className="text-white/70">RCH Reg: </span>
              <span className="font-mono font-bold text-white">9482-1039-4402</span>
            </div>
            <div>
              <span className="text-white/70">MCP ID: </span>
              <span className="font-mono font-bold text-white">{currentDisplayRecord.id?.toUpperCase() || 'MCH-001'}</span>
            </div>
          </div>
        </div>

        {/* Lifecycle Mode Switcher (Maternal Care vs Child Immunization) */}
        <div className="bg-rose-50/60 p-1.5 border-b border-rose-100 flex gap-1.5">
          <button
            onClick={() => {
              setMchActiveMode('maternal');
              setMchTimelineFilter('all');
            }}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mchActiveMode === 'maternal'
                ? 'bg-white text-rose-800 shadow-xs border border-rose-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <span>🤰</span>
            <span className="truncate">Maternal Care (ANC &amp; TT)</span>
          </button>
          <button
            onClick={() => {
              setMchActiveMode('child');
              setMchTimelineFilter('all');
            }}
            className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              mchActiveMode === 'child'
                ? 'bg-white text-rose-800 shadow-xs border border-rose-200'
                : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
            }`}
          >
            <span>👶</span>
            <span className="truncate">Child Immunization</span>
          </button>
        </div>

        {/* Active Mode Banner & Gestational / Infant Status */}
        {mchActiveMode === 'maternal' ? (
          <div className="p-4 bg-white space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900">
                  {currentDisplayRecord.patientName || patientName}
                </span>
                <span className="text-xs text-gray-500 ml-1.5">
                  · {currentDisplayRecord.gestationalWeeks || 26} Weeks Pregnant
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                2nd Trimester
              </span>
            </div>

            {/* Gestational Progress Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] mb-1 font-medium">
                <span className="text-gray-600">
                  Gestational Age: <strong className="text-gray-900">{currentDisplayRecord.gestationalWeeks || 26} of 40 Weeks</strong>
                </span>
                <span className="text-rose-600 font-bold">56 Days to Due Date</span>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex p-0.5 border border-gray-200">
                <div className="w-[30%] bg-emerald-500 rounded-l-full h-full" title="1st Trimester" />
                <div className="w-[35%] bg-gradient-to-r from-rose-500 to-pink-500 h-full relative">
                  <span className="absolute right-0 top-0 bottom-0 w-1 bg-white rounded-full animate-pulse" />
                </div>
                <div className="w-[35%] bg-gray-200 h-full rounded-r-full" title="3rd Trimester" />
              </div>
              <div className="flex justify-between text-[9px] text-gray-400 mt-1 font-medium px-0.5">
                <span className="text-emerald-700 font-semibold">✓ 1st Trimester (1–12w)</span>
                <span className="text-rose-700 font-bold">● 2nd Trimester (13–27w)</span>
                <span>3rd Trimester (28–40w)</span>
              </div>
            </div>

            {/* Clinical Pregnancy Markers Grid */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-rose-50/70 border border-rose-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-rose-700">EDD (Due Date)</div>
                <div className="font-bold text-xs text-gray-900 mt-0.5">{currentDisplayRecord.edd || '15 Nov 2026'}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-gray-500">LMP</div>
                <div className="font-semibold text-xs text-gray-800 mt-0.5">{currentDisplayRecord.lmp || '08 Feb 2026'}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-gray-500">Gravida / Para</div>
                <div className="font-semibold text-xs text-gray-800 mt-0.5">G{currentDisplayRecord.gravida ?? 1} P{currentDisplayRecord.para ?? 0}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-gray-500">Blood Group</div>
                <div className="font-bold text-xs text-rose-600 mt-0.5">{currentDisplayRecord.bloodGroup || 'O+'}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-white space-y-3.5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-gray-900">
                  {currentDisplayRecord.childName || 'Baby Aarav'}
                </span>
                <span className="text-xs text-gray-500 ml-1.5">
                  · {currentDisplayRecord.childGender || 'Male'}, {currentDisplayRecord.childAgeWeeks || 6} Weeks Old
                </span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Infant Care
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-blue-50/70 border border-blue-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-blue-700">Date of Birth</div>
                <div className="font-bold text-xs text-gray-900 mt-0.5">{currentDisplayRecord.childDob || '05 Aug 2026'}</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-gray-500">Birth Weight</div>
                <div className="font-semibold text-xs text-amber-700 mt-0.5">2.1 kg (LBW)</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-gray-500">Current Weight</div>
                <div className="font-semibold text-xs text-emerald-700 mt-0.5">3.2 kg (Normal)</div>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-2">
                <div className="text-[9px] uppercase font-bold text-gray-500">Vaccine Doses</div>
                <div className="font-bold text-xs text-purple-700 mt-0.5">2 Given · 2 Due</div>
              </div>
            </div>
          </div>
        )}

        {/* High-Risk Indicators Banner (if active) */}
        {currentDisplayRecord.isHighRisk && (
          <div className="mx-4 mb-3.5 p-3 bg-gradient-to-r from-amber-50 to-rose-50 border border-amber-300 rounded-2xl">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
                <Icon name="alert" size={15} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-amber-950">
                    {mchActiveMode === 'maternal' ? 'High-Risk Pregnancy (HRP) Alert' : 'High-Risk Infant Follow-up'}
                  </span>
                  <span className="text-[9px] font-bold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
                    Priority Protocol
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {currentDisplayRecord.hrpIndicators?.map((ind, i) => (
                    <span key={i} className="text-[10px] font-semibold bg-white border border-amber-300 text-amber-900 px-2 py-0.5 rounded-lg shadow-2xs">
                      ⚠️ {ind}
                    </span>
                  ))}
                </div>
                <p className="text-[10.5px] text-amber-900/80 mt-1.5 leading-snug">
                  {mchActiveMode === 'maternal'
                    ? "Priority ASHA home visits active. Take 1 IFA tablet daily with meals and drink safe boiled water. Specialist review at CHC."
                    : "Low birth weight newborn protocol active. Kangaroo Mother Care (KMC) instructed. Timely pentavalent vaccine required."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Next Scheduled Clinic Date Hero Card */}
        <div className="mx-4 mb-4 p-3.5 bg-gradient-to-br from-teal-50 via-emerald-50 to-teal-50 border border-teal-200 rounded-2xl shadow-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Icon name="history" size={16} />
              </div>
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800">
                  Next Scheduled Clinic Date
                </div>
                <div className="text-sm font-bold text-gray-900 mt-0.5">
                  {currentDisplayRecord.nextScheduledDate || '22 Sep 2026 (Tuesday)'}
                </div>
                <div className="text-xs font-semibold text-teal-900 mt-0.5">
                  Village Health &amp; Nutrition Day (VHND)
                </div>
                <div className="text-[11px] text-gray-600 mt-0.5">
                  📍 Govindpur Anganwadi Centre · 09:30 AM
                </div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 px-2 py-0.5 bg-white border border-teal-200 rounded-lg text-[10px] font-medium text-teal-900">
                  <span>Scheduled:</span>
                  <span className="font-bold">
                    {currentDisplayRecord.nextScheduledMilestone || (mchActiveMode === 'maternal' ? 'ANC-3 Checkup & IFA 2nd Allotment' : 'Pentavalent-1 & OPV-1')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-teal-100">
            <button
              onClick={() => {
                setShareToast('📅 Reminder set for 22 Sep 2026 (VHND Clinic)!');
                setTimeout(() => setShareToast(null), 2500);
              }}
              className="py-2 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Icon name="bell" size={12} />
              Set Reminder
            </button>
            <button
              onClick={() => {
                setShareToast('📞 Calling ASHA Worker Meena Kumari (94140 12345)…');
                setTimeout(() => setShareToast(null), 2500);
              }}
              className="py-2 bg-white hover:bg-teal-100 border border-teal-300 text-teal-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Icon name="phone" size={12} />
              Call ASHA Worker
            </button>
          </div>
        </div>

        {/* Visual Timeline of Past Vaccines and Next Scheduled Checkups */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-gray-900">
                Visual Milestone &amp; Vaccine Timeline
              </h3>
              <p className="text-[11px] text-gray-500">
                {mchActiveMode === 'maternal'
                  ? 'ANC 1–4 checkups, TT-1, TT-2, & IFA distribution'
                  : 'BCG, Oral Polio (OPV), & Pentavalent series'}
              </p>
            </div>
            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {filteredMilestones.length} Milestones
            </span>
          </div>

          {/* Timeline Filter Tabs */}
          <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 text-xs">
            {[
              { id: 'all', label: 'All' },
              { id: 'completed', label: '✓ Completed' },
              { id: 'due', label: '🚨 Due / Overdue' },
              { id: 'upcoming', label: '⏳ Upcoming' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setMchTimelineFilter(tab.id as any)}
                className={`px-2.5 py-1 rounded-xl font-bold text-[11px] shrink-0 transition-all cursor-pointer ${
                  mchTimelineFilter === tab.id
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Vertical Timeline Nodes */}
          <div className="relative pl-6 space-y-3.5 before:absolute before:left-2.5 before:top-2.5 before:bottom-2.5 before:w-0.5 before:bg-gradient-to-b before:from-emerald-400 before:via-rose-300 before:to-gray-200">
            {filteredMilestones.map((milestone) => {
              const isCompleted = milestone.status === 'completed';
              const isDue = milestone.status === 'due' || milestone.status === 'overdue';
              const isExpanded = expandedMilestoneId === milestone.id;

              return (
                <div key={milestone.id} className="relative group">
                  {/* Timeline Status Node Icon */}
                  <div
                    className={`absolute -left-6 top-1.5 w-5 h-5 rounded-full flex items-center justify-center ring-4 ring-white shadow-xs ${
                      isCompleted
                        ? 'bg-emerald-500 text-white'
                        : isDue
                        ? 'bg-amber-500 text-white animate-pulse'
                        : 'bg-gray-300 text-gray-600'
                    }`}
                  >
                    {isCompleted ? (
                      <Icon name="check" size={11} />
                    ) : isDue ? (
                      <span className="text-[10px] font-bold">!</span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>

                  {/* Milestone Card */}
                  <div
                    onClick={() => setExpandedMilestoneId(isExpanded ? null : milestone.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isDue
                        ? 'bg-amber-50/50 border-amber-300 shadow-xs ring-1 ring-amber-200'
                        : isCompleted
                        ? 'bg-white border-gray-200 hover:border-emerald-300'
                        : 'bg-gray-50/70 border-gray-200 hover:border-gray-300 opacity-85'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 border border-gray-200">
                            {milestone.code}
                          </span>
                          <span className="text-xs font-bold text-gray-900 truncate">
                            {milestone.name}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
                          <span>Target: {milestone.recommendedWeekOrAge}</span>
                          <span>·</span>
                          <span className={isCompleted ? 'text-emerald-700 font-bold' : isDue ? 'text-amber-700 font-bold' : 'text-gray-500'}>
                            {isCompleted ? `Administered: ${milestone.completedDate || milestone.dueDate}` : `Due: ${milestone.dueDate}`}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : isDue
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {milestone.status}
                        </span>
                        <Icon
                          name="chevron_down"
                          size={14}
                          className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </div>
                    </div>

                    {/* Expandable Clinical Findings & Vitals */}
                    {isExpanded && (
                      <div className="mt-2.5 pt-2.5 border-t border-gray-100 space-y-2 text-xs">
                        {milestone.facilityName && (
                          <div className="text-[11px] text-gray-600 flex items-center gap-1.5">
                            <span className="font-semibold text-gray-500">Administered at:</span>
                            <span>{milestone.facilityName} · {milestone.administeredBy || 'ASHA Worker'}</span>
                          </div>
                        )}

                        {milestone.batchNumber && (
                          <div className="text-[11px] text-gray-600 flex items-center gap-1.5">
                            <span className="font-semibold text-gray-500">Batch Number:</span>
                            <span className="font-mono font-bold text-gray-800">{milestone.batchNumber}</span>
                          </div>
                        )}

                        {milestone.vitals && (
                          <div className="bg-emerald-50/60 p-2 rounded-xl border border-emerald-100 grid grid-cols-3 gap-1.5 text-center">
                            {milestone.vitals.bloodPressure && (
                              <div>
                                <div className="text-[9px] text-emerald-800 font-medium">BP</div>
                                <div className="font-mono text-[11px] font-bold text-gray-900">{milestone.vitals.bloodPressure}</div>
                              </div>
                            )}
                            {milestone.vitals.weight && (
                              <div>
                                <div className="text-[9px] text-emerald-800 font-medium">Weight</div>
                                <div className="font-mono text-[11px] font-bold text-gray-900">{milestone.vitals.weight} kg</div>
                              </div>
                            )}
                            {milestone.vitals.haemoglobin && (
                              <div>
                                <div className="text-[9px] text-emerald-800 font-medium">Hb</div>
                                <div className="font-mono text-[11px] font-bold text-gray-900">{milestone.vitals.haemoglobin} g/dL</div>
                              </div>
                            )}
                          </div>
                        )}

                        {milestone.notes && (
                          <div className="p-2 bg-gray-50 rounded-xl text-[11px] text-gray-700 italic border border-gray-100">
                            &ldquo;{milestone.notes}&rdquo;
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Who Has Access — Doctor consent summary */}
      {doctorConsents.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 shrink-0">
                <Icon name="shield" size={12} />
              </div>
              <span className="font-semibold text-sm text-gray-900">Who Has Access</span>
            </div>
            <button
              onClick={() => navigate('patient-profile')}
              className="text-xs text-brand-600 font-semibold hover:underline cursor-pointer"
            >
              Manage →
            </button>
          </div>

          <div className="space-y-2">
            {doctorConsents.slice(0, 3).map((c: any) => {
              const isPending = c.status === 'TEMPORARY';
              const isGranted = c.status === 'GRANTED';
              const isActing = consentActionInProgress === c.id;

              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
                    isPending ? 'bg-amber-50 border-amber-200' :
                    isGranted ? 'bg-emerald-50 border-emerald-100' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">{c.grantedTo}</div>
                    <div className={`text-[10px] font-medium ${isPending ? 'text-amber-700' : isGranted ? 'text-emerald-700' : 'text-gray-500'}`}>
                      {isPending ? 'Awaiting your approval' : isGranted ? 'Access granted' : 'Revoked'}
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          setConsentActionInProgress(c.id);
                          try {
                            await approvePatientConsent(c.id);
                            setDoctorConsents((prev) =>
                              prev.map((x) => x.id === c.id ? { ...x, status: 'GRANTED' } : x)
                            );
                          } catch {
                            // ignore
                          } finally {
                            setConsentActionInProgress(null);
                          }
                        }}
                        className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        {isActing ? '…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          setConsentActionInProgress(c.id);
                          try {
                            await revokePatientConsent(c.id, 'Rejected by patient');
                            setDoctorConsents((prev) =>
                              prev.map((x) => x.id === c.id ? { ...x, status: 'REVOKED' } : x)
                            );
                          } catch {
                            // ignore
                          } finally {
                            setConsentActionInProgress(null);
                          }
                        }}
                        className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        {isActing ? '…' : 'Reject'}
                      </button>
                    </div>
                  )}
                  {isGranted && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">Active</span>
                  )}
                </div>
              );
            })}
            {doctorConsents.length > 3 && (
              <button
                onClick={() => navigate('patient-profile')}
                className="w-full text-center text-xs text-brand-600 font-semibold py-1 cursor-pointer hover:underline"
              >
                +{doctorConsents.length - 3} more · View all
              </button>
            )}
          </div>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-bold text-gray-900">
              My Health Record
            </h2>

            <p className="text-xs text-gray-500 mt-0.5">
              {history.length} consultations · longitudinal history
            </p>
          </div>

          <PermissionBadge type="view-only" />
        </div>

        <RecordOwnershipBanner />

        {history.length === 0 ? (
          <div className="text-center py-6 bg-gray-50 rounded-2xl border border-gray-100">
            <Icon
              name="clipboard"
              size={24}
              className="text-gray-300 mx-auto mb-2"
            />

            <p className="text-gray-500 text-sm">
              No health records found.
            </p>

            <p className="text-gray-400 text-xs">
              Visits to the PHC or ASHA will appear here.
            </p>
          </div>
        ) : (
          history.map((entry: any) => {
            const isExpanded = expandedConsultation === entry.id;

            return (
              <Card key={entry.id} className="overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    setExpandedConsultation(
                      isExpanded ? null : entry.id
                    )
                  }
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      entry.risk === 'moderate'
                        ? 'bg-amber-100'
                        : 'bg-green-100'
                    }`}
                  >
                    <Icon
                      name="clipboard"
                      size={16}
                      className={
                        entry.risk === 'moderate'
                          ? 'text-amber-700'
                          : 'text-green-700'
                      }
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {entry.diagnosis}
                      </span>

                      <RiskBadge
                        level={entry.risk}
                        size="sm"
                      />
                    </div>

                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {entry.date} · {entry.time} · {entry.facility}
                    </div>

                    <div className="text-[10px] text-gray-400">
                      Recorded by:{' '}
                      <span className="font-medium">
                        {entry.recordedBy}
                      </span>

                      {entry.reviewedBy && (
                        <>
                          {' · Reviewed by: '}
                          <span className="font-medium">
                            {entry.reviewedBy}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <Icon
                    name="chevron_down"
                    size={16}
                    className={`text-gray-400 shrink-0 mt-1 transition-transform ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Symptoms
                        </span>

                        <PermissionBadge type="asha-recorded" />
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {entry.symptoms.map((s: string) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-800 rounded-lg text-xs"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Vitals
                        </span>

                        <PermissionBadge type="asha-recorded" />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(entry.vitals).map(([k, v]) => (
                          <div
                            key={k}
                            className="bg-gray-50 rounded-lg px-2 py-1.5 text-center"
                          >
                            <div className="font-mono text-xs font-bold text-gray-800">
                              {String(v)}
                            </div>

                            <div className="text-[9px] text-gray-400 capitalize">
                              {k === 'bp'
                                ? 'Blood Pressure'
                                : k === 'hr'
                                  ? 'Heart Rate'
                                  : k === 'temp'
                                    ? 'Temp'
                                    : k === 'spo2'
                                      ? 'SpO₂'
                                      : 'Weight'}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="px-4 py-3 bg-purple-50/40">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Diagnosis
                        </span>

                        <PermissionBadge type="doctor-editable" />
                      </div>

                      <p className="text-sm text-gray-900 font-medium">
                        {entry.diagnosis}
                      </p>

                      {entry.notes && (
                        <p className="text-xs text-gray-500 mt-1">
                          {entry.notes}
                        </p>
                      )}
                    </div>

                    <div className="px-4 py-3 bg-blue-50/30">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                          Prescription
                        </span>

                        <PermissionBadge type="doctor-editable" />
                      </div>

                      <ul className="space-y-1">
                        {entry.prescription.map((rx: string) => (
                          <li
                            key={rx}
                            className="flex items-start gap-2 text-xs text-gray-700"
                          >
                            <Icon
                              name="pill"
                              size={11}
                              className="text-blue-500 shrink-0 mt-0.5"
                            />
                            {rx}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {entry.followUp && (
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Icon
                            name="history"
                            size={13}
                            className="text-brand-500 shrink-0"
                          />

                          <span className="text-xs text-gray-700">
                            Follow-up scheduled:{' '}
                            <strong>{entry.followUp}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })
        )}

        <Card>
          <div className="px-4 pt-4 pb-1">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold text-gray-900">
                Lab & Test Reports
              </h3>

              <PermissionBadge type="clinician-only" />
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {labs.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-xs">
                No lab reports available.
              </div>
            ) : (
              labs.map((r: any, i: number) => (
                <div
                  key={i}
                  className="px-4 py-3 flex items-start gap-3"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      r.status === 'abnormal'
                        ? 'bg-red-50'
                        : 'bg-green-50'
                    }`}
                  >
                    <Icon
                      name="document"
                      size={14}
                      className={
                        r.status === 'abnormal'
                          ? 'text-red-500'
                          : 'text-green-600'
                      }
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-900">
                        {r.name}
                      </span>

                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          r.status === 'abnormal'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>

                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {r.date} · {r.by}
                    </div>

                    <div className="text-xs text-gray-700 mt-0.5 font-mono">
                      {r.result}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <button className="w-full flex items-center gap-2.5 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl hover:border-brand-200 hover:bg-brand-50 transition-all text-left">
          <Icon
            name="document"
            size={16}
            className="text-gray-500 shrink-0"
          />

          <div className="flex-1">
            <div className="text-sm font-medium text-gray-700">
              Request Correction / Update
            </div>

            <div className="text-[10px] text-gray-400">
              Flag an error for review by your healthcare provider
            </div>
          </div>

          <Icon
            name="chevron_right"
            size={14}
            className="text-gray-400 shrink-0"
          />
        </button>
      </div>

      <Card>
        <div className="p-4">
          <div className="font-display font-semibold text-gray-800 mb-3">
            My Medicines
          </div>

          <div className="space-y-2">
            {patientMeds.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-2">
                No medicines on record.
              </div>
            ) : (
              patientMeds.map((m: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-gray-100"
                >
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                    <Icon
                      name="pill"
                      size={14}
                      className="text-blue-600"
                    />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {typeof m === 'string' ? m : m.name}
                    </div>

                    <div className="text-[10px] text-gray-500">
                      {typeof m === 'string'
                        ? ''
                        : m.dosage || m.dose || ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <button
        onClick={() => navigate('consent')}
        className="w-full flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-2xl hover:border-brand-200 hover:bg-brand-50 transition-all text-left"
      >
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
          <Icon
            name="shield"
            size={18}
            className="text-green-600"
          />
        </div>

        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">
            Privacy & Consent
          </div>

          <div className="text-xs text-gray-500">
            Manage who can access your records
          </div>
        </div>

        <Icon
          name="chevron_right"
          size={16}
          className="text-gray-400"
        />
      </button>

      {/* Share Toast */}
      {shareToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Icon name="check" size={14} className="text-emerald-400" />
          <span>{shareToast}</span>
        </div>
      )}

      {/* Show QR Modal */}
      {showQR && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl text-center">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700">Official Health QR</span>
              <button onClick={() => setShowQR(false)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
                ×
              </button>
            </div>
            <div className="flex justify-center py-2">
              <QRCodeSVG text={patientHealthId} size={190} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-gray-900">{patientName}</h3>
              <p className="font-mono text-xs font-bold text-brand-700 mt-0.5">{patientHealthId}</p>
              <p className="text-xs text-gray-500 mt-1">
                ABHA: {pt?.abhaNumber || 'Not Linked'} · {patientAge} · {patientBloodGroup}
              </p>
              {patientVillage && (
                <p className="text-xs text-gray-400 mt-0.5">{patientVillage}, {patientDistrict}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(patientHealthId);
                  setShareToast('Health ID copied!');
                  setTimeout(() => setShareToast(null), 2000);
                }}
                className="py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 flex items-center justify-center gap-1.5"
              >
                <Icon name="clipboard" size={13} />
                Copy ID
              </button>
              <button
                onClick={() => setShowQR(false)}
                className="py-2.5 bg-brand-600 hover:bg-brand-700 rounded-xl text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Medicines Modal */}
      {showMedsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <Icon name="pill" size={16} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-gray-900">Active Medications</h3>
                  <p className="text-[11px] text-gray-500">Prescribed treatments & ongoing therapies</p>
                </div>
              </div>
              <button onClick={() => setShowMedsModal(false)} className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
                ×
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {medsList.length > 0 || (patientMeds && patientMeds.length > 0) ? (
                (medsList.length > 0 ? medsList : patientMeds.map((m: string) => ({ name: m, dosage: 'Active medication' }))).map((med: any, idx: number) => (
                  <div key={idx} className="p-3.5 bg-purple-50/50 border border-purple-100 rounded-2xl flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon name="pill" size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-gray-900">{med.name}</div>
                      <div className="text-[11px] text-purple-800 mt-0.5">{med.dosage || med.dosageForm || 'As directed by physician'}</div>
                      {med.strength && <div className="text-[10px] text-gray-400 mt-0.5">Strength: {med.strength}</div>}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                  <Icon name="pill" size={28} className="text-gray-300 mx-auto" />
                  <p className="text-xs font-semibold text-gray-700">No Active Medications</p>
                  <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                    You currently have no prescribed medications or active drug therapies recorded.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2">
              <button
                onClick={() => setShowMedsModal(false)}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Digital MCP Pass Certificate Modal */}
      {showMcpModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 max-w-sm w-full space-y-3.5 shadow-2xl text-center max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <span className="text-base">🤰</span>
                <span className="text-xs font-bold uppercase tracking-wider text-rose-700">Official Digital MCP Pass</span>
              </div>
              <button
                onClick={() => setShowMcpModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="bg-gradient-to-br from-rose-500 to-pink-600 rounded-2xl p-4 text-white text-left shadow-sm">
              <div className="flex items-center justify-between text-[10px] text-rose-100 uppercase tracking-wider font-bold">
                <span>Govt of India · MoHFW</span>
                <span>RMNCH+A</span>
              </div>
              <h3 className="font-display font-bold text-base mt-1 text-white">
                Mother &amp; Child Protection Pass
              </h3>
              <div className="text-xs font-mono font-bold mt-2 bg-white/20 px-2 py-1 rounded-lg inline-block">
                RCH: 9482-1039-4402
              </div>
              <div className="mt-2 text-xs text-rose-100 space-y-0.5">
                <div>Beneficiary: <strong className="text-white">{currentDisplayRecord.patientName || patientName}</strong></div>
                {mchActiveMode === 'maternal' ? (
                  <>
                    <div>EDD: <strong className="text-white">{currentDisplayRecord.edd || '15 Nov 2026'}</strong> · LMP: {currentDisplayRecord.lmp || '08 Feb 2026'}</div>
                    <div>Blood Group: <strong className="text-white">{currentDisplayRecord.bloodGroup || 'O+'}</strong> · Gravida: G1 P0</div>
                  </>
                ) : (
                  <>
                    <div>Child: <strong className="text-white">{currentDisplayRecord.childName || 'Baby Aarav'}</strong> ({currentDisplayRecord.childGender || 'Male'})</div>
                    <div>DOB: <strong className="text-white">{currentDisplayRecord.childDob || '05 Aug 2026'}</strong> · Age: 6 Weeks</div>
                  </>
                )}
                <div>Assigned ASHA: <strong className="text-white">{currentDisplayRecord.assignedWorkerName || 'Meena Kumari'}</strong></div>
              </div>
            </div>

            <div className="flex justify-center py-1">
              <QRCodeSVG text={`MCP-PASS|${currentDisplayRecord.id}|${currentDisplayRecord.patientHealthId || patientHealthId}|EDD:${currentDisplayRecord.edd || 'N/A'}|VERIFIED`} size={170} />
            </div>

            <div className="bg-gray-50 border border-gray-100 rounded-xl p-2.5 text-left text-[11px] space-y-1">
              <div className="font-bold text-gray-700 flex items-center justify-between">
                <span>Verified Milestones Stamp</span>
                <span className="text-emerald-700 font-extrabold">✓ Official Record</span>
              </div>
              <div className="text-gray-500">
                {mchActiveMode === 'maternal'
                  ? 'ANC 1 & 2 Completed · TT-1 & TT-2 Administered · IFA Tablets Issued'
                  : 'BCG Birth Dose Given · OPV-0 Given · Pentavalent-1 Due'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  const passInfo = `Digital MCP Pass\nBeneficiary: ${currentDisplayRecord.patientName || patientName}\nID: ${currentDisplayRecord.id}\nRCH: 9482-1039-4402\nEDD: ${currentDisplayRecord.edd || 'N/A'}\nVillage: ${patientVillage}`;
                  if (navigator.share) {
                    navigator.share({ title: 'Digital MCP Card', text: passInfo }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(passInfo);
                    setShareToast('MCP Pass info copied to clipboard!');
                    setTimeout(() => setShareToast(null), 2000);
                  }
                }}
                className="py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Icon name="share" size={13} />
                Share Pass
              </button>
              <button
                onClick={() => setShowMcpModal(false)}
                className="py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}