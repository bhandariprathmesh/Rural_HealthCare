import { useState, useEffect } from 'react';
import { PATIENTS, CONSULTATIONS, REFERRALS, AUDIT_LOG } from '../data';
import {
  RiskBadge,
  ConsentBadge,
  HealthIDCard,
  Tabs,
  TimelineEntry,
  Card,
  Icon,
  SectionHeader,
  PermissionBadge,
} from '../components/shared';
import {
  getPatientByHealthId,
  getPatients,
  getCurrentUser,
} from '../api/client';

interface Props {
  navigate: (s: string) => void;
  patientId?: string | null;
}

const PROFILE_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'history', label: 'Medical History' },
  { id: 'diagnoses', label: 'Diagnoses' },
  { id: 'medications', label: 'Medications' },
  { id: 'consultations', label: 'Consultations' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'documents', label: 'Documents' },
  { id: 'access', label: 'Access History' },
];

export default function PatientProfile({
  navigate,
  patientId,
}: Props) {
  const [activeTab, setActiveTab] = useState('overview');
  const [patient, setPatient] = useState<any>(null);
  const [consultations, setConsultations] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);

    async function load() {
      try {
        if (patientId) {
          // Worker/doctor viewing a specific patient by Health ID
          const res = await getPatientByHealthId(patientId);

          if (res?.patient) {
            setPatient({
              ...res.patient,
              id: res.patient.healthId || res.patient.id,
            });

            setConsultations(
              mapConsultations(
                res.consultations,
                res.patient
              )
            );

            setReferrals(
              mapReferrals(
                res.referrals,
                res.patient
              )
            );
          } else {
            const patientList = await getPatients().catch(() => []);
            if (patientList && patientList.length > 0) {
              const firstId = patientList[0].healthId || patientList[0].id;
              const res = await getPatientByHealthId(firstId).catch(() => null);
              if (res?.patient) {
                setPatient({
                  ...res.patient,
                  id: res.patient.healthId || res.patient.id,
                });
                setConsultations(
                  mapConsultations(res.consultations, res.patient)
                );
                setReferrals(
                  mapReferrals(res.referrals, res.patient)
                );
              }
            }
          }
        } else {
          // Patient viewing their own profile
          const user = await getCurrentUser();

          if (user?.patientProfile) {
            const healthId =
              user.patientProfile.healthId;

            if (!healthId) {
              setPatient({
                ...user.patientProfile,
                id: user.patientProfile.id,
              });

              setConsultations([]);
              setReferrals([]);

              return;
            }

            setPatient({
              ...user.patientProfile,
              id: healthId,
            });

            const res =
              await getPatientByHealthId(
                healthId
              ).catch(() => null);

            if (res) {
              setConsultations(
                mapConsultations(
                  res.consultations,
                  res.patient
                )
              );

              setReferrals(
                mapReferrals(
                  res.referrals,
                  res.patient
                )
              );
            }
          } else {
            const patientList = await getPatients().catch(() => []);
            if (patientList && patientList.length > 0) {
              const firstId = patientList[0].healthId || patientList[0].id;
              const res = await getPatientByHealthId(firstId).catch(() => null);
              if (res?.patient) {
                setPatient({
                  ...res.patient,
                  id: res.patient.healthId || res.patient.id,
                });
                setConsultations(
                  mapConsultations(res.consultations, res.patient)
                );
                setReferrals(
                  mapReferrals(res.referrals, res.patient)
                );
              }
            }
          }
        }
      } catch {
        // Handle error safely without mock fallback
        setPatient(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [patientId]);

  function fallbackFor(id: string) {
    return (
      PATIENTS.find(
        (p) => p.id === id
      ) || PATIENTS[0]
    );
  }

  function mapConsultations(
    list: any[] | undefined,
    p: any
  ) {
    if (!list?.length) {
      return [];
    }

    return list.map((c: any) => ({
      id:
        c.consultationCode ||
        c.id,

      patientId:
        p?.healthId ||
        p?.id,

      date: c.date,
      time: c.time,

      workerName:
        c.workerName,

      doctorName:
        c.doctorName,

      symptoms:
        c.symptoms || [],

      vitals:
        c.vitals || {},

      diagnosis:
        c.diagnosis,

      treatment:
        c.treatment,

      prescription:
        c.prescription || [],

      notes:
        c.notes,

      riskLevel:
        (c.riskLevel?.toLowerCase() ||
          'low') as any,

      referralStatus:
        (c.referralStatus ||
          'completed') as any,

      followUpDate:
        c.followUpDate,
    }));
  }

  function mapReferrals(
    list: any[] | undefined,
    p: any
  ) {
    if (!list?.length) {
      return [];
    }

    return list.map((r: any) => ({
      id:
        r.referralCode ||
        r.id,

      patientId:
        p?.healthId ||
        p?.id,

      patientName:
        p?.name,

      fromWorker:
        r.fromWorker ||
        r.fromWorkerName ||
        'Meena Kumari (ASHA)',

      toPHC:
        r.toPHC ||
        r.toFacility?.name ||
        r.toFacilityName ||
        'Primary Health Centre',

      reason:
        r.reason,

      riskLevel:
        (r.riskLevel?.toLowerCase() ||
          'low') as any,

      status:
        (r.status?.toLowerCase().replace(/_/g, '-') ||
          'pending') as any,

      date:
        r.date ||
        (r.createdAt
          ? new Date(r.createdAt).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })
          : 'Recent'),

      priority:
        (r.priority?.toLowerCase() ||
          'routine') as any,

      aiSummary:
        r.aiSummary,
    }));
  }

  if (loading || !patient) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto mb-3" />

          <div className="text-sm text-gray-500">
            Loading patient data…
          </div>
        </div>
      </div>
    );
  }

  const isMock =
    consultations.length === 0 &&
    referrals.length === 0 &&
    !patientId;

  const nameStr =
    patient.name || 'Unknown';

  const initials =
    nameStr
      .split(' ')
      .map(
        (w: string) =>
          w[0] || ''
      )
      .join('')
      .toUpperCase();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <button
          onClick={() =>
            navigate('worker-dashboard')
          }
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-600"
        >
          <Icon
            name="chevron_right"
            size={14}
            className="rotate-180"
          />

          Back to Dashboard
        </button>

        <div className="flex items-center gap-2 px-3 py-1.5 bg-teal-50 border border-teal-100 rounded-xl text-[10px] text-teal-700 font-semibold">
          <Icon
            name="user"
            size={11}
          />

          ASHA Worker View
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[10px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <PermissionBadge
            type="asha-recorded"
          />

          <span>
            — Symptoms, vitals, basic info
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <PermissionBadge
            type="doctor-editable"
          />

          <span>
            — Diagnoses, prescriptions, referrals
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <PermissionBadge
            type="view-only"
          />

          <span>
            — Patient can view their record
          </span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-r from-brand-700 to-brand-600 px-6 py-5 text-white">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center text-2xl font-display font-bold shrink-0">
              {initials}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-xl font-bold">
                  {patient.name}
                </h1>

                {patient.nameHi && (
                  <span className="text-brand-200 text-sm">
                    · {patient.nameHi}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-4 mt-1 text-brand-100 text-sm flex-wrap">
                <span>
                  {patient.age} yrs ·{' '}
                  {patient.gender === 'F' ||
                  patient.gender === 'Female'
                    ? 'Female'
                    : 'Male'}
                </span>

                <span>
                  Blood:{' '}
                  <strong className="text-white">
                    {patient.bloodGroup ||
                      'N/A'}
                  </strong>
                </span>

                <span className="font-mono text-xs bg-white/10 px-2 py-0.5 rounded">
                  {patient.healthId ||
                    patient.id}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <RiskBadge
                  level={
                    patient.riskLevel
                      ? typeof patient.riskLevel ===
                        'string'
                        ? patient.riskLevel.toLowerCase()
                        : patient.riskLevel
                      : 'low'
                  }
                />

                {patient.consentStatus && (
                  <ConsentBadge
                    status={
                      patient.consentStatus
                    }
                  />
                )}

                {patient.vaccinationStatus && (
                  <span className="px-2.5 py-1 bg-white/10 text-white text-xs rounded-full">
                    {patient.vaccinationStatus}
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={() =>
                navigate(
                  'health-assessment'
                )
              }
              className="shrink-0 px-4 py-2 bg-white text-brand-700 rounded-xl text-sm font-semibold hover:bg-brand-50 transition-colors"
            >
              + Assessment
            </button>
          </div>
        </div>

        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-8 gap-y-1 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Icon
              name="map_pin"
              size={11}
              className="text-gray-400"
            />

            {patient.village}
            {patient.district
              ? `, ${patient.district}`
              : ''}
          </span>

          <span className="flex items-center gap-1">
            <Icon
              name="phone"
              size={11}
              className="text-gray-400"
            />

            {patient.phone}
          </span>

          {patient.emergencyContact?.name && (
            <span>
              Emergency:{' '}
              <strong>
                {patient.emergencyContact.name}
              </strong>{' '}
              (
              {
                patient.emergencyContact
                  .relation
              }
              ){' '}
              {
                patient.emergencyContact
                  .phone
              }
            </span>
          )}

          {patient.healthWorker && (
            <span>
              Health Worker:{' '}
              <strong>
                {patient.healthWorker}
              </strong>
            </span>
          )}

          <span>
            Registered:{' '}
            {patient.registeredAt ||
              patient.createdAt?.slice(
                0,
                10
              ) ||
              'N/A'}
          </span>
        </div>
      </Card>

      <Tabs
        tabs={PROFILE_TABS}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <SectionHeader title="Patient Health ID" />

              <HealthIDCard
                id={
                  patient.healthId ||
                  patient.id
                }
                name={patient.name}
                size="lg"
              />

              <div className="flex gap-2 mt-4">
                {[
                  'Copy',
                  'QR Code',
                  'Share',
                  'Print',
                ].map((a) => (
                  <button
                    key={a}
                    className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-600 transition-colors"
                  >
                    {a}
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader title="Alerts & Conditions" />

              <div className="space-y-3">
                {patient.allergies?.length >
                0 ? (
                  <div>
                    <div className="text-xs font-semibold text-red-600 mb-2 flex items-center gap-1">
                      <Icon
                        name="alert"
                        size={12}
                      />

                      ALLERGIES
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {patient.allergies.map(
                        (a: string) => (
                          <span
                            key={a}
                            className="px-2.5 py-1 bg-red-50 border border-red-100 text-red-700 rounded-lg text-xs font-medium"
                          >
                            {a}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                ) : null}

                <div>
                  <div className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                    <Icon
                      name="activity"
                      size={12}
                    />

                    CHRONIC CONDITIONS
                  </div>

                  {patient.chronicConditions?.length >
                  0 ? (
                    <div className="flex flex-wrap gap-2">
                      {patient.chronicConditions.map(
                        (c: string) => (
                          <span
                            key={c}
                            className="px-2.5 py-1 bg-amber-50 border border-amber-100 text-amber-800 rounded-lg text-xs font-medium"
                          >
                            {c}
                          </span>
                        )
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">
                      None reported.
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader
                title="Health Timeline"
                sub="Chronological record of care"
              />

              <div className="mt-4">
                {consultations.length >
                0 ? (
                  consultations.map(
                    (c, i) => (
                      <TimelineEntry
                        key={c.id}
                        date={`${c.date}${
                          c.time
                            ? ', ' +
                              c.time
                            : ''
                        }`}
                        title={`Consultation – ${
                          c.diagnosis ||
                          'Assessment recorded'
                        }`}
                        sub={
                          c.notes ||
                          `Recorded by ${c.workerName}`
                        }
                        icon="clipboard"
                        color="brand"
                      />
                    )
                  )
                ) : (
                  <div className="text-xs text-gray-400 py-3">
                    No consultations recorded yet.
                  </div>
                )}

                <TimelineEntry
                  date={
                    patient.registeredAt ||
                    'Registered'
                  }
                  title="Patient Registered"
                  sub={`Health ID issued: ${
                    patient.healthId ||
                    patient.id
                  }`}
                  icon="user"
                  color="brand"
                  last
                />
              </div>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="p-5">
              <SectionHeader
                title="Current Medications"
                action={
                  <PermissionBadge
                    type="doctor-editable"
                  />
                }
              />

              <div className="space-y-2.5 mt-3">
                {patient.currentMedications?.length >
                0 ? (
                  patient.currentMedications.map(
                    (
                      m: string,
                      i: number
                    ) => (
                      <div
                        key={i}
                        className="flex items-start gap-2.5 p-3 bg-brand-50 rounded-xl"
                      >
                        <Icon
                          name="pill"
                          size={14}
                          className="text-brand-600 shrink-0 mt-0.5"
                        />

                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {m
                              .split(' ')
                              .slice(
                                0,
                                2
                              )
                              .join(' ')}
                          </div>

                          <div className="text-xs text-gray-500">
                            {m
                              .split(' ')
                              .slice(
                                2
                              )
                              .join(' ')}
                          </div>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="text-xs text-gray-400 text-center py-4">
                    No active prescriptions.
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-5">
              <SectionHeader
                title="Last Vitals"
                sub={
                  consultations[0]?.date ||
                  'No vitals recorded'
                }
                action={
                  <PermissionBadge
                    type="asha-recorded"
                  />
                }
              />

              {consultations[0]?.vitals ? (
                <div className="space-y-2 mt-3">
                  {Object.entries(
                    consultations[0].vitals
                  ).map(
                    ([k, v]: any) => (
                      <div
                        key={k}
                        className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0"
                      >
                        <span className="text-xs text-gray-500 capitalize">
                          {k}
                        </span>

                        <span className="font-mono text-sm font-semibold text-gray-800">
                          {String(v)}
                        </span>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="text-xs text-gray-400 text-center py-4">
                  Take an assessment to record vitals.
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'consultations' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[11px] text-gray-500">
            <Icon
              name="info"
              size={13}
              className="shrink-0 mt-0.5 text-gray-400"
            />

            As an ASHA worker you may view consultation records. Diagnoses and prescriptions are recorded by authorized clinicians only.
          </div>

          {consultations.length ===
          0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No consultations recorded yet.
            </div>
          ) : (
            consultations.map((c) => (
              <Card
                key={c.id}
                className="p-5"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-display font-semibold text-gray-900">
                      {c.date}, {c.time}
                    </div>

                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-gray-500">
                        Recorded by:{' '}
                        <strong>
                          {c.workerName}
                        </strong>
                      </span>

                      <PermissionBadge
                        type="asha-recorded"
                      />

                      {c.doctorName && (
                        <>
                          <span className="text-[10px] text-gray-500">
                            · Reviewed by:{' '}
                            <strong>
                              {c.doctorName}
                            </strong>
                          </span>

                          <PermissionBadge
                            type="doctor-editable"
                          />
                        </>
                      )}
                    </div>
                  </div>

                  <RiskBadge
                    level={
                      c.riskLevel
                    }
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-gray-500">
                        Symptoms
                      </span>

                      <PermissionBadge
                        type="asha-recorded"
                      />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {c.symptoms.map(
                        (
                          s: string
                        ) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs"
                          >
                            {s}
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-gray-500">
                        Vitals
                      </span>

                      <PermissionBadge
                        type="asha-recorded"
                      />
                    </div>

                    <div className="text-xs text-gray-700 space-y-0.5">
                      <div>
                        BP:{' '}
                        {
                          c.vitals
                            ?.bloodPressure
                        }{' '}
                        · HR:{' '}
                        {
                          c.vitals
                            ?.heartRate
                        }{' '}
                        bpm
                      </div>

                      <div>
                        Temp:{' '}
                        {
                          c.vitals
                            ?.temperature
                        }
                        °C · SpO₂:{' '}
                        {
                          c.vitals
                            ?.spo2
                        }
                        %
                      </div>
                    </div>
                  </div>
                </div>

                {c.diagnosis && (
                  <div className="mt-3 p-3 bg-purple-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-purple-700">
                        Diagnosis
                      </span>

                      <PermissionBadge
                        type="doctor-editable"
                      />
                    </div>

                    <div className="text-sm text-gray-800">
                      {c.diagnosis}
                    </div>
                  </div>
                )}

                {c.prescription?.length >
                  0 && (
                  <div className="mt-2 p-3 bg-blue-50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-blue-700">
                        Prescription
                      </span>

                      <PermissionBadge
                        type="doctor-editable"
                      />
                    </div>

                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {c.prescription.map(
                        (
                          rx: string
                        ) => (
                          <li key={rx}>
                            · {rx}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'referrals' && (
        <div className="space-y-4">
          {referrals.length ===
          0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No referrals recorded.
            </div>
          ) : (
            referrals.map((r) => (
              <Card
                key={r.id}
                className="p-5"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {r.toPHC}
                    </div>

                    <div className="text-xs text-gray-500 mt-0.5">
                      {r.date} ·{' '}
                      {r.fromWorker}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <RiskBadge
                      level={
                        r.riskLevel
                      }
                      size="sm"
                    />
                  </div>
                </div>

                <p className="text-sm text-gray-700 mt-2">
                  {r.reason}
                </p>

                {r.aiSummary && (
                  <div className="mt-2 text-xs text-blue-700 bg-blue-50 p-2 rounded-lg">
                    {r.aiSummary}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'access' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-100 rounded-xl px-4 py-3">
            <Icon
              name="shield"
              size={14}
              className="text-brand-600"
            />

            Showing access log for{' '}
            <strong>
              {patient.name}
            </strong>{' '}
            ·{' '}
            <span className="font-mono text-xs">
              {patient.id}
            </span>
          </div>

          {AUDIT_LOG.filter(
            (a) =>
              a.patientId ===
              patient.id
          ).map((entry) => (
            <Card
              key={entry.id}
              className="p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
                  <Icon
                    name="eye"
                    size={14}
                    className="text-gray-500"
                  />
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-gray-900">
                      {entry.accessorName}
                    </div>

                    <div className="font-mono text-xs text-gray-400">
                      {entry.timestamp}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    {entry.accessorRole} ·{' '}
                    {entry.organization}
                  </div>

                  <div className="text-xs text-gray-700 mt-1">
                    {entry.action}
                  </div>

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {entry.dataAccessed.map(
                      (d) => (
                        <span
                          key={d}
                          className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]"
                        >
                          {d}
                        </span>
                      )
                    )}
                  </div>

                  <div className="text-[10px] text-gray-400 mt-1">
                    Purpose:{' '}
                    {entry.purpose}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {activeTab === 'medications' && (
        <Card className="p-5">
          <SectionHeader
            title="Current Medications"
            action={
              <PermissionBadge
                type="doctor-editable"
              />
            }
          />

          <div className="space-y-3 mt-3">
            {patient.currentMedications?.length >
            0 ? (
              patient.currentMedications.map(
                (
                  m: string,
                  i: number
                ) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl"
                  >
                    <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
                      <Icon
                        name="pill"
                        size={16}
                        className="text-brand-600"
                      />
                    </div>

                    <div>
                      <div className="font-medium text-sm text-gray-900">
                        {m}
                      </div>
                    </div>
                  </div>
                )
              )
            ) : (
              <div className="text-xs text-gray-400 text-center py-4">
                No active prescriptions.
              </div>
            )}
          </div>
        </Card>
      )}

      {(
        activeTab === 'history' ||
        activeTab === 'diagnoses' ||
        activeTab === 'documents'
      ) && (
        <Card className="p-8 text-center">
          <Icon
            name={
              activeTab ===
              'documents'
                ? 'document'
                : 'clipboard'
            }
            size={32}
            className="text-gray-300 mx-auto mb-3"
          />

          <p className="text-gray-500 font-medium">
            {activeTab ===
            'documents'
              ? 'No documents uploaded'
              : 'No additional records'}
          </p>

          <p className="text-xs text-gray-400 mt-1">
            Records will appear here as they are added
          </p>
        </Card>
      )}
    </div>
  );
}