import { API_BASE_URL } from '../api/client';

function buildUrl(path: string): string {
  let clean = path.trim();
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }
  if (clean.startsWith('/api/v1')) {
    clean = clean.slice('/api/v1'.length);
  } else if (clean.startsWith('api/v1')) {
    clean = clean.slice('api/v1'.length);
  }
  if (!clean.startsWith('/')) {
    clean = `/${clean}`;
  }
  return `${API_BASE_URL}${clean}`;
}

export async function apiPost(path: string, body: object, token?: string) {
  const res = await fetch(buildUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = data.errors?.length
      ? `${data.message || 'Validation failed'}: ${data.errors.map((e: any) => `${e.path} (${e.message})`).join(', ')}`
      : data.message || `Request failed with status ${res.status}`;
    throw new Error(detail);
  }
  return data;
}

export async function apiGet(path: string, token?: string) {
  const res = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let data: any = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    const detail = data.errors?.length
      ? `${data.message || 'Request failed'}: ${data.errors.map((e: any) => `${e.path} (${e.message})`).join(', ')}`
      : data.message || `Request failed with status ${res.status}`;
    throw new Error(detail);
  }
  return data;
}

export const auth = {
  login: (email: string, password: string, role: string) =>
    apiPost('/auth/login', { email, password, role }),

  register: (email: string, password: string, fullName: string, role: string, profileData?: any) =>
    apiPost('/auth/register', { email, password, fullName, role, ...profileData }),

  getCurrentUser: (token?: string) => apiGet('/auth/me', token),
};

export const patients = {
  register: (data: any, token?: string) =>
    apiPost('/patients/register', data, token),
  get: (token?: string) => apiGet('/patients', token),
  getById: (id: string, token?: string) => apiGet(`/patients/${id}`, token),
  getByPhone: (phone: string, token?: string) => apiGet(`/patients/by-phone/${phone}`, token),
};

export const assessments = {
  generate: (data: any, token?: string) =>
    apiPost('/assessments/generate', data, token),
};

export const referrals = {
  get: (token?: string) => apiGet('/referrals', token),
  create: (data: any, token?: string) => apiPost('/referrals', data, token)
};

export function saveToken(token: string) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem('rc_token', token);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('rc_token');
  }
}

export function getToken() {
  if (typeof sessionStorage !== 'undefined') {
    return sessionStorage.getItem('rc_token');
  }
  return null;
}

export function clearToken() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('rc_token');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('rc_token');
  }
}