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
  getMchDueList,
  updateMchMilestone,
  createMchRecord,
} from '../api/client';
import type { MchDueAlertItem, MchRecord } from '../types';

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

  // MCH Lifecycle & Immunization Tracker Tab State
  const [activeTab, setActiveTab] = useState<'overview' | 'mch'>('overview');
  const [mchVillage, setMchVillage] = useState<string>('Govindpur');
  const [mchFilter, setMchFilter] = useState<'all' | 'overdue' | 'due' | 'maternal' | 'child' | 'hrp'>('all');
  const [mchSearch, setMchSearch] = useState<string>('');
  const [mchDueItems, setMchDueItems] = useState<MchDueAlertItem[]>([]);
  const [mchRecords, setMchRecords] = useState<MchRecord[]>([]);
  const [mchStats, setMchStats] = useState<any>({
    totalBeneficiaries: 5,
    overdueCount: 3,
    dueThisWeekCount: 4,
    highRiskCount: 3,
    maternalDueCount: 4,
    childDueCount: 3,
  });
  const [mchLoading, setMchLoading] = useState(false);
  const [completingItem, setCompletingItem] = useState<MchDueAlertItem | null>(null);
  const [administerForm, setAdministerForm] = useState({
    completedDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    administeredBy: 'Meena Kumari (ASHA)',
    facilityName: 'PHC Lunkaransar',
    batchNumber: '',
    vitals: { bp: '110/70', weight: '52', hb: '9.0' },
    notes: '',
  });
  const [isRegisteringMch, setIsRegisteringMch] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    patientName: '',
    patientPhone: '',
    patientAge: '24',
    village: 'Govindpur',
    pregnancyStatus: 'PREGNANT' as 'PREGNANT' | 'POSTPARTUM',
    lmp: '',
    edd: '',
    isHighRisk: false,
    hrpIndicators: [] as string[],
    childName: '',
    childDob: '',
    childGender: 'Female',
    notes: '',
  });
  const [mchToast, setMchToast] = useState<string | null>(null);

  const fetchMch = async (targetVillage?: string) => {
    setMchLoading(true);
    try {
      const v = targetVillage !== undefined ? targetVillage : mchVillage;
      const res = await getMchDueList({ village: v });
      if (res) {
        setMchDueItems(res.dueItems || []);
        setMchRecords(res.records || []);
        if (res.stats) setMchStats(res.stats);
      }
    } catch {
      // client handles fallback
    } finally {
      setMchLoading(false);
    }
  };

  useEffect(() => {
    fetchMch(mchVillage);
  }, [mchVillage]);

  const handleConfirmAdminister = async () => {
    if (!completingItem) return;
    try {
      await updateMchMilestone(completingItem.recordId, completingItem.milestoneCode, {
        status: 'completed',
        completedDate: administerForm.completedDate,
        administeredBy: administerForm.administeredBy,
        facilityName: administerForm.facilityName,
        batchNumber: administerForm.batchNumber || `LOT-${Date.now().toString().slice(-5)}`,
        notes: administerForm.notes,
        vitals: administerForm.vitals,
      });

      setMchDueItems(prev => prev.filter(i => i.id !== completingItem.id));
      setMchStats((prev: any) => ({
        ...prev,
        overdueCount: completingItem.status === 'overdue' ? Math.max(0, prev.overdueCount - 1) : prev.overdueCount,
        dueThisWeekCount: completingItem.status === 'due' ? Math.max(0, prev.dueThisWeekCount - 1) : prev.dueThisWeekCount,
      }));

      setMchToast(`✓ Recorded ${completingItem.milestoneName} for ${completingItem.patientName}!`);
      setTimeout(() => setMchToast(null), 3500);
      setCompletingItem(null);
    } catch {
      setMchToast('Recorded in local database.');
      setTimeout(() => setMchToast(null), 3000);
      setCompletingItem(null);
    }
  };

  const handleCreateBeneficiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.patientName) return;

    let computedEdd = registerForm.edd;
    if (!computedEdd && registerForm.lmp) {
      const lmpDate = new Date(registerForm.lmp);
      if (!isNaN(lmpDate.getTime())) {
        lmpDate.setDate(lmpDate.getDate() + 280);
        computedEdd = lmpDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      }
    }

    try {
      await createMchRecord({
        patientId: `pat-${Date.now()}`,
        patientName: registerForm.patientName,
        patientPhone: registerForm.patientPhone,
        patientVillage: registerForm.village,
        pregnancyStatus: registerForm.pregnancyStatus,
        lmp: registerForm.lmp,
        edd: computedEdd,
        isHighRisk: registerForm.isHighRisk || registerForm.hrpIndicators.length > 0,
        hrpIndicators: registerForm.hrpIndicators,
        childName: registerForm.childName,
        childDob: registerForm.childDob,
        childGender: registerForm.childGender,
        assignedVillage: registerForm.village,
        assignedWorkerName: dbUser?.fullName || 'Meena Kumari (ASHA)',
      });

      setMchToast(`✓ Enrolled ${registerForm.patientName} into MCH Lifecycle Tracker!`);
      setTimeout(() => setMchToast(null), 3500);
      setIsRegisteringMch(false);
      setRegisterForm({
        patientName: '',
        patientPhone: '',
        patientAge: '24',
        village: 'Govindpur',
        pregnancyStatus: 'PREGNANT',
        lmp: '',
        edd: '',
        isHighRisk: false,
        hrpIndicators: [],
        childName: '',
        childDob: '',
        childGender: 'Female',
        notes: '',
      });
      fetchMch(mchVillage);
    } catch {
      setIsRegisteringMch(false);
    }
  };

  const handleSendReminder = (item: MchDueAlertItem) => {
    setMchToast(`📱 Reminder dispatched to ${item.patientName} (${item.phone || '94141...'}): "${item.milestoneName} is ${item.status === 'overdue' ? 'OVERDUE' : 'due on ' + item.dueDate}. Please visit VHND at Anganwadi!"`);
    setTimeout(() => setMchToast(null), 4500);
  };

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

      {/* Toast Notification */}
      {mchToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-xl flex items-center gap-2 border border-gray-700 animate-in fade-in duration-200">
          <Icon name="check" size={15} className="text-emerald-400 shrink-0" />
          <span>{mchToast}</span>
        </div>
      )}

      {/* Main Tab Navigation */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200 gap-1.5 shadow-2xs">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
          }`}
        >
          <Icon name="dashboard" size={16} />
          <span>Clinical Overview & Consultations</span>
        </button>

        <button
          onClick={() => setActiveTab('mch')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer relative ${
            activeTab === 'mch'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-200'
              : 'text-gray-600 hover:text-gray-900 hover:bg-white/40'
          }`}
        >
          <span className="text-sm">🤰</span>
          <span>MCH & Immunization Due List</span>
          {mchStats?.overdueCount > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                activeTab === 'mch'
                  ? 'bg-white text-rose-700'
                  : 'bg-rose-100 text-rose-700 border border-rose-200 animate-pulse'
              }`}
            >
              🚨 {mchStats.overdueCount} Overdue
            </span>
          )}
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* MCH Weekly Alert Banner (on Overview tab) */}
          {mchStats?.overdueCount > 0 && (
            <div className="p-4 bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border border-rose-200 rounded-3xl flex items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                  <Icon name="alert" size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-700">
                      Weekly MCH Action Alert · Week of Sept 15–21, 2026
                    </span>
                    <span className="px-2 py-0.5 bg-rose-200 text-rose-900 rounded-full text-[10px] font-black">
                      {mchStats.overdueCount} OVERDUE
                    </span>
                  </div>
                  <div className="text-sm font-bold text-gray-900 mt-0.5">
                    {mchStats.overdueCount} immunization doses overdue & {mchStats.dueThisWeekCount} visits due this week in {workerVillage || 'Govindpur'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('mch')}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shrink-0 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm shadow-rose-200"
              >
                <span>Review Due List</span>
                <Icon name="chevron_right" size={14} />
              </button>
            </div>
          )}

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
  )}

  {/* ─── TAB 2: MCH & Immunization Due List ─── */}
  {activeTab === 'mch' && (
    <div className="space-y-6">
      {/* Hero Banner with Week Info & Village Filter */}
      <div className="bg-gradient-to-br from-rose-700 via-rose-600 to-pink-700 text-white rounded-3xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-white/10 pointer-events-none blur-xl" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-rose-400/20 pointer-events-none blur-lg" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-bold text-rose-100 mb-2">
              <span className="w-2 h-2 rounded-full bg-rose-200 animate-ping" />
              RMNCH+A Automated Lifecycle Tracker · National Health Mission
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-black tracking-tight">
              MCH & Immunization Due List
            </h2>
            <p className="text-rose-100 text-xs sm:text-sm mt-1">
              Automated tracking of upcoming & overdue vaccines and maternal checkups for{' '}
              <span className="font-bold text-white underline decoration-rose-300 underline-offset-2">
                Week of Sept 15–21, 2026
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsRegisteringMch(true)}
              className="px-4 py-2.5 bg-white hover:bg-rose-50 text-rose-800 text-xs sm:text-sm font-extrabold rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Icon name="plus" size={16} />
              <span>Enroll Mother / Child</span>
            </button>

            <button
              onClick={() => fetchMch(mchVillage)}
              className="p-2.5 bg-white/20 hover:bg-white/30 text-white rounded-2xl transition-all cursor-pointer"
              title="Refresh Due List"
            >
              <Icon name="sync" size={16} />
            </button>
          </div>
        </div>

        {/* Village Selector Pills */}
        <div className="relative z-10 mt-5 pt-4 border-t border-rose-400/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Icon name="map_pin" size={14} className="text-rose-200" />
            <span className="font-bold text-rose-100">Assigned Village:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'Govindpur', label: 'Govindpur (My Village)' },
              { id: 'Khetolai', label: 'Khetolai' },
              { id: 'Deshnok', label: 'Deshnok' },
              { id: 'All', label: 'All Villages' },
            ].map(v => (
              <button
                key={v.id}
                onClick={() => {
                  setMchVillage(v.id);
                  fetchMch(v.id);
                }}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all cursor-pointer ${
                  mchVillage.toLowerCase() === v.id.toLowerCase()
                    ? 'bg-white text-rose-800 shadow-sm'
                    : 'bg-rose-800/40 text-rose-100 hover:bg-rose-800/60'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-red-50 border border-red-200/80 rounded-3xl p-4.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-700 uppercase tracking-wider">Overdue Doses</span>
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div className="font-display text-3xl font-black text-red-900 mt-2">
            {mchStats?.overdueCount ?? 0}
          </div>
          <div className="text-[11px] text-red-700 font-medium mt-0.5">
            Urgent home visits required
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200/80 rounded-3xl p-4.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Due This Week</span>
            <Icon name="history" size={15} className="text-amber-600" />
          </div>
          <div className="font-display text-3xl font-black text-amber-900 mt-2">
            {mchStats?.dueThisWeekCount ?? 0}
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
            Scheduled for Wednesday VHND
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200/80 rounded-3xl p-4.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-800 uppercase tracking-wider">High-Risk (HRP)</span>
            <Icon name="shield" size={15} className="text-purple-600" />
          </div>
          <div className="font-display text-3xl font-black text-purple-900 mt-2">
            {mchStats?.highRiskCount ?? 0}
          </div>
          <div className="text-[11px] text-purple-700 font-medium mt-0.5">
            Severe anaemia & high-risk care
          </div>
        </div>

        <div className="bg-emerald-50 border border-emerald-200/80 rounded-3xl p-4.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Active Beneficiaries</span>
            <Icon name="users" size={15} className="text-emerald-600" />
          </div>
          <div className="font-display text-3xl font-black text-emerald-900 mt-2">
            {mchStats?.totalBeneficiaries ?? 0}
          </div>
          <div className="text-[11px] text-emerald-700 font-medium mt-0.5">
            Mothers & infants in {mchVillage}
          </div>
        </div>
      </div>

      {/* Filter Chips Bar & Search */}
      <div className="bg-white border border-gray-200 rounded-2xl p-3 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Filter Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: `All Alerts (${mchDueItems.length})` },
              { id: 'overdue', label: `🚨 Overdue (${mchDueItems.filter(i => i.status === 'overdue').length})` },
              { id: 'due', label: `📅 Due This Week (${mchDueItems.filter(i => i.status === 'due').length})` },
              { id: 'maternal', label: '🤰 Maternal (ANC/TT/IFA)' },
              { id: 'child', label: '👶 Child Immunizations' },
              { id: 'hrp', label: '⚠️ High-Risk Only' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setMchFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  mchFilter === f.id
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative min-w-[220px]">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={mchSearch}
              onChange={e => setMchSearch(e.target.value)}
              placeholder="Search mother, baby, ID..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>
        </div>
      </div>

      {/* Due List Cards */}
      <div className="space-y-3">
        {(() => {
          const normalizedSearch = mchSearch.trim().toLowerCase();
          const filtered = mchDueItems.filter(item => {
            if (mchVillage.toLowerCase() !== 'all' && item.village?.toLowerCase() !== mchVillage.toLowerCase()) {
              return false;
            }
            if (mchFilter === 'overdue' && item.status !== 'overdue') return false;
            if (mchFilter === 'due' && item.status !== 'due') return false;
            if (mchFilter === 'maternal' && item.category !== 'maternal') return false;
            if (mchFilter === 'child' && item.category !== 'child') return false;
            if (mchFilter === 'hrp' && !item.isHighRisk) return false;
            if (normalizedSearch) {
              const matchName = item.patientName?.toLowerCase().includes(normalizedSearch);
              const matchMilestone = item.milestoneName?.toLowerCase().includes(normalizedSearch);
              const matchHealthId = item.healthId?.toLowerCase().includes(normalizedSearch);
              const matchChild = item.childName ? item.childName.toLowerCase().includes(normalizedSearch) : false;
              if (!matchName && !matchMilestone && !matchHealthId && !matchChild) return false;
            }
            return true;
          });

          if (mchLoading) {
            return (
              <div className="p-8 text-center bg-white border border-gray-100 rounded-3xl text-sm text-gray-400">
                Loading MCH schedule from database…
              </div>
            );
          }

          if (filtered.length === 0) {
            return (
              <div className="p-10 text-center bg-white border border-gray-100 rounded-3xl space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-xl font-bold">
                  ✓
                </div>
                <div className="text-sm font-bold text-gray-900">All caught up! No due items matching this filter</div>
                <p className="text-xs text-gray-400 max-w-sm mx-auto">
                  All mothers and children in this village have completed scheduled doses or have no overdue alerts for this selection.
                </p>
              </div>
            );
          }

          return filtered.map(item => {
            const isOverdue = item.status === 'overdue';

            return (
              <div
                key={item.id}
                className={`rounded-3xl p-5 border transition-all shadow-2xs hover:shadow-sm ${
                  isOverdue
                    ? 'bg-red-50/40 border-red-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Identity & Milestone info */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl shrink-0 font-bold shadow-2xs ${
                        item.category === 'maternal'
                          ? 'bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-blue-100 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {item.category === 'maternal' ? '🤰' : '👶'}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Badges Row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                            item.category === 'maternal'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {item.category === 'maternal' ? 'Maternal Care' : 'Child Immunization'}
                        </span>

                        {isOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-600 text-white shadow-xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            OVERDUE ({item.daysOverdue ? `${item.daysOverdue} days` : 'Immediate'})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            DUE THIS WEEK ({item.dueDate})
                          </span>
                        )}

                        {item.isHighRisk && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                            ⚠️ High-Risk Pregnancy (HRP)
                          </span>
                        )}
                      </div>

                      {/* Beneficiary Name & Details */}
                      <h3 className="font-display text-base font-bold text-gray-900">
                        {item.patientName}
                        {item.childName && (
                          <span className="text-gray-500 font-medium text-xs ml-1.5">
                            · Child: {item.childName} {item.childAge ? `(${item.childAge})` : ''}
                          </span>
                        )}
                      </h3>

                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-gray-600 font-semibold">{item.healthId}</span>
                        <span>·</span>
                        <span>{item.village}</span>
                        {item.gestationalWeeks && (
                          <>
                            <span>·</span>
                            <span className="text-rose-700 font-semibold">{item.gestationalWeeks} Weeks Pregnant</span>
                          </>
                        )}
                        {item.phone && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{item.phone}</span>
                          </>
                        )}
                      </div>

                      {/* HRP Indicators */}
                      {item.hrpIndicators && item.hrpIndicators.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {item.hrpIndicators.map((hrp: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-purple-100/70 border border-purple-200 text-purple-900 rounded-lg text-[10px] font-bold"
                            >
                              {hrp}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Due Milestone Card Box */}
                      <div className="mt-3 p-3 bg-white/90 border border-gray-200 rounded-2xl flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 shrink-0 mt-0.5 font-bold text-xs">
                          {item.milestoneCode.startsWith('ANC') ? '🩺' : item.milestoneCode.startsWith('IFA') ? '💊' : '💉'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-gray-900">
                            {item.milestoneName}
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            Recommended timing: <span className="font-semibold text-gray-700">{item.recommendedWeekOrAge || 'Scheduled date'}</span> · Due on: <span className="font-bold text-gray-800">{item.dueDate}</span>
                          </div>
                          {item.notes && (
                            <div className="text-[10px] text-gray-600 mt-1 italic">
                              Guidance: {item.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex flex-row md:flex-col items-center md:items-end gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-200">
                    <button
                      onClick={() => {
                        setCompletingItem(item);
                        setAdministerForm({
                          completedDate: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
                          administeredBy: dbUser?.fullName || 'Meena Kumari (ASHA)',
                          facilityName: workerFacility || 'PHC Lunkaransar',
                          batchNumber: '',
                          vitals: { bp: '110/70', weight: '52', hb: '9.0' },
                          notes: '',
                        });
                      }}
                      className="flex-1 md:flex-none px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Icon name="check" size={14} />
                      <span>Mark Administered</span>
                    </button>

                    <button
                      onClick={() => handleSendReminder(item)}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                      title="Dispatch automated SMS/WhatsApp alert"
                    >
                      <span>💬 Send Reminder</span>
                    </button>

                    {item.phone && (
                      <a
                        href={`tel:${item.phone.replace(/\s+/g, '')}`}
                        className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors flex items-center justify-center"
                        title="Call Beneficiary"
                      >
                        <Icon name="phone" size={14} />
                      </a>
                    )}

                    <button
                      onClick={() => navigate('patient-profile', item.patientId)}
                      className="text-[11px] text-brand-600 hover:underline font-semibold cursor-pointer hidden md:block mt-1"
                    >
                      View Full Profile →
                    </button>
                  </div>
                </div>
              </div>
            );
          });
        })()}
      </div>
    </div>
  )}

  {/* ─── Modal 1: Mark Milestone Administered / Completed ─── */}
  {completingItem && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Icon name="check" size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-gray-900">Record Administration</h3>
              <p className="text-[11px] text-gray-500">MCH Milestone · Official Immunization Record</p>
            </div>
          </div>
          <button
            onClick={() => setCompletingItem(null)}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-2xl">
          <div className="text-xs font-bold text-emerald-950">{completingItem.milestoneName}</div>
          <div className="text-[11px] text-emerald-800 mt-0.5">
            Beneficiary: <span className="font-bold">{completingItem.patientName}</span> ({completingItem.healthId})
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Date Given</label>
              <input
                value={administerForm.completedDate}
                onChange={e => setAdministerForm({ ...administerForm, completedDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Batch / Vial #</label>
              <input
                placeholder="e.g. VAC-2026-B9"
                value={administerForm.batchNumber}
                onChange={e => setAdministerForm({ ...administerForm, batchNumber: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Administered By</label>
            <input
              value={administerForm.administeredBy}
              onChange={e => setAdministerForm({ ...administerForm, administeredBy: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Health Facility / Location</label>
            <input
              value={administerForm.facilityName}
              onChange={e => setAdministerForm({ ...administerForm, facilityName: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {completingItem.category === 'maternal' && (
            <div className="grid grid-cols-3 gap-2 p-3 bg-gray-50 border border-gray-100 rounded-xl">
              <div>
                <span className="block text-[9px] font-bold text-gray-400 uppercase">Blood Pressure</span>
                <input
                  value={administerForm.vitals.bp}
                  onChange={e => setAdministerForm({ ...administerForm, vitals: { ...administerForm.vitals, bp: e.target.value } })}
                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono mt-1"
                />
              </div>
              <div>
                <span className="block text-[9px] font-bold text-gray-400 uppercase">Weight (kg)</span>
                <input
                  value={administerForm.vitals.weight}
                  onChange={e => setAdministerForm({ ...administerForm, vitals: { ...administerForm.vitals, weight: e.target.value } })}
                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono mt-1"
                />
              </div>
              <div>
                <span className="block text-[9px] font-bold text-gray-400 uppercase">Hb (g/dL)</span>
                <input
                  value={administerForm.vitals.hb}
                  onChange={e => setAdministerForm({ ...administerForm, vitals: { ...administerForm.vitals, hb: e.target.value } })}
                  className="w-full px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-mono mt-1"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Clinical Notes / Findings</label>
            <textarea
              rows={2}
              placeholder="Record maternal vitals, adverse reaction checks, or counseling points..."
              value={administerForm.notes}
              onChange={e => setAdministerForm({ ...administerForm, notes: e.target.value })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none text-xs"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={() => setCompletingItem(null)}
            className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirmAdminister}
            className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-200 transition-all cursor-pointer"
          >
            Confirm & Record Dose
          </button>
        </div>
      </div>
    </div>
  )}

  {/* ─── Modal 2: Enroll New Mother / Child ─── */}
  {isRegisteringMch && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
              🤰
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-gray-900">Enroll MCH Beneficiary</h3>
              <p className="text-[11px] text-gray-500">Auto-schedules RMNCH+A ANC & Immunization roadmap</p>
            </div>
          </div>
          <button
            onClick={() => setIsRegisteringMch(false)}
            className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleCreateBeneficiary} className="space-y-3.5 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mother's Full Name *</label>
              <input
                required
                placeholder="e.g. Geeta Devi"
                value={registerForm.patientName}
                onChange={e => setRegisterForm({ ...registerForm, patientName: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 font-medium"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mobile Number *</label>
              <input
                required
                placeholder="e.g. 98290 12345"
                value={registerForm.patientPhone}
                onChange={e => setRegisterForm({ ...registerForm, patientPhone: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-400 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Village</label>
              <select
                value={registerForm.village}
                onChange={e => setRegisterForm({ ...registerForm, village: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="Govindpur">Govindpur</option>
                <option value="Khetolai">Khetolai</option>
                <option value="Deshnok">Deshnok</option>
                <option value="Lunkaransar">Lunkaransar</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Pregnancy Status</label>
              <select
                value={registerForm.pregnancyStatus}
                onChange={e => setRegisterForm({ ...registerForm, pregnancyStatus: e.target.value as any })}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-rose-400"
              >
                <option value="PREGNANT">Currently Pregnant</option>
                <option value="POSTPARTUM">Delivered / Postpartum Infant</option>
              </select>
            </div>
          </div>

          {registerForm.pregnancyStatus === 'PREGNANT' ? (
            <div className="p-3.5 bg-rose-50/50 border border-rose-100 rounded-2xl space-y-2.5">
              <div className="text-[11px] font-bold text-rose-900">Pregnancy Dates & Estimated Due Date</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Last Menstrual Period (LMP)</label>
                  <input
                    type="date"
                    value={registerForm.lmp}
                    onChange={e => {
                      const lmpVal = e.target.value;
                      let autoEdd = '';
                      if (lmpVal) {
                        const d = new Date(lmpVal);
                        d.setDate(d.getDate() + 280);
                        autoEdd = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                      }
                      setRegisterForm({ ...registerForm, lmp: lmpVal, edd: autoEdd });
                    }}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Estimated Due Date (EDD)</label>
                  <input
                    placeholder="e.g. 15 Nov 2026"
                    value={registerForm.edd}
                    onChange={e => setRegisterForm({ ...registerForm, edd: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-2.5">
              <div className="text-[11px] font-bold text-blue-900">Child / Newborn Details</div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Baby Name</label>
                  <input
                    placeholder="Baby of..."
                    value={registerForm.childName}
                    onChange={e => setRegisterForm({ ...registerForm, childName: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={registerForm.childDob}
                    onChange={e => setRegisterForm({ ...registerForm, childDob: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Gender</label>
                  <select
                    value={registerForm.childGender}
                    onChange={e => setRegisterForm({ ...registerForm, childGender: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-xl text-xs"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* High-Risk Pregnancy (HRP) Indicators */}
          <div className="p-3.5 bg-purple-50/50 border border-purple-100 rounded-2xl space-y-2">
            <div className="text-[11px] font-bold text-purple-900 flex items-center justify-between">
              <span>High-Risk Indicators (HRP Checklist)</span>
              <span className="text-[10px] text-purple-700 font-normal">Select applicable risks</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                'Severe Anaemia (Hb < 9)',
                'Gestational Hypertension',
                'Gestational Diabetes',
                'Previous Caesarean (LSCS)',
                'Young Primigravida (< 20)',
                'Twin / Multiple Pregnancy',
              ].map(hrp => {
                const isChecked = registerForm.hrpIndicators.includes(hrp);
                return (
                  <label key={hrp} className="flex items-center gap-1.5 text-[11px] text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        const next = isChecked
                          ? registerForm.hrpIndicators.filter(x => x !== hrp)
                          : [...registerForm.hrpIndicators, hrp];
                        setRegisterForm({ ...registerForm, hrpIndicators: next, isHighRisk: next.length > 0 });
                      }}
                      className="rounded text-rose-600 focus:ring-rose-400"
                    />
                    <span>{hrp}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsRegisteringMch(false)}
              className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs shadow-md shadow-rose-200 transition-all cursor-pointer"
            >
              Enroll & Generate Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  )}

    </div>
  );
}