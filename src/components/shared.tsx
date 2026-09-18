import type { ReactNode } from 'react';
import type {
  RiskLevel,
  ConsentStatus,
  ReferralStatus,
  SyncStatus,
} from '../types';

// ─── Icons ──────────────────────────────────────────────────────────────────

export function Icon({
  name,
  size = 18,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const paths: Record<string, string> = {
    dashboard:
      'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',

    plus:
      'M12 4v16m8-8H4',

    user:
      'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',

    users:
      'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',

    clipboard:
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',

    brain:
      'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',

    share:
      'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',

    wifi_off:
      'M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a5 5 0 010-7.072M15 12a3 3 0 11-6 0 3 3 0 016 0zm-7.072 7.072L3 21m2.636-15.364a9 9 0 00-.891 12.017',

    sync:
      'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',

    shield:
      'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',

    lock:
      'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',

    eye:
      'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',

    history:
      'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',

    chart:
      'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',

    qr:
      'M12 4H4v8h8V4zm0 0h8v8h-8V4zm0 8v8h8v-8h-8zm0 0H4v8h8v-8z',

    bell:
      'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',

    check:
      'M5 13l4 4L19 7',

    x:
      'M6 18L18 6M6 6l12 12',

    chevron_right:
      'M9 5l7 7-7 7',

    chevron_down:
      'M19 9l-7 7-7-7',

    search:
      'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',

    home:
      'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001 1v4a1 1 0 001 1m-6 0h6',

    pill:
      'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18',

    document:
      'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',

    logout:
      'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',

    alert:
      'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',

    info:
      'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',

    arrow_right:
      'M14 5l7 7m0 0l-7 7m7-7H3',

    activity:
      'M22 12h-4l-3 9L9 3l-3 9H2',

    settings:
      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',

    map_pin:
      'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',

    phone:
      'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z',
  };

  const path = paths[name];

  if (!path) {
    return null;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {path.split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}

// ─── Risk Badge ─────────────────────────────────────────────────────────────

const riskConfig: Record<
  'low' | 'moderate' | 'high' | 'critical',
  {
    label: string;
    labelHi: string;
    bg: string;
    text: string;
    dot: string;
  }
> = {
  low: {
    label: 'Low Risk',
    labelHi: 'कम जोखिम',
    bg: 'bg-green-50',
    text: 'text-green-800',
    dot: 'bg-green-500',
  },

  moderate: {
    label: 'Moderate',
    labelHi: 'मध्यम जोखिम',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    dot: 'bg-amber-500',
  },

  high: {
    label: 'High Risk',
    labelHi: 'उच्च जोखिम',
    bg: 'bg-red-50',
    text: 'text-red-700',
    dot: 'bg-red-500',
  },

  critical: {
    label: 'Critical',
    labelHi: 'गंभीर',
    bg: 'bg-red-100',
    text: 'text-red-900',
    dot: 'bg-red-700',
  },
};

function normalizeRiskLevel(
  level: unknown
): 'low' | 'moderate' | 'high' | 'critical' {
  if (typeof level !== 'string') {
    return 'low';
  }

  const normalized = level
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');

  switch (normalized) {
    case 'low':
    case 'lowrisk':
      return 'low';

    case 'moderate':
    case 'moderaterisk':
    case 'medium':
    case 'mediumrisk':
      return 'moderate';

    case 'high':
    case 'highrisk':
      return 'high';

    case 'critical':
    case 'criticalrisk':
      return 'critical';

    default:
      return 'low';
  }
}

export function RiskBadge({
  level,
  size = 'md',
}: {
  level: RiskLevel | string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
}) {
  const normalizedLevel = normalizeRiskLevel(level);
  const c = riskConfig[normalizedLevel];

  const padding =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs'
      : size === 'lg'
        ? 'px-4 py-2 text-sm font-semibold'
        : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-mono tracking-wide ${padding} ${c.bg} ${c.text}`}
      title={c.label}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0`}
      />

      {c.label.toUpperCase()}
    </span>
  );
}

// ─── Consent Badge ──────────────────────────────────────────────────────────

const consentConfig: Record<
  ConsentStatus,
  {
    label: string;
    icon: string;
    bg: string;
    text: string;
  }
> = {
  granted: {
    label: 'Granted',
    icon: '🟢',
    bg: 'bg-green-50',
    text: 'text-green-800',
  },

  temporary: {
    label: 'Temporary',
    icon: '🟡',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
  },

  revoked: {
    label: 'Revoked',
    icon: '🔴',
    bg: 'bg-red-50',
    text: 'text-red-700',
  },
};

export function ConsentBadge({
  status,
}: {
  status: ConsentStatus;
}) {
  const c = consentConfig[status];

  if (!c) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Unknown
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.icon} {c.label}
    </span>
  );
}

// ─── Referral Status Badge ──────────────────────────────────────────────────

