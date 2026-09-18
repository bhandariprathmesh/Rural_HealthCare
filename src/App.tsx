import { useEffect, useState } from 'react';
import type { Role } from './types';
import { Icon, OfflineIndicator } from './components/shared';
import { getCurrentUser, getToken, clearToken, dispatchSosAlert } from './api/client';

import LoginScreen from './screens/LoginScreen';
import WorkerDashboard from './screens/WorkerDashboard';
import PatientRegistration from './screens/PatientRegistration';
import PatientProfile from './screens/PatientProfile';
import HealthAssessment from './screens/HealthAssessment';
import AIRiskAssessment from './screens/AIRiskAssessment';
import ReferralSystem from './screens/ReferralSystem';
import DoctorDashboard from './screens/DoctorDashboard';
import EmergencyAccess from './screens/EmergencyAccess';
import EmergencyAccessLog from './screens/EmergencyAccessLog';
import DoctorPatientView from './screens/DoctorPatientView';
import ConsentManagement from './screens/ConsentManagement';
import AccessRequest from './screens/AccessRequest';
import AccessHistory from './screens/AccessHistory';
import OfflineMode from './screens/OfflineMode';
import SyncCenter from './screens/SyncCenter';
import PatientMobileDashboard from './screens/PatientMobileDashboard';
import AdminDashboard from './screens/AdminDashboard';

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

export interface CurrentUser {
  id?: string;
  email?: string;
  role?: string;
  fullName?: string;
  phone?: string;

  doctorProfile?: {
    id?: string;
    name?: string;
    specialty?: string;
    hprId?: string;
    facility?: {
      id?: string;
      name?: string;
      district?: string;
      state?: string;
    };
  };

  workerProfile?: {
    id?: string;
    name?: string;
    workerCode?: string;
    workerType?: string;
    village?: string;
    subCentre?: string;
    assignedPhc?: string;
    district?: string;
    state?: string;
  };

  patientProfile?: {
    id?: string;
    name?: string;
    healthId?: string;
    village?: string;
    district?: string;
    state?: string;
  };
}

const NAV: Record<Role, NavItem[]> = {
  login: [],

  worker: [
    {
      id: 'worker-dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
    },
    {
      id: 'register-patient',
      label: 'Register Patient',
      icon: 'plus',
    },
    {
      id: 'patient-profile',
      label: 'Patient Profile',
      icon: 'user',
    },
    {
      id: 'health-assessment',
      label: 'New Assessment',
      icon: 'clipboard',
    },
    {
      id: 'ai-risk',
      label: 'AI Assessment',
      icon: 'brain',
    },
    {
      id: 'referral',
      label: 'Referrals',
      icon: 'share',
    },
    {
      id: 'offline',
      label: 'Offline Mode',
      icon: 'wifi_off',
    },
    {
      id: 'sync',
      label: 'Sync Center',
      icon: 'sync',
    },
  ],

  doctor: [
    {
      id: 'doctor-dashboard',
      label: 'Dashboard',
      icon: 'dashboard',
    },
    {
      id: 'doctor-patient-view',
      label: 'Patient View',
      icon: 'user',
    },
    {
      id: 'health-assessment',
      label: 'New Assessment',
      icon: 'clipboard',
    },
    {
      id: 'referral',
      label: 'Referrals',
      icon: 'share',
    },
    {
      id: 'emergency-access',
      label: 'Emergency Access',
      icon: 'alert',
    },
    {
      id: 'emergency-log',
      label: 'Emergency Log',
      icon: 'history',
    },
  ],

  patient: [
    {
      id: 'patient-dashboard',
      label: 'My Health',
      icon: 'home',
    },
    {
      id: 'patient-profile',
      label: 'My Account',
      icon: 'user',
    },
    {
      id: 'health-assessment',
      label: 'Self Report',
      icon: 'clipboard',
    },
    {
      id: 'consent',
      label: 'Consent & Privacy',
      icon: 'shield',
    },
    {
      id: 'access-request',
      label: 'Access Request',
      icon: 'lock',
    },
    {
      id: 'access-history',
      label: 'Access History',
      icon: 'eye',
    },
  ],

  admin: [
    {
      id: 'admin-dashboard',
      label: 'Dashboard',
      icon: 'chart',
    },
  ],
};

