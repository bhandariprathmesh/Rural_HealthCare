import { useState, useEffect, useCallback } from 'react';
import {
  RiskBadge,
  ReferralBadge,
  PriorityBadge,
  Card,
  Icon,
  SectionHeader,
} from '../components/shared';
import type { Referral } from '../types';
import {
  getReferrals,
  createReferral,
  updateReferralStatus,
  getPatients,
  getReferralFacilities,
  getReferralDoctors,
  getReferralWorkers,
  getCurrentUser,
} from '../api/client';

interface Props {
  navigate: (s: string, id?: string) => void;
  patientId?: string;
}

interface PatientOption {
  id: string;
  healthId?: string;
  name: string;
  phone?: string;
}

interface FacilityOption {
  id: string;
  name: string;
  district?: string;
}

interface DoctorOption {
  id: string;
  name: string;
  specialty?: string;
  facility?: { id: string; name: string };
}

interface WorkerOption {
  id: string;
  name: string;
  workerCode?: string;
}

const STATUS_STEPS: Referral['status'][] = [
  'pending',
  'accepted',
  'in-consultation',
  'referred',
  'completed',
];

export default function ReferralSystem({ navigate, patientId }: Props) {
  const [dbUser, setDbUser] = useState<any>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [selected, setSelected] = useState<Referral | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [creating, setCreating] = useState(Boolean(patientId));

  // Form options from live DB
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);

  // Form state
  const [selectedPatientId, setSelectedPatientId] = useState(patientId || '');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'emergency'>('urgent');

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then(setDbUser)
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [fetchedReferrals, fetchedPatients, fetchedFacilities, fetchedDoctors, fetchedWorkers] =
        await Promise.all([
          getReferrals(),
          getPatients().catch(() => []),
          getReferralFacilities().catch(() => []),
          getReferralDoctors().catch(() => []),
          getReferralWorkers().catch(() => []),
        ]);

      const mapped: Referral[] = (fetchedReferrals || []).map((r: any) => ({
        id: r.referralCode || r.id,
        rawId: r.id,
        patientId: r.patient?.healthId || r.patient?.id || r.patientId,
        patientName: r.patient?.name || r.patientName || 'Patient',
        fromWorker: r.fromWorker || 'Authorized Care Provider',
        toPHC: r.toPHC || r.toFacility?.name || 'Destination Healthcare Facility',
        toDoctorName: r.toDoctor?.name,
        toDoctorSpecialty: r.toDoctor?.specialty,
        reason: r.reason || '',
        riskLevel: (r.riskLevel?.toLowerCase() || 'moderate') as any,
        status: (r.status?.toLowerCase().replace('_', '-') || 'pending') as any,
        date:
          r.date ||
          new Date(r.createdAt || Date.now()).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
        priority: (r.priority?.toLowerCase() || 'routine') as any,
        aiSummary: r.aiSummary,
      }));

      setReferrals(mapped);
      if (mapped.length > 0) {
        setSelected(mapped[0]);
      } else {
        setSelected(null);
      }

      if (fetchedPatients && fetchedPatients.length > 0) {
        setPatients(fetchedPatients);
        if (!selectedPatientId && !patientId) {
          setSelectedPatientId(fetchedPatients[0].id);
        } else if (patientId) {
          const matched = fetchedPatients.find(
            (p: any) => p.id === patientId || p.healthId === patientId
          );
          if (matched) {
            setSelectedPatientId(matched.id);
          }
        }
      }

      if (fetchedFacilities && fetchedFacilities.length > 0) {
        setFacilities(fetchedFacilities);
        if (!selectedFacilityId) {
          setSelectedFacilityId(fetchedFacilities[0].id);
        }
      }

      if (fetchedDoctors && fetchedDoctors.length > 0) {
        setDoctors(fetchedDoctors);
      }

      if (fetchedWorkers && fetchedWorkers.length > 0) {
        setWorkers(fetchedWorkers);
        if (!selectedWorkerId) {
          setSelectedWorkerId(fetchedWorkers[0].id);
        }
      }
    } catch (err: any) {
      setFetchError(
        err?.message || 'Failed to load live referrals from PostgreSQL database.'
      );
    } finally {
      setLoading(false);
    }
  }, [patientId, selectedPatientId, selectedFacilityId, selectedWorkerId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered =
    filterStatus === 'all'
      ? referrals
      : referrals.filter((r) => r.status === filterStatus);

  const currentStepIdx = selected
    ? Math.max(0, STATUS_STEPS.indexOf(selected.status as Referral['status']))
    : 0;

  const isDoctor = dbUser?.role === 'DOCTOR';
  const isWorker = dbUser?.role === 'WORKER';

  async function handleCreateReferral() {
    if (!reason.trim() || !selectedPatientId) return;
    setSubmitting(true);
    setCreateError(null);

    try {
      const chosenFacility = facilities.find((f) => f.id === selectedFacilityId);
      const chosenDoctor = doctors.find((d) => d.id === selectedDoctorId);
      const chosenWorker = workers.find((w) => w.id === selectedWorkerId);

      // Referring provider attribution
      let fromWorkerName: string | undefined;
      let fromWorkerId: string | undefined;

      if (isDoctor) {
        fromWorkerName = dbUser?.fullName
          ? (dbUser.fullName.toLowerCase().startsWith('dr.') ? dbUser.fullName : `Dr. ${dbUser.fullName}`)
          : 'Doctor';
        fromWorkerId = dbUser?.id;
      } else if (isWorker) {
        fromWorkerName = dbUser?.fullName ? `${dbUser.fullName} (ASHA)` : 'ASHA Health Worker';
        fromWorkerId = dbUser?.id;
      } else {
        fromWorkerName = chosenWorker?.name;
        fromWorkerId = chosenWorker?.id;
      }

      const res = await createReferral({
        patientId: selectedPatientId,
        toFacilityId: selectedFacilityId || chosenDoctor?.facility?.id || undefined,
        toPHC: chosenFacility?.name || chosenDoctor?.facility?.name,
        toDoctorId: selectedDoctorId || undefined,
        fromWorkerId,
        fromWorker: fromWorkerName,
        reason: reason.trim(),
        priority,
      });

      if (res?.referral) {
        const r = res.referral;
        const newRef: Referral = {
          id: r.referralCode || r.id,
          rawId: r.id,
          patientId: r.patient?.healthId || r.patient?.id || r.patientId,
          patientName: r.patient?.name || r.patientName || 'Patient',
          fromWorker: r.fromWorker || fromWorkerName || 'Authorized Care Provider',
          toPHC: r.toPHC || chosenFacility?.name || 'Destination Healthcare Facility',
          toDoctorName: r.toDoctor?.name || chosenDoctor?.name,
          toDoctorSpecialty: r.toDoctor?.specialty || chosenDoctor?.specialty,
          reason: r.reason,
          riskLevel: (r.riskLevel?.toLowerCase() || 'moderate') as any,
          status: 'pending',
          date: r.date || 'Today',
          priority: (r.priority?.toLowerCase() || priority) as any,
          aiSummary: r.aiSummary,
        };

        setReferrals((prev) => [newRef, ...prev]);
        setSelected(newRef);
        setCreating(false);
        setReason('');
      }
    } catch (err: any) {
      setCreateError(
        err?.message || 'Failed to save referral to database. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvanceStatus(targetStatus?: string) {
    if (!selected) return;
    const nextIdx = currentStepIdx + 1;
    const nextStatus = targetStatus || (nextIdx < STATUS_STEPS.length ? STATUS_STEPS[nextIdx] : null);
    if (!nextStatus) return;

    try {
      const refId = (selected as any).rawId || selected.id;
      await updateReferralStatus(refId, nextStatus.toUpperCase());
      const updated: Referral = { ...selected, status: nextStatus as any };
      setSelected(updated);
      setReferrals((prev) =>
        prev.map((r) => (r.id === selected.id ? updated : r))
      );
    } catch (err: any) {
      alert(err?.message || 'Failed to update referral status');
    }
  }

  const activePatientObj = patients.find((p) => p.id === selectedPatientId);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Clinical Referral System
          </h1>
          <p className="text-sm text-gray-500">
            Provider-directed patient transfer, specialist consultation, and care pathway tracking
          </p>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setCreateError(null);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
        >
          <Icon name="plus" size={16} />
          New Referral
        </button>
      </div>

      {/* Create New Referral Modal / Panel */}
      {creating && (
        <Card className="p-5 border-brand-200 bg-brand-50/70 shadow-md">
          <SectionHeader
            title="Create Clinical Referral"
            action={
              <button
                onClick={() => setCreating(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg hover:bg-gray-100"
              >
                <Icon name="x" size={18} />
              </button>
            }
          />

          {createError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            {/* Patient Selector */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Patient to Refer <span className="text-red-500">*</span>
              </label>
              {patientId && activePatientObj ? (
                <div className="w-full px-3.5 py-2.5 border border-brand-300 rounded-xl text-sm bg-brand-50 font-medium text-brand-950 flex items-center justify-between">
                  <span>{activePatientObj.name} ({activePatientObj.healthId || activePatientObj.id.slice(0, 8)})</span>
                  <span className="text-[10px] bg-brand-200 text-brand-800 px-2 py-0.5 rounded-md font-bold">Active Case</span>
                </div>
              ) : (
                <select
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 font-medium"
                >
                  {patients.length === 0 && (
                    <option value="">No patients available</option>
                  )}
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.healthId || p.id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Destination Facility */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Destination Facility / PHC / CHC <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedFacilityId}
                onChange={(e) => setSelectedFacilityId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                {facilities.length === 0 && (
                  <option value="">No facilities available</option>
                )}
                {facilities.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} {f.district ? `(${f.district})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Destination Specialist / Doctor (Optional) */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Destination Specialist / Attending Doctor <span className="text-xs text-gray-400 font-normal">(Optional)</span>
              </label>
              <select
                value={selectedDoctorId}
                onChange={(e) => {
                  setSelectedDoctorId(e.target.value);
                  const doc = doctors.find((d) => d.id === e.target.value);
                  if (doc?.facility?.id) {
                    setSelectedFacilityId(doc.facility.id);
                  }
                }}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">Any Available Specialist / On-Duty Medical Officer</option>
                {doctors.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} {d.specialty ? `· ${d.specialty}` : ''} {d.facility?.name ? `(${d.facility.name})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Referring Provider */}
            <div>
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Referring Provider
              </label>
              <div className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-700 font-medium">
                {isDoctor ? (
                  <span>Dr. {dbUser?.fullName?.replace(/^Dr\.?\s*/i, '') || 'Doctor'} (Attending Doctor)</span>
                ) : isWorker ? (
                  <span>{dbUser?.fullName || 'ASHA'} (Community Health Worker)</span>
                ) : (
                  <span>Authorized Healthcare Administrator</span>
                )}
              </div>
            </div>

            {/* Priority Selector */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Priority Level <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                {(['routine', 'urgent', 'emergency'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2.5 rounded-xl border text-xs font-bold uppercase transition-all cursor-pointer ${
                      priority === p
                        ? p === 'emergency'
                          ? 'bg-red-600 text-white border-red-600 shadow-sm'
                          : p === 'urgent'
                            ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                            : 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason for Referral */}
            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-gray-700 block mb-1">
                Clinical Indication & Referral Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. Suspected Acute Coronary Syndrome, persistent fever unresponsive to first-line antipyretics, high-risk antenatal evaluation..."
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-brand-200">
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting || !reason.trim() || !selectedPatientId}
              onClick={handleCreateReferral}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer disabled:opacity-50"
            >
              <Icon name="share" size={14} />
              {submitting ? 'Dispatching Referral…' : 'Dispatch Clinical Referral'}
            </button>
          </div>
        </Card>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 pb-1 overflow-x-auto">
        {[
          { id: 'all', label: 'All Statuses' },
          { id: 'pending', label: 'Pending' },
          { id: 'accepted', label: 'Accepted' },
          { id: 'in-consultation', label: 'In Consultation' },
          { id: 'completed', label: 'Completed' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilterStatus(t.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              filterStatus === t.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-brand-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card className="p-8 text-center text-gray-400">
          <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-xs">Loading clinical referrals from PostgreSQL database…</p>
        </Card>
      ) : fetchError ? (
        <Card className="p-6 bg-red-50 border-red-200 text-red-700 text-center text-xs">
          {fetchError}
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: List of Referrals */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <Card className="p-6 text-center text-gray-400 text-xs">
                No referrals found matching the selected criteria.
              </Card>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                    selected?.id === r.id
                      ? 'border-brand-500 bg-brand-50/50 ring-2 ring-brand-100 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-brand-200 hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="font-bold text-sm text-gray-900 truncate">
                      {r.patientName}
                    </div>
                    <PriorityBadge priority={r.priority} />
                  </div>

                  <div className="text-xs text-gray-600 line-clamp-2 mb-2 font-medium">
                    {r.reason}
                  </div>

                  <div className="text-[11px] text-gray-500 space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-700">From:</span> {r.fromWorker}
                    </div>
                    <div className="flex items-center gap-1 truncate">
                      <span className="font-semibold text-gray-700">To:</span> {r.toDoctorName ? `${r.toDoctorName} · ` : ''}{r.toPHC}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100 text-[10px] text-gray-400">
                    <ReferralBadge status={r.status} />
                    <span className="font-mono">{r.date}</span>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Right Column: Detailed Referral View */}
          <div className="lg:col-span-2 space-y-4">
            {selected ? (
              <>
                <Card className="p-5 shadow-sm space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-display text-lg font-bold text-gray-900">
                          {selected.patientName}
                        </h2>
                        <PriorityBadge priority={selected.priority} />
                      </div>
                      <div className="font-mono text-xs text-gray-400">
                        {selected.id}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <RiskBadge level={selected.riskLevel} size="lg" />
                    </div>
                  </div>

                  {/* Status Progression Stepper */}
                  <div>
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                      Referral Care Pathway
                    </div>
                    <div className="flex items-center">
                      {STATUS_STEPS.map((s, i) => {
                        const isActive = i <= currentStepIdx;
                        const isCurrent = i === currentStepIdx;
                        return (
                          <div key={s} className="flex items-center flex-1 last:flex-none">
                            <div className="flex flex-col items-center gap-1 flex-1">
                              <div
                                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                  isActive
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-100 text-gray-400'
                                } ${isCurrent ? 'ring-4 ring-brand-100' : ''}`}
                              >
                                {i < currentStepIdx ? <Icon name="check" size={13} /> : i + 1}
                              </div>
                              <span className={`text-[10px] font-semibold text-center uppercase tracking-tight ${
                                isActive ? 'text-brand-800' : 'text-gray-400'
                              }`}>
                                {s.replace('-', ' ')}
                              </span>
                            </div>
                            {i < STATUS_STEPS.length - 1 && (
                              <div className={`flex-1 h-0.5 mx-1 ${i < currentStepIdx ? 'bg-brand-500' : 'bg-gray-200'}`} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Referral Overview Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-gray-50 rounded-xl text-xs">
                    <div>
                      <div className="text-gray-500 font-semibold mb-0.5">Referring Provider</div>
                      <div className="text-gray-900 font-bold">{selected.fromWorker}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 font-semibold mb-0.5">Destination Facility & Team</div>
                      <div className="text-gray-900 font-bold">
                        {selected.toDoctorName ? `${selected.toDoctorName} · ` : ''}{selected.toPHC}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 font-semibold mb-0.5">Referral Date</div>
                      <div className="text-gray-800 font-medium">{selected.date}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 font-semibold mb-0.5">Current Status</div>
                      <div><ReferralBadge status={selected.status} /></div>
                    </div>
                  </div>

                  {/* Clinical Reason */}
                  <div className="p-3.5 bg-brand-50/50 border border-brand-100 rounded-xl">
                    <div className="text-[10px] font-bold text-brand-800 uppercase tracking-wider mb-1">
                      Clinical Indication & Notes
                    </div>
                    <p className="text-xs text-gray-800 leading-relaxed font-medium">
                      {selected.reason}
                    </p>
                  </div>

                  {/* Action Bar based on Status */}
                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {selected.status === 'pending' && (
                        <button
                          onClick={() => handleAdvanceStatus('accepted')}
                          className="px-3.5 py-2 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <Icon name="check" size={14} /> Accept Referral
                        </button>
                      )}
                      {selected.status === 'accepted' && (
                        <button
                          onClick={() => handleAdvanceStatus('in-consultation')}
                          className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <Icon name="clipboard" size={14} /> Start Consultation
                        </button>
                      )}
                      {selected.status === 'in-consultation' && (
                        <button
                          onClick={() => handleAdvanceStatus('completed')}
                          className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs cursor-pointer shadow-sm flex items-center gap-1.5"
                        >
                          <Icon name="check_circle" size={14} /> Mark Completed
                        </button>
                      )}
                      {selected.status !== 'completed' && currentStepIdx < STATUS_STEPS.length - 1 && (
                        <button
                          onClick={() => handleAdvanceStatus()}
                          className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs cursor-pointer"
                        >
                          Advance Next →
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('doctor-patient-view', selected.patientId)}
                        className="px-3 py-2 bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold rounded-xl text-xs cursor-pointer flex items-center gap-1 border border-brand-200"
                      >
                        <Icon name="user" size={14} /> Open Patient Chart
                      </button>
                    </div>
                  </div>
                </Card>
              </>
            ) : (
              <Card className="p-8 text-center text-gray-400">
                <Icon name="clipboard" size={32} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">No referral selected</p>
                <p className="text-xs text-gray-400 mt-1">
                  Choose a referral from the list on the left to view the care pathway and details.
                </p>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}