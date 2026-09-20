import { useState, useEffect, useRef } from "react"
import {
  Icon,
  ConsentBadge,
  RiskBadge,
  Card,
  PermissionBadge,
  RecordOwnershipBanner,
} from "../components/shared"
import {
  getCurrentUser,
  getPatientDashboardData,
  getPatientAccessRequests,
  approvePatientConsent,
  revokePatientConsent,
  bookAppointment,
  getPatientAppointments,
  getFacilities,
  getDoctors,
  getDoctorSlots,
  getActiveTeleconsultationCall,
  type DoctorSlotItem,
} from "../api/client"
import { syncEngine } from "../services/syncEngine"

interface Props {
  navigate: (s: string, patientId?: string, roomId?: string) => void
  onSOS: () => void
  loginPhone?: string
}

function QRCodeSVG({ text, size = 180 }: { text: string; size?: number }) {
  const matrix: boolean[][] = Array.from({ length: 21 }, () =>
    Array(21).fill(false),
  )

  const drawFinder = (r: number, c: number) => {
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        if (
          i === 0 ||
          i === 6 ||
          j === 0 ||
          j === 6 ||
          (i >= 2 && i <= 4 && j >= 2 && j <= 4)
        ) {
          matrix[r + i][c + j] = true
        }
      }
    }
  }

  drawFinder(0, 0)

  drawFinder(0, 14)

  drawFinder(14, 0)

  for (let i = 8; i < 13; i++) {
    matrix[6][i] = i % 2 === 0

    matrix[i][6] = i % 2 === 0
  }

  let hash = 0

  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  }

  for (let r = 0; r < 21; r++) {
    for (let c = 0; c < 21; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8)) continue

      if (r === 6 || c === 6) continue

      const seed = (hash ^ (r * 37 + c * 17)) >>> 0

      matrix[r][c] = seed % 3 === 0
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 21 21"
      className="rounded-xl bg-white p-2.5 shadow-sm border border-gray-100"
    >
      {matrix.map((row, r) =>
        row.map((filled, c) =>
          filled ? (
            <rect
              key={`${r}-${c}`}
              x={c}
              y={r}
              width={1}
              height={1}
              fill="#111827"
            />
          ) : null,
        ),
      )}
    </svg>
  )
}

