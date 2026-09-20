import { useState, useEffect } from 'react';
import { ConsentBadge, HealthIDCard, Card, Icon, SectionHeader } from '../components/shared';
import {
  getCurrentUser,
  getPatientByHealthId,
  createPatientConsent,
  revokePatientConsent,
  getPatientAccessRequests,
  approvePatientConsent,
  getDoctors,
  getWorkers,
} from '../api/client';

interface Props {
  navigate: (s: string) => void;
}

export default function ConsentManagement({ navigate }: Props) {
  const [patient, setPatient] = useState<any>(null);
  const [consents, setConsents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGrant, setShowGrant] = useState(false);
  const [selectedScope, setSelectedScope] = useState<string[]>([
    'Consultations',
    'Vitals',
    'Prescriptions',
  ]);
  const [grantForm, setGrantForm] = useState({
    grantedTo: '',
    role: 'Doctor',
    organization: 'Primary Health Centre',
    purpose: 'Routine primary health care and medical consultation',
    duration: '1 month',
  });
  const [doctorsList, setDoctorsList] = useState<any[]>([]);
  const [workersList, setWorkersList] = useState<any[]>([]);
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const dataScopes = [
    'Consultations',
    'Vitals',
    'Prescriptions',
    'DiagnosticReports',
    'Referrals',
    'Medical History',
    'Contact Information',
  ];

  async function loadData() {
    try {
      const user = await getCurrentUser().catch(() => null);
      const pProfile = user?.patientProfile;

      if (pProfile) {
        const healthId = pProfile.healthId || pProfile.id;
        const res = healthId ? await getPatientByHealthId(healthId).catch(() => null) : null;

        if (res?.patient) {
          setPatient(res.patient);
          // Format consent entries
          const list = (res.patient.consentEntries || []).map((c: any) => ({
            id: c.id,
            consentCode: c.consentCode,
            grantedTo: c.grantedTo,
            role: c.role,
            organization: c.organization,
            status: (c.status?.toLowerCase() || 'granted') as any,
            purpose: c.purpose,
            dataScope: c.dataScope || [],
            expiresAt: c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Permanent',
          }));
          setConsents(list);
        } else {
          setPatient(pProfile);
          setConsents([]);
        }

        const targetId = pProfile.id || pProfile.healthId;
        const reqs = targetId ? await getPatientAccessRequests(targetId).catch(() => []) : [];
        setPendingRequests(reqs || []);
      }

      // Fetch roster for quick select
      const docs = await getDoctors().catch(() => []);
      const wrks = await getWorkers().catch(() => []);
      setDoctorsList(docs || []);
      setWorkersList(wrks || []);
    } catch (err) {
      console.error('Failed to load consents:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadData();
  }, []);

  function toggleScope(scope: string) {
    setSelectedScope((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  async function handleApprove(id: string) {
    setActionLoadingId(id);
    try {
      await approvePatientConsent(id);
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      setActionMsg({ type: 'success', text: 'Access request approved! Healthcare provider now has authorized access.' });
      setTimeout(() => setActionMsg(null), 4000);
      loadData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Failed to approve consent request.' });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleReject(id: string) {
    setActionLoadingId(id);
    try {
      await revokePatientConsent(id, 'Rejected by patient via consent manager');
      setPendingRequests((prev) => prev.filter((r) => r.id !== id));
      setActionMsg({ type: 'success', text: 'Access request rejected. Healthcare provider was denied access.' });
      setTimeout(() => setActionMsg(null), 4000);
      loadData();
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Failed to reject consent request.' });
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleRevoke(id: string) {
    try {
      await revokePatientConsent(id, 'Revoked by patient via consent manager');
      setConsents((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: 'revoked' } : c))
      );
      setActionMsg({ type: 'success', text: 'Consent successfully revoked.' });
      setTimeout(() => setActionMsg(null), 3000);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Failed to revoke consent.' });
    }
  }

  async function handleGrantSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patient?.id) return;

    if (!grantForm.grantedTo.trim()) {
      setActionMsg({ type: 'error', text: 'Please specify healthcare provider name.' });
      return;
    }

    if (selectedScope.length === 0) {
      setActionMsg({ type: 'error', text: 'Please select at least one data scope.' });
      return;
    }

    setIsSubmitting(true);
    setActionMsg(null);

    try {
      // Calculate expiresAt date
      const now = new Date();
      let expiresAt: string | undefined;
      if (grantForm.duration === '1 day') {
        expiresAt = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
      } else if (grantForm.duration === '1 week') {
        expiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
      } else if (grantForm.duration === '1 month') {
        expiresAt = new Date(now.getTime() + 30 * 24 * 3600 * 1000).toISOString();
      }

      const payload = {
        patientId: patient.id,
        grantedTo: grantForm.grantedTo.trim(),
        role: grantForm.role,
        organization: grantForm.organization.trim() || 'Primary Health Centre',
        purpose: grantForm.purpose.trim(),
        dataScope: selectedScope,
        expiresAt,
      };

      const res = await createPatientConsent(payload);

      const newEntry = {
        id: res?.id || `CA-${Date.now()}`,
        consentCode: res?.consentCode || `CA-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        grantedTo: payload.grantedTo,
        role: payload.role,
        organization: payload.organization,
        status: 'granted' as const,
        purpose: payload.purpose,
        dataScope: payload.dataScope,
        expiresAt: expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Permanent',
      };

      setConsents((prev) => [newEntry, ...prev]);
      setShowGrant(false);
      setActionMsg({ type: 'success', text: `Access granted to ${payload.grantedTo} successfully!` });
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err: any) {
      setActionMsg({ type: 'error', text: err?.message || 'Failed to grant consent.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  const activeCount = consents.filter(
    (c) => c.status === 'granted' || c.status === 'temporary'
  ).length;
  const tempCount = consents.filter((c) => c.status === 'temporary').length;
  const revokedCount = consents.filter((c) => c.status === 'revoked').length;

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Loading consent records…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('patient-dashboard')}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold text-gray-900">Consent & Privacy</h1>
            <p className="text-xs text-gray-500">Control who can access your longitudinal health records</p>
          </div>
        </div>

        <button
          onClick={() => setShowGrant(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 transition-colors shadow-xs"
        >
          <Icon name="plus" size={13} /> Grant Access
        </button>
      </div>

      {/* Patient Health ID Card */}
      {patient && (
        <div className="flex justify-center">
          <HealthIDCard
            id={patient.healthId || patient.id}
            name={patient.name || 'Patient'}
            size="sm"
          />
        </div>
      )}

      {/* Alerts */}
      {actionMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs font-medium ${
            actionMsg.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-red-50 border border-red-200 text-red-700'
          }`}
        >
          {actionMsg.text}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 text-center bg-green-50 text-green-700">
          <div className="font-display text-2xl font-bold">{activeCount}</div>
          <div className="text-xs font-medium mt-0.5">Access Granted</div>
        </div>
        <div className="rounded-2xl p-4 text-center bg-amber-50 text-amber-700">
          <div className="font-display text-2xl font-bold">{tempCount}</div>
          <div className="text-xs font-medium mt-0.5">Temporary</div>
        </div>
        <div className="rounded-2xl p-4 text-center bg-gray-100 text-gray-600">
          <div className="font-display text-2xl font-bold">{revokedCount}</div>
          <div className="text-xs font-medium mt-0.5">Revoked</div>
        </div>
      </div>

      {/* ABDM Privacy Notice */}
      <div className="flex items-start gap-2.5 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
        <Icon name="shield" size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-800 leading-relaxed">
          <strong>ABDM Consent Architecture:</strong> Your Patient Health ID alone never gives anyone access to your records without your permission. Every doctor or health worker requires your explicit consent. You can revoke access anytime with immediate effect.
        </p>
      </div>

      {/* Pending Access Requests from Doctors & Health Workers */}
      {pendingRequests.length > 0 && (
        <Card className="p-5 border-2 border-amber-300 bg-amber-50/40 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center text-amber-700 shrink-0">
                <Icon name="lock" size={16} />
              </div>
              <div>
                <h3 className="font-display font-bold text-gray-900 text-sm">
                  Pending Access Requests ({pendingRequests.length})
                </h3>
                <p className="text-[11px] text-gray-500">
                  Healthcare providers requesting authorization to view your records
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
              Action Required
            </span>
          </div>

          <div className="space-y-3">
            {pendingRequests.map((r: any) => {
              const isActing = actionLoadingId === r.id;
              return (
                <div
                  key={r.id}
                  className="p-4 bg-white border border-amber-200 rounded-2xl flex items-start justify-between gap-4 flex-wrap shadow-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-gray-900">{r.grantedTo}</span>
                      <span className="px-2 py-0.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-md text-[10px] font-semibold">
                        {r.role || 'Doctor'}
                      </span>
                      <span className="font-mono text-[10px] text-gray-400">{r.consentCode}</span>
                    </div>

                    <div className="text-xs text-gray-600 mt-1 font-medium">
                      Purpose: {r.purpose || 'Clinical assessment'}
                    </div>

                    {Array.isArray(r.dataScope) && r.dataScope.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {r.dataScope.map((s: string) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 bg-gray-100 border border-gray-200 text-gray-600 rounded text-[10px]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}

                    {r.expiresAt && (
                      <div className="text-[10px] text-gray-400 mt-1.5">
                        Duration until: {new Date(r.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleApprove(r.id)}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50 cursor-pointer flex items-center gap-1"
                    >
                      <Icon name="check" size={13} />
                      {isActing ? 'Authorizing…' : 'Approve Access'}
                    </button>
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleReject(r.id)}
                      className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1"
                    >
                      <Icon name="x" size={13} />
                      {isActing ? 'Declining…' : 'Decline'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Consents List Card */}
      <Card>
        <div className="px-5 pt-5 pb-3">
          <SectionHeader
            title="Healthcare Providers With Access"
            action={
              <button
                onClick={() => setShowGrant(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-lg text-xs font-semibold hover:bg-brand-100"
              >
                <Icon name="plus" size={12} /> New Grant
              </button>
            }
          />
        </div>

        {consents.length === 0 ? (
          <div className="text-center py-12 px-6">
            <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-gray-400">
              <Icon name="shield" size={24} />
            </div>
            <h3 className="font-semibold text-gray-800 text-sm">No Active Consents</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              You have not granted access to any external healthcare providers yet. Your health records are completely private.
            </p>
            <button
              onClick={() => setShowGrant(true)}
              className="mt-4 px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold hover:bg-brand-700 transition-colors"
            >
              + Grant Access to Doctor or ASHA
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {consents.map((consent) => (
              <div key={consent.id} className="px-5 py-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                  <Icon
                    name={
                      consent.role === 'Doctor'
                        ? 'clipboard'
                        : consent.role?.includes('Admin')
                        ? 'settings'
                        : 'users'
                    }
                    size={18}
                    className="text-gray-500"
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-semibold text-sm text-gray-900">{consent.grantedTo}</span>
                    <ConsentBadge status={consent.status} />
                  </div>
                  <div className="text-xs text-gray-500">
                    {consent.role} · {consent.organization}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">Purpose: {consent.purpose}</div>

                  {consent.expiresAt && (
                    <div className="text-xs text-amber-600 mt-0.5 flex items-center gap-1">
                      <Icon name="history" size={10} />
                      {consent.status === 'revoked' ? 'Was valid until' : 'Expires'}: {consent.expiresAt}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {consent.dataScope.map((d: string) => (
                      <span key={d} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 shrink-0">
                  {consent.status !== 'revoked' ? (
                    <button
                      onClick={() => handleRevoke(consent.id)}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-xs font-medium transition-colors border border-red-100"
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className="px-3 py-1.5 bg-gray-50 text-gray-400 rounded-lg text-xs font-medium">
                      Revoked
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Grant Access Modal */}
      {showGrant && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden my-6">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-display text-lg font-bold text-gray-900">Grant Health Record Access</h3>
                  <p className="text-xs text-gray-500">Authorize a doctor or worker to view your records</p>
                </div>
                <button
                  onClick={() => setShowGrant(false)}
                  className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-gray-500"
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <form onSubmit={handleGrantSubmit} className="space-y-4">
                {/* Select from registered doctors or custom */}
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1">
                    Select Healthcare Provider
                  </label>
                  <select
                    onChange={(e) => {
                      const selectedVal = e.target.value;
                      if (!selectedVal) return;
                      if (selectedVal.startsWith('doc:')) {
                        const doc = doctorsList.find((d) => d.id === selectedVal.replace('doc:', ''));
                        if (doc) {
                          setGrantForm({
                            ...grantForm,
                            grantedTo: doc.name,
                            role: 'Doctor',
                            organization: doc.facility?.name || doc.facilityName || 'PHC Lunkaransar',
                          });
                        }
                      } else if (selectedVal.startsWith('wrk:')) {
                        const wrk = workersList.find((w) => w.id === selectedVal.replace('wrk:', ''));
                        if (wrk) {
                          setGrantForm({
                            ...grantForm,
                            grantedTo: wrk.name,
                            role: 'ASHA Worker',
                            organization: `Sub Centre ${wrk.village || 'Rural'}`,
                          });
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 mb-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="">-- Choose from available doctors/workers or enter below --</option>
                    <optgroup label="Doctors">
                      {doctorsList.map((doc) => (
                        <option key={doc.id} value={`doc:${doc.id}`}>
                          {doc.name} ({doc.specialty || 'General'} — {doc.facility?.name || 'PHC'})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="ASHA & Community Workers">
                      {workersList.map((wrk) => (
                        <option key={wrk.id} value={`wrk:${wrk.id}`}>
                          {wrk.name} (ASHA — {wrk.village || 'Primary Centre'})
                        </option>
                      ))}
                    </optgroup>
                  </select>

                  <input
                    type="text"
                    placeholder="Or type provider full name"
                    value={grantForm.grantedTo}
                    onChange={(e) => setGrantForm({ ...grantForm, grantedTo: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Role</label>
                    <select
                      value={grantForm.role}
                      onChange={(e) => setGrantForm({ ...grantForm, role: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="Doctor">Doctor</option>
                      <option value="ASHA Worker">ASHA Worker</option>
                      <option value="Lab Technician">Lab Technician</option>
                      <option value="PHC Staff">PHC Staff</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">Facility / Org</label>
                    <input
                      type="text"
                      value={grantForm.organization}
                      onChange={(e) => setGrantForm({ ...grantForm, organization: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">Access Duration</label>
                  <div className="flex gap-2">
                    {['1 day', '1 week', '1 month', 'Permanent'].map((d) => (
                      <button
                        type="button"
                        key={d}
                        onClick={() => setGrantForm({ ...grantForm, duration: d })}
                        className={`flex-1 py-2 border rounded-xl text-xs font-medium transition-all ${
                          grantForm.duration === d
                            ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold'
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                    Data Scope Allowed
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {dataScopes.map((scope) => (
                      <button
                        type="button"
                        key={scope}
                        onClick={() => toggleScope(scope)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          selectedScope.includes(scope)
                            ? 'bg-brand-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowGrant(false)}
                    className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isSubmitting && <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                    Confirm & Grant
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
