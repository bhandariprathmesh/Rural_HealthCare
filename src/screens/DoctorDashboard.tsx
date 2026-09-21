import { useState, useEffect, useCallback, useMemo } from "react";

import {
  StatCard,
  RiskBadge,
  PriorityBadge,
  ReferralBadge,
  Card,
  SectionHeader,
  Icon,
  HPRBadge,
  HFRBadge,
  ABDMLayerLegend,
} from "../components/shared";

import {
  getDoctorDashboardData,
  updateDoctorDutyStatus,
  getCurrentUser,
  getDoctorAppointments,
  updateAppointmentStatus,
  updateDoctorSlotCapacity,
} from "../api/client";
import PhcStockCheckerModal from "../components/PhcStockCheckerModal";

interface SOSAlert {
  id: string
  from: string
  role: string
  patientId: string
  location: string

  ts: string
  offline: boolean
  dismissed: boolean

  status: "sent" | "notified" | "awaiting" | "acknowledged" | "declined" | "escalated"

  escalationLevel: number
}

interface Props {
  navigate: (s: string, patientId?: string, roomId?: string) => void
  sosAlerts?: SOSAlert[]
  onDismissSOS?: (id: string) => void
  onAcknowledgeSOS?: (id: string) => void
  onDeclineSOS?: (id: string) => void
}

type DutyStatus = "available" | "busy" | "offline"

const STATUS_OPTIONS: {
  value: DutyStatus
  label: string
  sub: string
  dot: string
  bg: string
  text: string
  border: string
}[] = [
  {
    value: "available",
    label: "Available",
    sub: "Accepting patients & SOS",
    dot: "bg-green-500",
    bg: "bg-green-50",
    text: "text-green-800",
    border: "border-green-300",
  },
  {
    value: "busy",
    label: "Busy",
    sub: "In consultation — limited",
    dot: "bg-amber-500",
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-300",
  },
  {
    value: "offline",
    label: "Off Duty",
    sub: "Not available for SOS",
    dot: "bg-gray-400",
    bg: "bg-gray-50",
    text: "text-gray-700",
    border: "border-gray-300",
  },
];