const referralConfig: Record<
  ReferralStatus,
  {
    label: string;
    bg: string;
    text: string;
  }
> = {
  pending: {
    label: 'Pending',
    bg: 'bg-gray-100',
    text: 'text-gray-700',
  },

  accepted: {
    label: 'Accepted',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
  },

  'in-consultation': {
    label: 'In Consultation',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
  },

  referred: {
    label: 'Referred',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
  },

  completed: {
    label: 'Completed',
    bg: 'bg-green-50',
    text: 'text-green-700',
  },

  'follow-up': {
    label: 'Follow-up Required',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
  },
};

export function ReferralBadge({
  status,
}: {
  status: ReferralStatus | string | null | undefined;
}) {
  const normalized = String(status || 'pending')
    .toLowerCase()
    .replace(/_/g, '-') as ReferralStatus;
  const c = referralConfig[normalized] || referralConfig.pending;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ─── Sync Status Badge ──────────────────────────────────────────────────────

export function SyncBadge({
  status,
}: {
  status: SyncStatus;
}) {
  const config = {
    synced: {
      label: 'Synced ✓',
      bg: 'bg-green-50',
      text: 'text-green-700',
    },

    pending: {
      label: 'Pending ↻',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
    },

    failed: {
      label: 'Failed !',
      bg: 'bg-red-50',
      text: 'text-red-700',
    },
  };

  const c = config[status];

  if (!c) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono bg-gray-100 text-gray-600">
        Unknown
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ─── Patient Health ID ──────────────────────────────────────────────────────

export function HealthIDCard({
  id,
  name,
  size = 'md',
}: {
  id: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const textSize =
    size === 'sm'
      ? 'text-xs'
      : size === 'lg'
        ? 'text-xl'
        : 'text-sm';

  const padding =
    size === 'sm'
      ? 'px-3 py-2'
      : size === 'lg'
        ? 'px-5 py-4'
        : 'px-4 py-3';

  return (
    <div
      className={`${padding} bg-brand-50 border border-brand-200 rounded-xl inline-flex flex-col gap-0.5`}
    >
      <span className="text-[10px] font-medium text-brand-600 tracking-widest uppercase">
        Patient Health ID
      </span>

      <span
        className={`font-mono font-semibold text-brand-800 ${textSize} tracking-wider select-all`}
      >
        {id}
      </span>

      {name && (
        <span className="text-xs text-brand-600 mt-0.5">
          {name}
        </span>
      )}
    </div>
  );
}

// ─── Offline Indicator ──────────────────────────────────────────────────────

export function OfflineIndicator({
  isOffline,
  pendingSync = 0,
}: {
  isOffline: boolean;
  pendingSync?: number;
}) {
  if (!isOffline) {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        Online
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 rounded-full text-xs font-semibold border border-amber-200">
      <Icon name="wifi_off" size={12} />

      OFFLINE

      {pendingSync > 0 && (
        <span className="ml-1 bg-amber-400 text-amber-900 rounded-full px-1.5 py-0.5 text-[10px]">
          {pendingSync} pending
        </span>
      )}
    </div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  sub,
  icon,
  color = 'brand',
  trend,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: string;
  color?: 'brand' | 'amber' | 'red' | 'green' | 'purple';
  trend?: 'up' | 'down';
}) {
  const colors = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}
        >
          <Icon name={icon} size={20} />
        </div>

        {trend && (
          <span
            className={`text-xs font-medium ${
              trend === 'up'
                ? 'text-green-600'
                : 'text-red-500'
            }`}
          >
            {trend === 'up' ? '↑' : '↓'}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="font-display text-2xl font-bold text-gray-900">
          {value}
        </div>

        <div className="text-sm font-medium text-gray-700 mt-0.5">
          {label}
        </div>

        {sub && (
          <div className="text-xs text-gray-400 mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Section Header ─────────────────────────────────────────────────────────

export function SectionHeader({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-gray-900">
          {title}
        </h2>

        {sub && (
          <p className="text-xs text-gray-500 mt-0.5">
            {sub}
          </p>
        )}
      </div>

      {action && <div>{action}</div>}
    </div>
  );
}

// ─── Patient Row ────────────────────────────────────────────────────────────

export function PatientRow({
  patient,
  onClick,
}: {
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    village: string;
    riskLevel: RiskLevel | string | null | undefined;
    lastConsultation: string;
  };
  onClick?: () => void;
}) {
  const initials = patient.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
    >
      <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold text-sm shrink-0">
        {initials}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm truncate">
            {patient.name}
          </span>

          <RiskBadge
            level={patient.riskLevel}
            size="sm"
          />
        </div>

        <div className="text-xs text-gray-500 mt-0.5">
          {patient.age}
          {patient.gender} · {patient.village} · Last:{' '}
          {patient.lastConsultation}
        </div>

        <div className="font-mono text-[10px] text-gray-400">
          {patient.id}
        </div>
      </div>

      <Icon
        name="chevron_right"
        size={16}
        className="text-gray-300 group-hover:text-gray-500 transition-colors shrink-0"
      />
    </button>
  );
}

// ─── Priority Badge ─────────────────────────────────────────────────────────

export function PriorityBadge({
  priority,
}: {
  priority?: 'routine' | 'urgent' | 'emergency' | string | null;
}) {
  const normalized = String(priority || 'routine').toLowerCase().trim();
  const key: 'routine' | 'urgent' | 'emergency' =
    normalized === 'urgent'
      ? 'urgent'
      : normalized === 'emergency' || normalized === 'critical'
        ? 'emergency'
        : 'routine';

  const config = {
    routine: {
      label: 'Routine',
      bg: 'bg-gray-100',
      text: 'text-gray-600',
    },

    urgent: {
      label: 'Urgent',
      bg: 'bg-amber-50',
      text: 'text-amber-700',
    },

    emergency: {
      label: 'Emergency',
      bg: 'bg-red-100',
      text: 'text-red-800 font-bold',
    },
  };

  const c = config[key] || config.routine;

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs uppercase tracking-wide ${c.bg} ${c.text}`}
    >
      {c.label}
    </span>
  );
}

// ─── Tabs ──────────────────────────────────────────────────────────────────

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: {
    id: string;
    label: string;
  }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
            active === t.id
              ? 'bg-white text-brand-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ─── Encryption Indicator ───────────────────────────────────────────────────

export function EncryptedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-[10px] font-mono">
      <Icon name="lock" size={9} />
      AES-256
    </span>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────

export function EmptyState({
  icon,
  title,
  sub,
}: {
  icon: string;
  title: string;
  sub?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-3">
        <Icon
          name={icon}
          size={24}
          className="text-gray-400"
        />
      </div>

      <p className="font-medium text-gray-700">
        {title}
      </p>

      {sub && (
        <p className="text-sm text-gray-400 mt-1">
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Timeline Entry ─────────────────────────────────────────────────────────

export function TimelineEntry({
  date,
  title,
  sub,
  icon,
  color = 'brand',
  last = false,
}: {
  date: string;
  title: string;
  sub?: string;
  icon?: string;
  color?: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
            color === 'brand'
              ? 'bg-brand-100 text-brand-600'
              : color === 'red'
                ? 'bg-red-100 text-red-600'
                : color === 'green'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
          }`}
        >
          {icon ? (
            <Icon name={icon} size={14} />
          ) : (
            <div className="w-2 h-2 rounded-full bg-current" />
          )}
        </div>

        {!last && (
          <div className="w-px flex-1 bg-gray-100 mt-1" />
        )}
      </div>

      <div className="pb-6 flex-1 min-w-0">
        <div className="text-[10px] text-gray-400 font-mono mb-0.5">
          {date}
        </div>

        <div className="text-sm font-medium text-gray-900">
          {title}
        </div>

        {sub && (
          <div className="text-xs text-gray-500 mt-0.5">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────────────────────

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 ${className}`}
    >
      {children}
    </div>
  );
}

// ─── HPR / HFR Verified Badges ─────────────────────────────────────────────

export function HPRBadge({
  id,
  compact = false,
}: {
  id?: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded text-[10px] font-semibold tracking-wide">
      <svg
        width="9"
        height="9"
        viewBox="0 0 9 9"
        className="shrink-0"
      >
        <circle
          cx="4.5"
          cy="4.5"
          r="4.5"
          fill="#3B82F6"
        />

        <path
          d="M2.5 4.5l1.5 1.5L6.5 2.5"
          stroke="white"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>

      {compact ? 'HPR' : 'HPR Verified'}

      {id && !compact && (
        <span className="font-mono font-normal text-blue-400 ml-0.5">
          {id}
        </span>
      )}
    </span>
  );
}

export function HFRBadge({
  id,
  compact = false,
}: {
  id?: string;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-[10px] font-semibold tracking-wide">
      <svg
        width="9"
        height="9"
        viewBox="0 0 9 9"
        className="shrink-0"
      >
        <rect
          width="9"
          height="9"
          rx="2"
          fill="#6366F1"
        />

        <path
          d="M1.5 6V4l3-2.5L7.5 4V6M3.5 6V4.5h2V6"
          stroke="white"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {compact ? 'HFR' : 'HFR Verified'}

      {id && !compact && (
        <span className="font-mono font-normal text-indigo-400 ml-0.5">
          {id}
        </span>
      )}
    </span>
  );
}

// ─── Duty Status Badge ──────────────────────────────────────────────────────

export function DutyStatusBadge({
  status,
}: {
  status: 'available' | 'busy' | 'offline' | string | null | undefined;
}) {
  const normalized = String(status || 'available').toLowerCase().trim();
  const key: 'available' | 'busy' | 'offline' =
    normalized === 'busy'
      ? 'busy'
      : normalized === 'offline' || normalized === 'off-duty' || normalized === 'offduty'
        ? 'offline'
        : 'available';

  const cfg = {
    available: {
      label: 'Available',
      dot: 'bg-green-500',
      text: 'text-green-700',
      bg: 'bg-green-50 border-green-200',
    },

    busy: {
      label: 'Busy',
      dot: 'bg-amber-500',
      text: 'text-amber-700',
      bg: 'bg-amber-50 border-amber-200',
    },

    offline: {
      label: 'Off Duty',
      dot: 'bg-gray-400',
      text: 'text-gray-600',
      bg: 'bg-gray-50 border-gray-200',
    },
  };

  const c = cfg[key];

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 border rounded text-[10px] font-semibold ${c.bg} ${c.text}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${c.dot} shrink-0 ${
          key === 'available'
            ? 'animate-pulse'
            : ''
        }`}
      />

      {c.label}
    </span>
  );
}

// ─── ABDM Layer Legend ──────────────────────────────────────────────────────

export function ABDMLayerLegend({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-gray-500 ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="shrink-0"
        >
          <circle
            cx="5"
            cy="5"
            r="5"
            fill="#3B82F6"
          />

          <path
            d="M2.5 5l2 2L7.5 3"
            stroke="white"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        <span>
          <strong className="text-blue-700">
            ABDM HPR
          </strong>{' '}
          = Verified Doctor Identity
        </span>
      </div>

      <span className="text-gray-200 hidden sm:inline">
        |
      </span>

      <div className="flex items-center gap-1.5">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="shrink-0"
        >
          <circle
            cx="5"
            cy="5"
            r="5"
            fill="#0A6C79"
          />

          <path
            d="M3 5h4M5 3v4"
            stroke="white"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        <span>
          <strong className="text-brand-700">
            RuralCare
          </strong>{' '}
          = On-duty / Availability
        </span>
      </div>

      <span className="text-gray-200 hidden sm:inline">
        |
      </span>

      <div className="flex items-center gap-1.5">
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="shrink-0"
        >
          <circle
            cx="5"
            cy="5"
            r="5"
            fill="#16A34A"
          />

          <path
            d="M2.5 5.5l2 2 3-4"
            stroke="white"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
        </svg>

        <span>
          <strong className="text-green-700">
            SOS Acknowledgement
          </strong>{' '}
          = Confirmed Active Response
        </span>
      </div>
    </div>
  );
}

// ─── RBAC Permission Labels ─────────────────────────────────────────────────

type PermissionType =
  | 'view-only'
  | 'doctor-editable'
  | 'asha-recorded'
  | 'consent-required'
  | 'clinician-only';

const permConfig: Record<
  PermissionType,
  {
    label: string;
    bg: string;
    text: string;
    border: string;
  }
> = {
  'view-only': {
    label: 'VIEW ONLY',
    bg: 'bg-gray-100',
    text: 'text-gray-500',
    border: 'border-gray-200',
  },

  'doctor-editable': {
    label: 'EDITABLE BY DOCTOR',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-100',
  },

  'asha-recorded': {
    label: 'RECORDED BY ASHA',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-200',
  },

  'consent-required': {
    label: 'CONSENT REQUIRED',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-100',
  },

  'clinician-only': {
    label: 'CLINICIAN ONLY',
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-100',
  },
};

export function PermissionBadge({
  type,
}: {
  type: PermissionType;
}) {
  const c = permConfig[type];

  if (!c) {
    return (
      <span className="inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wider bg-gray-100 text-gray-500 border-gray-200">
        VIEW ONLY
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[9px] font-bold tracking-wider ${c.bg} ${c.text} ${c.border}`}
    >
      {c.label}
    </span>
  );
}

export function RecordOwnershipBanner() {
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 bg-brand-50 border border-brand-100 rounded-xl">
      <Icon
        name="shield"
        size={14}
        className="text-brand-600 shrink-0"
      />

      <p className="flex-1 text-[11px] text-brand-700">
        <strong>
          Your medical history is protected
        </strong>{' '}
        — records can only be modified by authorized
        healthcare professionals.
      </p>

      <PermissionBadge type="view-only" />
    </div>
  );
}

// ─── AI Disclaimer ──────────────────────────────────────────────────────────

export function AIDisclaimer() {
  return (
    <div className="flex items-start gap-2 px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700">
      <Icon
        name="info"
        size={14}
        className="shrink-0 mt-0.5"
      />

      <span>
        <strong>AI Decision Support</strong> — Not a
        Final Diagnosis. The final medical decision must
        remain with the authorized healthcare professional.
      </span>
    </div>
  );
}