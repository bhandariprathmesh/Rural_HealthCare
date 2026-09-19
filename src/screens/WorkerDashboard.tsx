import { useState, useEffect } from 'react';
import {
  StatCard,
  SectionHeader,
  PatientRow,
  RiskBadge,
  ReferralBadge,
  PriorityBadge,
  Card,
  Icon,
  HPRBadge,
  DutyStatusBadge,
  ABDMLayerLegend,
} from '../components/shared';
import {
  getWorkerDashboardData,
  getDoctors,
  getCurrentUser,
  dispatchSosAlert,
  getSosAlertStatus,
  cancelSosAlert,
} from '../api/client';

interface ActiveSosAlert {
  id: string;
  status:
    | 'sent'
    | 'notified'
    | 'awaiting'
    | 'acknowledged'
    | 'declined'
    | 'escalated';
  escalationLevel: number;
}

interface Props {
  navigate: (s: string, patientId?: string) => void;
  isOffline: boolean;
  onSOS: () => void;
  activeSosAlert?: ActiveSosAlert | null;
}

interface Doctor {
  id: string;
  name: string;
  specialty: string;
  facility: string;
  hprId: string;
  status: 'available' | 'busy' | 'offline';
  distance: string;
  recommended: boolean;
  reasons: string[];
}

const DEFAULT_DOCTORS: Doctor[] = [
  {
    id: 'doc1',
    name: 'Dr. Ankit Sharma',
    specialty: 'General Medicine',
    facility: 'PHC Lunkaransar',
    hprId: 'HPR-2024-00142',
    status: 'available',
    distance: '2.1 km',
    recommended: true,
    reasons: [
      'Primary assigned doctor',
      'On-duty now',
      'General Medicine specialist',
      'Nearest PHC',
    ],
  },
  {
    id: 'doc2',
    name: 'Dr. Priya Mehta',
    specialty: 'Gynaecology & Obstetrics',
    facility: 'CHC Bikaner',
    hprId: 'HPR-2024-00289',
    status: 'busy',
    distance: '8.4 km',
    recommended: false,
    reasons: [],
  },
  {
    id: 'doc3',
    name: 'Dr. Suresh Gupta',
    specialty: 'Emergency Medicine',
    facility: 'District Hospital Bikaner',
    hprId: 'HPR-2024-00371',
    status: 'available',
    distance: '14.2 km',
    recommended: false,
    reasons: ['Emergency specialist available'],
  },
];

const DEFAULT_ESCALATION_CHAIN = [
  {
    label: 'On-duty Doctor',
    sub: 'Primary assigned doctor',
  },
  {
    label: 'Emergency Doctor',
    sub: 'Nearest emergency specialist',
  },
  {
    label: 'District Control Room',
    sub: 'District Emergency Operations',
  },
];

function safeArray<T>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? value : fallback;
}

function normalizeDoctor(raw: any, index: number): Doctor {
  const name =
    raw?.name ||
    raw?.fullName ||
    raw?.doctorName ||
    `Doctor ${index + 1}`;

  const rawStatus = String(raw?.dutyStatus || raw?.status || '').toLowerCase().trim();
  const status: 'available' | 'busy' | 'offline' =
    rawStatus === 'busy'
      ? 'busy'
      : rawStatus === 'offline' || rawStatus === 'off-duty' || rawStatus === 'offduty'
        ? 'offline'
        : 'available';

  return {
    id: String(raw?.id || raw?.professionalId || `doctor-${index + 1}`),
    name,
    specialty:
      raw?.specialty ||
      raw?.specialization ||
      raw?.qualification ||
      'Medical Officer',
    facility:
      raw?.facility?.name ||
      raw?.facility ||
      raw?.facilityName ||
      raw?.primaryFacilityName ||
      'Primary Health Centre',
    hprId:
      raw?.hprId ||
      raw?.hprID ||
      raw?.professionalId ||
      'HPR-2024-00142',
    status,
    distance: raw?.distance || '2.5 km',
    recommended: Boolean(raw?.recommended || raw?.isPreferred),
    reasons: Array.isArray(raw?.reasons)
      ? raw.reasons
      : raw?.recommendationReasons || ['Primary assigned doctor'],
  };
}

