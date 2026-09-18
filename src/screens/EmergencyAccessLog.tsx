import { useState, useEffect } from 'react';
import { Icon, Card, SectionHeader } from '../components/shared';
import { getEmergencyLogs } from '../api/client';

interface Props { navigate: (s: string) => void; }

const LOG_ENTRIES = [
  {
    id: 'EAL-2026-001',
    patient: 'Priya Devi',
    patientId: 'RHC-2026-8F4K92',
    doctor: 'Dr. Ankit Sharma',
    facility: 'PHC Lunkaransar',
    reason: 'Patient unconscious',
    note: 'Patient found unresponsive, suspected cardiac event, referred by ASHA Sunita Yadav.',
    started: '31 Aug 2026, 14:32',
    ended: '31 Aug 2026, 14:47',
    duration: '15 min',
    records: 'Emergency Medical Summary',
    addlRequested: false,
    status: 'Completed',
  },
  {
    id: 'EAL-2026-002',
    patient: 'Unknown Patient',
    patientId: 'TEMP-ER-2026-0046',
    doctor: 'Dr. Priya Mehta',
    facility: 'PHC Bikaner',
    reason: 'Life-threatening condition',
    note: 'RTA victim, unconscious, no ID available. Temp record created.',
    started: '28 Aug 2026, 09:15',
    ended: '28 Aug 2026, 09:30',
    duration: '15 min',
    records: 'Emergency Medical Summary, Vitals',
    addlRequested: true,
    status: 'Completed',
  },
  {
    id: 'EAL-2026-003',
    patient: 'Mohan Lal',
    patientId: 'RHC-2026-2K8Q15',
    doctor: 'Dr. Ankit Sharma',
    facility: 'PHC Lunkaransar',
    reason: 'Patient unable to provide consent',
    note: 'Acute COPD exacerbation, semi-conscious.',
    started: '31 Aug 2026, 08:35',
    ended: '31 Aug 2026, 08:50',
    duration: '15 min',
    records: 'Emergency Medical Summary, Medications, Allergies',
    addlRequested: true,
    status: 'Completed',
  },
];

export default function EmergencyAccessLog({ navigate }: Props) {
  const [logs, setLogs] = useState<any[]>(LOG_ENTRIES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLogs() {
      try {
        const fetched = await getEmergencyLogs();
        if (fetched && fetched.length > 0) {
          const mapped = fetched.map((f: any) => ({
            id: f.logCode || f.id,
            patient: f.patientName || 'Unknown Patient',
            patientId: f.patientHealthId || 'N/A',
            doctor: f.doctorName || 'Attending Physician',
            facility: f.facilityName || 'Emergency Center',
            reason: f.reason || 'Emergency Care',
            note: f.note || 'No clinical note provided',
            started: f.started || new Date(f.createdAt).toLocaleString('en-IN'),
            ended: f.ended || '15 min session',
            duration: f.duration || '15 min',
            records: f.records || 'Emergency Medical Summary',
            addlRequested: f.addlRequested || false,
            status: f.status || 'Active',
          }));
          setLogs(mapped);
        }
      } catch (e) {
        console.error('Failed to load emergency logs, showing offline records:', e);
      } finally {
        setLoading(false);
      }
    }
    loadLogs();
  }, []);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('doctor-dashboard')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">Emergency Access Log</h1>
          <p className="text-xs text-gray-500">Audit trail of all break-glass emergency access events</p>
        </div>
      </div>

      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
        <Icon name="shield" size={14} className="shrink-0 mt-0.5" />
        This log is immutable. Every emergency access event is permanently recorded. Patients are notified after access ends.
      </div>

      <div className="space-y-4">
        {loading && (
          <div className="text-center py-6 text-xs text-gray-500">Loading audit trail...</div>
        )}
        {logs.map(entry => (
          <Card key={entry.id} className="overflow-hidden">
            {/* Status bar */}
            <div className="bg-red-50 border-b border-red-100 px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs font-bold text-red-700 uppercase tracking-wide">Emergency Break-Glass</span>
                <span className="font-mono text-[10px] text-gray-400">{entry.id}</span>
              </div>
              <span className="text-xs font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded">{entry.status}</span>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Doctor / Staff</div>
                <div className="text-sm font-medium text-gray-900">{entry.doctor}</div>
                <div className="text-xs text-gray-500">{entry.facility}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Patient</div>
                <div className="text-sm font-medium text-gray-900">{entry.patient}</div>
                <div className="font-mono text-xs text-gray-400">{entry.patientId}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Emergency Reason</div>
                <div className="text-sm text-gray-800">{entry.reason}</div>
                <div className="text-xs text-gray-500 mt-0.5 italic">"{entry.note}"</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Access Window</div>
                <div className="text-xs text-gray-700">
                  <div>Started: {entry.started}</div>
                  <div>Ended: {entry.ended}</div>
                  <div className="font-semibold text-gray-800 mt-0.5">Duration: {entry.duration}</div>
                </div>
              </div>
              <div className="sm:col-span-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Records Accessed</div>
                <div className="flex flex-wrap gap-1.5">
                  {entry.records.split(', ').map(r => (
                    <span key={r} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{r}</span>
                  ))}
                  {entry.addlRequested && (
                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">+ Additional Records Requested</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <button className="w-full py-3 flex items-center justify-center gap-2 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50">
        <Icon name="document" size={15} />
        Export Emergency Access Report (PDF)
      </button>
    </div>
  );
}