const DEFAULT_SCREEN: Record<Role, string> = {
  login: 'login',
  worker: 'worker-dashboard',
  doctor: 'doctor-dashboard',
  patient: 'patient-dashboard',
  admin: 'admin-dashboard',
};

function normalizeRole(value?: string): Role {
  const role = String(value || '').toUpperCase();

  if (
    role === 'WORKER' ||
    role === 'ASHA' ||
    role === 'HEALTH_WORKER'
  ) {
    return 'worker';
  }

  if (
    role === 'DOCTOR' ||
    role === 'PHC_STAFF'
  ) {
    return 'doctor';
  }

  if (role === 'PATIENT') {
    return 'patient';
  }

  if (
    role === 'ADMIN' ||
    role === 'ADMINISTRATOR'
  ) {
    return 'admin';
  }

  return 'login';
}

function getInitials(name: string): string {
  const cleanName = name
    .replace(/^Dr\.?\s*/i, '')
    .trim();

  const parts = cleanName
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  if (parts.length === 1) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`
    .toUpperCase();
}

function getRoleInfo(
  role: Role,
  user: CurrentUser | null
) {
  const name =
    user?.fullName ||
    user?.doctorProfile?.name ||
    user?.workerProfile?.name ||
    user?.patientProfile?.name ||
    'User';

  if (role === 'worker') {
    const profile =
      user?.workerProfile;

    const location =
      profile?.assignedPhc ||
      profile?.subCentre ||
      profile?.village ||
      'Health Centre';

    return {
      label: 'Health Worker',
      sub: `${profile?.workerType || 'ASHA'} · ${location}`,
      color: 'bg-brand-600',
      user: name,
    };
  }

  if (role === 'doctor') {
    const profile =
      user?.doctorProfile;

    const facility =
      profile?.facility?.name ||
      'PHC';

    return {
      label: 'Doctor',
      sub: `${profile?.specialty || 'Doctor'} · ${facility}`,
      color: 'bg-purple-600',
      user: name,
    };
  }

  if (role === 'patient') {
    const profile =
      user?.patientProfile;

    const healthId =
      profile?.healthId ||
      'Health ID';

    return {
      label: 'Patient',
      sub: healthId,
      color: 'bg-teal-600',
      user: name,
    };
  }

  if (role === 'admin') {
    const district =
      user?.doctorProfile?.facility?.district ||
      user?.workerProfile?.district ||
      user?.patientProfile?.district ||
      'District Health';

    return {
      label: 'Administrator',
      sub: district,
      color: 'bg-saffron-600',
      user: name,
    };
  }

  return {
    label: '',
    sub: '',
    color: 'bg-gray-600',
    user: name,
  };
}

export default function App() {
  const [role, setRole] =
    useState<Role>('login');

  const [screen, setScreen] =
    useState('login');

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [isOffline, setIsOffline] =
    useState(false);

  const [lang, setLang] =
    useState<'en' | 'hi'>('en');

  const [sidebarOpen, setSidebarOpen] =
    useState(false);

  const [sosAlerts, setSosAlerts] =
    useState<
      {
        id: string;
        from: string;
        role: string;
        patientId: string;
        location: string;
        ts: string;
        offline: boolean;
        dismissed: boolean;
        status:
          | 'sent'
          | 'notified'
          | 'awaiting'
          | 'acknowledged'
          | 'declined'
          | 'escalated';
        escalationLevel: number;
      }[]
    >([]);

  const [selectedPatientId, setSelectedPatientId] =
    useState<string | null>(null);

  useEffect(() => {
    const token = getToken();

    if (!token) {
      return;
    }

    getCurrentUser()
      .then((user) => {
        if (!user) {
          clearToken();
          setCurrentUser(null);
          setRole('login');
          setScreen('login');
          return;
        }

        const resolvedRole =
          normalizeRole(user.role);

        if (resolvedRole === 'login') {
          clearToken();
          setCurrentUser(null);
          setRole('login');
          setScreen('login');
          return;
        }

        setCurrentUser(user);
        setRole(resolvedRole);
        setScreen(
          DEFAULT_SCREEN[resolvedRole]
        );
      })
      .catch(() => {
        clearToken();
        setCurrentUser(null);
        setRole('login');
        setScreen('login');
      });
  }, []);

  // Enforce role-based navigation lock
  useEffect(() => {
    if (role !== 'login') {
      const allowedItems = NAV[role] || [];
      const allowedScreenIds = allowedItems.map((item) => item.id);
      if (!allowedScreenIds.includes(screen)) {
        setScreen(DEFAULT_SCREEN[role]);
      }
    }
  }, [role, screen]);

  function fireSOS(
    from: string,
    fromRole: string,
    patientId: string
  ) {
    const id = `SOS-${Date.now()}`;

    const location =
      currentUser?.patientProfile?.village ||
      currentUser?.workerProfile?.village ||
      currentUser?.workerProfile?.assignedPhc ||
      currentUser?.doctorProfile?.facility?.name ||
      'RuralCare Location';

    setSosAlerts((alerts) => [
      {
        id,
        from,
        role: fromRole,
        patientId,
        location,
        ts: new Date().toLocaleTimeString(
          'en-IN',
          {
            hour: '2-digit',
            minute: '2-digit',
          }
        ),
        offline: isOffline,
        dismissed: false,
        status: 'sent',
        escalationLevel: 0,
      },
      ...alerts,
    ]);

    if (!isOffline) {
      dispatchSosAlert({
        fromName: from,
        role: fromRole,
        patientHealthId: patientId || 'RHC-EMERGENCY',
        location,
      }).catch((err) => console.warn('SOS broadcast error:', err));
    }
  }

  function dismissSOS(id: string) {
    setSosAlerts((alerts) =>
      alerts.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              dismissed: true,
            }
          : alert
      )
    );
  }

  function acknowledgeSOS(id: string) {
    setSosAlerts((alerts) =>
      alerts.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              status: 'acknowledged',
            }
          : alert
      )
    );
  }

  function declineSOS(id: string) {
    setSosAlerts((alerts) =>
      alerts.map((alert) =>
        alert.id === id
          ? {
              ...alert,
              status: 'declined',
              escalationLevel:
                alert.escalationLevel + 1,
              dismissed: true,
            }
          : alert
      )
    );
  }

  function handleLogin(
    selectedRole: Role,
    user?: CurrentUser
  ) {
    const userRole =
      normalizeRole(user?.role);

    const resolvedRole =
      userRole !== 'login'
        ? userRole
        : selectedRole;

    if (
      !user ||
      resolvedRole === 'login'
    ) {
      clearToken();
      setCurrentUser(null);
      setRole('login');
      setScreen('login');
      setSidebarOpen(false);
      return;
    }

    setCurrentUser(user);
    setRole(resolvedRole);
    setScreen(
      DEFAULT_SCREEN[resolvedRole]
    );
    setSidebarOpen(false);
  }

  function navigate(
    nextScreen: string,
    patientId?: string
  ) {
    if (patientId) {
      setSelectedPatientId(
        patientId
      );
    }

    setScreen(nextScreen);
    setSidebarOpen(false);
  }

  function logout() {
    clearToken();
    setCurrentUser(null);
    setRole('login');
    setScreen('login');
    setSelectedPatientId(null);
    setSidebarOpen(false);
  }

  const pendingSync =
    isOffline ? 4 : 0;

  if (role === 'login') {
    if (
      screen ===
      'register-patient'
    ) {
      return (
        <div className="min-h-screen bg-surface p-4">
          <PatientRegistration
            navigate={() =>
              setScreen('login')
            }
            isOffline={isOffline}
          />
        </div>
      );
    }

    return (
      <LoginScreen
        onLogin={handleLogin}
        lang={lang}
        setLang={setLang}
      />
    );
  }

  const roleInfo =
    getRoleInfo(
      role,
      currentUser
    );

  const navItems =
    NAV[role];

  return (
    <div className="h-full flex bg-surface overflow-hidden">

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() =>
            setSidebarOpen(false)
          }
        />
      )}

      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40 flex flex-col
          w-60 bg-white border-r border-gray-100 shadow-sm
          transition-transform duration-200
          ${
            sidebarOpen
              ? 'translate-x-0'
              : '-translate-x-full lg:translate-x-0'
          }
        `}
      >

        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">

            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center shrink-0">
              <Icon
                name="shield"
                size={18}
                className="text-white"
              />
            </div>

            <div>
              <div className="font-display font-bold text-gray-900 text-sm leading-tight">
                RuralHealth
              </div>

              <div className="text-[10px] text-gray-400 leading-tight">
                ग्रामीण स्वास्थ्य · SIH-26133
              </div>
            </div>

          </div>
        </div>

        <div className="px-4 py-3 border-b border-gray-50">
          <div
            className={`
              flex items-center gap-2.5 p-2.5 rounded-xl
              ${roleInfo.color
                .replace('bg-', 'bg-')
                .replace('-600', '-50')}
            `}
          >

            <div
              className={`
                w-8 h-8 rounded-lg ${roleInfo.color}
                flex items-center justify-center
                text-white font-bold text-xs shrink-0
              `}
            >
              {getInitials(
                roleInfo.user
              )}
            </div>

            <div className="flex-1 min-w-0">

              <div className="text-xs font-semibold text-gray-900 truncate">
                {roleInfo.user}
              </div>

              <div className="text-[10px] text-gray-500 truncate">
                {roleInfo.label} ·{' '}
                {roleInfo.sub}
              </div>

            </div>

          </div>
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto">

          <div className="space-y-0.5">

            {navItems.map(
              (item) => {
                const isActive =
                  screen ===
                  item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() =>
                      navigate(
                        item.id
                      )
                    }
                    className={`
                      w-full flex items-center gap-3
                      px-3 py-2.5 rounded-xl
                      text-sm font-medium transition-all text-left
                      ${
                        isActive
                          ? 'bg-brand-50 text-brand-700 font-semibold'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }
                    `}
                  >

                    <Icon
                      name={
                        item.icon
                      }
                      size={17}
                      className={
                        isActive
                          ? 'text-brand-600'
                          : 'text-gray-400'
                      }
                    />

                    {item.label}

                    {item.id ===
                      'sync' &&
                      pendingSync >
                        0 && (
                        <span className="ml-auto bg-amber-400 text-amber-900 text-[10px] font-bold px-1.5 rounded-full">
                          {pendingSync}
                        </span>
                      )}

                    {item.id ===
                      'access-request' && (
                      <span className="ml-auto w-2 h-2 bg-red-500 rounded-full" />
                    )}

                  </button>
                );
              }
            )}

          </div>

        </nav>

        <div className="px-3 py-3 border-t border-gray-100 space-y-1">

          <div className="px-3 py-2">
            <OfflineIndicator
              isOffline={
                isOffline
              }
              pendingSync={
                pendingSync
              }
            />
          </div>

          <button
            onClick={
              logout
            }
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            <Icon
              name="logout"
              size={16}
            />
            Logout
          </button>

        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0">

          <button
            onClick={() =>
              setSidebarOpen(
                true
              )
            }
            className="lg:hidden w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line
                x1="3"
                y1="6"
                x2="21"
                y2="6"
              />
              <line
                x1="3"
                y1="12"
                x2="21"
                y2="12"
              />
              <line
                x1="3"
                y1="18"
                x2="21"
                y2="18"
              />
            </svg>
          </button>

          {(role ===
            'worker' ||
            role ===
              'doctor') && (
            <div className="relative flex-1 max-w-xs">

              <Icon
                name="search"
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />

              <input
                placeholder="Search patient..."
                className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 bg-gray-50"
              />

            </div>
          )}

          <div className="flex-1" />

          <button
            onClick={() =>
              setIsOffline(
                (offline) =>
                  !offline
              )
            }
            className={`
              flex items-center gap-1.5 px-3 py-1.5
              rounded-full border text-xs font-medium transition-all
              ${
                isOffline
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
              }
            `}
          >

            <Icon
              name={
                isOffline
                  ? 'wifi_off'
                  : 'sync'
              }
              size={12}
            />

            {isOffline
              ? 'Offline'
              : 'Online'}

          </button>

          <button
            onClick={() =>
              setLang(
                (language) =>
                  language ===
                  'en'
                    ? 'hi'
                    : 'en'
              )
            }
            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-xs font-medium text-gray-600 transition-colors"
          >
            {lang === 'en'
              ? 'हि'
              : 'EN'}
          </button>

          <div className="flex items-center gap-1 text-[10px] text-gray-400 hidden sm:flex">
            <Icon
              name="lock"
              size={10}
            />
            Encrypted
          </div>

          {pendingSync >
            0 && (
            <button
              onClick={() =>
                navigate(
                  'sync'
                )
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-full text-[10px] font-semibold"
            >
              <Icon
                name="sync"
                size={11}
              />
              {pendingSync}{' '}
              pending
            </button>
          )}

        </header>

        <main className="flex-1 overflow-y-auto bg-surface">

          {screen ===
            'worker-dashboard' && (
            <WorkerDashboard
              navigate={
                navigate
              }
              isOffline={
                isOffline
              }
              onSOS={() =>
                fireSOS(
                  `${roleInfo.user} (ASHA)`,
                  'ASHA Worker',
                  currentUser
                    ?.patientProfile
                    ?.healthId ||
                    currentUser
                      ?.id ||
                    ''
                )
              }
              activeSosAlert={
                sosAlerts.find(
                  (alert) =>
                    alert.role ===
                    'ASHA Worker'
                ) ?? null
              }
            />
          )}

          {screen ===
            'register-patient' && (
            <PatientRegistration
              navigate={
                navigate
              }
              isOffline={
                isOffline
              }
            />
          )}

          {screen ===
            'patient-profile' && (
            <PatientProfile
              navigate={
                navigate
              }
              patientId={
                selectedPatientId
              }
            />
          )}

          {screen ===
            'health-assessment' && (
            <HealthAssessment
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'ai-risk' && (
            <AIRiskAssessment
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'referral' && (
            <ReferralSystem
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'doctor-dashboard' && (
            <DoctorDashboard
              navigate={
                navigate
              }
              sosAlerts={sosAlerts.filter(
                (alert) =>
                  !alert.dismissed
              )}
              onDismissSOS={
                dismissSOS
              }
              onAcknowledgeSOS={
                acknowledgeSOS
              }
              onDeclineSOS={
                declineSOS
              }
            />
          )}

          {screen ===
            'doctor-patient-view' && (
            <DoctorPatientView
              navigate={
                navigate
              }
              patientId={
                selectedPatientId
              }
            />
          )}

          {screen ===
            'patient-dashboard' && (
            <PatientMobileDashboard
              navigate={
                navigate
              }
              onSOS={() =>
                fireSOS(
                  `${roleInfo.user} (Patient)`,
                  'Patient',
                  currentUser
                    ?.patientProfile
                    ?.healthId ||
                    currentUser
                      ?.id ||
                    ''
                )
              }
              loginPhone={
                currentUser?.phone ||
                ''
              }
            />
          )}

          {screen ===
            'consent' && (
            <ConsentManagement
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'access-request' && (
            <AccessRequest
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'access-history' && (
            <AccessHistory
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'offline' && (
            <OfflineMode
              navigate={
                navigate
              }
              isOffline={
                isOffline
              }
              toggleOffline={() =>
                setIsOffline(
                  (offline) =>
                    !offline
                )
              }
            />
          )}

          {screen ===
            'sync' && (
            <SyncCenter
              navigate={
                navigate
              }
              isOffline={
                isOffline
              }
            />
          )}

          {screen ===
            'admin-dashboard' && (
            <AdminDashboard
              navigate={
                navigate
              }
              isOffline={
                isOffline
              }
            />
          )}

          {screen ===
            'emergency-access' && (
            <EmergencyAccess
              navigate={
                navigate
              }
            />
          )}

          {screen ===
            'emergency-log' && (
            <EmergencyAccessLog
              navigate={
                navigate
              }
            />
          )}

        </main>
      </div>
    </div>
  );
}