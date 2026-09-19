import { useState, useEffect } from 'react';
import { Card, Icon } from '../components/shared';
import { getCurrentUser, getPatientAuditLogs } from '../api/client';

interface Props {
  navigate: (s: string) => void;
}

export default function AccessHistory({ navigate }: Props) {
  const [patient, setPatient] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  const roles = ['all', 'Doctor', 'ASHA Worker', 'PHC Staff'];

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function loadLogs() {
      try {
        const user = await getCurrentUser().catch(() => null);
        const pProfile = user?.patientProfile;

        if (pProfile && mounted) {
          setPatient(pProfile);
          const targetId = pProfile.id || pProfile.healthId;
          const logs = targetId ? await getPatientAuditLogs(targetId).catch(() => []) : [];
          if (mounted) {
            setAuditLogs(logs || []);
          }
        }
      } catch (err) {
        console.error('Failed to load audit logs:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadLogs();

    return () => {
      mounted = false;
    };
  }, []);

  const filtered = auditLogs.filter((entry) => {
    if (filterRole !== 'all') {
      const entryRole = entry.accessorRole || '';
      if (!entryRole.toLowerCase().includes(filterRole.toLowerCase())) return false;
    }
    if (filterDate) {
      const entryTime = entry.timestamp || entry.createdAt || '';
      if (!entryTime.includes(filterDate)) return false;
    }
    return true;
  });

  const roleColors: Record<string, string> = {
    Doctor: 'bg-purple-50 text-purple-700',
    'ASHA Worker': 'bg-brand-50 text-brand-700',
    'PHC Staff': 'bg-blue-50 text-blue-700',
  };

  function handlePrintReport() {
    window.print();
  }

  if (loading) {
    return (
      <div className="p-6 max-w-3xl mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />
          <div className="text-sm text-gray-500">Retrieving tamper-proof audit trail…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5 print:p-0 print:max-w-none">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('patient-dashboard')}
            className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
          >
            <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
          </button>
          <div>
            <h1 className="font-display text-xl font-bold text-gray-900">Access History</h1>
            <p className="text-xs text-gray-500">Complete audit log of who accessed your records</p>
          </div>
        </div>

        {patient && (
          <div className="text-right">
            <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-lg font-semibold">
              {patient.healthId || patient.id}
            </span>
          </div>
        )}
      </div>

      {/* Print only banner */}
      <div className="hidden print:block mb-6 border-b pb-4">
        <h1 className="text-2xl font-bold text-gray-900">RuralCare — Access & Audit Trail Report</h1>
        <p className="text-sm text-gray-600">
          Patient: {patient?.name || 'N/A'} · Health ID: {patient?.healthId || patient?.id || 'N/A'} · Generated: {new Date().toLocaleString()}
        </p>
      </div>

      {/* Summary banner */}
      <div className="p-4 bg-brand-50 border border-brand-100 rounded-2xl flex items-start gap-3 print:hidden">
        <Icon name="shield" size={18} className="text-brand-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-brand-800 text-sm">Your Privacy is Protected by Law</div>
          <div className="text-xs text-brand-600 mt-0.5 leading-relaxed">
            Every access to your longitudinal health records is recorded with a cryptographic timestamp in compliance with ABDM privacy standards. Unauthorized access is strictly prohibited and logged automatically.
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {roles.map((r) => (
            <button
              key={r}
              onClick={() => setFilterRole(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filterRole === r
                  ? 'bg-white text-brand-700 shadow-xs font-semibold'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {r === 'all' ? 'All Roles' : r}
            </button>
          ))}
        </div>

        <div className="relative">
          <Icon
            name="history"
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="pl-8 pr-3 py-1.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>

        {(filterRole !== 'all' || filterDate) && (
          <button
            onClick={() => {
              setFilterRole('all');
              setFilterDate('');
            }}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-medium hover:bg-red-100 transition-colors"
          >
            <Icon name="x" size={11} /> Clear filters
          </button>
        )}
      </div>

      <div className="text-xs text-gray-500 print:hidden">
        {filtered.length} access event{filtered.length !== 1 ? 's' : ''} found
      </div>

      {/* Timeline */}
      <div className="space-y-3">
        {filtered.map((entry, i) => (
          <Card key={entry.id || i} className="p-4 hover:shadow-xs transition-shadow">
            <div className="flex items-start gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  roleColors[entry.accessorRole] || 'bg-gray-100 text-gray-500'
                }`}
              >
                <Icon
                  name={entry.accessorRole === 'Doctor' ? 'clipboard' : 'users'}
                  size={17}
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-gray-900">{entry.accessorName}</div>
                    <div className="text-xs text-gray-500">
                      {entry.accessorRole} · {entry.organization}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono text-xs text-gray-500">
                      {entry.timestamp || (entry.createdAt ? new Date(entry.createdAt).toLocaleString() : 'Recent')}
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-gray-700 font-medium">
                    <Icon name="eye" size={12} className="text-brand-600" />
                    {entry.action}
                  </div>
                </div>

                {entry.dataAccessed && (
                  <div className="mt-1.5">
                    <div className="text-[10px] text-gray-400 mb-1">Data accessed:</div>
                    <div className="flex flex-wrap gap-1">
                      {(Array.isArray(entry.dataAccessed) ? entry.dataAccessed : [String(entry.dataAccessed)]).map(
                        (d: string) => (
                          <span
                            key={d}
                            className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]"
                          >
                            {d}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400">
                  <Icon name="info" size={10} />
                  Purpose: {entry.purpose}
                </div>
              </div>
            </div>

            {i < filtered.length - 1 && (
              <div className="flex justify-start pl-5 mt-3 print:hidden">
                <div className="w-px h-3 bg-gray-100" />
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Clean Empty State */}
      {filtered.length === 0 && (
        <Card className="p-12 text-center">
          <Icon name="shield" size={36} className="text-gray-300 mx-auto mb-3" />
          <h3 className="font-semibold text-gray-800 text-sm">No Access History Recorded Yet</h3>
          <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
            Your health records have not been accessed by any healthcare provider yet. When an authorized doctor or health worker reviews your record, a permanent audit log entry will appear here.
          </p>
        </Card>
      )}

      {/* Export / Print */}
      {filtered.length > 0 && (
        <button
          onClick={handlePrintReport}
          className="w-full py-3 flex items-center justify-center gap-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors print:hidden"
        >
          <Icon name="document" size={15} />
          Download Full Audit Report (PDF)
        </button>
      )}
    </div>
  );
}
