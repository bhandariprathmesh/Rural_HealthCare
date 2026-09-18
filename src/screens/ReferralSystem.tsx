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
  getReferralWorkers,
} from '../api/client';

interface Props {
  navigate: (s: string) => void;
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

export default function ReferralSystem({ navigate }: Props) {
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [selected, setSelected] = useState<Referral | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [creating, setCreating] = useState(false);

  // Form options from live DB
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);
  const [workers, setWorkers] = useState<WorkerOption[]>([]);

  // Form state
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'emergency'>('urgent');

  // Loading & error states
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [fetchedReferrals, fetchedPatients, fetchedFacilities, fetchedWorkers] =
        await Promise.all([
          getReferrals(),
          getPatients().catch(() => []),
          getReferralFacilities().catch(() => []),
          getReferralWorkers().catch(() => []),
        ]);

      const mapped: Referral[] = (fetchedReferrals || []).map((r: any) => ({
        id: r.referralCode || r.id,
        patientId: r.patient?.healthId || r.patientId,
        patientName: r.patient?.name || r.patientName || 'Patient',
        fromWorker: r.fromWorker || r.fromWorkerName || 'Meena Kumari (ASHA)',
        toPHC: r.toPHC || r.toFacility?.name || 'Primary Health Centre',
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
        setSelectedPatientId(fetchedPatients[0].id);
      }

      if (fetchedFacilities && fetchedFacilities.length > 0) {
        setFacilities(fetchedFacilities);
        setSelectedFacilityId(fetchedFacilities[0].id);
      }

      if (fetchedWorkers && fetchedWorkers.length > 0) {
        setWorkers(fetchedWorkers);
        setSelectedWorkerId(fetchedWorkers[0].id);
      }
    } catch (err: any) {
      setFetchError(
        err?.message || 'Failed to load live referrals from PostgreSQL database.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

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

  async function handleCreateReferral() {
    if (!reason.trim() || !selectedPatientId) return;
    setSubmitting(true);
    setCreateError(null);

    try {
      const chosenFacility = facilities.find((f) => f.id === selectedFacilityId);
      const chosenWorker = workers.find((w) => w.id === selectedWorkerId);

      const res = await createReferral({
        patientId: selectedPatientId,
        toFacilityId: selectedFacilityId || undefined,
        toPHC: chosenFacility?.name,
        fromWorkerId: selectedWorkerId || undefined,
        fromWorker: chosenWorker?.name,
        reason: reason.trim(),
        priority,
      });

      if (res?.referral) {
        const r = res.referral;
        const newRef: Referral = {
          id: r.referralCode || r.id,
          patientId: r.patient?.healthId || r.patientId,
          patientName: r.patient?.name || r.patientName || 'Patient',
          fromWorker: r.fromWorker || chosenWorker?.name || 'Meena Kumari (ASHA)',
          toPHC: r.toPHC || chosenFacility?.name || 'Primary Health Centre',
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

  async function handleAdvanceStatus() {
    if (!selected) return;
    const nextIdx = currentStepIdx + 1;
    if (nextIdx < STATUS_STEPS.length) {
      const nextStatus = STATUS_STEPS[nextIdx];
      try {
        await updateReferralStatus(selected.id, nextStatus.toUpperCase());
        const updated: Referral = { ...selected, status: nextStatus };
        setSelected(updated);
        setReferrals((prev) =>
          prev.map((r) => (r.id === selected.id ? updated : r))
        );
      } catch {
        // preserve current state if API fails
      }
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">
            Referral System
          </h1>
          <p className="text-sm text-gray-500">
            Track patient referrals and follow the care pathway
          </p>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setCreateError(null);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
        >
          <Icon name="plus" size={16} />
          New Referral
        </button>
      </div>

      {/* Create New Referral Modal / Panel */}
      {creating && (
        <Card className="p-5 border-brand-200 bg-brand-50">
          <SectionHeader
            title="Create New Referral"
            action={
              <button
                onClick={() => setCreating(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <Icon name="x" size={18} />
              </button>
            }
          />

          {createError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {createError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Patient
              </label>
              <select
                value={selectedPatientId}
                onChange={(e) => setSelectedPatientId(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
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
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Destination PHC / Hospital
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

            {workers.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">
                  Referring Health Worker / ASHA
                </label>
                <select
                  value={selectedWorkerId}
                  onChange={(e) => setSelectedWorkerId(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.workerCode ? `(${w.workerCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={workers.length > 0 ? '' : 'sm:col-span-2'}>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Priority
              </label>
              <div className="flex gap-2">
                {(['routine', 'urgent', 'emergency'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-semibold uppercase transition-all cursor-pointer ${
                      priority === p
                        ? p === 'emergency'
                          ? 'bg-red-600 text-white border-red-600'
                          : p === 'urgent'
                            ? 'bg-amber-500 text-white border-amber-500'
                            : 'bg-gray-600 text-white border-gray-600'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Reason for Referral
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Describe the clinical reason for referral..."
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                navigate('ai-risk');
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-xl text-sm border border-blue-200 cursor-pointer"
            >
              <Icon name="brain" size={14} /> Get AI Assessment First
            </button>
            <button
              type="button"
              onClick={handleCreateReferral}
              disabled={submitting || !reason.trim() || !selectedPatientId}
              className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Referral'}
            </button>
          </div>
        </Card>
      )}

      {/* Status Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'pending', 'accepted', 'in-consultation', 'completed'].map(
          (s) => {
            const count =
              s === 'all'
                ? referrals.length
                : referrals.filter((r) => r.status === s).length;
            return (
              <button
                key={s}
                onClick={() => {
                  setFilterStatus(s);
                  const matching =
                    s === 'all'
                      ? referrals
                      : referrals.filter((r) => r.status === s);
                  if (matching.length > 0 && (!selected || !matching.some((r) => r.id === selected.id))) {
                    setSelected(matching[0]);
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  filterStatus === s
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s === 'all'
                  ? 'All Referrals'
                  : s.charAt(0).toUpperCase() + s.slice(1).replace('-', ' ')}
                <span
                  className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                    filterStatus === s
                      ? 'bg-white/20 text-white'
                      : 'bg-gray-200 text-gray-700'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          }
        )}
      </div>

      {/* Fetch Error Banner */}
      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between">
          <div className="text-sm text-red-800">{fetchError}</div>
          <button
            onClick={loadData}
            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div className="flex items-center justify-center p-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-brand-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm font-medium text-gray-500">
              Loading referrals from PostgreSQL...
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Referral Cards List */}
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-2xl border border-gray-100 text-gray-400">
                <Icon name="clipboard" size={28} className="mx-auto mb-2 text-gray-300" />
                <p className="text-sm font-medium text-gray-600">
                  {referrals.length === 0
                    ? 'No referrals found in database'
                    : `No ${filterStatus.replace('-', ' ')} referrals`}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {referrals.length === 0
                    ? 'Click "New Referral" above to dispatch a referral.'
                    : 'Select "All Referrals" to view all records.'}
                </p>
              </div>
            ) : (
              filtered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                    selected?.id === r.id
                      ? 'border-brand-400 bg-brand-50 shadow-xs'
                      : 'border-gray-100 bg-white hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-semibold text-sm text-gray-900">
                      {r.patientName}
                    </span>
                    <PriorityBadge priority={r.priority} />
                  </div>
                  <div className="text-xs text-gray-500 mb-1.5">{r.toPHC}</div>
                  <div className="text-xs text-gray-600 truncate mb-2">
                    {r.reason}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <RiskBadge level={r.riskLevel} size="sm" />
                    <ReferralBadge status={r.status} />
                  </div>
                  <div className="font-mono text-[10px] text-gray-400 mt-2">
                    {r.id} · {r.date}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Right Column: Detailed Referral View */}
          <div className="lg:col-span-2 space-y-4">
            {selected ? (
              <>
                <Card className="p-5">
                  <div className="flex items-start justify-between mb-4">
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
                    <div className="flex items-center gap-2">
                      <RiskBadge level={selected.riskLevel} size="lg" />
                      {currentStepIdx < STATUS_STEPS.length - 1 && (
                        <button
                          onClick={handleAdvanceStatus}
                          className="px-3 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 rounded-xl text-xs font-semibold cursor-pointer transition-colors"
                        >
                          Advance Step →
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs font-semibold text-gray-500 mb-3">
                      REFERRAL PATHWAY
                    </div>
                    <div className="flex items-center">
                      {STATUS_STEPS.map((s, i) => {
                        const isActive = i <= currentStepIdx;
                        const isCurrent = i === currentStepIdx;
                        return (
                          <div
                            key={s}
                            className="flex items-center flex-1 last:flex-none"
                          >
                            <div
                              className={`flex flex-col items-center gap-1 ${
                                i < STATUS_STEPS.length - 1 ? 'flex-1' : ''
                              }`}
                            >
                              <div
                                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                                  isActive
                                    ? 'bg-brand-600 text-white'
                                    : 'bg-gray-100 text-gray-400'
                                } ${isCurrent ? 'ring-4 ring-brand-100' : ''}`}
                              >
                                {i < currentStepIdx ? (
                                  <Icon name="check" size={11} />
                                ) : (
                                  i + 1
                                )}
                              </div>
                              <div
                                className={`text-[9px] text-center font-medium ${
                                  isActive ? 'text-brand-700' : 'text-gray-400'
                                }`}
                              >
                                {s.replace('-', ' ')}
                              </div>
                            </div>
                            {i < STATUS_STEPS.length - 1 && (
                              <div
                                className={`flex-1 h-px mx-1 ${
                                  i < currentStepIdx
                                    ? 'bg-brand-400'
                                    : 'bg-gray-200'
                                }`}
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">
                        From
                      </div>
                      <div className="text-sm text-gray-800">
                        {selected.fromWorker}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">
                        To
                      </div>
                      <div className="text-sm text-gray-800 font-medium">
                        {selected.toPHC}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">
                        Date
                      </div>
                      <div className="text-sm text-gray-800">{selected.date}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-1">
                        Status
                      </div>
                      <ReferralBadge status={selected.status} />
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-gray-50 rounded-xl">
                    <div className="text-xs font-semibold text-gray-500 mb-1">
                      Reason for Referral
                    </div>
                    <div className="text-sm text-gray-700">
                      {selected.reason}
                    </div>
                  </div>

                  {selected.aiSummary && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-2">
                      <Icon
                        name="brain"
                        size={15}
                        className="text-blue-600 shrink-0 mt-0.5"
                      />
                      <div className="text-xs text-blue-800">
                        {selected.aiSummary}
                      </div>
                    </div>
                  )}
                </Card>

                <div className="flex gap-3">
                  <button
                    onClick={() => navigate('patient-profile')}
                    className="flex-1 py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Icon name="user" size={16} /> View Full Record
                  </button>
                  <button
                    onClick={() => navigate('ai-risk')}
                    className="px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium rounded-xl text-sm border border-blue-200 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Icon name="brain" size={16} /> AI Assessment
                  </button>
                </div>
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