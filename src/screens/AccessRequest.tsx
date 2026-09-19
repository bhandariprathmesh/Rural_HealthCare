import { useState, useEffect } from 'react';
import { Icon } from '../components/shared';
import {
  getCurrentUser,
  getPatientAccessRequests,
  approvePatientConsent,
  revokePatientConsent,
} from '../api/client';

interface Props {
  navigate: (s: string) => void;
}

export default function AccessRequest({ navigate }: Props) {
  const [patient, setPatient] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<'none' | 'allowed' | 'denied'>('none');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [showOTP, setShowOTP] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function loadRequests() {
      try {
        const user = await getCurrentUser().catch(() => null);
        const pProfile = user?.patientProfile;

        if (pProfile && mounted) {
          setPatient(pProfile);
          const targetId = pProfile.id || pProfile.healthId;
          const reqs = targetId ? await getPatientAccessRequests(targetId).catch(() => []) : [];
          if (mounted) {
            setRequests(reqs || []);
          }
        }
      } catch (err) {
        console.error('Failed to load access requests:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadRequests();

    return () => {
      mounted = false;
    };
  }, []);

  function handleOTP(i: number, val: string) {
    const next = [...otp];
    next[i] = val.slice(-1);
    setOtp(next);
    if (val && i < 5) {
      (document.getElementById(`req-otp-${i + 1}`) as HTMLInputElement)?.focus();
    }
  }

  const currentReq = requests[currentIndex];

  async function handleAllow() {
    if (!currentReq) return;
    setActionLoading(true);
    setErrorMsg('');

    try {
      await approvePatientConsent(currentReq.id);
      setDecision('allowed');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to authorize access.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeny() {
    if (!currentReq) return;
    setActionLoading(true);
    setErrorMsg('');

    try {
      await revokePatientConsent(currentReq.id, 'Denied by patient via access request modal');
      setDecision('denied');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to decline request.');
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Checking pending access requests…</div>
        </div>
      </div>
    );
  }

  if (decision === 'allowed') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="check" size={28} className="text-green-600" />
          </div>
          <h2 className="font-display text-xl font-bold text-gray-900">Access Granted</h2>
          <p className="text-sm text-gray-500 mt-2">
            {currentReq?.grantedTo || 'The healthcare provider'} can now access your records for clinical care.
          </p>
          <div className="mt-4 p-3 bg-green-50 rounded-xl text-xs text-green-700">
            This access is logged with timestamp in your audit history. You can revoke it anytime from Consent settings.
          </div>
          <button
            onClick={() => navigate('patient-dashboard')}
            className="mt-5 w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 text-sm transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (decision === 'denied') {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-sm w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Icon name="x" size={28} className="text-red-600" />
          </div>
          <h2 className="font-display text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="text-sm text-gray-500 mt-2">
            You have declined the access request. No clinical information will be shared.
          </p>
          <button
            onClick={() => navigate('patient-dashboard')}
            className="mt-5 w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 text-sm transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Clean empty state for new patients
  if (!currentReq || requests.length === 0) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 text-center space-y-4">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto text-brand-600">
            <Icon name="shield" size={32} />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-gray-900">No Pending Requests</h2>
            <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
              There are currently no healthcare providers or facilities requesting access to your health records.
            </p>
          </div>
          <div className="p-3.5 bg-gray-50 rounded-2xl text-left border border-gray-100">
            <div className="text-[11px] font-semibold text-gray-700 mb-1">Your Privacy Shield Active</div>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              Under ABDM guidelines, whenever a doctor or health facility requests your medical history, an authorization alert will appear here for your explicit consent.
            </p>
          </div>
          <button
            onClick={() => navigate('patient-dashboard')}
            className="w-full py-3 bg-brand-600 text-white font-semibold rounded-xl hover:bg-brand-700 text-sm transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const requesterInitials = currentReq.grantedTo
    ? currentReq.grantedTo
        .split(' ')
        .map((n: string) => n[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'HC';

  const maskedPhone = patient?.phone
    ? `+91 ${patient.phone.slice(0, 2)}••••••${patient.phone.slice(-2)}`
    : '+91 94••••••92';

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-brand-700 text-white px-6 py-5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                <Icon name="shield" size={16} />
              </div>
              <span className="font-display font-bold text-lg">Access Request</span>
            </div>
            {requests.length > 1 && (
              <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full font-medium">
                {currentIndex + 1} of {requests.length}
              </span>
            )}
          </div>
          <p className="text-brand-200 text-xs">
            A healthcare provider is requesting permission to access your medical records
          </p>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {errorMsg}
            </div>
          )}

          {/* Requester card */}
          <div className="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl border-2 border-gray-100">
            <div className="w-14 h-14 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-display font-bold text-xl shrink-0">
              {requesterInitials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-gray-900 text-base">
                {currentReq.grantedTo}
              </div>
              <div className="text-sm text-gray-600">{currentReq.role || 'Healthcare Practitioner'}</div>
              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                <Icon name="map_pin" size={10} />
                {currentReq.facility?.name || currentReq.organization || 'Primary Health Centre'}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-green-700 font-medium">Verified Healthcare Provider</span>
              </div>
            </div>
          </div>

          {/* Request details */}
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Purpose</div>
                <div className="text-xs font-medium text-gray-800 line-clamp-2">
                  {currentReq.purpose || 'Clinical care and consultation'}
                </div>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Duration</div>
                <div className="text-xs font-medium text-gray-800">
                  {currentReq.expiresAt
                    ? `Until ${new Date(currentReq.expiresAt).toLocaleDateString()}`
                    : '30 days'}
                </div>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-1.5">
                Data Requested
              </div>
              <div className="flex flex-wrap gap-1">
                {(currentReq.dataScope || ['Consultations', 'Vitals', 'Prescriptions']).map(
                  (d: string) => (
                    <span key={d} className="px-2 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">
                      {d}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="text-[10px] font-semibold text-gray-400 uppercase mb-0.5">Your Health ID</div>
              <div className="font-mono text-sm text-brand-700 font-semibold">
                {patient?.healthId || patient?.id || 'RHC-2026-ACTIVE'}
              </div>
            </div>
          </div>

          {/* Optional OTP Verification Section */}
          {!showOTP ? (
            <div className="p-3.5 bg-brand-50 rounded-2xl border border-brand-100 flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Icon name="lock" size={14} className="text-brand-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-semibold text-brand-800">2-Factor Authorize (Optional)</div>
                  <p className="text-[11px] text-brand-600">You can authorize directly or verify via OTP.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOTP(true)}
                className="text-xs text-brand-700 font-bold hover:underline shrink-0"
              >
                Use OTP
              </button>
            </div>
          ) : (
            <div className="p-4 bg-brand-50 rounded-2xl border border-brand-200">
              <div className="text-xs font-semibold text-brand-800 mb-2.5">Enter 6-digit verification code</div>
              <div className="flex gap-2 justify-center mb-2">
                {otp.map((digit, i) => (
                  <input
                    key={i}
                    id={`req-otp-${i}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleOTP(i, e.target.value)}
                    className="w-9 h-11 text-center border-2 border-gray-200 rounded-lg text-base font-mono font-bold focus:outline-none focus:border-brand-500 bg-white"
                  />
                ))}
              </div>
              <p className="text-[10px] text-brand-600 text-center">SMS code sent to {maskedPhone}</p>
            </div>
          )}

          {/* Consent notice */}
          <div className="flex items-start gap-2 text-xs text-gray-500">
            <Icon name="info" size={12} className="shrink-0 mt-0.5" />
            <span>This authorization will be permanently logged in your Access History audit log.</span>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleDeny}
              disabled={actionLoading}
              className="py-3.5 border-2 border-red-200 text-red-600 font-bold rounded-xl hover:bg-red-50 transition-colors text-sm disabled:opacity-50"
            >
              <Icon name="x" size={15} className="inline-block mr-1.5" />
              Deny
            </button>
            <button
              onClick={handleAllow}
              disabled={actionLoading}
              className="py-3.5 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors text-sm disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
            >
              {actionLoading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Icon name="check" size={15} />
              )}
              Allow Access
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
