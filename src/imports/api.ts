const BASE = 'http://localhost:5000/api/v1';

export async function apiPost(path: string, body: object, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
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
  const res = await fetch(`${BASE}${path}`, {
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
  localStorage.setItem('rc_token', token);
}

export function getToken() {
  return localStorage.getItem('rc_token');
}

export function clearToken() {
  localStorage.removeItem('rc_token');
}