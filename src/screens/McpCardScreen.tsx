import { useState, useEffect } from "react"
import { Icon } from "../components/shared"
import {
  getCurrentUser,
  getPatientDashboardData,
  getPatientMchRecord,
} from "../api/client"
import type { MchRecord, MchMilestone } from "../types"
import { MCH_RECORDS } from "../data"

interface Props {
  navigate: (s: string, patientId?: string, roomId?: string) => void
  currentUser?: any
  loginPhone?: string
  patientId?: string
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

export default function McpCardScreen({
  navigate,
  currentUser,
  loginPhone,
  patientId,
}: Props) {
  const [dbUser, setDbUser] = useState<any>(currentUser || null)
  const [loading, setLoading] = useState(true)
  const [mchRecord, setMchRecord] = useState<MchRecord | null>(null)
  const [mchActiveMode, setMchActiveMode] = useState<'maternal' | 'child'>('maternal')
  const [mchTimelineFilter, setMchTimelineFilter] = useState<'all' | 'completed' | 'due' | 'upcoming'>('all')
  const [showMcpModal, setShowMcpModal] = useState(false)
  const [expandedMilestoneId, setExpandedMilestoneId] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)

    getCurrentUser()
      .then(async (user) => {
        if (!mounted) return
        if (user) setDbUser(user)
        const healthId =
          patientId ||
          user?.patientProfile?.healthId ||
          user?.patientProfile?.id ||
          currentUser?.patientProfile?.healthId ||
          currentUser?.patientProfile?.id ||
          loginPhone ||
          'RHC-2026-8F4K92'

        if (healthId) {
          const data = await getPatientDashboardData(healthId).catch(() => null)
          if (data?.mchRecord) {
            setMchRecord(data.mchRecord)
          } else {
            const rec = await getPatientMchRecord(healthId).catch(() => null)
            if (rec && mounted) setMchRecord(rec)
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [currentUser, loginPhone, patientId])

  const pt = dbUser?.patientProfile || currentUser?.patientProfile
  const patientGender = pt?.gender || dbUser?.gender || currentUser?.gender || ""
  const normalizedGender = String(patientGender || "").trim().toLowerCase()
  const isMale =
    normalizedGender === "m" ||
    normalizedGender === "male" ||
    normalizedGender === "man" ||
    normalizedGender === "boy"

  const patientName = pt?.name || dbUser?.fullName || currentUser?.fullName || "Priya Devi"
  const patientVillage = pt?.village || "Govindpur"
  const patientHealthId = pt?.healthId || patientId || "RHC-2026-8F4K92"

  const maternalRecord = (mchRecord?.pregnancyStatus === 'PREGNANT' ? mchRecord : MCH_RECORDS[0])
  const childRecord = (mchRecord?.pregnancyStatus === 'POSTPARTUM' ? mchRecord : MCH_RECORDS[1])
  const currentDisplayRecord: MchRecord = mchActiveMode === 'maternal' ? maternalRecord : childRecord
  const milestonesList: MchMilestone[] = currentDisplayRecord?.milestones || []
  const filteredMilestones = milestonesList.filter((m) => {
    if (mchTimelineFilter === 'completed') return m.status === 'completed'
    if (mchTimelineFilter === 'due') return m.status === 'due' || m.status === 'overdue'
    if (mchTimelineFilter === 'upcoming') return m.status === 'upcoming'
    return true
  })

  if (loading) {
    return (
      <div className="p-4 max-w-md mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-rose-200 border-t-rose-600 rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Loading Mother &amp; Child Protection Pass…</div>
        </div>
      </div>
    )
  }

  if (isMale) {
    return (
      <div className="p-4 max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-2.5 pb-2">
          <button
            onClick={() => navigate('patient-dashboard')}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Back to Dashboard"
          >
            <Icon name="chevron_right" size={18} className="rotate-180 text-gray-700" />
          </button>
          <h1 className="font-display text-base font-bold text-gray-900">
            Mother &amp; Child Protection Card
          </h1>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center space-y-3 shadow-xs">
          <div className="text-3xl">📋</div>
          <h3 className="font-bold text-gray-900 text-sm">Not Applicable</h3>
          <p className="text-xs text-gray-600 leading-relaxed">
            The Mother &amp; Child Protection (MCP) card is registered exclusively for maternal care (pregnant women) and infant immunization records.
          </p>
          <button
            onClick={() => navigate('patient-dashboard')}
            className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer shadow-xs"
          >
            ← Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      {/* Top Header with Back Navigation */}
      <div className="flex items-center justify-between pb-1">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('patient-dashboard')}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 active:scale-95 flex items-center justify-center transition-all cursor-pointer shrink-0"
            title="Back to Dashboard"
          >
            <Icon name="chevron_right" size={18} className="rotate-180 text-gray-700" />
          </button>
          <div>
            <h1 className="font-display text-base font-bold text-gray-900 leading-tight">
              Mother &amp; Child Protection Card
            </h1>
            <p className="text-[11px] text-gray-500">
              National Health Mission · RMNCH+A
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowMcpModal(true)}
          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
        >
          <Icon name="qr" size={13} />
          Pass QR
        </button>
      </div>

      {shareToast && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-2xl animate-in fade-in slide-in-from-top-2 duration-150 text-center shadow-sm">
          {shareToast}
        </div>
      )}

      {/* ─── DIGITAL MOTHER & CHILD PROTECTION (MCP) CARD PASS ─────────── */}
      <div id="mcp-card-pass" className="bg-white rounded-3xl border-2 border-rose-100 shadow-sm overflow-hidden">
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
              setMchActiveMode('maternal')
              setMchTimelineFilter('all')
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
              setMchActiveMode('child')
              setMchTimelineFilter('all')
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

        {/* Mother / Child Hero Identity Strip */}
        <div className="p-4 border-b border-gray-100 bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-bold text-gray-900 flex items-center gap-1.5">
                <span>{currentDisplayRecord.patientName || patientName}</span>
                {mchActiveMode === 'maternal' ? (
                  <span className="text-xs font-normal text-gray-500">
                    · {currentDisplayRecord.gestationalWeeks || 26} Weeks Pregnant
                  </span>
                ) : (
                  <span className="text-xs font-normal text-gray-500">
                    · {currentDisplayRecord.childName || 'Baby Aarav'} ({currentDisplayRecord.childAgeWeeks || 6} Weeks)
                  </span>
                )}
              </h3>
            </div>
            <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 font-bold text-[11px] rounded-full">
              {mchActiveMode === 'maternal'
                ? ((currentDisplayRecord.gestationalWeeks || 26) <= 12
                  ? '1st Trimester'
                  : (currentDisplayRecord.gestationalWeeks || 26) <= 27
                  ? '2nd Trimester'
                  : '3rd Trimester')
                : 'Infant Care'}
            </span>
          </div>

          {/* Gestational Age / Trimester Progress Bar */}
          {mchActiveMode === 'maternal' && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-semibold text-gray-700">
                  Gestational Age: <strong className="text-gray-900">{currentDisplayRecord.gestationalWeeks || 26} of 40 Weeks</strong>
                </span>
                <span className="text-rose-600 font-bold">
                  56 Days to Due Date
                </span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: '30%' }} title="1st Trimester" />
                <div className="h-full bg-rose-500 transition-all" style={{ width: '35%' }} title="2nd Trimester (Current)" />
                <div className="h-full bg-gray-200 transition-all" style={{ width: '35%' }} title="3rd Trimester" />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1 font-medium">
                <span className="text-emerald-700 font-bold">✓ 1st Trimester (1–12w)</span>
                <span className="text-rose-600 font-bold">• 2nd Trimester (13–27w)</span>
                <span>3rd Trimester (28–40w)</span>
              </div>
            </div>
          )}

          {/* Quick Details Chips */}
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-gray-100 text-center">
            {mchActiveMode === 'maternal' ? (
              <>
                <div className="p-2 bg-rose-50/50 rounded-xl border border-rose-100">
                  <div className="text-[9px] font-bold text-rose-800 uppercase">EDD (Due Date)</div>
                  <div className="text-xs font-bold text-gray-900 mt-0.5">{currentDisplayRecord.edd || '15 Nov 2026'}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">LMP</div>
                  <div className="text-xs font-bold text-gray-900 mt-0.5">{currentDisplayRecord.lmp || '08 Feb 2026'}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Gravida / Para</div>
                  <div className="text-xs font-bold text-gray-900 mt-0.5">G1 P0</div>
                </div>
                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Blood Group</div>
                  <div className="text-xs font-bold text-rose-600 mt-0.5">{currentDisplayRecord.bloodGroup || 'O+'}</div>
                </div>
              </>
            ) : (
              <>
                <div className="p-2 bg-rose-50/50 rounded-xl border border-rose-100">
                  <div className="text-[9px] font-bold text-rose-800 uppercase">Birth Weight</div>
                  <div className="text-xs font-bold text-gray-900 mt-0.5">2.4 kg (Low)</div>
                </div>
                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">DOB</div>
                  <div className="text-xs font-bold text-gray-900 mt-0.5">{currentDisplayRecord.childDob || '05 Aug 2026'}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">Gender</div>
                  <div className="text-xs font-bold text-gray-900 mt-0.5">{currentDisplayRecord.childGender || 'Male'}</div>
                </div>
                <div className="p-2 bg-gray-50 rounded-xl border border-gray-100">
                  <div className="text-[9px] font-bold text-gray-500 uppercase">ASHA Worker</div>
                  <div className="text-xs font-bold text-teal-800 mt-0.5 truncate">{currentDisplayRecord.assignedWorkerName || 'Meena Kumari'}</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* High-Risk Indicators Banner (if active) */}
        {currentDisplayRecord.isHighRisk && (
          <div className="mx-4 my-3.5 p-3 bg-gradient-to-r from-amber-50 to-rose-50 border border-amber-300 rounded-2xl">
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
                setShareToast('📅 Reminder set for 22 Sep 2026 (VHND Clinic)!')
                setTimeout(() => setShareToast(null), 2500)
              }}
              className="py-2 bg-teal-600 hover:bg-teal-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <Icon name="bell" size={12} />
              Set Reminder
            </button>
            <button
              onClick={() => {
                setShareToast('📞 Calling ASHA Worker Meena Kumari (94140 12345)…')
                setTimeout(() => setShareToast(null), 2500)
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
              const isCompleted = milestone.status === 'completed'
              const isDue = milestone.status === 'due' || milestone.status === 'overdue'
              const isExpanded = expandedMilestoneId === milestone.id

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
                      <span className="text-[10px] font-black">!</span>
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                    )}
                  </div>

                  {/* Milestone Card */}
                  <div
                    onClick={() => setExpandedMilestoneId(isExpanded ? null : milestone.id)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                      isCompleted
                        ? 'bg-emerald-50/40 border-emerald-200 hover:border-emerald-300'
                        : isDue
                        ? 'bg-amber-50/60 border-amber-300 shadow-xs'
                        : 'bg-white border-gray-200 hover:border-gray-300 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-gray-900">{milestone.name}</span>
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">
                            {milestone.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5">{milestone.notes || milestone.recommendedWeekOrAge}</p>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-1">
                        <div>
                          <div className={`text-[10px] font-bold uppercase ${
                            isCompleted ? 'text-emerald-700' : isDue ? 'text-amber-700' : 'text-gray-400'
                          }`}>
                            {milestone.status}
                          </div>
                          <div className="text-[10px] font-mono text-gray-500">{milestone.completedDate || milestone.dueDate}</div>
                        </div>
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
              )
            })}
          </div>
        </div>
      </div>

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
                  const passInfo = `Digital MCP Pass\nBeneficiary: ${currentDisplayRecord.patientName || patientName}\nID: ${currentDisplayRecord.id}\nRCH: 9482-1039-4402\nEDD: ${currentDisplayRecord.edd || 'N/A'}\nVillage: ${patientVillage}`
                  if (navigator.share) {
                    navigator.share({ title: 'Digital MCP Card', text: passInfo }).catch(() => {})
                  } else {
                    navigator.clipboard.writeText(passInfo)
                    setShareToast('MCP Pass info copied to clipboard!')
                    setTimeout(() => setShareToast(null), 2000)
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
  )
}
