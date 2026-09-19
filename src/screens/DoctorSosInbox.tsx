import { useState, useEffect } from 'react';
import { Icon, Card } from '../components/shared';
import { getDoctorSosInbox, acceptSosAlert, declineSosAlert } from '../api/client';

interface Props {
  navigate: (screen: string) => void;
  isOffline?: boolean;
}

export default function DoctorSosInbox({ navigate, isOffline = false }: Props) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchInbox = async () => {
    try {
      const data = await getDoctorSosInbox();
      setAlerts(data);
      setLoading(false);
    } catch (err: any) {
      console.warn('Failed to poll SOS inbox:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInbox();

    // Poll every 5s if online
    const interval = setInterval(() => {
      if (!isOffline) {
        fetchInbox();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isOffline]);

  const handleAccept = async (alertId: string, patientHealthId: string) => {
    setActionInProgress(alertId);
    try {
      await acceptSosAlert(alertId);
      setFeedbackMsg({ text: 'SOS Alert ACCEPTED. You are assigned as lead physician.', type: 'success' });
      // Store emergency context for Break-Glass Access
      sessionStorage.setItem('active_sos_alert_id', alertId);
      sessionStorage.setItem('active_sos_patient_id', patientHealthId);
      await fetchInbox();
    } catch (err: any) {
      if (err?.message?.includes('409') || err?.status === 409) {
        setFeedbackMsg({ text: 'Alert was already accepted by another physician.', type: 'error' });
      } else {
        setFeedbackMsg({ text: 'Failed to accept alert. Please retry.', type: 'error' });
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDecline = async (alertId: string) => {
    setActionInProgress(alertId);
    try {
      await declineSosAlert(alertId);
      setFeedbackMsg({ text: 'Alert declined. Immediately escalated to next doctor in roster.', type: 'success' });
      await fetchInbox();
    } catch (err) {
      setFeedbackMsg({ text: 'Failed to decline alert.', type: 'error' });
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('doctor-dashboard')}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-xl font-bold text-gray-900">Emergency SOS Inbox</h1>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 animate-pulse">
                Live (90s Escalation)
              </span>
            </div>
            <p className="text-xs text-gray-500">
              Active patient emergency broadcasts assigned to your duty roster priority
            </p>
          </div>
        </div>

        {isOffline && (
          <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 text-amber-800 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Offline Mode
          </span>
        )}
      </div>

      {/* Feedback Banner */}
      {feedbackMsg && (
        <div
          className={`p-4 rounded-xl text-xs font-medium flex items-center justify-between ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-gray-400 hover:text-gray-600">
            ×
          </button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-sm text-gray-500">Checking duty roster for active alerts...</div>
      ) : alerts.length === 0 ? (
        <Card className="p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
            <Icon name="check_circle" size={24} />
          </div>
          <h3 className="font-bold text-gray-900">All Clear — No Pending Emergency Broadcasts</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            When an ASHA worker or patient triggers an SOS in your jurisdiction, it will route here with an active 90-second response window before escalating.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => {
            const pct = Math.min(100, Math.max(0, (alert.secondsRemaining / 90) * 100));
            const isCritical = alert.secondsRemaining <= 20;

            return (
              <Card key={alert.id} className="overflow-hidden border-2 border-red-200 shadow-md">
                {/* Status bar with countdown progress */}
                <div className="bg-red-50 px-5 py-3 border-b border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping" />
                    <span className="font-bold text-xs text-red-800 tracking-wide uppercase">
                      Urgent Emergency Alert ({alert.sosCode})
                    </span>
                    <span className="text-[11px] text-gray-500">• Hop {alert.escalationIndex + 1}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-red-700">
                      {alert.status === 'DECLINED_ALL' || alert.currentResponderId === 'CONTROL_ROOM'
                        ? '🚨 Escalated to District Emergency Control Room'
                        : `⏱ ${alert.secondsRemaining}s before escalation`}
                    </span>
                  </div>
                </div>

                {/* Countdown progress bar */}
                <div className="w-full bg-gray-100 h-1.5">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      isCritical ? 'bg-red-600' : alert.secondsRemaining <= 45 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {/* Body Details */}
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-gray-400 font-medium block">Patient Health ID</span>
                      <span className="text-sm font-bold text-gray-900 font-mono">{alert.patientHealthId}</span>
                    </div>

                    <div>
                      <span className="text-gray-400 font-medium block">Raised By</span>
                      <span className="text-sm font-semibold text-gray-800">
                        {alert.fromName} ({alert.role})
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 font-medium block">Location / Village</span>
                      <span className="text-sm font-semibold text-gray-800 flex items-center gap-1">
                        <Icon name="location" size={14} className="text-red-500" />
                        {alert.location}
                      </span>
                    </div>
                  </div>

                  {/* Vitals Snapshot */}
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                      Emergency Vitals Snapshot
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <span className="text-gray-400 text-[10px] block">Heart Rate</span>
                        <span className="font-bold text-gray-800">
                          {alert.vitals?.pulse || alert.vitals?.heartRate || '118 bpm'}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <span className="text-gray-400 text-[10px] block">Blood Pressure</span>
                        <span className="font-bold text-gray-800">
                          {alert.vitals?.bloodPressure || alert.vitals?.bp || '85/55 mmHg'}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <span className="text-gray-400 text-[10px] block">SpO2 Oxygen</span>
                        <span className="font-bold text-red-600">
                          {alert.vitals?.spo2 || '91%'}
                        </span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-gray-100">
                        <span className="text-gray-400 text-[10px] block">Status</span>
                        <span className="font-bold text-amber-700">Semi-conscious</span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      disabled={actionInProgress === alert.id || alert.status === 'ACCEPTED'}
                      onClick={() => handleAccept(alert.id, alert.patientHealthId)}
                      className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 transition-colors shadow-sm"
                    >
                      <Icon name="check_circle" size={16} />
                      {actionInProgress === alert.id
                        ? 'Processing...'
                        : alert.status === 'ACCEPTED'
                        ? `✓ Accepted by ${alert.acceptedBy || 'Physician'}`
                        : 'Accept Emergency SOS'}
                    </button>

                    <button
                      disabled={actionInProgress === alert.id}
                      onClick={() => handleDecline(alert.id)}
                      className="py-3 px-4 border border-gray-200 hover:bg-gray-100 disabled:opacity-50 text-gray-700 font-semibold rounded-xl text-sm transition-colors"
                    >
                      Decline & Escalate
                    </button>

                    <button
                      onClick={() => {
                        sessionStorage.setItem('active_sos_alert_id', alert.id);
                        sessionStorage.setItem('active_sos_patient_id', alert.patientHealthId);
                        navigate('emergency-access');
                      }}
                      className="py-3 px-4 bg-red-50 hover:bg-red-100 text-red-700 font-bold border border-red-200 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <Icon name="shield" size={16} />
                      Break-Glass Access
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