export default function DoctorDashboard({
  navigate,
  sosAlerts = [],
  onDismissSOS,
  onAcknowledgeSOS,
  onDeclineSOS,
}: Props) {
  const [patients, setPatients] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [followUps, setFollowUps] = useState<any[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [quickLookupId, setQuickLookupId] = useState("");
  const [myStatus, setMyStatus] = useState<DutyStatus>("available");
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbUser, setDbUser] = useState<any>(null);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [patientCallStatus, setPatientCallStatus] = useState<Record<string, 'available' | 'ringing' | 'active' | 'missed' | 'offline'>>({});

  const [dashboardStats, setDashboardStats] = useState<any>(null)

  const [referralFilter, setReferralFilter] =
    useState<"all" | "pending" | "accepted" | "in-consultation">("all")

  // OPD Queue & Appointment states

  const [activeTab, setActiveTab] =
    useState<"opd" | "referrals" | "patients" | "consultations">("opd")

  const [opdAppointments, setOpdAppointments] = useState<any[]>([])

  const [opdLoading, setOpdLoading] = useState(false)

  const [opdDate, setOpdDate] = useState<string>(
    () => new Date().toISOString().split("T")[0],
  )

  const [opdFilter, setOpdFilter] =
    useState<"all" | "waiting" | "in-progress" | "completed">("all")

  const [callingPatientId, setCallingPatientId] = useState<string | null>(null)

  const [queueNotice, setQueueNotice] = useState<string | null>(null)

  // Slot Capacity & Limits State
  const [slotCapacity, setSlotCapacity] = useState<number>(3)
  const [tempCapacity, setTempCapacity] = useState<number>(3)
  const [showCapacityModal, setShowCapacityModal] = useState(false)
  const [capacitySaving, setCapacitySaving] = useState(false)
  const [capacitySuccessMsg, setCapacitySuccessMsg] = useState<string | null>(null)

  const loadAppointments = useCallback(
    (targetDocId?: string, targetDate?: string) => {
      const id = targetDocId || doctorId || dbUser?.doctorProfile?.id
      if (!id) return
      setOpdLoading(true)
      getDoctorAppointments(id, targetDate || opdDate)
        .then((list) => {
          if (Array.isArray(list)) {
            setOpdAppointments(list)
          }
        })
        .catch((err) => console.error("Failed to load appointments", err))
        .finally(() => setOpdLoading(false))
    },
    [doctorId, dbUser, opdDate],
  )

  async function handleSaveCapacity() {
    const docId = doctorId || dbUser?.doctorProfile?.id
    if (!docId) return
    setCapacitySaving(true)
    try {
      await updateDoctorSlotCapacity(docId, tempCapacity)
      setSlotCapacity(tempCapacity)
      setCapacitySuccessMsg(`Slot capacity updated to ${tempCapacity} patients per slot.`)
      setTimeout(() => {
        setCapacitySuccessMsg(null)
        setShowCapacityModal(false)
      }, 1200)
    } catch (e: any) {
      console.error("Failed to update slot capacity", e)
    } finally {
      setCapacitySaving(false)
    }
  }

  const slotOccupancies = useMemo(() => {
    const STANDARD_SLOTS = [
      "09:00 AM - 09:30 AM",
      "09:30 AM - 10:00 AM",
      "10:00 AM - 10:30 AM",
      "10:30 AM - 11:00 AM",
      "11:00 AM - 11:30 AM",
      "11:30 AM - 12:00 PM",
      "02:00 PM - 02:30 PM",
      "02:30 PM - 03:00 PM",
      "03:00 PM - 03:30 PM",
      "03:30 PM - 04:00 PM",
    ]

    return STANDARD_SLOTS.map((slot) => {
      const booked = opdAppointments.filter(
        (a) => a.timeSlot === slot && a.status !== "CANCELLED",
      ).length
      const isFull = booked >= slotCapacity
      const almostFull = booked === slotCapacity - 1 && slotCapacity > 1
      return {
        slot,
        booked,
        capacity: slotCapacity,
        isFull,
        almostFull,
      }
    })
  }, [opdAppointments, slotCapacity])

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`${protocol}//${host}:5000/teleconsultation`);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'consultation:active' && data.patientId) {
          setPatientCallStatus((prev) => ({ ...prev, [data.patientId]: 'active' }));
        } else if (data.type === 'consultation:missed' && data.patientId) {
          setPatientCallStatus((prev) => ({ ...prev, [data.patientId]: 'missed' }));
        } else if (data.type === 'consultation:end' && data.sessionId) {
          setPatientCallStatus((prev) => {
            const next = { ...prev };
            for (const k in next) {
              if (next[k] === 'ringing' || next[k] === 'active') {
                next[k] = 'available';
              }
            }
            return next;
          });
        }
      } catch {}
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, []);

  useEffect(() => {
    setLoading(true)
    getCurrentUser()
      .then((user) => {
        setDbUser(user)
        const docId = user?.doctorProfile?.id
        if (docId) {
          setDoctorId(docId)
          getDoctorAppointments(docId, opdDate)
            .then((list) => {
              if (Array.isArray(list)) setOpdAppointments(list)
            })
            .catch(() => {})
        }

        getDoctorDashboardData(docId)
          .then((data) => {
            if (data) {
              if (data.stats) setDashboardStats(data.stats)
              if (data.patients) setPatients(data.patients)
              const refs = data.referrals || data.pendingReferrals
              if (refs) setReferrals(refs)
              if (data.consultations) setConsultations(data.consultations)
              if (data.followUps) setFollowUps(data.followUps)
              if (data.doctor) {
                setDoctorId(data.doctor.id)
                if (data.doctor.dutyStatus)
                  setMyStatus(data.doctor.dutyStatus.toLowerCase() as DutyStatus)
                if (data.doctor.slotCapacity) {
                  setSlotCapacity(data.doctor.slotCapacity)
                  setTempCapacity(data.doctor.slotCapacity)
                }
              }
              setIsLive(true)
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false))
      })
      .catch(() => {
        getDoctorDashboardData()
          .then((data) => {
            if (data?.referrals) setReferrals(data.referrals)
          })
          .catch(() => {})
          .finally(() => setLoading(false))
      })
  }, []) // Run ONCE on mount

  // Refresh appointments only when date changes
  useEffect(() => {
    const id = doctorId || dbUser?.doctorProfile?.id
    if (id) {
      loadAppointments(id, opdDate)
    }
  }, [opdDate])

  function handleStatusChange(status: DutyStatus) {
    setMyStatus(status)

    setStatusPickerOpen(false)

    const targetDoctorId = doctorId || dbUser?.doctorProfile?.id || dbUser?.id

    if (targetDoctorId) {
      updateDoctorDutyStatus(targetDoctorId, status.toUpperCase() as any).catch(
        () => {},
      )
    }
  }

  const handleUpdateApptStatus = async (
    appointmentId: string,

    status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",

    patientNavId?: string,
  ) => {
    try {
      await updateAppointmentStatus(appointmentId, status)

      loadAppointments(doctorId, opdDate)

      if (status === "IN_PROGRESS" && patientNavId) {
        navigate("doctor-patient-view", patientNavId)
      }
    } catch (err) {
      console.error("Failed to update appointment status", err)
    }
  }

  const handleCallNextPatient = async () => {
    const waitingList = opdAppointments

      .filter((a) => a.status === "CONFIRMED" || a.status === "PENDING")

      .sort((a, b) => {
        const prioWeight: Record<string, number> = {
          HIGH_RISK: 0,
          URGENT: 1,
          ROUTINE: 2,
        }

        const pDiff =
          (prioWeight[a.priority] ?? 9) - (prioWeight[b.priority] ?? 9)

        if (pDiff !== 0) return pDiff

        return (a.tokenNumber || 0) - (b.tokenNumber || 0)
      })

    if (waitingList.length === 0) {
      setQueueNotice(
        "No patients currently waiting in OPD queue for this date.",
      )

      setTimeout(() => setQueueNotice(null), 4000)

      return
    }

    const next = waitingList[0]

    setCallingPatientId(next.id)

    try {
      await updateAppointmentStatus(next.id, "IN_PROGRESS")

      loadAppointments(doctorId, opdDate)

      const pTarget =
        next.patient?.healthId || next.patient?.id || next.patientId

      navigate("doctor-patient-view", pTarget)
    } catch (e) {
      console.error("Error calling next patient", e)
    } finally {
      setCallingPatientId(null)
    }
  }

  function handleQuickLookup() {
    const q = quickLookupId.trim()

    if (!q) return

    navigate("doctor-patient-view", q)
  }

  const isMock = !isLive

  const displayReferrals = referrals.filter((r) => {
    const s = String(r.status || "")
      .toLowerCase()
      .replace(/_/g, "-")

    if (referralFilter === "all")
      return s === "pending" || s === "accepted" || s === "in-consultation"

    return s === referralFilter
  })

  const criticalPatients = patients.filter(
    (p: any) => p.riskLevel === "critical" || p.riskLevel === "high",
  )

  const filteredPatientsList = patients.filter((p: any) => {
    if (!search.trim()) return true

    const q = search.trim().toLowerCase()

    return (
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.healthId && p.healthId.toLowerCase().includes(q)) ||
      (p.phone && p.phone.includes(q)) ||
      (p.village && p.village.toLowerCase().includes(q))
    )
  })

  const doctorName = dbUser?.fullName || "Doctor"

  const doctorProfile = dbUser?.doctorProfile

  const handleStartConsultation = (p: any) => {
    const pId = p.healthId || p.id;
    const cleanId = String(pId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
    const sessionId = `tc-${cleanId}-${Date.now().toString(36)}`;

    setPatientCallStatus((prev) => ({ ...prev, [pId]: 'ringing' }));

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`${protocol}//${host}:5000/teleconsultation`);

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: 'consultation:start',
          sessionId,
          patientId: pId,
          doctorId: dbUser?.doctorProfile?.id || dbUser?.id || doctorId || 'doc-1',
          doctorName: dbUser?.doctorProfile?.name || dbUser?.fullName || 'Dr. rushi pansare',
          facilityName: dbUser?.doctorProfile?.facility?.name || 'PHC Lunkaransar Tele-Clinic',
          role: 'doctor',
        })
      );
    };

    // 30-second timeout: if no accept, mark as MISSED
    setTimeout(() => {
      setPatientCallStatus((prev) => {
        if (prev[pId] === 'ringing') {
          return { ...prev, [pId]: 'missed' };
        }
        return prev;
      });
    }, 30000);

    navigate('teleconsultation', pId, sessionId);
  };

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="font-display text-2xl font-bold text-gray-900">
              {doctorName}
            </h1>
            <HPRBadge id={doctorProfile?.hprId || "HPR-PENDING"} />
            <div className="relative">
              <button
                onClick={() => setStatusPickerOpen((o) => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-xs font-semibold transition-colors ${STATUS_OPTIONS.find((s) => s.value === myStatus)!.bg} ${STATUS_OPTIONS.find((s) => s.value === myStatus)!.text} ${STATUS_OPTIONS.find((s) => s.value === myStatus)!.border} hover:opacity-80`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_OPTIONS.find((s) => s.value === myStatus)!.dot} ${
                    myStatus === "available" ? "animate-pulse" : ""
                  }`}
                />
                {STATUS_OPTIONS.find((s) => s.value === myStatus)!.label}
                <Icon
                  name="chevron_down"
                  size={11}
                  className={`transition-transform ${
                    statusPickerOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {statusPickerOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-56 bg-white border border-gray-200 rounded-2xl shadow-lg z-20 overflow-hidden">
                  <div className="px-3 pt-3 pb-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Set Your Availability
                  </div>
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => handleStatusChange(opt.value)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left ${
                        myStatus === opt.value ? "bg-gray-50" : ""
                      }`}
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${opt.dot}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-gray-900">
                          {opt.label}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {opt.sub}
                        </div>
                      </div>
                      {myStatus === opt.value && (
                        <Icon
                          name="check"
                          size={14}
                          className="text-brand-600 shrink-0"
                        />
                      )}
                    </button>
                  ))}
                  <div className="px-3 py-2 border-t border-gray-100">
                    <p className="text-[9px] text-gray-400">
                      Status is visible to ASHA workers and used for SOS
                      routing. Logged in audit trail.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm text-gray-500">
              {doctorProfile?.facility?.name || "PHC / Hospital"} ·{" "}
              {doctorProfile?.specialty || "General Medicine"} ·{" "}
              {new Date().toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            <HFRBadge
              id={doctorProfile?.facility?.hfrId || "HFR-PENDING"}
              compact
            />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStockModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Icon name="pill" size={13} className="text-emerald-700" />
            PHC Stock
          </button>
          <button
            onClick={() => navigate("doctor-sos-inbox")}
            className="flex items-center gap-1.5 px-3 py-2 bg-red-100 hover:bg-red-200 text-red-800 border border-red-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <span className="w-2 h-2 rounded-full bg-red-600 animate-pulse" />
            SOS Inbox
          </button>
          <div className="px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-700 font-semibold flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            PHC Staff Mode
          </div>
          <button
            onClick={() => navigate("emergency-access")}
            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors"
          >
            <Icon name="alert" size={13} />
            Emergency Access
          </button>
        </div>
      </div>

      <ABDMLayerLegend />

      {sosAlerts.length > 0 && (
        <div className="space-y-3">
          {sosAlerts.map((sos) => (
            <div
              key={sos.id}
              className={`rounded-2xl shadow-lg overflow-hidden ${
                sos.status === "acknowledged"
                  ? "shadow-green-200"
                  : "shadow-red-200"
              }`}
            >
              <div
                className={`flex items-start gap-3 px-4 py-4 ${
                  sos.status === "acknowledged"
                    ? "bg-green-600"
                    : "bg-red-600 animate-pulse"
                } text-white`}
              >
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    sos.status === "acknowledged"
                      ? "bg-green-500"
                      : "bg-red-500"
                  }`}
                >
                  <Icon
                    name={sos.status === "acknowledged" ? "check" : "alert"}
                    size={20}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-base">
                    {sos.status === "acknowledged"
                      ? "✓ SOS ACKNOWLEDGED — You are Responding"
                      : "🚨 EMERGENCY SOS RECEIVED"}
                  </div>
                  <div className="text-red-100 text-xs mt-0.5">
                    <strong>{sos.from}</strong> · {sos.ts} · {sos.location}
                  </div>
                  <div className="font-mono text-xs text-red-200 mt-0.5">
                    {sos.patientId}
                  </div>
                  {sos.offline && (
                    <div className="text-xs text-red-200 mt-0.5">
                      ⚠ Transmitted from offline device — GPS approximate
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white border-x border-b border-red-100 rounded-b-2xl px-4 py-3 space-y-3">
                <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl">
                  <Icon
                    name="info"
                    size={13}
                    className="text-amber-600 shrink-0 mt-0.5"
                  />
                  <p className="text-[10px] text-amber-800">
                    <strong>HPR verifies doctor identity.</strong> RuralCare
                    shows duty status. Being listed as on-duty does not
                    guarantee physical presence — your acceptance confirms you
                    are actively responding.
                  </p>
                </div>

                {sos.status === "acknowledged" ? (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => navigate("emergency-access")}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <Icon name="clipboard" size={14} />
                      Open Emergency Access
                    </button>
                    <button
                      onClick={() => onDismissSOS?.(sos.id)}
                      className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs transition-colors"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        onAcknowledgeSOS?.(sos.id)
                        navigate("emergency-access")
                      }}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                    >
                      <Icon name="check" size={14} />
                      ACCEPT — RESPOND
                    </button>
                    <button
                      onClick={() => onDeclineSOS?.(sos.id)}
                      className="flex-1 py-2.5 bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700 border border-gray-200 hover:border-red-200 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
                    >
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
        <StatCard
          label="Active OPD Queue"
          value={String(
            opdAppointments.filter(
              (a) => a.status === "CONFIRMED" || a.status === "PENDING",
            ).length,
          )}
          sub={`${opdAppointments.filter((a) => a.status === "COMPLETED").length} completed today`}
          icon="calendar"
          color="brand"
        />
        <StatCard
          label="New Referrals"
          value={displayReferrals.length}
          sub="Awaiting review"
          icon="share"
          color="amber"
        />
        <StatCard
          label="High-risk Cases"
          value={String(
            dashboardStats?.highRiskCount ?? criticalPatients.length ?? 0,
          )}
          sub="Under monitoring"
          icon="alert"
          color="red"
        />
        <StatCard
          label="Pending Follow-ups"
          value={String(
            dashboardStats?.pendingFollowUps ?? followUps.length ?? 0,
          )}
          sub={
            followUps.length > 0
              ? `${followUps.length} scheduled`
              : "No follow-ups yet"
          }
          icon="history"
          color="purple"
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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search patient by name or Health ID"
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto">
            <button
              onClick={() => setActiveTab("opd")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === "opd"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon name="calendar" size={15} />
              <span>Active OPD Queue</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === "opd"
                    ? "bg-white/20 text-white"
                    : "bg-brand-100 text-brand-800"
                }`}
              >
                {
                  opdAppointments.filter(
                    (a) => a.status !== "CANCELLED" && a.status !== "COMPLETED",
                  ).length
                }
              </span>
            </button>

            <button
              onClick={() => setActiveTab("referrals")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === "referrals"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon name="share" size={15} />
              <span>Referrals Queue</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === "referrals"
                    ? "bg-white/20 text-white"
                    : "bg-amber-100 text-amber-800"
                }`}
              >
                {displayReferrals.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("patients")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === "patients"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon name="users" size={15} />
              <span>All Patients</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === "patients"
                    ? "bg-white/20 text-white"
                    : "bg-gray-200 text-gray-700"
                }`}
              >
                {filteredPatientsList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab("consultations")}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shrink-0 ${
                activeTab === "consultations"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Icon name="clipboard" size={15} />
              <span>Consultations</span>
            </button>
          </div>

          {/* TAB 1: ACTIVE OPD QUEUE */}
          {activeTab === "opd" && (
            <Card>
              <div className="p-4 border-b border-gray-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display font-bold text-gray-900 text-base">
                        Active OPD Queue & Appointments
                      </h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
                        {
                          opdAppointments.filter(
                            (a) =>
                              a.status === "CONFIRMED" ||
                              a.status === "PENDING",
                          ).length
                        }{" "}
                        Waiting
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Triaged by AI Risk Priority (HIGH_RISK → URGENT → ROUTINE)
                      & Daily OPD Token
                    </p>
                  </div>

                  <div className="flex items-center flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setTempCapacity(slotCapacity)
                        setShowCapacityModal(true)
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 rounded-xl text-xs font-bold transition-colors border border-teal-200 cursor-pointer shadow-2xs"
                      title="Configure Patient Capacity per OPD Slot"
                    >
                      <Icon name="settings" size={13} />
                      <span>Capacity: {slotCapacity}/slot</span>
                    </button>
                    <input
                      type="date"
                      value={opdDate}
                      onChange={(e) => setOpdDate(e.target.value)}
                      className="px-2.5 py-1.5 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500 bg-white"
                    />
                    <button
                      onClick={handleCallNextPatient}
                      disabled={callingPatientId !== null}
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
                    >
                      <Icon name="bell" size={14} />
                      <span>Call Next Patient</span>
                    </button>
                  </div>
                </div>

                {/* Live Slot Capacity & Occupancy Overview Card */}
                <div className="mt-3.5 p-3 bg-gradient-to-r from-teal-50/80 via-teal-50/40 to-white rounded-xl border border-teal-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon name="clock" size={13} className="text-teal-700" />
                      <span className="text-xs font-bold text-gray-800">OPD Slot Occupancy ({opdDate})</span>
                      <span className="text-[10px] text-gray-500 font-medium">(Max {slotCapacity} patients per slot)</span>
                    </div>
                    <button
                      onClick={() => {
                        setTempCapacity(slotCapacity)
                        setShowCapacityModal(true)
                      }}
                      className="text-[11px] text-teal-700 hover:text-teal-900 font-bold hover:underline cursor-pointer"
                    >
                      Change Limit
                    </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {slotOccupancies.map((s) => (
                      <div
                        key={s.slot}
                        className={`px-2.5 py-1.5 rounded-lg border shrink-0 text-center min-w-[105px] transition-all ${
                          s.isFull
                            ? "bg-red-50/90 border-red-200 text-red-800"
                            : s.almostFull
                            ? "bg-amber-50/90 border-amber-200 text-amber-800"
                            : s.booked > 0
                            ? "bg-teal-50/90 border-teal-200 text-teal-800"
                            : "bg-white border-gray-200 text-gray-600"
                        }`}
                      >
                        <p className="text-[10px] font-bold truncate">{s.slot.split(" - ")[0]}</p>
                        <div className="mt-0.5 flex items-center justify-center gap-1">
                          <span className="text-xs font-extrabold">{s.booked}</span>
                          <span className="text-[10px] text-gray-400">/</span>
                          <span className="text-[10px] font-medium text-gray-500">{s.capacity}</span>
                          {s.isFull ? (
                            <span className="ml-1 text-[8px] font-black uppercase text-red-600 bg-red-100 px-1 rounded">
                              Full
                            </span>
                          ) : s.almostFull ? (
                            <span className="ml-1 text-[8px] font-bold uppercase text-amber-700 bg-amber-100 px-1 rounded">
                              1 left
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {queueNotice && (
                  <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center gap-2 animate-fadeIn">
                    <Icon
                      name="info"
                      size={14}
                      className="shrink-0 text-amber-600"
                    />
                    <span>{queueNotice}</span>
                  </div>
                )}

                {/* Filter pills */}
                <div className="flex gap-1.5 mt-3 overflow-x-auto">
                  {[
                    { id: "all", label: `All (${opdAppointments.length})` },

                    {
                      id: "waiting",
                      label: `Waiting (${opdAppointments.filter((a) => a.status === "CONFIRMED" || a.status === "PENDING").length})`,
                    },

                    {
                      id: "in-progress",
                      label: `In Consultation (${opdAppointments.filter((a) => a.status === "IN_PROGRESS").length})`,
                    },

                    {
                      id: "completed",
                      label: `Completed (${opdAppointments.filter((a) => a.status === "COMPLETED").length})`,
                    },
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setOpdFilter(f.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        opdFilter === f.id
                          ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200"
                          : "text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Appointment list */}
              <div className="divide-y divide-gray-100">
                {opdLoading ? (
                  <div className="p-8 text-center text-sm text-gray-500">
                    Loading live OPD token queue...
                  </div>
                ) : (
                  (() => {
                    const sorted = [...opdAppointments].sort((a, b) => {
                      const statusOrder: Record<string, number> = {
                        IN_PROGRESS: 0,

                        CONFIRMED: 1,

                        PENDING: 1,

                        COMPLETED: 2,

                        CANCELLED: 3,
                      }

                      const statusDiff =
                        (statusOrder[a.status] ?? 9) -
                        (statusOrder[b.status] ?? 9)

                      if (statusDiff !== 0) return statusDiff

                      const prioOrder: Record<string, number> = {
                        HIGH_RISK: 0,
                        URGENT: 1,
                        ROUTINE: 2,
                      }

                      const pDiff =
                        (prioOrder[a.priority] ?? 9) -
                        (prioOrder[b.priority] ?? 9)

                      if (pDiff !== 0) return pDiff

                      return (a.tokenNumber || 0) - (b.tokenNumber || 0)
                    })

                    const filtered = sorted.filter((a) => {
                      if (opdFilter === "waiting")
                        return (
                          a.status === "CONFIRMED" || a.status === "PENDING"
                        )

                      if (opdFilter === "in-progress")
                        return a.status === "IN_PROGRESS"

                      if (opdFilter === "completed")
                        return a.status === "COMPLETED"

                      return true
                    })

                    if (filtered.length === 0) {
                      return (
                        <div className="p-8 text-center">
                          <Icon
                            name="calendar"
                            size={32}
                            className="mx-auto text-gray-300 mb-2"
                          />
                          <p className="text-sm font-semibold text-gray-700">
                            No appointments in this view
                          </p>
                          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                            Appointments booked by patients via mobile or
                            scheduled by frontline ASHA workers for {opdDate}{" "}
                            will automatically appear here in live priority
                            order.
                          </p>
                        </div>
                      )
                    }

                    return filtered.map((appt) => {
                      const isCalling = callingPatientId === appt.id

                      const isCurrent = appt.status === "IN_PROGRESS"

                      const isDone = appt.status === "COMPLETED"

                      const isCancelled = appt.status === "CANCELLED"

                      return (
                        <div
                          key={appt.id}
                          className={`p-4 transition-colors ${
                            isCurrent
                              ? "bg-emerald-50/50 border-l-4 border-emerald-500"
                              : "hover:bg-gray-50/80"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                            {/* Left: Token Number & Patient Info */}
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              {/* Token Badge */}
                              <div
                                className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center shrink-0 border ${
                                  isCurrent
                                    ? "bg-emerald-600 text-white border-emerald-700 shadow-sm animate-pulse"
                                    : appt.priority === "HIGH_RISK"
                                      ? "bg-red-50 text-red-700 border-red-200"
                                      : appt.priority === "URGENT"
                                        ? "bg-amber-50 text-amber-800 border-amber-200"
                                        : "bg-brand-50 text-brand-700 border-brand-200"
                                }`}
                              >
                                <span className="text-[9px] font-bold uppercase tracking-wider opacity-80">
                                  Token
                                </span>
                                <span className="text-lg font-black leading-none">
                                  #{String(appt.tokenNumber).padStart(2, "0")}
                                </span>
                              </div>

                              {/* Details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="font-bold text-gray-900 text-sm">
                                    {appt.patient?.name || "Unknown Patient"}
                                  </span>

                                  {/* Priority badge */}
                                  {appt.priority === "HIGH_RISK" && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1">
                                      <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
                                      HIGH RISK
                                    </span>
                                  )}
                                  {appt.priority === "URGENT" && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      URGENT
                                    </span>
                                  )}
                                  {appt.priority === "ROUTINE" && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                      ROUTINE
                                    </span>
                                  )}

                                  {/* Status pill */}
                                  {isCurrent && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      ● In Consultation
                                    </span>
                                  )}
                                  {isDone && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                      ✓ Completed
                                    </span>
                                  )}
                                  {isCancelled && (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-600 line-through">
                                      Cancelled
                                    </span>
                                  )}
                                </div>

                                <div className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
                                  <span>
                                    {appt.patient?.age
                                      ? `${appt.patient.age} yrs`
                                      : ""}{" "}
                                    {appt.patient?.gender
                                      ? `· ${appt.patient.gender}`
                                      : ""}
                                  </span>
                                  <span>
                                    · {appt.patient?.village || "Village Area"}
                                  </span>
                                  <span className="font-mono text-[11px] text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded">
                                    {appt.patient?.healthId ||
                                      appt.appointmentCode}
                                  </span>
                                  <span className="text-gray-400 font-medium">
                                    Slot: {appt.timeSlot}
                                  </span>
                                </div>

                                {appt.reason && (
                                  <div className="mt-1.5 text-xs text-gray-700 bg-gray-50 rounded-lg p-1.5 border border-gray-100">
                                    <span className="font-semibold text-gray-500">
                                      Chief Complaint:
                                    </span>{" "}
                                    {appt.reason}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Action Buttons */}
                            <div className="flex items-center gap-1.5 self-center shrink-0">
                              {!isDone && !isCancelled && (
                                <>
                                  <button
                                    onClick={() =>
                                      handleUpdateApptStatus(
                                        appt.id,
                                        "IN_PROGRESS",
                                        appt.patient?.healthId ||
                                          appt.patient?.id,
                                      )
                                    }
                                    disabled={isCalling}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                      isCurrent
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                        : "bg-brand-600 text-white hover:bg-brand-700"
                                    }`}
                                  >
                                    <Icon name="clipboard" size={13} />
                                    <span>
                                      {isCurrent
                                        ? "Resume Consult"
                                        : "Call & Consult"}
                                    </span>
                                  </button>

                                  <button
                                    title="Mark consultation completed"
                                    onClick={() =>
                                      handleUpdateApptStatus(
                                        appt.id,
                                        "COMPLETED",
                                      )
                                    }
                                    className="p-1.5 rounded-xl border border-gray-200 text-gray-600 hover:text-green-700 hover:bg-green-50 transition-colors cursor-pointer"
                                  >
                                    <Icon name="check" size={14} />
                                  </button>

                                  <button
                                    title="Cancel appointment"
                                    onClick={() =>
                                      handleUpdateApptStatus(
                                        appt.id,
                                        "CANCELLED",
                                      )
                                    }
                                    className="p-1.5 rounded-xl border border-gray-200 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                  >
                                    <Icon name="x" size={14} />
                                  </button>
                                </>
                              )}

                              {isDone && (
                                <button
                                  onClick={() =>
                                    navigate(
                                      "doctor-patient-view",
                                      appt.patient?.healthId ||
                                        appt.patient?.id,
                                    )
                                  }
                                  className="px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors cursor-pointer"
                                >
                                  View Chart →
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })
                  })()
                )}
              </div>
            </Card>
          )}

          {/* TAB 2: REFERRALS QUEUE */}
          {activeTab === "referrals" && (
            <Card>
              <div className="px-4 pt-4">
                <SectionHeader
                  title="Referrals Queue"
                  sub="Active clinical referrals"
                  action={
                    <button
                      onClick={() => navigate("referral")}
                      className="text-xs text-brand-600 font-medium hover:underline"
                    >
                      View all
                    </button>
                  }
                />
                <div className="flex gap-1 mb-2 pb-1 overflow-x-auto">
                  {[
                    { id: "all", label: "All Active" },

                    { id: "pending", label: "Pending" },

                    { id: "accepted", label: "Accepted" },

                    { id: "in-consultation", label: "In Consultation" },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setReferralFilter(t.id as any)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                        referralFilter === t.id
                          ? "bg-brand-50 text-brand-700 font-semibold border border-brand-200"
                          : "text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-gray-50">
                {displayReferrals.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    {loading
                      ? "Loading live referrals…"
                      : "No pending referrals."}
                  </div>
                ) : (
                  displayReferrals.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() =>
                        navigate(
                          "doctor-patient-view",
                          r.patientId || r.patient?.healthId || r.patient?.id,
                        )
                      }
                      className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left group"
                    >
                      <div
                        className={`w-2 h-12 rounded-full shrink-0 ${
                          r.priority === "emergency"
                            ? "bg-red-500"
                            : r.priority === "urgent"
                              ? "bg-amber-500"
                              : "bg-gray-300"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-gray-900">
                            {r.patientName || r.patient?.name || "Patient"}
                          </span>
                          <PriorityBadge priority={r.priority} />
                          <RiskBadge
                            level={r.riskLevel || r.patient?.riskLevel}
                            size="sm"
                          />
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {r.reason}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <ReferralBadge status={r.status} />
                          <span className="text-[10px] text-gray-400 font-mono">
                            {r.id} · {r.date}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(
                              "teleconsultation",
                              r.patientId || r.patient?.healthId || r.patient?.id,
                            )
                          }}
                          className="px-2.5 py-1.5 bg-teal-50 hover:bg-teal-600 text-teal-700 hover:text-white border border-teal-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          title="Start Live Teleconsultation"
                        >
                          <Icon name="video" size={12} />
                          <span className="hidden sm:inline">Teleconsult</span>
                        </button>
                        <Icon
                          name="chevron_right"
                          size={16}
                          className="text-gray-300 group-hover:text-gray-500 shrink-0"
                        />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </Card>
          )}

          {/* TAB 3: ALL PATIENTS */}
          {activeTab === "patients" && (
            <Card>
              <div className="px-4 pt-4">
                <SectionHeader
                  title="My Patients (View Patients)"
                  sub="Consented and referred patients assigned to your care"
                  action={
                    <button
                      onClick={() => navigate("doctor-patient-view")}
                      className="text-xs text-brand-600 font-semibold hover:underline"
                    >
                      Open Patient View →
                    </button>
                  }
                />
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {filteredPatientsList.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    {loading
                      ? "Loading live patients…"
                      : search
                        ? `No patients matching "${search}"`
                        : "No patients assigned or consented yet. Request access from New Health Assessment."}
                  </div>
                ) : (
                  filteredPatientsList.map((p: any) => {
                    const pId = p.healthId || p.id
                    const callStatus = patientCallStatus[pId] || 'available'

                    return (
                      <div
                        key={p.id || p.healthId}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-gray-50 transition-colors"
                      >
                        <div
                          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                          onClick={() =>
                            navigate("doctor-patient-view", p.healthId || p.id)
                          }
                        >
                          <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {String(p.name || "P")
                              .split(" ")
                              .map((w: string) => w[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-gray-900 truncate">
                                {p.name}
                              </span>
                              {callStatus === 'ringing' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1 animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                                  🟡 Ringing (30s)
                                </span>
                              ) : callStatus === 'active' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  🟢 Active Call
                                </span>
                              ) : callStatus === 'missed' ? (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                  🔴 Missed
                                </span>
                              ) : (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  🟢 Available
                                </span>
                              )}
                              <RiskBadge level={p.riskLevel} size="sm" />
                              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Active Consent
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 truncate mt-0.5">
                              {p.age} yrs ·{" "}
                              {p.gender === "F" || p.gender === "Female"
                                ? "Female"
                                : "Male"}{" "}
                              · {p.village || p.district || "Rural Center"} ·{" "}
                              <span className="font-mono text-[10px] text-gray-400">
                                {p.healthId || p.id}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleStartConsultation(p)}
                            className="px-3 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm hover:shadow active:scale-95"
                            title="Start 1-to-1 consultation session with this patient"
                          >
                            <Icon name="video" size={13} />
                            <span>👉 Start Consultation</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate("health-assessment", p.healthId || p.id)
                            }
                            className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            + Assessment
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              navigate("doctor-patient-view", p.healthId || p.id)
                            }
                            className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                          >
                            View Chart →
                          </button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </Card>
          )}

          {/* TAB 4: CONSULTATIONS LOG */}
          {activeTab === "consultations" && (
            <Card>
              <div className="px-4 pt-4">
                <SectionHeader
                  title="Today's Consultations"
                  sub={new Date().toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                />
              </div>
              <div className="overflow-x-auto">
                {consultations.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-sm">
                    <Icon
                      name="clipboard"
                      size={24}
                      className="mx-auto mb-2 text-gray-300"
                    />
                    {loading
                      ? "Loading clinical records…"
                      : "No consultations recorded yet."}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        {[
                          "Time",
                          "Patient",
                          "Age/Gender",
                          "Purpose / Symptoms",
                          "Risk",
                          "Status",
                        ].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left text-xs font-medium text-gray-500"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {consultations.map((row: any, i: number) => (
                        <tr
                          key={row.id || i}
                          className="hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            navigate(
                              "doctor-patient-view",
                              row.patientId || row.id,
                            )
                          }
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                            {row.time}
                          </td>
                          <td className="px-4 py-2.5 font-medium text-sm text-gray-900">
                            {row.name}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-500">
                            {row.ag}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-gray-600 truncate max-w-xs">
                            {row.purpose}
                          </td>
                          <td className="px-4 py-2.5">
                            <RiskBadge level={row.risk} size="sm" />
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`text-xs font-medium px-2 py-0.5 rounded ${
                                row.status === "Completed"
                                  ? "bg-green-50 text-green-700"
                                  : row.status === "In Progress"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-amber-50 text-amber-700"
                              }`}
                            >
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
          )}
        </div>

        <div className="space-y-4">
          <Card className="border-red-100">
            <div className="px-4 pt-4">
              <SectionHeader title="Critical Patients" />
            </div>
            <div className="px-4 pb-4 space-y-3">
              {criticalPatients.length === 0 ? (
                <div className="text-xs text-gray-400 text-center py-3">
                  {loading
                    ? "Loading patients…"
                    : "No critical patients assigned."}
                </div>
              ) : (
                criticalPatients.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() =>
                      navigate("doctor-patient-view", p.healthId || p.id)
                    }
                    className="w-full text-left flex items-center gap-3 p-3 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    <div className="relative">
                      <div className="w-9 h-9 rounded-full bg-red-200 text-red-800 flex items-center justify-center font-bold text-xs">
                        {String(p.name || "P")
                          .split(" ")
                          .map((w: string) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {p.name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {p.age}
                        {p.gender?.[0] || "M"} · {p.village}
                      </div>
                      <RiskBadge level={p.riskLevel} size="sm" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>

          <Card className="p-4">
            <SectionHeader
              title="Quick Lookup"
              sub="Enter patient Health ID or Name"
            />
            <div className="flex gap-2">
              <input
                value={quickLookupId}
                onChange={(e) => setQuickLookupId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleQuickLookup()
                }}
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
                  {loading
                    ? "Checking schedule…"
                    : "No follow-ups scheduled yet."}
                </div>
              ) : (
                followUps.map((f: any, i: number) => (
                  <div
                    key={f.id || i}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
                    onClick={() =>
                      navigate("doctor-patient-view", f.patientId || f.id)
                    }
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-1.5 shrink-0" />
                    <div>
                      <div className="text-xs font-medium text-gray-900">
                        {f.name}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {f.date} · {f.type}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>

      <PhcStockCheckerModal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
        defaultFacilityName={doctorProfile?.facility?.name || 'Sanjivani PHC'}
        userRole="doctor"
      />

      {/* OPD Slot Capacity Modal */}
      {showCapacityModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
                  <Icon name="calendar" size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-900">OPD Slot Capacity Settings</h3>
                  <p className="text-xs text-gray-500">Configure patient booking limits per 30-min window</p>
                </div>
              </div>
              <button
                onClick={() => setShowCapacityModal(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Max Patients Per 30-Min Slot
                </label>
                <p className="text-xs text-gray-500 mb-3">
                  Controls how many appointments patients and ASHA workers can book in each slot before it displays as FULL.
                </p>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={tempCapacity}
                    onChange={(e) => setTempCapacity(Number(e.target.value))}
                    className="w-full accent-teal-600 cursor-pointer"
                  />
                  <span className="w-12 text-center px-2 py-1 bg-teal-50 border border-teal-200 text-teal-800 rounded-lg text-sm font-black shrink-0">
                    {tempCapacity}
                  </span>
                </div>
                <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                  <span>1 patient (Thorough)</span>
                  <span>3 (Standard default)</span>
                  <span>10 patients (Rush)</span>
                </div>
              </div>

              {capacitySuccessMsg && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                  <Icon name="check" size={14} className="text-emerald-600 shrink-0" />
                  <span>{capacitySuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setShowCapacityModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCapacity}
                disabled={capacitySaving}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {capacitySaving ? "Saving..." : "Save Limit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