export default function WorkerDashboard({
  navigate,
  isOffline,
  onSOS,
  activeSosAlert,
}: Props) {
  const [patients, setPatients] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [onDutyDoctors, setOnDutyDoctors] = useState<Doctor[]>(
    DEFAULT_DOCTORS
  );

  const [isLive, setIsLive] = useState(false);
  const [search, setSearch] = useState('');
  const [sosConfirm, setSosConfirm] = useState(false);
  const [sosSent, setSosSent] = useState(false);
  const [selectedDoctorId, setSelectedDoctorId] = useState('doc1');
  const [selectionMode, setSelectionMode] =
    useState<'smart' | 'manual'>('smart');
  const [countdown, setCountdown] = useState(90);
  const [activeSosId, setActiveSosId] = useState<string | null>(null);
  const [liveSosStatus, setLiveSosStatus] = useState<any>(null);
  const [dbUser, setDbUser] = useState<any>(null);

  const today = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  useEffect(() => {
    let mounted = true;

    getCurrentUser()
      .then((result: any) => {
        if (!mounted) return;

        const user = result?.user || result?.data?.user || result;

        if (user) {
          setDbUser(user);
        }
      })
      .catch(() => {
        if (mounted) {
          setDbUser(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const fetchDoctorsRoster = async () => {
    try {
      const docs = await getDoctors();
      if (Array.isArray(docs) && docs.length > 0) {
        setOnDutyDoctors(docs.map((doc, index) => normalizeDoctor(doc, index)));
      }
    } catch {
      // Keep existing roster on fetch error
    }
  };

  useEffect(() => {
    fetchDoctorsRoster();
  }, []);

  useEffect(() => {
    let mounted = true;

    if (isOffline) {
      setIsLive(false);
      return () => {
        mounted = false;
      };
    }

    getWorkerDashboardData()
      .then((result: any) => {
        if (!mounted) return;

        const data =
          result?.data ||
          result?.dashboard ||
          result ||
          {};

        if (data?.stats) {
          setDashboardStats(data.stats);
        }

        const apiPatients = safeArray<any>(data?.patients);
        const apiReferrals = safeArray<any>(
          data?.pendingReferrals || data?.referrals
        );
        const apiDoctors = safeArray<any>(
          data?.onDutyDoctors || data?.doctors
        );

        if (apiPatients.length > 0) {
          setPatients(apiPatients);
        }

        if (apiReferrals.length > 0) {
          setReferrals(apiReferrals);
        }

        if (apiDoctors.length > 0) {
          setOnDutyDoctors(
            apiDoctors.map((doctor, index) =>
              normalizeDoctor(doctor, index)
            )
          );
        }

        setIsLive(true);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setIsLive(false);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isOffline]);

  const highRisk = patients.filter((p: any) => {
    const risk = String(p?.riskLevel || '').toLowerCase();

    return risk === 'high' || risk === 'critical';
  });

  const pendingReferrals = referrals.filter(
    (r: any) =>
      String(r?.status || '').toLowerCase() === 'pending'
  );

  const normalizedSearch = search.trim().toLowerCase();

  const filtered = normalizedSearch
    ? patients.filter((p: any) => {
        const name = String(p?.name || '').toLowerCase();
        const id = String(p?.id || '').toLowerCase();

        return (
          name.includes(normalizedSearch) ||
          id.includes(normalizedSearch)
        );
      })
    : patients.slice(0, 4);

  const workerName =
    dbUser?.fullName?.trim() ||
    dbUser?.workerProfile?.name?.trim() ||
    dbUser?.name?.trim() ||
    'there';

  const workerFirstName =
    workerName.split(/\s+/)[0] || 'there';

  const workerVillage =
    dbUser?.workerProfile?.village ||
    dbUser?.workerProfile?.villageName ||
    dbUser?.village ||
    'Village Health Centre';

  const workerFacility =
    dbUser?.workerProfile?.facility ||
    dbUser?.workerProfile?.facilityName ||
    dbUser?.facility ||
    'Rural Health Centre';

  const selectedDoctor =
    onDutyDoctors.find(
      doctor => doctor.id === selectedDoctorId
    ) ||
    onDutyDoctors[0] ||
    DEFAULT_DOCTORS[0];

  const recommendedDoctor =
    onDutyDoctors.find(doctor => doctor.recommended) ||
    selectedDoctor;

  // 5s Live Polling for SOS escalation status
  useEffect(() => {
    if (!activeSosId || !sosSent) return;

    let isMounted = true;
    const pollStatus = async () => {
      try {
        const data = await getSosAlertStatus(activeSosId);
        if (isMounted && data) {
          setLiveSosStatus(data);
          if (typeof data.secondsRemaining === 'number') {
            setCountdown(data.secondsRemaining);
          }
        }
      } catch (err) {
        console.warn('Polling SOS status error:', err);
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeSosId, sosSent]);

  // Sync active SOS from global state/backend
  useEffect(() => {
    if (activeSosAlert) {
      setSosSent(true);
      if (activeSosAlert.id && !activeSosId) {
        setActiveSosId(activeSosAlert.id);
      }
    }
  }, [activeSosAlert]);

  // Local second-by-second decrement for smooth UI countdown
  useEffect(() => {
    if (!sosSent) return;

    const timer = setInterval(() => {
      setCountdown(current => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [sosSent]);

  const formatCountdown = (seconds: number) =>
    `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
      seconds % 60
    ).padStart(2, '0')}`;

  const sosStatus =
    liveSosStatus?.status?.toLowerCase() ||
    activeSosAlert?.status ||
    'sent';

  const escalationLevel =
    liveSosStatus?.escalationIndex ??
    activeSosAlert?.escalationLevel ??
    0;

  const simulatedStep = sosSent
    ? Math.min(
        2,
        Math.floor((90 - countdown) / 12) + 1
      )
    : 0;

  const currentStep =
    sosStatus === 'acknowledged' ||
    sosStatus === 'declined'
      ? 3
      : simulatedStep;

  const statusSteps = [
    'SOS Sent',
    'Doctor Notified',
    'Awaiting Ack.',
    sosStatus === 'acknowledged'
      ? 'Acknowledged ✓'
      : escalationLevel > 0
        ? 'Escalating…'
        : 'Response',
  ];

  const escalationChain = [
    {
      label:
        recommendedDoctor?.name ||
        'On-duty Doctor',
      sub:
        `${recommendedDoctor?.facility || 'Primary facility'} · ${
          recommendedDoctor?.specialty || 'Medical Officer'
        }`,
    },
    ...DEFAULT_ESCALATION_CHAIN.slice(1),
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {sosConfirm && !sosSent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh]">

            <div className="bg-red-600 px-6 py-5 rounded-t-3xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center shrink-0">
                  <Icon
                    name="alert"
                    size={22}
                    className="text-white"
                  />
                </div>

                <div>
                  <h3 className="font-display text-lg font-bold text-white">
                    Send Emergency SOS
                  </h3>

                  <p className="text-red-200 text-xs">
                    Select responding doctor and confirm
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-5">

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Select Responding Doctor
                </div>

                <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
                  <button
                    onClick={() =>
                      setSelectionMode('smart')
                    }
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectionMode === 'smart'
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-gray-500'
                    }`}
                  >
                    Smart Recommendation
                  </button>

                  <button
                    onClick={() =>
                      setSelectionMode('manual')
                    }
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      selectionMode === 'manual'
                        ? 'bg-white text-brand-700 shadow-sm'
                        : 'text-gray-500'
                    }`}
                  >
                    Manual Selection
                  </button>
                </div>

                {selectionMode === 'smart' && (
                  <div className="rounded-2xl border-2 border-brand-400 bg-brand-50 p-4">
                    <div className="flex items-start gap-3">

                      <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {String(
                          recommendedDoctor?.name ||
                            'Doctor'
                        )
                          .replace(/^Dr\.\s*/i, '')
                          .split(' ')
                          .map(word => word[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-900">
                            {recommendedDoctor?.name ||
                              'On-duty Doctor'}
                          </span>

                          <HPRBadge compact />

                          <DutyStatusBadge
                            status={
                              recommendedDoctor?.status ||
                              'available'
                            }
                          />
                        </div>

                        <div className="text-xs text-gray-600 mt-0.5">
                          {recommendedDoctor?.specialty ||
                            'Medical Officer'}{' '}
                          ·{' '}
                          {recommendedDoctor?.facility ||
                            'Nearby Facility'}
                        </div>

                        <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                          {recommendedDoctor?.hprId ||
                            'HPR-PENDING'}{' '}
                          ·{' '}
                          {recommendedDoctor?.distance ||
                            'Nearby'}
                        </div>

                        <div className="flex flex-wrap gap-1 mt-2">
                          {(
                            recommendedDoctor?.reasons ||
                            []
                          ).map(reason => (
                            <span
                              key={reason}
                              className="px-2 py-0.5 bg-white border border-brand-200 text-brand-700 rounded-full text-[10px] font-medium"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="px-2 py-1 bg-brand-600 text-white text-[9px] font-bold rounded-lg shrink-0">
                        RECOMMENDED
                      </div>
                    </div>

                    <p className="text-[10px] text-brand-600 mt-3 border-t border-brand-200 pt-2">
                      RuralCare selects based on duty roster and
                      specialty. HPR confirms doctor identity via
                      ABDM — physical presence confirmed by
                      acknowledgement.
                    </p>
                  </div>
                )}

                {selectionMode === 'manual' && (
                  <div className="space-y-2">
                    {onDutyDoctors.map(doc => (
                      <button
                        key={doc.id}
                        onClick={() =>
                          doc.status !== 'offline' &&
                          setSelectedDoctorId(doc.id)
                        }
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all ${
                          selectedDoctorId === doc.id
                            ? 'border-brand-400 bg-brand-50'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        } ${
                          doc.status === 'offline'
                            ? 'opacity-40'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">

                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                              selectedDoctorId === doc.id
                                ? 'bg-brand-600 text-white'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {String(doc.name)
                              .replace(/^Dr\.\s*/i, '')
                              .split(' ')
                              .map(word => word[0])
                              .join('')
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-900">
                                {doc.name}
                              </span>

                              {doc.recommended && (
                                <span className="text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">
                                  RECOMMENDED
                                </span>
                              )}
                            </div>

                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {doc.specialty} ·{' '}
                              {doc.distance}
                            </div>

                            <div className="flex items-center gap-1.5 mt-1">
                              <HPRBadge compact />
                              <DutyStatusBadge
                                status={doc.status}
                              />
                            </div>
                          </div>

                          {selectedDoctorId === doc.id && (
                            <div className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center shrink-0">
                              <Icon
                                name="check"
                                size={11}
                                className="text-white"
                              />
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <ABDMLayerLegend />

              {isOffline && (
                <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                  <Icon
                    name="wifi_off"
                    size={13}
                    className="text-amber-600 shrink-0"
                  />

                  <p className="text-xs text-amber-800">
                    SOS stored locally — transmitted when
                    connectivity is restored.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={() =>
                    setSosConfirm(false)
                  }
                  className="py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>

                <button
                  onClick={async () => {
                    try {
                      const activePt = patients.length > 0 ? patients[0] : null;
                      const res = await dispatchSosAlert({
                        fromName: dbUser?.fullName || 'ASHA Sunita Yadav',
                        role: 'ASHA Worker',
                        patientHealthId: activePt?.healthId || 'RHC-2026-8F4K92',
                        location: activePt?.village ? `${activePt.village} Sector` : 'Lunkaransar Sector 4',
                        targetedDoctorId: selectedDoctor?.id,
                        vitalsSnapshot: {
                          pulse: '118 bpm',
                          bp: '85/55 mmHg',
                          spo2: '91%',
                        },
                      });
                      if (res?.id) {
                        setActiveSosId(res.id);
                        setLiveSosStatus(res);
                        if (typeof res.secondsRemaining === 'number') {
                          setCountdown(res.secondsRemaining);
                        }
                      }
                    } catch (e) {
                      console.warn('Backend SOS dispatch failed, falling back to local state:', e);
                    }
                    onSOS();
                    setSosSent(true);
                    setSosConfirm(false);
                  }}
                  className="py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl text-sm transition-colors"
                >
                  Send SOS
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {sosSent && (
        <div className="rounded-2xl border border-red-200 bg-red-50 overflow-hidden">

          <div className="px-5 py-4 border-b border-red-100">
            <div className="flex items-center justify-between mb-3">

              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />

                <span className="font-display font-bold text-red-800 text-sm">
                  Emergency SOS Active
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (activeSosId) {
                      try {
                        await cancelSosAlert(activeSosId);
                      } catch (e) {
                        console.warn('Cancel SOS error:', e);
                      }
                    }
                    setSosSent(false);
                    setActiveSosId(null);
                    setLiveSosStatus(null);
                  }}
                  className="px-2.5 py-1 bg-white border border-red-200 hover:bg-red-100 text-red-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                >
                  <Icon name="x" size={12} />
                  Cancel SOS
                </button>
              </div>

            </div>

            <div className="flex items-start gap-1">
              {statusSteps.map((label, i) => {
                const done = i < currentStep;

                const active =
                  i === currentStep &&
                  sosStatus !== 'acknowledged';

                const ack =
                  sosStatus === 'acknowledged' &&
                  i === 3;

                return (
                  <div
                    key={i}
                    className="flex items-center flex-1 min-w-0"
                  >
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">

                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          done || ack
                            ? 'bg-green-500 text-white'
                            : active
                              ? 'bg-red-500 text-white'
                              : 'bg-gray-200 text-gray-400'
                        }`}
                      >
                        {done || ack
                          ? '✓'
                          : active
                            ? '⟳'
                            : i + 1}
                      </div>

                      <span
                        className={`text-[9px] text-center leading-tight font-medium px-0.5 ${
                          done || ack
                            ? 'text-green-700'
                            : active
                              ? 'text-red-700'
                              : 'text-gray-400'
                        }`}
                      >
                        {label}
                      </span>
                    </div>

                    {i < 3 && (
                      <div
                        className={`h-px w-3 shrink-0 mt-[-10px] ${
                          done
                            ? 'bg-green-400'
                            : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* Live Escalation Banner Text */}
            <div className="p-3 bg-red-100/70 border border-red-300 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                <span className="text-xs font-bold text-red-900">
                  {liveSosStatus?.status === 'ACCEPTED'
                    ? `✓ Accepted by ${liveSosStatus.acceptedBy || 'Attending Physician'} — Doctor Responding`
                    : liveSosStatus?.status === 'DECLINED_ALL' || liveSosStatus?.isControlRoom
                    ? `🚨 Control Room notified — Command Center dispatching ambulance & emergency team`
                    : countdown <= 0
                    ? `⚠️ Escalating to next physician on duty roster…`
                    : liveSosStatus?.hopNumber > 1
                    ? `⚠️ Escalating to ${liveSosStatus.currentResponderName} (${liveSosStatus.hopNumber} of ${liveSosStatus.totalHops})… ${formatCountdown(countdown)}`
                    : `🚨 Alerting ${liveSosStatus?.currentResponderName || selectedDoctor.name}… ${formatCountdown(countdown)}`}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-red-700 shrink-0 ml-2">
                {liveSosStatus?.status === 'ACCEPTED' ? 'LIVE' : formatCountdown(countdown)}
              </span>
            </div>

            {sosStatus === 'accepted' || sosStatus === 'acknowledged' ? (
              <div className="flex items-center gap-3 p-3 bg-green-100 border border-green-300 rounded-xl">
                <div className="w-9 h-9 bg-green-500 rounded-xl flex items-center justify-center shrink-0">
                  <Icon
                    name="check"
                    size={18}
                    className="text-white"
                  />
                </div>

                <div>
                  <div className="font-bold text-green-900 text-sm">
                    SOS Accepted — Doctor Responding
                  </div>

                  <div className="text-xs text-green-700">
                    {liveSosStatus?.acceptedBy || recommendedDoctor?.name || 'Assigned doctor'} is responding · {recommendedDoctor?.facility || workerFacility}
                  </div>
                </div>
              </div>
            ) : sosStatus === 'declined_all' || liveSosStatus?.isControlRoom ? (
              <div className="p-3 bg-red-600 text-white rounded-xl text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Icon name="shield" size={14} />
                  Hospital Control Room & EMS (108) Alerted
                </div>
                <div>All local on-duty doctors declined or timed out. District Command Center has taken over emergency dispatch.</div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                  <Icon
                    name="alert"
                    size={14}
                    className="shrink-0 mt-0.5 text-amber-600"
                  />
                  <span>
                    Alert active with 90-second response window. If the on-duty doctor does not acknowledge within 90 seconds, the system automatically advances to the next physician on the roster.
                  </span>
                </div>
              </div>
            )}

            {escalationLevel >= 2 && (
              <div className="flex items-start gap-2 p-3 bg-red-100 border border-red-300 rounded-xl text-xs text-red-800">
                <Icon
                  name="phone"
                  size={14}
                  className="shrink-0 mt-0.5"
                />

                <span>
                  <strong>
                    District Control Room alerted.
                  </strong>{' '}
                  Emergency operations have been
                  notified.
                </span>
              </div>
            )}

            <div>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Escalation Chain
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                {escalationChain.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 shrink-0 px-3 py-2 rounded-xl border text-xs transition-all ${
                      i === escalationLevel &&
                      sosStatus !== 'acknowledged'
                        ? 'border-red-400 bg-red-50'
                        : i < escalationLevel
                          ? 'border-gray-200 bg-gray-50 opacity-40'
                          : 'border-gray-100 bg-white opacity-50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        i === escalationLevel &&
                        sosStatus !== 'acknowledged'
                          ? 'bg-red-500 text-white animate-pulse'
                          : i < escalationLevel
                            ? 'bg-gray-300 text-gray-600'
                            : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {i + 1}
                    </div>

                    <div>
                      <div className="font-semibold text-gray-800 text-[11px] leading-tight">
                        {step.label}
                      </div>

                      <div className="text-[9px] text-gray-500 leading-tight">
                        {step.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}

      <div className="flex items-start justify-between">

        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="font-display text-2xl font-bold text-gray-900">
              Good morning, {workerFirstName}
            </h1>
            <span className="px-2.5 py-0.5 bg-brand-50 text-brand-700 border border-brand-200 rounded-lg text-xs font-bold uppercase">
              {dbUser?.workerProfile?.workerType || 'ASHA'}
            </span>
            <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
              {dbUser?.workerProfile?.workerCode || 'ASHA-2026'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {dbUser?.workerProfile?.status || 'ACTIVE'}
            </span>
          </div>

          <p className="text-sm text-gray-500 mt-0.5">
            {today} · {workerVillage} {dbUser?.workerProfile?.subCentre ? `· Sub-Centre: ${dbUser.workerProfile.subCentre}` : ''} {dbUser?.workerProfile?.assignedPhc ? `· PHC: ${dbUser.workerProfile.assignedPhc}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">

          {isOffline && (
            <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-semibold flex items-center gap-2">
              <Icon name="wifi_off" size={14} />
              OFFLINE
            </div>
          )}

          <button
            onClick={() => setSosConfirm(true)}
            className="relative flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 active:scale-95 text-white font-bold rounded-xl transition-all text-sm shadow-lg shadow-red-200"
          >
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-400 rounded-full animate-ping" />

            <Icon name="alert" size={16} />

            SOS
          </button>

        </div>
      </div>

      <Card>
        <div className="px-4 pt-4 pb-2">
          <SectionHeader
            title="On-Duty Doctors · Facility Roster"
            sub={`${workerFacility} & nearby facilities — Live doctor availability`}
            action={
              <button
                onClick={fetchDoctorsRoster}
                className="flex items-center gap-1.5 text-xs text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 font-semibold px-2.5 py-1.5 rounded-xl transition-colors border border-brand-200"
                title="Refresh availability from database"
              >
                <Icon name="sync" size={12} />
                Refresh Roster
              </button>
            }
          />
        </div>

        <div className="px-4 pb-4 space-y-2">

          {onDutyDoctors.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-400">
              No on-duty doctors available right now.
            </div>
          ) : (
            onDutyDoctors.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors"
              >

                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                    doc.status === 'available'
                      ? 'bg-green-100 text-green-800'
                      : doc.status === 'busy'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {String(doc.name)
                    .replace(/^Dr\.\s*/i, '')
                    .split(' ')
                    .map(word => word[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">
                      {doc.name}
                    </span>

                    <HPRBadge compact />

                    {doc.recommended && (
                      <span className="text-[9px] bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded font-bold">
                        PREFERRED
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-500 mt-0.5">
                    {doc.specialty} · {doc.facility}
                  </div>

                  <div className="text-[10px] font-mono text-gray-400">
                    {doc.hprId}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <DutyStatusBadge status={doc.status} />

                  <span className="text-[10px] text-gray-400">
                    {doc.distance}
                  </span>
                </div>

              </div>
            ))
          )}

          <ABDMLayerLegend className="mt-2" />
        </div>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {[
          {
            label: 'Register Patient',
            icon: 'plus',
            screen: 'register-patient',
            color:
              'bg-brand-600 text-white hover:bg-brand-700',
          },
          {
            label: 'New Assessment',
            icon: 'clipboard',
            screen: 'health-assessment',
            color:
              'bg-brand-50 text-brand-700 hover:bg-brand-100 border border-brand-200',
          },
          {
            label: 'Search Patient',
            icon: 'search',
            screen: 'patient-profile',
            color:
              'bg-gray-100 text-gray-700 hover:bg-gray-200',
          },
          {
            label: isOffline
              ? 'Sync Pending'
              : 'Sync Center',
            icon: 'sync',
            screen: 'sync',
            color: isOffline
              ? 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
          },
        ].map(action => (
          <button
            key={action.screen}
            onClick={() =>
              navigate(action.screen)
            }
            className={`p-4 rounded-2xl flex flex-col items-center gap-2 text-center transition-all active:scale-95 font-medium text-sm ${action.color}`}
          >
            <Icon
              name={action.icon}
              size={20}
            />

            {action.label}
          </button>
        ))}

      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

        <StatCard
          label="Today's Consultations"
          value={String(dashboardStats?.todayConsultations ?? 0)}
          sub="Recorded today"
          icon="clipboard"
          color="brand"
          trend="up"
        />

        <StatCard
          label="Registered Patients"
          value={String(dashboardStats?.registeredPatients ?? patients.length ?? 0)}
          sub="Live sector coverage"
          icon="users"
          color="green"
          trend="up"
        />

        <StatCard
          label="Pending Follow-ups"
          value={String(dashboardStats?.pendingFollowUps ?? 0)}
          sub="Under monitoring"
          icon="history"
          color="amber"
        />

        <StatCard
          label="High-risk Patients"
          value={String(dashboardStats?.highRiskCount ?? highRisk.length ?? 0)}
          sub="Need urgent review"
          icon="alert"
          color="red"
        />

      </div>

      <div className="relative">

        <Icon
          name="search"
          size={16}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
        />

        <input
          value={search}
          onChange={e =>
            setSearch(e.target.value)
          }
          placeholder="Search by name or Health ID (e.g. RHC-2026-...)"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="lg:col-span-2">

          <Card>

            <div className="px-4 pt-4 pb-2">
              <SectionHeader
                title="Recent Patients"
                sub={
                  search
                    ? `Showing results for "${search}"`
                    : 'Last visited'
                }
              />
            </div>

            <div className="divide-y divide-gray-50">

              {filtered.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  {loading ? 'Loading assigned patients from PostgreSQL…' : 'No patients found'}
                </div>
              ) : (
                filtered.map((patient: any, index) => (
                  <PatientRow
                    key={
                      patient?.id ||
                      `patient-${index}`
                    }
                    patient={patient}
                    onClick={() =>
                      navigate(
                        'patient-profile',
                        patient?.id
                      )
                    }
                  />
                ))
              )}

            </div>

            {!search && (
              <div className="px-4 py-3 border-t border-gray-50">
                <button
                  onClick={() =>
                    navigate('patient-profile')
                  }
                  className="text-sm text-brand-600 font-medium hover:underline"
                >
                  View all patients →
                </button>
              </div>
            )}

          </Card>

        </div>

        <div className="space-y-4">

          <Card className="border-red-100">

            <div className="px-4 pt-4">
              <SectionHeader
                title="High-risk Alerts"
                sub="Require immediate attention"
              />
            </div>

            <div className="px-4 pb-4 space-y-3">

              {highRisk.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No high-risk patients.
                </p>
              ) : (
                highRisk.map((patient: any, index) => (
                  <button
                    key={
                      patient?.id ||
                      `risk-${index}`
                    }
                    onClick={() =>
                      navigate(
                        'patient-profile',
                        patient?.id
                      )
                    }
                    className="w-full text-left flex items-center gap-3 p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                  >

                    <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {String(
                        patient?.name ||
                          'Patient'
                      )
                        .split(' ')
                        .map(word => word[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">

                      <div className="text-sm font-medium text-gray-900 truncate">
                        {patient?.name ||
                          'Unknown Patient'}
                      </div>

                      <div className="flex items-center gap-1 mt-0.5">
                        <RiskBadge
                          level={
                            patient?.riskLevel ||
                            'high'
                          }
                          size="sm"
                        />
                      </div>

                    </div>
                  </button>
                ))
              )}

            </div>
          </Card>

          <Card>

            <div className="px-4 pt-4">
              <SectionHeader title="Pending Referrals" />
            </div>

            <div className="px-4 pb-4 space-y-3">

              {pendingReferrals.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  No pending referrals
                </p>
              ) : (
                pendingReferrals.map(
                  (referral: any, index) => (
                    <button
                      key={
                        referral?.id ||
                        `referral-${index}`
                      }
                      onClick={() =>
                        navigate('referral')
                      }
                      className="w-full text-left p-3 rounded-xl border border-gray-100 hover:border-brand-200 hover:bg-brand-50 transition-colors"
                    >

                      <div className="flex items-center justify-between mb-1">

                        <span className="text-sm font-medium text-gray-900">
                          {referral?.patientName ||
                            referral?.patient?.name ||
                            'Patient'}
                        </span>

                        <PriorityBadge
                          priority={
                            referral?.priority ||
                            'routine'
                          }
                        />
                      </div>

                      <div className="text-xs text-gray-500 truncate">
                        {referral?.toPHC ||
                          referral?.toFacility?.name ||
                          referral?.facility ||
                          'Health Facility'}
                      </div>

                      <div className="flex items-center gap-2 mt-1">

                        <RiskBadge
                          level={
                            referral?.riskLevel ||
                            referral?.patient?.riskLevel ||
                            'moderate'
                          }
                          size="sm"
                        />

                        <ReferralBadge
                          status={
                            referral?.status ||
                            'pending'
                          }
                        />

                      </div>

                    </button>
                  )
                )
              )}

              <button
                onClick={() =>
                  navigate('referral')
                }
                className="text-sm text-brand-600 font-medium hover:underline"
              >
                View all referrals →
              </button>

            </div>
          </Card>

          <div
            className={`rounded-2xl p-4 flex items-center justify-between ${
              isOffline
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-green-50 border border-green-100'
            }`}
          >

            <div>

              <div
                className={`text-sm font-semibold ${
                  isOffline
                    ? 'text-amber-800'
                    : 'text-green-800'
                }`}
              >
                {isOffline
                  ? 'Offline — 4 pending'
                  : isLive
                    ? 'All synced ✓'
                    : 'Connected'}
              </div>

              <div
                className={`text-xs mt-0.5 ${
                  isOffline
                    ? 'text-amber-600'
                    : 'text-green-600'
                }`}
              >
                {isLive
                  ? 'Live data from PostgreSQL'
                  : 'Using available local data'}
              </div>

            </div>

            <button
              onClick={() => navigate('sync')}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                isOffline
                  ? 'bg-amber-400 text-amber-900 hover:bg-amber-500'
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {isOffline
                ? 'Retry'
                : 'Details'}
            </button>

          </div>

        </div>
      </div>

      <Card>

        <div className="px-4 pt-4">
          <SectionHeader
            title="Today's Schedule"
            sub={today}
            action={
              <button
                onClick={() =>
                  navigate('health-assessment')
                }
                className="text-xs text-brand-600 font-medium hover:underline"
              >
                + New Assessment
              </button>
            }
          />
        </div>

        <div className="overflow-x-auto">

          <table className="w-full text-sm">

            <thead>
              <tr className="border-b border-gray-100">

                {[
                  'Time',
                  'Patient',
                  'Village',
                  'Purpose',
                  'Risk',
                  'Status',
                ].map(header => (
                  <th
                    key={header}
                    className="px-4 py-2 text-left text-xs font-medium text-gray-500"
                  >
                    {header}
                  </th>
                ))}

              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">

              {[
                {
                  time: '08:20 AM',
                  name: 'Mohan Lal',
                  village: 'Deshnok',
                  purpose: 'Emergency Assessment',
                  risk: 'critical' as const,
                  status: 'Referred',
                },
                {
                  time: '09:40 AM',
                  name: 'Ramesh Kumar',
                  village: 'Khetolai',
                  purpose: 'Chest pain evaluation',
                  risk: 'critical' as const,
                  status: 'Referred',
                },
                {
                  time: '10:15 AM',
                  name: 'Priya Devi',
                  village: 'Govindpur',
                  purpose: 'Anaemia follow-up',
                  risk: 'moderate' as const,
                  status: 'Completed',
                },
                {
                  time: '11:30 AM',
                  name: 'Kavita Sharma',
                  village: 'Churi Ajitgarh',
                  purpose: 'Routine check-up',
                  risk: 'low' as const,
                  status: 'Completed',
                },
                {
                  time: '02:00 PM',
                  name: 'Anita Meena',
                  village: 'Govindpur',
                  purpose: 'Vaccination',
                  risk: 'low' as const,
                  status: 'Scheduled',
                },
              ].map((row, index) => (
                <tr
                  key={index}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() =>
                    navigate('patient-profile')
                  }
                >

                  <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                    {row.time}
                  </td>

                  <td className="px-4 py-2.5 font-medium text-gray-900">
                    {row.name}
                  </td>

                  <td className="px-4 py-2.5 text-gray-500 text-xs">
                    {row.village}
                  </td>

                  <td className="px-4 py-2.5 text-gray-600 text-xs">
                    {row.purpose}
                  </td>

                  <td className="px-4 py-2.5">
                    <RiskBadge
                      level={row.risk}
                      size="sm"
                    />
                  </td>

                  <td className="px-4 py-2.5">

                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded ${
                        row.status === 'Completed'
                          ? 'bg-green-50 text-green-700'
                          : row.status === 'Referred'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.status}
                    </span>

                  </td>

                </tr>
              ))}

            </tbody>
          </table>

        </div>
      </Card>

    </div>
  );
}