export default function PatientMobileDashboard({
  navigate,

  onSOS,

  loginPhone,
}: Props) {
  const [dbUser, setDbUser] = useState<any>(null)

  const [history, setHistory] = useState<any[]>([])

  const [labs, setLabs] = useState<any[]>([])

  const [medsList, setMedsList] = useState<any[]>([])

  const [sosConfirm, setSosConfirm] = useState(false)

  const [sosSent, setSosSent] = useState(false)

  const [showQR, setShowQR] = useState(false)

  const [showMedsModal, setShowMedsModal] = useState(false)

  const [shareToast, setShareToast] = useState<string | null>(null)

  const [expandedConsultation, setExpandedConsultation] =
    useState<string | null>(null)

  const [doctorConsents, setDoctorConsents] = useState<any[]>([])

  const [consentActionInProgress, setConsentActionInProgress] =
    useState<string | null>(null)

  const [loading, setLoading] = useState(true)

  // Appointment & OPD Queue state

  const [appointments, setAppointments] = useState<any[]>([])

  const [showBookModal, setShowBookModal] = useState(false)

  const [facilitiesList, setFacilitiesList] = useState<any[]>([])

  const [doctorsList, setDoctorsList] = useState<any[]>([])

  const [bookingLoading, setBookingLoading] = useState(false)

  const [bookedTokenCard, setBookedTokenCard] = useState<any | null>(null)

  // Form fields

  const [bookFacilityId, setBookFacilityId] = useState("")

  const [bookDoctorId, setBookDoctorId] = useState("")

  const [bookDate, setBookDate] = useState(
    () => new Date().toISOString().split("T")[0],
  )

  const [bookSlot, setBookSlot] = useState("09:00 AM - 09:30 AM")
  const [doctorSlots, setDoctorSlots] = useState<DoctorSlotItem[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  const [bookReason, setBookReason] = useState("")

  const [bookPriority, setBookPriority] = useState<"ROUTINE" | "URGENT">(
    "ROUTINE",
  )

  const [bookError, setBookError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)

    getCurrentUser()

      .then(async (user) => {
        setDbUser(user)

        const healthId =
          user?.patientProfile?.healthId || user?.patientProfile?.id

        if (healthId) {
          // Fetch existing appointments

          getPatientAppointments(healthId)

            .then((apts) => {
              if (Array.isArray(apts)) setAppointments(apts)
            })

            .catch(() => {})

          const data = await getPatientDashboardData(healthId).catch(() => null)

          if (data?.medicines && Array.isArray(data.medicines)) {
            setMedsList(data.medicines)
          }

          if (data?.consultations?.length) {
            setHistory(
              data.consultations.map((c: any) => ({
                id: c.consultationCode || c.id,

                date: c.date,

                time: c.time,

                recordedBy: c.workerName || "ASHA Worker",

                reviewedBy: c.doctorName,

                facility: c.facilityName || "PHC",

                symptoms: c.symptoms || [],

                vitals: {
                  bp: c.vitals?.bloodPressure
                    ? `${c.vitals.bloodPressure} mmHg`
                    : "—",

                  hr: c.vitals?.heartRate ? `${c.vitals.heartRate} bpm` : "—",

                  temp: c.vitals?.temperature
                    ? `${c.vitals.temperature}°C`
                    : "—",

                  spo2: c.vitals?.spo2 ? `${c.vitals.spo2}%` : "—",

                  wt: c.vitals?.weight ? `${c.vitals.weight} kg` : "—",
                },

                diagnosis: c.diagnosis || "Clinical evaluation",

                prescription: c.prescription || [],

                notes: c.notes || "",

                risk: (c.riskLevel?.toLowerCase() || "low") as any,

                followUp: c.followUpDate,
              })),
            )
          }

          // Fetch doctor consent entries

          getPatientAccessRequests(healthId)

            .then((reqs) => {
              const docConsents = (reqs || []).filter(
                (r: any) =>
                  String(r.role || "")
                    .toLowerCase()
                    .includes("doctor") ||
                  String(r.role || "").toLowerCase() === "physician",
              )

              setDoctorConsents(docConsents)
            })

            .catch(() => {})
        }
      })

      .catch((e) => console.error("Failed to load user", e))

      .finally(() => setLoading(false))

    getFacilities()

      .then((facs) => {
        if (Array.isArray(facs) && facs.length > 0) {
          setFacilitiesList(facs)

          setBookFacilityId(facs[0].id)
        }
      })

      .catch(() => {})

    getDoctors()

      .then((docs) => {
        if (Array.isArray(docs)) {
          setDoctorsList(docs)

          if (docs.length > 0) setBookDoctorId(docs[0].id)
        }
      })

      .catch(() => {})
  }, [])

  useEffect(() => {
    if (bookDoctorId) {
      setSlotsLoading(true)
      getDoctorSlots(bookDoctorId, bookDate)
        .then((res) => {
          if (res?.slots && Array.isArray(res.slots)) {
            setDoctorSlots(res.slots)
            const currentSlotData = res.slots.find((s) => s.timeSlot === bookSlot)
            if (!currentSlotData || currentSlotData.status === "FULL") {
              const firstAvail = res.slots.find((s) => s.status !== "FULL")
              if (firstAvail) setBookSlot(firstAvail.timeSlot)
            }
          }
        })
        .catch(() => {})
        .finally(() => setSlotsLoading(false))
    }
  }, [bookDoctorId, bookDate, showBookModal])

  async function handleBookAppointment() {
    if (!bookDoctorId) {
      setBookError("Please select a doctor.")

      return
    }

    if (!bookDate) {
      setBookError("Please select a date.")

      return
    }

    setBookingLoading(true)

    setBookError(null)

    const healthId = pt?.healthId || pt?.id || dbUser?.id

    const payload = {
      patientId: healthId,

      doctorId: bookDoctorId,

      facilityId: bookFacilityId || undefined,

      scheduledDate: bookDate,

      timeSlot: bookSlot,

      reason: bookReason.trim() || undefined,

      priority: bookPriority,

      source: "PATIENT" as const,
    }

    try {
      let appointmentResult: any = null

      try {
        appointmentResult = await bookAppointment(payload)
      } catch (err: any) {
        // Offline Dexie fallback

        const docObj = doctorsList.find((d) => d.id === bookDoctorId)

        const facObj = facilitiesList.find((f) => f.id === bookFacilityId)

        const offlineResult = await syncEngine.saveOfflineAppointment({
          ...payload,

          doctorName: docObj?.name || "Doctor",

          facilityName: facObj?.name || "PHC",
        })

        appointmentResult = {
          ...offlineResult,

          tokenNumber: offlineResult.tokenNumber,

          status: "CONFIRMED",

          scheduledDate: bookDate,

          timeSlot: bookSlot,

          doctor: docObj,

          facility: facObj,
        }
      }

      setBookedTokenCard(appointmentResult)

      setShowBookModal(false)

      setBookReason("")

      // Refresh appointments list

      if (healthId) {
        getPatientAppointments(healthId)
          .then((apts) => {
            if (Array.isArray(apts)) setAppointments(apts)
          })
          .catch(() => {})
      }
    } catch (err: any) {
      setBookError(err?.message || "Failed to book appointment.")
    } finally {
      setBookingLoading(false)
    }
  }

  const pt = dbUser?.patientProfile

  const patientName = pt?.name || dbUser?.fullName || "Patient"

  const patientVillage = pt?.village || ""

  const patientDistrict = pt?.district || ""

  const patientHealthId = pt?.healthId || "PENDING"

  const patientAge = pt?.age || pt?.dob || "--"

  const patientGender = pt?.gender || "U"

  const patientBloodGroup = pt?.bloodGroup || "--"

  const patientRisk = pt?.riskLevel ? String(pt.riskLevel).toLowerCase() : "low"

  const patientInitials = patientName

    .split(" ")

    .map((w: string) => w[0])

    .join("")

    .slice(0, 2)

    .toUpperCase()

  const patientAllergies = pt?.allergies || []

  const patientMeds = pt?.currentMedications || []

  const isNewPatient = !!dbUser && history.length === 0

  const [activeDoctorCall, setActiveDoctorCall] = useState<{
    sessionId: string;
    patientId: string;
    doctorName: string;
    facilityName?: string;
  } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleAcceptCall = () => {
    if (!activeDoctorCall) return;
    if (activeDoctorCall.doctorName) {
      localStorage.setItem('last_calling_doctor', activeDoctorCall.doctorName);
    }
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'consultation:accept',
          sessionId: activeDoctorCall.sessionId,
          patientId: pt?.healthId || patientHealthId,
          role: 'patient',
        })
      );
    }
    navigate(
      'teleconsultation',
      pt?.healthId || patientHealthId,
      activeDoctorCall.sessionId
    );
  };

  const handleRejectCall = () => {
    if (activeDoctorCall && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'consultation:reject',
          sessionId: activeDoctorCall.sessionId,
          patientId: pt?.healthId || patientHealthId,
          role: 'patient',
        })
      );
    }
    setActiveDoctorCall(null);
  };

  useEffect(() => {
    const healthId = pt?.healthId || dbUser?.patientProfile?.healthId || dbUser?.id || loginPhone;
    if (!healthId) return;

    let isMounted = true;
    const checkActiveCall = async () => {
      try {
        const call = await getActiveTeleconsultationCall(healthId);
        if (isMounted) {
          setActiveDoctorCall(call || null);
        }
      } catch {
        // silent
      }
    };

    checkActiveCall();
    const interval = setInterval(checkActiveCall, 2500);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname || 'localhost';
    const ws = new WebSocket(`${protocol}//${host}:5000/teleconsultation`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'consultation:incoming' || data.type === 'call:incoming') {
          const myIds = [
            pt?.healthId,
            pt?.id,
            dbUser?.id,
            loginPhone,
          ]
            .filter(Boolean)
            .map((id) => String(id).replace(/[^a-zA-Z0-9]/g, '').toLowerCase());

          const incomingIds = [
            data.patientId,
            data.patientDbId,
            data.patientHealthId,
            data.patientUserId,
          ]
            .filter(Boolean)
            .map((id) => String(id).replace(/[^a-zA-Z0-9]/g, '').toLowerCase());

          const isMatch = myIds.some((myId) => incomingIds.some((incId) => myId === incId));
          if (isMatch) {
            setActiveDoctorCall({
              sessionId: data.sessionId,
              patientId: data.patientHealthId || data.patientId || healthId,
              doctorName: data.doctorName,
              facilityName: data.facilityName,
            });
          }
        } else if (data.type === 'consultation:active') {
          // Both active -> auto-open if this patient accepted
          if (activeDoctorCall && activeDoctorCall.sessionId === data.sessionId) {
            navigate('teleconsultation', pt?.healthId || patientHealthId, data.sessionId);
          }
        } else if (
          data.type === 'call:cancelled' ||
          data.type === 'call:end' ||
          data.type === 'consultation:end' ||
          data.type === 'consultation:missed'
        ) {
          setActiveDoctorCall(null);
        }
      } catch {}
    };

    return () => {
      isMounted = false;
      clearInterval(interval);
      try {
        ws.close();
      } catch {}
    };
  }, [dbUser, pt?.healthId, pt?.id, loginPhone]);

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
    )
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
                  onSOS()

                  setSosSent(true)

                  setSosConfirm(false)
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

      {/* High-Priority Doctor Call Ringing Alert Banner */}
      {activeDoctorCall && (
        <div className="bg-gradient-to-r from-teal-950 via-emerald-950 to-gray-950 border-2 border-emerald-400 rounded-3xl p-4 text-white shadow-2xl space-y-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-300">
                Incoming Doctor Video Call
              </span>
            </div>
            <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded-md text-emerald-200 border border-white/10">
              Live ABDM Clinic
            </span>
          </div>

          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shrink-0 shadow-lg">
              <Icon name="video" size={22} className="animate-bounce" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="font-bold text-base text-white truncate">
                {activeDoctorCall.doctorName}
              </h4>
              <p className="text-xs text-emerald-200 truncate">
                {activeDoctorCall.facilityName || 'PHC Medical Officer'} is calling you right now
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={handleRejectCall}
              className="py-2.5 px-3 bg-red-950/60 hover:bg-red-900 border border-red-500/30 text-red-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer text-center flex items-center justify-center gap-1.5"
            >
              <span>❌ Reject</span>
            </button>
            <button
              type="button"
              onClick={handleAcceptCall}
              className="py-2.5 px-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 active:scale-98 text-gray-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer"
            >
              <span>✅ Accept</span>
            </button>
          </div>
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
            {patientVillage ? ` · ${patientVillage}, ${patientDistrict}` : ""}
          </p>

          {loginPhone && (
            <p className="text-xs text-gray-500 mt-0.5">
              Phone: <span className="font-medium">{loginPhone}</span>
            </p>
          )}

          <button
            onClick={() => navigate("patient-profile-edit")}
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
                    [
                      0, 1, 2, 5, 10, 14, 15, 16, 20, 24, 6, 7, 8, 22, 23,
                    ].includes(i)
                      ? "bg-gray-900"
                      : "bg-transparent"
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
              const shareText = `RuralCare Health ID Card\nPatient: ${patientName}\nHealth ID: ${patientHealthId}\nABHA: ${pt?.abhaNumber || "N/A"}\nVillage: ${patientVillage || "N/A"}\nBlood Group: ${patientBloodGroup}`

              if (navigator.share) {
                navigator
                  .share({ title: "RuralCare Health ID", text: shareText })
                  .catch(() => {})
              } else {
                navigator.clipboard.writeText(shareText)

                setShareToast("Health ID card copied to clipboard!")

                setTimeout(() => setShareToast(null), 2500)
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
              {pt?.healthWorkerName ||
                pt?.healthWorker?.name ||
                "Meena Kumari (ASHA)"}
            </div>
            <div className="text-[11px] text-gray-500">
              Community Health Center · {patientVillage || "Local Area"}
            </div>
          </div>
        </div>
        <div className="px-2.5 py-1 bg-teal-50 border border-teal-200 rounded-full text-[10px] font-bold text-teal-800">
          Assigned
        </div>
      </div>

      {/* Dedicated 1-to-1 Doctor Teleconsultation Card */}
      <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-teal-700 shrink-0">
              <Icon name="video" size={20} />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold text-teal-700 tracking-wider">
                1-to-1 Video Consultation
              </div>
              <div className="text-sm font-bold text-gray-900 mt-0.5">
                Doctor Teleconsultation Room
              </div>
              <div className="text-[11px] text-gray-500">
                Direct live consultation & digital prescription delivery
              </div>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
              activeDoctorCall
                ? 'bg-emerald-500 text-white animate-pulse'
                : 'bg-teal-50 text-teal-800 border border-teal-200'
            }`}
          >
            {activeDoctorCall ? 'Doctor Ringing' : 'Waiting for doctor…'}
          </span>
        </div>

        <div className="p-3 bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100/80 rounded-2xl flex items-center justify-between gap-3">
          <div className="text-xs text-teal-900 leading-snug">
            {activeDoctorCall ? (
              <span>
                🚨 <strong className="text-emerald-800">{activeDoctorCall.doctorName}</strong> is calling you!
              </span>
            ) : (
              <span className="flex items-center gap-2 text-gray-600">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
                </span>
                <span>👉 Waiting for doctor to start consultation…</span>
              </span>
            )}
          </div>
          {activeDoctorCall ? (
            <button
              type="button"
              onClick={handleAcceptCall}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5 animate-bounce"
            >
              <Icon name="video" size={13} />
              <span>✅ Accept</span>
            </button>
          ) : (
            <div className="text-[10px] font-mono text-gray-400">
              Auto-receives
            </div>
          )}
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

      {/* Book Doctor Consultation / OPD Token Banner */}
      <div className="bg-gradient-to-r from-teal-700 via-teal-800 to-emerald-800 rounded-3xl p-4 text-white shadow-md flex items-center justify-between border border-teal-600/40">
        <div>
          <div className="flex items-center gap-1.5 text-teal-200 text-[10px] font-bold uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Fast-Track Public Care · OPD Pass
          </div>
          <div className="text-base font-extrabold mt-0.5 tracking-tight">
            Book Doctor Consultation
          </div>
          <div className="text-[11px] text-teal-100/90 mt-0.5">
            Generate your priority digital OPD token & skip waiting lines
          </div>
        </div>
        <button
          onClick={() => setShowBookModal(true)}
          className="px-3.5 py-2.5 bg-white text-teal-900 font-extrabold rounded-xl text-xs hover:bg-teal-50 transition-all shadow-md active:scale-95 shrink-0 ml-3 cursor-pointer"
        >
          + Book Slot
        </button>
      </div>

      {/* Active OPD Appointments & Passes */}
      {appointments.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-teal-100 rounded-lg flex items-center justify-center text-teal-700 shrink-0">
                <Icon name="calendar" size={13} />
              </div>
              <span className="font-semibold text-sm text-gray-900">
                My OPD Appointments ({appointments.length})
              </span>
            </div>
            <button
              onClick={() => setShowBookModal(true)}
              className="text-xs text-teal-700 font-bold hover:underline cursor-pointer"
            >
              + New
            </button>
          </div>

          <div className="space-y-2.5">
            {appointments.map((apt: any) => (
              <div
                key={apt.id}
                className="p-3 bg-gray-50 border border-gray-100 rounded-2xl flex items-center justify-between hover:bg-gray-100/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-white border-2 border-teal-300 rounded-xl flex flex-col items-center justify-center text-teal-800 shadow-2xs shrink-0">
                    <span className="text-[8px] font-bold uppercase text-teal-600">
                      TOKEN
                    </span>
                    <span className="text-base font-extrabold leading-none">
                      #{apt.tokenNumber || "—"}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <div className="text-xs font-bold text-gray-900 truncate">
                      {apt.doctor?.name || "Assigned Medical Officer"}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {apt.facility?.name || "Primary Health Centre"} ·{" "}
                      {apt.doctor?.specialty || "General Medicine"}
                    </div>
                    <div className="text-[10px] text-teal-700 font-medium mt-0.5 flex items-center gap-2">
                      <span>📅 {apt.scheduledDate}</span>
                      <span>⏰ {apt.timeSlot || "Morning OPD"}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1.5 shrink-0 ml-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                      apt.status === "COMPLETED"
                        ? "bg-green-100 text-green-800"
                        : apt.status === "IN_PROGRESS"
                          ? "bg-amber-100 text-amber-800 animate-pulse"
                          : "bg-teal-100 text-teal-800"
                    }`}
                  >
                    {apt.status || "CONFIRMED"}
                  </span>
                  <button
                    onClick={() => setBookedTokenCard(apt)}
                    className="text-[11px] text-brand-600 font-bold hover:underline cursor-pointer"
                  >
                    View Slip →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-5 gap-2">
        {[
          {
            label: 'Video Call',
            icon: 'video',
            color: activeDoctorCall
              ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-400 ring-2 ring-emerald-300 animate-pulse'
              : 'bg-teal-50 text-teal-700',
            action: () =>
              navigate(
                'teleconsultation',
                pt?.healthId || patientHealthId,
                activeDoctorCall?.sessionId || undefined
              ),
          },
          {
            label: "Records",
            icon: "clipboard",
            color: "bg-brand-50 text-brand-700",
            action: () => navigate("patient-profile"),
          },
          {
            label: "Medicines",
            icon: "pill",
            color: "bg-purple-50 text-purple-700",
            action: () => setShowMedsModal(true),
          },
          {
            label: "Consent",
            icon: "shield",
            color: "bg-green-50 text-green-700",
            action: () => navigate("consent"),
          },
          {
            label: "Access Log",
            icon: "eye",
            color: "bg-amber-50 text-amber-700",
            action: () => navigate("access-history"),
          },
        ].map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`flex flex-col items-center gap-1.5 p-2.5 rounded-2xl ${item.color} hover:opacity-80 transition-opacity cursor-pointer`}
          >
            <Icon name={item.icon} size={18} />
            <span className="text-[10px] font-medium text-center leading-tight">
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {/* Who Has Access — Doctor consent summary */}
      {doctorConsents.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 shrink-0">
                <Icon name="shield" size={12} />
              </div>
              <span className="font-semibold text-sm text-gray-900">
                Who Has Access
              </span>
            </div>
            <button
              onClick={() => navigate("patient-profile")}
              className="text-xs text-brand-600 font-semibold hover:underline cursor-pointer"
            >
              Manage →
            </button>
          </div>

          <div className="space-y-2">
            {doctorConsents.slice(0, 3).map((c: any) => {
              const isPending = c.status === "TEMPORARY"

              const isGranted = c.status === "GRANTED"

              const isActing = consentActionInProgress === c.id

              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
                    isPending
                      ? "bg-amber-50 border-amber-200"
                      : isGranted
                        ? "bg-emerald-50 border-emerald-100"
                        : "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-900 truncate">
                      {c.grantedTo}
                    </div>
                    <div
                      className={`text-[10px] font-medium ${
                        isPending
                          ? "text-amber-700"
                          : isGranted
                            ? "text-emerald-700"
                            : "text-gray-500"
                      }`}
                    >
                      {isPending
                        ? "Awaiting your approval"
                        : isGranted
                          ? "Access granted"
                          : "Revoked"}
                    </div>
                  </div>
                  {isPending && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          setConsentActionInProgress(c.id)

                          try {
                            await approvePatientConsent(c.id)

                            setDoctorConsents((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, status: "GRANTED" } : x,
                              ),
                            )
                          } catch {
                            // ignore
                          } finally {
                            setConsentActionInProgress(null)
                          }
                        }}
                        className="px-2.5 py-1 bg-emerald-600 text-white text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        {isActing ? "…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={async () => {
                          setConsentActionInProgress(c.id)

                          try {
                            await revokePatientConsent(
                              c.id,
                              "Rejected by patient",
                            )

                            setDoctorConsents((prev) =>
                              prev.map((x) =>
                                x.id === c.id ? { ...x, status: "REVOKED" } : x,
                              ),
                            )
                          } catch {
                            // ignore
                          } finally {
                            setConsentActionInProgress(null)
                          }
                        }}
                        className="px-2.5 py-1 bg-red-50 border border-red-200 text-red-700 text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-50"
                      >
                        {isActing ? "…" : "Reject"}
                      </button>
                    </div>
                  )}
                  {isGranted && (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full shrink-0">
                      Active
                    </span>
                  )}
                </div>
              )
            })}
            {doctorConsents.length > 3 && (
              <button
                onClick={() => navigate("patient-profile")}
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

            <p className="text-gray-500 text-sm">No health records found.</p>

            <p className="text-gray-400 text-xs">
              Visits to the PHC or ASHA will appear here.
            </p>
          </div>
        ) : (
          history.map((entry: any) => {
            const isExpanded = expandedConsultation === entry.id

            return (
              <Card key={entry.id} className="overflow-hidden">
                <button
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors"
                  onClick={() =>
                    setExpandedConsultation(isExpanded ? null : entry.id)
                  }
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      entry.risk === "moderate"
                        ? "bg-amber-100"
                        : "bg-green-100"
                    }`}
                  >
                    <Icon
                      name="clipboard"
                      size={16}
                      className={
                        entry.risk === "moderate"
                          ? "text-amber-700"
                          : "text-green-700"
                      }
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {entry.diagnosis}
                      </span>

                      <RiskBadge level={entry.risk} size="sm" />
                    </div>

                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {entry.date} · {entry.time} · {entry.facility}
                    </div>

                    <div className="text-[10px] text-gray-400">
                      Recorded by:{" "}
                      <span className="font-medium">{entry.recordedBy}</span>
                      {entry.reviewedBy && (
                        <>
                          {" · Reviewed by: "}
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
                      isExpanded ? "rotate-180" : ""
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
                              {k === "bp"
                                ? "Blood Pressure"
                                : k === "hr"
                                  ? "Heart Rate"
                                  : k === "temp"
                                    ? "Temp"
                                    : k === "spo2"
                                      ? "SpO₂"
                                      : "Weight"}
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
                            Follow-up scheduled:{" "}
                            <strong>{entry.followUp}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            )
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
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      r.status === "abnormal" ? "bg-red-50" : "bg-green-50"
                    }`}
                  >
                    <Icon
                      name="document"
                      size={14}
                      className={
                        r.status === "abnormal"
                          ? "text-red-500"
                          : "text-green-600"
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
                          r.status === "abnormal"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
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
          <Icon name="document" size={16} className="text-gray-500 shrink-0" />

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
                    <Icon name="pill" size={14} className="text-blue-600" />
                  </div>

                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {typeof m === "string" ? m : m.name}
                    </div>

                    <div className="text-[10px] text-gray-500">
                      {typeof m === "string" ? "" : m.dosage || m.dose || ""}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      <button
        onClick={() => navigate("consent")}
        className="w-full flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-2xl hover:border-brand-200 hover:bg-brand-50 transition-all text-left"
      >
        <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center shrink-0">
          <Icon name="shield" size={18} className="text-green-600" />
        </div>

        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">
            Privacy & Consent
          </div>

          <div className="text-xs text-gray-500">
            Manage who can access your records
          </div>
        </div>

        <Icon name="chevron_right" size={16} className="text-gray-400" />
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
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700">
                Official Health QR
              </span>
              <button
                onClick={() => setShowQR(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                ×
              </button>
            </div>
            <div className="flex justify-center py-2">
              <QRCodeSVG text={patientHealthId} size={190} />
            </div>
            <div>
              <h3 className="font-display font-bold text-lg text-gray-900">
                {patientName}
              </h3>
              <p className="font-mono text-xs font-bold text-brand-700 mt-0.5">
                {patientHealthId}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                ABHA: {pt?.abhaNumber || "Not Linked"} · {patientAge} ·{" "}
                {patientBloodGroup}
              </p>
              {patientVillage && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {patientVillage}, {patientDistrict}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(patientHealthId)

                  setShareToast("Health ID copied!")

                  setTimeout(() => setShareToast(null), 2000)
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
                  <h3 className="font-display font-bold text-base text-gray-900">
                    Active Medications
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Prescribed treatments & ongoing therapies
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMedsModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"
              >
                ×
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {medsList.length > 0 ||
              (patientMeds && patientMeds.length > 0) ? (
                (medsList.length > 0
                  ? medsList
                  : patientMeds.map((m: string) => ({
                      name: m,
                      dosage: "Active medication",
                    }))
                ).map((med: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-purple-50/50 border border-purple-100 rounded-2xl flex items-start gap-3"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon name="pill" size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-xs text-gray-900">
                        {med.name}
                      </div>
                      <div className="text-[11px] text-purple-800 mt-0.5">
                        {med.dosage ||
                          med.dosageForm ||
                          "As directed by physician"}
                      </div>
                      {med.strength && (
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          Strength: {med.strength}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-gray-50 rounded-2xl border border-gray-100 space-y-2">
                  <Icon
                    name="pill"
                    size={28}
                    className="text-gray-300 mx-auto"
                  />
                  <p className="text-xs font-semibold text-gray-700">
                    No Active Medications
                  </p>
                  <p className="text-[11px] text-gray-400 max-w-xs mx-auto">
                    You currently have no prescribed medications or active drug
                    therapies recorded.
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

      {/* Book Doctor Consultation / OPD Token Modal */}
      {showBookModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                  <Icon name="calendar" size={16} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-base text-gray-900">
                    Book Doctor Consultation
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Fast-track priority digital OPD token
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBookModal(false)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                ×
              </button>
            </div>

            {bookError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {bookError}
              </div>
            )}

            <div className="space-y-3.5">
              {/* Facility Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Healthcare Facility / PHC
                </label>
                <select
                  value={bookFacilityId}
                  onChange={(e) => setBookFacilityId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {facilitiesList.length === 0 ? (
                    <option value="">Sanjivani PHC (Default Facility)</option>
                  ) : (
                    facilitiesList.map((fac) => (
                      <option key={fac.id} value={fac.id}>
                        {fac.facilityName || fac.name} (
                        {fac.facilityType || "PHC"} ·{" "}
                        {fac.district || "Bikaner"})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Doctor Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Select Attending Physician
                </label>
                <select
                  value={bookDoctorId}
                  onChange={(e) => setBookDoctorId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {doctorsList.length === 0 ? (
                    <option value="">No doctors listed</option>
                  ) : (
                    doctorsList.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name} · {doc.specialty || "General Medicine"}{" "}
                        {doc.hprId ? `(${doc.hprId})` : ""}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Date Selection */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Appointment Date
                </label>
                <div className="flex gap-2 mb-2">
                  {[
                    {
                      label: "Today",
                      date: new Date().toISOString().split("T")[0],
                    },

                    {
                      label: "Tomorrow",

                      date: new Date(Date.now() + 86400000)
                        .toISOString()
                        .split("T")[0],
                    },
                  ].map((quick) => (
                    <button
                      key={quick.label}
                      type="button"
                      onClick={() => setBookDate(quick.date)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                        bookDate === quick.date
                          ? "bg-teal-700 text-white border-teal-700"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                      }`}
                    >
                      {quick.label}
                    </button>
                  ))}
                </div>
                <input
                  type="date"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Time Slot Selection & Live Availability */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-gray-700">
                    OPD Time Slot & Live Capacity
                  </label>
                  {slotsLoading && (
                    <span className="text-[10px] text-teal-600 animate-pulse font-medium">Checking live slots…</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {(doctorSlots.length > 0 ? doctorSlots : [
                    { timeSlot: "09:00 AM - 09:30 AM", availableSpots: 3, capacity: 3, status: "AVAILABLE" as const, bookedCount: 0 },
                    { timeSlot: "09:30 AM - 10:00 AM", availableSpots: 3, capacity: 3, status: "AVAILABLE" as const, bookedCount: 0 },
                    { timeSlot: "10:00 AM - 10:30 AM", availableSpots: 3, capacity: 3, status: "AVAILABLE" as const, bookedCount: 0 },
                    { timeSlot: "10:30 AM - 11:00 AM", availableSpots: 3, capacity: 3, status: "AVAILABLE" as const, bookedCount: 0 },
                    { timeSlot: "11:00 AM - 11:30 AM", availableSpots: 3, capacity: 3, status: "AVAILABLE" as const, bookedCount: 0 },
                    { timeSlot: "02:00 PM - 02:30 PM", availableSpots: 3, capacity: 3, status: "AVAILABLE" as const, bookedCount: 0 },
                  ]).map((slot) => {
                    const isFull = slot.status === "FULL"
                    const isSelected = bookSlot === slot.timeSlot

                    return (
                      <button
                        key={slot.timeSlot}
                        type="button"
                        disabled={isFull}
                        onClick={() => setBookSlot(slot.timeSlot)}
                        className={`p-2 rounded-xl text-left border transition-all flex flex-col justify-between ${
                          isFull
                            ? "bg-gray-100/80 border-gray-200 text-gray-400 opacity-60 cursor-not-allowed"
                            : isSelected
                            ? "bg-teal-50 border-teal-600 text-teal-900 ring-2 ring-teal-500 shadow-sm"
                            : "bg-white border-gray-200 text-gray-700 hover:border-teal-300 hover:bg-teal-50/30 cursor-pointer"
                        }`}
                      >
                        <span className="text-[11px] font-bold leading-tight">{slot.timeSlot}</span>
                        <div className="mt-1 flex items-center justify-between">
                          {isFull ? (
                            <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-red-100 text-red-700 uppercase">
                              FULL (0 left)
                            </span>
                          ) : slot.status === "ALMOST_FULL" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              1 spot left!
                            </span>
                          ) : (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              {slot.availableSpots} spots left
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Symptoms / Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Symptoms / Reason for Visit
                </label>
                <input
                  type="text"
                  value={bookReason}
                  onChange={(e) => setBookReason(e.target.value)}
                  placeholder="e.g. Fever for 3 days, cough, routine follow-up"
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  Priority Urgency
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setBookPriority("ROUTINE")}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      bookPriority === "ROUTINE"
                        ? "bg-teal-700 text-white border-teal-700"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Routine Care
                  </button>
                  <button
                    type="button"
                    onClick={() => setBookPriority("URGENT")}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${
                      bookPriority === "URGENT"
                        ? "bg-amber-600 text-white border-amber-600"
                        : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    Urgent / Sick
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setShowBookModal(false)}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-xs font-semibold text-gray-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBookAppointment}
                disabled={bookingLoading || !bookDoctorId}
                className="flex-2 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl text-xs shadow-md transition-all disabled:opacity-50 cursor-pointer"
              >
                {bookingLoading
                  ? "Booking OPD Slot..."
                  : "Confirm & Generate Token"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Digital OPD Token Slip Modal */}
      {bookedTokenCard && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-2xl border-4 border-teal-600 animate-in zoom-in-95 duration-200">
            {/* Gov Header */}
            <div className="text-center border-b border-gray-200 pb-3">
              <div className="text-[10px] font-extrabold uppercase tracking-widest text-teal-800">
                National Health Authority · ABDM
              </div>
              <div className="text-sm font-black text-gray-900 mt-0.5">
                Primary Health Centre · OPD Token Slip
              </div>
              <div className="text-[10px] text-gray-500">
                {bookedTokenCard.facility?.name ||
                  "Sanjivani Primary Health Centre"}
              </div>
            </div>

            {/* Token Badge */}
            <div className="p-4 bg-teal-50 border-2 border-dashed border-teal-300 rounded-2xl text-center">
              <div className="text-[10px] uppercase font-bold text-teal-700 tracking-wider">
                Priority Queue Token
              </div>
              <div className="text-4xl font-black text-teal-900 my-1 font-mono tracking-tight">
                #{bookedTokenCard.tokenNumber || "01"}
              </div>
              <div className="text-[11px] font-mono text-teal-800 font-bold">
                {bookedTokenCard.appointmentCode || "OPD-CONFIRMED"}
              </div>
            </div>

            {/* Patient & Booking Details */}
            <div className="space-y-2 text-xs bg-gray-50 p-3 rounded-xl">
              <div className="flex justify-between">
                <span className="text-gray-500">Patient:</span>
                <span className="font-bold text-gray-900">{patientName}</span>
              </div>
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-gray-500">Health ID:</span>
                <span className="font-semibold text-gray-800">
                  {patientHealthId}
                </span>
              </div>
              {pt?.abhaNumber && (
                <div className="flex justify-between font-mono text-[11px]">
                  <span className="text-gray-500">ABHA:</span>
                  <span className="font-semibold text-gray-800">
                    {pt.abhaNumber}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Doctor:</span>
                <span className="font-bold text-gray-900">
                  {bookedTokenCard.doctor?.name || "Medical Officer"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date & Slot:</span>
                <span className="font-semibold text-teal-800">
                  {bookedTokenCard.scheduledDate} ({bookedTokenCard.timeSlot})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Priority:</span>
                <span className="px-2 py-0.5 bg-teal-100 text-teal-800 rounded font-bold uppercase text-[9px]">
                  {bookedTokenCard.priority || "ROUTINE"}
                </span>
              </div>
            </div>

            <div className="text-center text-[10px] text-gray-400">
              Please present this digital slip at the PHC OPD desk.
            </div>

            <button
              onClick={() => setBookedTokenCard(null)}
              className="w-full py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs shadow transition-colors cursor-pointer"
            >
              Done / Close Slip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
