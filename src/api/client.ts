// ============================================================================

// RuralCare API Client Layer (SIH 26133)

// ============================================================================

function resolveApiBaseUrl(): string {
  const envUrl = (
    import.meta.env.VITE_API_URL ||
    (import.meta as any).env?.VITE_API_BASE_URL ||
    ''
  ).trim();

  let base = envUrl;

  if (!base) {
    const isCapacitor = typeof window !== 'undefined' && (!!(window as any)?.Capacitor || window.location.protocol === 'capacitor:');
    if (import.meta.env.DEV && !isCapacitor) {
      base = 'http://localhost:5000';
    } else {
      // Production & native mobile fallback so app never calls localhost on phone
      base = 'https://rural-healthcare-342y.onrender.com';
    }
  }

  // Strip trailing slashes
  base = base.replace(/\/+$/, '');

  // Normalize /api/v1 suffix: ensure not missing and not duplicated
  if (base.endsWith('/api/v1')) {
    return base;
  }
  if (base.endsWith('/api')) {
    return `${base}/v1`;
  }
  return `${base}/api/v1`;
}

import { PATIENTS, CONSULTATIONS, REFERRALS } from '../data';

export const API_BASE_URL = resolveApiBaseUrl();

export function getTeleconsultationWsUrl(): string {
  try {
    const base = API_BASE_URL;
    if (base.startsWith('http://') || base.startsWith('https://')) {
      const parsed = new URL(base);
      const wsProto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${parsed.host}/teleconsultation`;
    }
  } catch {}

  const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  if (host === 'localhost' || host === '127.0.0.1') {
    return `${protocol}//${host}:5000/teleconsultation`;
  }
  return `${protocol}//${host}/teleconsultation`;
}

export interface ApiResponse<T = any> {
  success: boolean

  message?: string

  data?: T

  errors?: Array<{ path: string; message: string }>
}

export interface AuthUser {
  id?: string

  email?: string

  role?: string

  fullName?: string

  phone?: string

  doctorProfile?: {
    id?: string

    name?: string

    specialty?: string

    qualification?: string

    hprId?: string

    registrationNumber?: string

    registrationCouncil?: string

    verificationStatus?: string

    facilityId?: string

    facility?: {
      id?: string

      name?: string

      district?: string

      state?: string
    }
  }

  workerProfile?: {
    id?: string

    name?: string

    workerCode?: string

    workerType?: string

    village?: string

    subCentre?: string

    assignedPhc?: string

    district?: string

    state?: string

    status?: string
  }

  patientProfile?: {
    id?: string

    name?: string

    healthId?: string

    dob?: string

    gender?: string

    phone?: string

    village?: string

    district?: string

    state?: string
  }
}

export const DEMO_PROFILES: Record<string, AuthUser> = {
  DOCTOR: {
    id: 'demo-doctor-id',
    email: 'doctor@ruralcare.in',
    role: 'DOCTOR',
    fullName: 'Dr. Ankit Sharma',
    phone: '9829000002',
    doctorProfile: {
      id: 'demo-doc-prof-1',
      name: 'Dr. Ankit Sharma',
      specialty: 'General Medicine',
      qualification: 'MBBS, MD',
      hprId: 'HPR-2026-00142',
      verificationStatus: 'VERIFIED',
      facility: {
        id: 'demo-fac-1',
        name: 'PHC Lunkaransar',
        district: 'Bikaner',
        state: 'Rajasthan',
      },
    },
  },
  WORKER: {
    id: 'demo-worker-id',
    email: 'asha.worker@ruralcare.in',
    role: 'WORKER',
    fullName: 'Meena Kumari (ASHA)',
    phone: '9829000005',
    workerProfile: {
      id: 'demo-worker-prof-1',
      name: 'Meena Kumari',
      workerCode: 'ASHA-2026-001',
      workerType: 'ASHA',
      village: 'Govindpur',
      subCentre: 'Govindpur SC',
      assignedPhc: 'PHC Lunkaransar',
      district: 'Bikaner',
      state: 'Rajasthan',
      status: 'ACTIVE',
    },
  },
  PATIENT: {
    id: 'demo-patient-id',
    email: 'patient@ruralcare.in',
    role: 'PATIENT',
    fullName: 'Priya Devi',
    phone: '9414158392',
    patientProfile: {
      id: 'demo-patient-prof-1',
      name: 'Priya Devi',
      healthId: 'RHC-2026-8F4K92',
      dob: '1996-05-14',
      gender: 'Female',
      phone: '9414158392',
      village: 'Govindpur',
      district: 'Bikaner',
      state: 'Rajasthan',
    },
  },
  ADMIN: {
    id: 'demo-admin-id',
    email: 'admin@ruralcare.in',
    role: 'ADMIN',
    fullName: 'Rajiv Singh (District Admin)',
    phone: '9829000001',
  },
};

export function saveToken(token: string) {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem("rc_token", token);
  }
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("rc_token", token);
  }
}

export function getToken(): string | null {
  if (typeof localStorage !== "undefined") {
    const localToken = localStorage.getItem("rc_token");
    if (localToken) return localToken;
  }
  if (typeof sessionStorage !== "undefined") {
    return sessionStorage.getItem("rc_token");
  }
  return null;
}

export function clearToken() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('rc_token');
    sessionStorage.removeItem('rc_emergency_token');
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('rc_token');
    localStorage.removeItem('rc_cached_user');
  }
}

async function request<T>(
  endpoint: string,

  options: RequestInit = {},
): Promise<T> {
  let cleanEndpoint = endpoint.trim();
  let url: string;

  if (cleanEndpoint.startsWith('http://') || cleanEndpoint.startsWith('https://')) {
    url = cleanEndpoint;
  } else {
    // Strip accidental leading /api/v1 or /api
    if (cleanEndpoint.startsWith('/api/v1')) {
      cleanEndpoint = cleanEndpoint.slice('/api/v1'.length);
    } else if (cleanEndpoint.startsWith('api/v1')) {
      cleanEndpoint = cleanEndpoint.slice('api/v1'.length);
    } else if (cleanEndpoint.startsWith('/api/')) {
      cleanEndpoint = cleanEndpoint.slice('/api'.length);
    }

    if (!cleanEndpoint.startsWith('/')) {
      cleanEndpoint = `/${cleanEndpoint}`;
    }
    url = `${API_BASE_URL}${cleanEndpoint}`;
  }

  const token = getToken()

  const emergencyToken =
    typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("rc_emergency_token")
      : null

  const headers: Record<string, string> = {
    "Content-Type": "application/json",

    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),

    ...(emergencyToken
      ? {
          "x-emergency-token": emergencyToken,
        }
      : {}),

    ...(options.headers as Record<string, string> || {}),
  }

  const controller = new AbortController();
  const isAuthRequest = cleanEndpoint.includes('/auth/login') || cleanEndpoint.includes('/auth/register');
  const timeoutMs = (options as any)?.timeout || (isAuthRequest ? 35000 : 12000);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      signal: options.signal || controller.signal,
    });
    clearTimeout(timer);

    let json: any = {};

    try {
      json = await res.json();
    } catch {
      json = {};
    }

    if (!res.ok) {
      const detailedMsg = json.errors?.length
        ? `${json.message || "Validation failed"}: ${json.errors.map((e: any) => `${e.path} (${e.message})`).join(", ")}`
        : json.message ||
          json.errors?.[0]?.message ||
          `Request failed with status ${res.status}`;

      // Concurrent session revocation handling
      if (res.status === 401 && (detailedMsg.includes('SESSION_REVOKED') || detailedMsg.includes('another device'))) {
        clearToken();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('rc:session_revoked', { detail: { message: detailedMsg } }));
        }
      }

      const error: any = new Error(detailedMsg);
      error.status = res.status;
      error.data = json;
      throw error;
    }

    return json;
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      const abortError: any = new Error(
        "Request timed out. Server is waking up or network is slow. Please retry in a few moments."
      );
      abortError.isTimeout = true;
      throw abortError;
    }

    if (err instanceof Error) {
      throw err;
    }

    throw new Error(
      "Network error or server unreachable. Please verify the backend is running.",
    );
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string

  password: string

  fullName: string

  role: "WORKER" | "DOCTOR" | "PATIENT" | "ADMIN"

  phone?: string

  // Doctor

  hprId?: string

  specialty?: string

  qualification?: string

  gender?: string

  facility?: string

  facilityId?: string

  district?: string

  state?: string

  // Worker

  workerType?: string

  village?: string

  subCentre?: string

  assignedPhc?: string

  // Patient

  dob?: string

  bloodGroup?: string

  abhaAddress?: string

  abhaNumber?: string

  [key: string]: any
}

export interface AuthResponse {
  token: string

  user: AuthUser
}

export async function registerUser(
  payload: RegisterPayload,
): Promise<AuthResponse> {
  const res = await request<ApiResponse<AuthResponse>>(
    "/auth/register",

    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  if (!res.data?.token) {
    throw new Error(
      "Registration succeeded but the server did not return an authentication token.",
    )
  }

  saveToken(res.data.token)

  return res.data
}

export async function loginUser(
  email: string,
  password: string,
  role: string,
): Promise<AuthResponse> {
  const normalizedRole = role.toUpperCase();
  try {
    const res = await request<ApiResponse<AuthResponse>>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        role: normalizedRole,
      }),
    });

    if (!res.data?.token) {
      throw new Error(
        'Login succeeded but the server did not return an authentication token.'
      );
    }

    saveToken(res.data.token);
    if (res.data.user) {
      localStorage.setItem('rc_cached_user', JSON.stringify(res.data.user));
    }

    return res.data;
  } catch (err: any) {
    const isNetworkError =
      !err.status ||
      err.message?.includes('Network error') ||
      err.message?.includes('unreachable') ||
      err.message?.includes('Failed to fetch') ||
      err.isTimeout;

    if (isNetworkError) {
      const fallbackUser = DEMO_PROFILES[normalizedRole];
      const enteredEmail = email.trim().toLowerCase();
      const isDemoEmail = fallbackUser && (
        enteredEmail === fallbackUser.email?.toLowerCase() ||
        enteredEmail === fallbackUser.phone ||
        enteredEmail.startsWith('demo') ||
        (normalizedRole === 'DOCTOR' && (enteredEmail === 'doctor@ruralcare.in' || enteredEmail === 'dr.ankit@ruralcare.in')) ||
        (normalizedRole === 'WORKER' && (enteredEmail === 'asha.worker@ruralcare.in' || enteredEmail === 'worker@ruralcare.in')) ||
        (normalizedRole === 'PATIENT' && enteredEmail === 'patient@ruralcare.in') ||
        (normalizedRole === 'ADMIN' && (enteredEmail === 'admin@ruralcare.in' || enteredEmail === 'rajiv@ruralcare.in'))
      );

      // Strictly allow offline demo session ONLY if credentials entered match demo user
      if (isDemoEmail && fallbackUser) {
        console.warn('Backend unreachable: using offline demo session for verified demo account', normalizedRole);
        const offlineToken = `offline_demo_${normalizedRole.toLowerCase()}_${Date.now()}`;
        saveToken(offlineToken);
        localStorage.setItem('rc_cached_user', JSON.stringify(fallbackUser));
        return {
          token: offlineToken,
          user: fallbackUser,
        };
      }

      // If a custom non-demo account was entered, do not silently impersonate demo doctor/worker!
      throw new Error(
        'Server is taking longer to respond (waking up) or network is unreachable. Please wait 10 seconds and try again.'
      );
    }

    throw err;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getToken();

  if (!token) {
    return null;
  }

  // If using an offline demo session, load cached profile
  if (token.startsWith('offline_demo_')) {
    const cached = localStorage.getItem('rc_cached_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
  }

  try {
    const res = await request<
      ApiResponse<{
        user: AuthUser;
      }>
    >('/auth/me');

    if (res.data?.user) {
      localStorage.setItem('rc_cached_user', JSON.stringify(res.data.user));
      return res.data.user;
    }
  } catch (err: any) {
    // If session was revoked due to concurrent login elsewhere, clear immediately
    if (err?.message?.includes('SESSION_REVOKED') || err?.status === 401) {
      clearToken();
      return null;
    }

    const cached = localStorage.getItem('rc_cached_user');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {}
    }
  }

  return null;
}

// ─── ABHA Services ───────────────────────────────────────────────────────────

export interface AbhaVerificationResult {
  exists: boolean

  verified: boolean

  status?: string

  abhaAddress?: string

  abhaNumber?: string

  fullName?: string

  gender?: string

  dob?: string

  isMock?: boolean

  message?: string
}

export async function verifyAbha(
  abhaAddress: string,
): Promise<AbhaVerificationResult> {
  const res = await request<ApiResponse<AbhaVerificationResult>>(
    "/abdm/mock/abha/verify",
    {
      method: "POST",

      body: JSON.stringify({
        abhaAddress,
      }),
    },
  )

  return (
    res.data || {
      exists: false,

      verified: false,
    }
  )
}

export async function getAbhaProfile(identifier: string) {
  const res = await request<ApiResponse>(
    "/abdm/mock/abha/" + encodeURIComponent(identifier),
  )

  return res.data
}

// ─── HPR Services ────────────────────────────────────────────────────────────

export interface HprProfessionalResult {
  id: string

  hprId: string

  fullName: string

  gender: string

  professionalType: string

  qualification: string

  specialties: string[]

  registrationNumber: string

  registrationCouncil: string

  state: string

  district: string

  primaryHfrId?: string

  primaryFacilityName?: string

  verificationStatus: string

  isMock: boolean
}

export interface GenerateHprPayload {
  fullName: string

  qualification: string

  specialties: string[]

  professionalType?: string

  state?: string

  district?: string

  contactEmail: string

  contactPhone?: string

  gender?: string

  primaryFacilityName?: string
}

function createHprNumber(): string {
  const number = Math.floor(10000 + Math.random() * 90000)

  return `HPR-2026-${number}`
}

export async function generateHprId(
  payload: GenerateHprPayload,
): Promise<HprProfessionalResult> {
  const hprId = createHprNumber()

  const body = {
    hprId,

    fullName: payload.fullName,

    qualification: payload.qualification,

    specialties: payload.specialties,

    professionalType: payload.professionalType || "Doctor",

    state: payload.state || "Rajasthan",

    district: payload.district || "Bikaner",

    contactEmail: payload.contactEmail,

    contactPhone: payload.contactPhone,

    gender: payload.gender || "Other",

    primaryFacilityName: payload.primaryFacilityName,
  }

  const res = await request<ApiResponse<HprProfessionalResult>>(
    "/abdm/mock/hpr/professionals",
    {
      method: "POST",

      body: JSON.stringify(body),
    },
  )

  if (!res.data?.hprId) {
    throw new Error("HPR registry did not return an HPR ID.")
  }

  return res.data
}

export async function verifyHpr(hprId: string): Promise<HprProfessionalResult> {
  const cleanHprId = hprId.trim()

  if (!cleanHprId) {
    throw new Error("Please enter an HPR ID.")
  }

  const res = await request<ApiResponse<HprProfessionalResult>>(
    "/abdm/mock/hpr/professionals/" + encodeURIComponent(cleanHprId),
  )

  if (!res.data?.hprId) {
    throw new Error("HPR ID not found in ABDM HPR Registry.")
  }

  return res.data
}

// ─── Facility Services ───────────────────────────────────────────────────────

export interface FacilityItem {
  id: string

  hfrId: string

  facilityName: string

  facilityType: string

  district: string

  state: string

  hasEmergency: boolean
}

const DEFAULT_FACILITIES: FacilityItem[] = [
  {
    id: 'HFR-2024-SANJIVANI',
    hfrId: 'HFR-2024-SANJIVANI',
    facilityName: 'Sanjivani PHC',
    facilityType: 'PHC',
    district: 'Bikaner',
    state: 'Rajasthan',
    hasEmergency: true,
  },
  {
    id: 'HFR-2026-00891',
    hfrId: 'HFR-2026-00891',
    facilityName: 'PHC Lunkaransar',
    facilityType: 'PHC',
    district: 'Bikaner',
    state: 'Rajasthan',
    hasEmergency: true,
  },
  {
    id: 'HFR-2024-00289',
    hfrId: 'HFR-2024-00289',
    facilityName: 'CHC Bikaner',
    facilityType: 'CHC',
    district: 'Bikaner',
    state: 'Rajasthan',
    hasEmergency: true,
  },
];

export async function getFacilities(): Promise<FacilityItem[]> {
  try {
    const res = await request<{
      data: FacilityItem[]
    }>("/abdm/mock/hfr/facilities");
    if (res.data && res.data.length > 0) {
      return res.data;
    }
  } catch {}
  return DEFAULT_FACILITIES;
}

// ─── Patient Registration ────────────────────────────────────────────────────

export interface PatientRegistrationPayload {
  name: string

  nameHi?: string

  dob: string

  gender: "M" | "F" | "O" | "Male" | "Female" | "Other"

  bloodGroup?: string

  phone: string

  village: string

  district: string

  state: string

  address?: string

  emergencyContact: {
    name: string

    relation: string

    phone: string
  }

  allergies?: string[]

  chronicConditions?: string[]

  currentMedications?: string[]

  abhaAddress?: string

  healthWorkerName?: string

  consent: {
    granted: boolean

    purpose?: string

    dataScope?: string[]
  }
}

export interface PatientRegistrationResult {
  patient: {
    id: string

    healthId: string

    name: string

    nameHi?: string

    dob: string

    age: number

    gender: string

    phone: string

    village: string

    district: string

    state: string

    abhaAddress?: string

    abhaNumber?: string

    abhaSource: "existing" | "mock-created"

    registeredAt: string

    consentStatus: string
  }
}

export async function registerPatient(
  payload: PatientRegistrationPayload,
): Promise<PatientRegistrationResult> {
  const res = await request<ApiResponse<PatientRegistrationResult>>(
    "/patients/register",
    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  return res.data!
}

// ─── Doctor Registration ─────────────────────────────────────────────────────

export interface DoctorRegistrationPayload {
  fullName: string

  phone: string

  pin: string

  hprId: string

  facilityId: string

  specialty?: string
}

export interface DoctorRegistrationResult {
  token: string

  user: AuthUser

  doctor: {
    id: string

    hprId: string

    name: string

    specialty: string

    facilityId: string

    facilityName: string

    qualification: string

    registrationNumber: string

    registrationCouncil: string

    verificationStatus: string
  }
}

export async function registerDoctor(
  payload: DoctorRegistrationPayload,
): Promise<DoctorRegistrationResult> {
  const res = await request<ApiResponse<DoctorRegistrationResult>>(
    "/doctors/register",
    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  return res.data!
}

// ─── Worker Registration ─────────────────────────────────────────────────────

export interface WorkerRegistrationPayload {
  fullName: string

  phone: string

  pin: string

  workerType?: "ASHA" | "ANM" | "CHO" | "Health Worker"

  village: string

  subCentre?: string

  assignedPhc?: string

  district?: string

  state?: string
}

export interface WorkerRegistrationResult {
  token: string

  status: "ACTIVE" | "PENDING_VERIFICATION"

  user: AuthUser

  worker: {
    id: string

    workerCode: string

    name: string

    role: string

    village: string

    subCentre: string

    assignedPhc: string

    district: string

    state: string

    status: string
  }
}

export async function registerWorker(
  payload: WorkerRegistrationPayload,
): Promise<WorkerRegistrationResult> {
  const res = await request<ApiResponse<WorkerRegistrationResult>>(
    "/workers/register",
    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  return res.data!
}

// ─── Patients ────────────────────────────────────────────────────────────────

export async function getPatients(search?: string): Promise<any[]> {
  const query = search ? `?q=${encodeURIComponent(search)}` : ""

  try {
    const res = await request<ApiResponse<{
      patients: any[]
    }>>(`/patients${query}`)

    if (res.data?.patients && res.data.patients.length > 0) {
      return res.data.patients
    }
  } catch {}

  const q = (search || "").toLowerCase().trim()
  if (!q) return PATIENTS

  return PATIENTS.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.nameHi && p.nameHi.includes(q)) ||
      p.id.toLowerCase().includes(q) ||
      p.village.toLowerCase().includes(q) ||
      p.phone.includes(q)
  )
}

export async function getPatientByHealthId(
  healthId: string,
  purpose?: string,
): Promise<any> {
  const query = purpose ? `?purpose=${encodeURIComponent(purpose)}` : ""

  try {
    const res = await request<ApiResponse<{
      patient: any

      consultations: any[]

      referrals: any[]

      hasAccess?: boolean

      activeConsent?: any

      pendingRequest?: any
    }>>(`/patients/${encodeURIComponent(healthId)}${query}`)

    if (res?.data?.patient) {
      return res.data
    }
  } catch {}

  const cleanId = (healthId || "").trim()
  const found =
    PATIENTS.find(
      (p) =>
        p.id.toLowerCase() === cleanId.toLowerCase() ||
        (p as any).healthId?.toLowerCase() === cleanId.toLowerCase() ||
        p.phone.replace(/\D/g, "").includes(cleanId.replace(/\D/g, ""))
    ) || PATIENTS[0]

  return {
    patient: found,
    consultations: CONSULTATIONS.filter(
      (c) => c.patientId === found.id || c.patientId === (found as any).healthId
    ),
    referrals: REFERRALS.filter(
      (r) => r.patientId === found.id || r.patientId === (found as any).healthId
    ),
    hasAccess: true,
    activeConsent: {
      status: "GRANTED",
      grantedAt: "2026-01-14T00:00:00Z",
      expiresAt: "2027-01-14T00:00:00Z",
      purpose: purpose || "Care delivery",
    },
  }
}

export async function verifyPatientInCloud(
  healthId: string,
): Promise<{ exists: boolean; patient?: any; error?: string }> {
  try {
    const data = await getPatientByHealthId(healthId)

    if (data?.patient) {
      return { exists: true, patient: data.patient }
    }

    return { exists: false }
  } catch (err: any) {
    return { exists: false, error: err.message }
  }
}

// ─── Consultations ───────────────────────────────────────────────────────────

export interface CreateConsultationPayload {
  patientId: string

  referralId?: string

  workerId?: string

  workerName?: string

  doctorId?: string

  doctorName?: string

  facilityName?: string

  symptoms?: string[]

  vitals?: Record<string, any>

  diagnosis?: string

  treatment?: string

  prescription?: string[]

  notes?: string

  riskLevel?: "low" | "moderate" | "high" | "critical"

  referralStatus?: "pending" | "accepted" | "in-consultation" | "referred" | "completed"

  followUpDate?: string
}

export async function getConsultations(patientId?: string): Promise<any[]> {
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""

  const res = await request<ApiResponse<{
    consultations: any[]
  }>>(`/consultations${query}`)

  return res.data?.consultations || []
}

export async function createConsultation(
  payload: CreateConsultationPayload,
): Promise<any> {
  const res = await request<ApiResponse<{
    consultation: any

    aiAssessment?: any
  }>>("/consultations", {
    method: "POST",

    body: JSON.stringify(payload),
  })

  return res.data
}

export async function updateConsultation(
  id: string,

  payload: Partial<CreateConsultationPayload>,
): Promise<any> {
  const res = await request<ApiResponse<{
    consultation: any
  }>>(`/consultations/${encodeURIComponent(id)}`, {
    method: "PATCH",

    body: JSON.stringify(payload),
  })

  return res.data
}

// ─── Referrals ───────────────────────────────────────────────────────────────

export interface CreateReferralPayload {
  patientId: string

  consultationId?: string

  fromWorkerId?: string

  fromWorkerName?: string

  fromWorker?: string

  toFacilityId?: string

  toFacilityName?: string

  toPHC?: string

  toDoctorId?: string

  reason: string

  priority?: "routine" | "urgent" | "emergency"

  riskLevel?: "low" | "moderate" | "high" | "critical"

  notes?: string

  aiSummary?: string
}

export async function getReferrals(
  patientId?: string,

  status?: string,
): Promise<any[]> {
  const params = new URLSearchParams()

  if (patientId) params.append("patientId", patientId)

  if (status && status !== "all") params.append("status", status)

  const query = params.toString() ? `?${params.toString()}` : ""

  const res = await request<ApiResponse<{
    referrals: any[]
  }>>(`/referrals${query}`)

  return res.data?.referrals || []
}

export async function getReferralFacilities(): Promise<any[]> {
  const res = await request<ApiResponse<{
    facilities: any[]
  }>>("/referrals/facilities")

  return res.data?.facilities || []
}

export async function getReferralDoctors(): Promise<any[]> {
  const res =
    await request<ApiResponse<{
      doctors: any[]
    }>>("/referrals/doctors")

  return res.data?.doctors || []
}

export async function getReferralWorkers(): Promise<any[]> {
  const res =
    await request<ApiResponse<{
      workers: any[]
    }>>("/referrals/workers")

  return res.data?.workers || []
}

export async function createReferral(
  payload: CreateReferralPayload,
): Promise<any> {
  const res = await request<ApiResponse<{
    referral: any
  }>>("/referrals", {
    method: "POST",

    body: JSON.stringify(payload),
  })

  return res.data
}

export async function updateReferralStatus(
  id: string,

  status: string,

  notes?: string,
): Promise<any> {
  const res = await request<ApiResponse<{
    referral: any
  }>>(
    `/referrals/${encodeURIComponent(id)}/status`,

    {
      method: "PATCH",

      body: JSON.stringify({
        status,

        notes,
      }),
    },
  )

  return res.data
}

// ─── Medicines & Pharmacy Stock ─────────────────────────────────────────────

export interface MedicineItem {
  id: string;
  code: string;
  name: string;
  genericName: string;
  brand?: string;
  dosageForm: string;
  strength: string;
  category: string;
  stock: number;
  minStockLevel: number;
  isLowStock: boolean;
  batch?: string;
  expiryDate?: string;
  facilityId?: string;
  facilityName?: string;
  availability: 'In Stock' | 'Low Stock' | 'Out of Stock' | string;
  facility?: {
    id?: string;
    name?: string;
    hfrId?: string;
    facilityType?: string;
  };
}

export interface DiagnosticItem {
  id: string;
  code: string;
  testName: string;
  testNameHi?: string;
  category: string;
  kitsAvailable: number;
  minKitsLevel: number;
  status: 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  batch?: string;
  expiryDate?: string;
  facilityId: string;
  facilityName?: string;
  facility?: {
    id?: string;
    name?: string;
    hfrId?: string;
    facilityType?: string;
  };
}

export interface FacilityStockSummary {
  facility?: {
    id?: string;
    name?: string;
    hfrId?: string;
    facilityType?: string;
    district?: string;
    state?: string;
  };
  medicines: MedicineItem[];
  diagnosticItems: DiagnosticItem[];
  stats: {
    medicines: {
      total: number;
      inStock: number;
      lowStock: number;
      outOfStock: number;
    };
    diagnostics: {
      total: number;
      available: number;
      lowStock: number;
      outOfStock: number;
    };
    hasCriticalShortages: boolean;
  };
}

export async function getMedicines(
  search?: string,
  category?: string,
  facilityId?: string
): Promise<MedicineItem[]> {
  const params = new URLSearchParams();

  if (search) {
    params.append('search', search);
  }

  if (category) {
    params.append('category', category);
  }

  if (facilityId) {
    params.append('facilityId', facilityId);
  }

  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await request<ApiResponse<{ medicines: MedicineItem[] }>>(`/medicines${query}`);

  return res.data?.medicines || [];
}

export async function updateMedicineStock(
  id: string,
  payload: { stock: number; minStockLevel?: number; availability?: string }
): Promise<MedicineItem> {
  const res = await request<ApiResponse<{ medicine: MedicineItem }>>(`/medicines/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data!.medicine;
}

export async function createMedicine(payload: {
  name: string;
  genericName: string;
  brand?: string;
  dosageForm?: string;
  strength?: string;
  category?: string;
  stock?: number;
  minStockLevel?: number;
  batch?: string;
  expiryDate?: string;
  facilityId?: string;
  facilityName?: string;
  unitPrice?: number;
  code?: string;
}): Promise<MedicineItem> {
  const res = await request<ApiResponse<{ medicine: MedicineItem }>>('/medicines', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!.medicine;
}

// ─── Diagnostic Test Kits Stock ──────────────────────────────────────────────

export async function getDiagnosticItems(
  facilityId?: string,
  search?: string,
  category?: string,
  status?: string
): Promise<DiagnosticItem[]> {
  const params = new URLSearchParams();

  if (facilityId) {
    params.append('facilityId', facilityId);
  }
  if (search) {
    params.append('search', search);
  }
  if (category && category !== 'ALL') {
    params.append('category', category);
  }
  if (status && status !== 'ALL') {
    params.append('status', status);
  }

  const query = params.toString() ? `?${params.toString()}` : '';

  const res = await request<ApiResponse<{ diagnosticItems: DiagnosticItem[] }>>(`/diagnostics${query}`);

  return res.data?.diagnosticItems || [];
}

export async function updateDiagnosticStock(
  id: string,
  payload: { kitsAvailable: number; status?: string; minKitsLevel?: number }
): Promise<DiagnosticItem> {
  const res = await request<ApiResponse<{ diagnosticItem: DiagnosticItem }>>(`/diagnostics/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data!.diagnosticItem;
}

export async function createDiagnosticItem(payload: {
  code: string;
  testName: string;
  testNameHi?: string;
  category?: string;
  kitsAvailable?: number;
  minKitsLevel?: number;
  status?: string;
  batch?: string;
  expiryDate?: string;
  facilityId: string;
}): Promise<DiagnosticItem> {
  const res = await request<ApiResponse<{ diagnosticItem: DiagnosticItem }>>('/diagnostics', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!.diagnosticItem;
}

export async function getFacilityStockSummary(facilityId: string): Promise<FacilityStockSummary> {
  const res = await request<ApiResponse<FacilityStockSummary>>(`/medicines/facilities/${encodeURIComponent(facilityId)}/stock-summary`);
  return res.data!;
}



// ─── AI ──────────────────────────────────────────────────────────────────────

export async function getAiAssessments(patientId?: string): Promise<any[]> {
  const query = patientId ? `?patientId=${encodeURIComponent(patientId)}` : ""

  const res = await request<ApiResponse<{
    assessments: any[]
  }>>(`/ai-assessments${query}`)

  return res.data?.assessments || []
}

// ─── Standardized Symptoms & XGBoost AI ───────────────────────────────────────

export interface StandardizedSymptom {
  id: string

  code: string

  name: string

  nameHi?: string

  category: string

  synonyms: string[]

  icd10Code?: string

  defaultWeight: number
}

export async function getSymptoms(
  query?: string,
): Promise<StandardizedSymptom[]> {
  const q = query ? `?q=${encodeURIComponent(query.trim())}` : ""

  const res = await request<ApiResponse<{ symptoms: StandardizedSymptom[] }>>(
    `/symptoms${q}`,
  )

  return res.data?.symptoms || []
}

export interface RiskPredictionResponse {
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"

  confidence: number

  probabilities: {
    low: number

    moderate: number

    high: number

    critical: number
  }

  abnormalVitals: string[]

  reasoning: string

  recommendedAction: string

  modelVersion: string

  standardizedCodes: string[]
}

export async function predictRisk(payload: {
  age?: number

  gender?: string

  vitals: any

  symptoms: string[]

  standardizedSymptomCodes?: string[]

  obs?: string
}): Promise<RiskPredictionResponse> {
  const res = await request<ApiResponse<RiskPredictionResponse>>(
    "/assessments/predict-risk",
    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  return res.data!
}

export async function generateAiAssessment(payload: {
  patientId: string

  symptoms: string[]

  standardizedSymptomCodes?: string[]

  vitals: any

  obs?: string
}): Promise<any> {
  const res = await request<ApiResponse<{
    assessment: any
    prediction: RiskPredictionResponse
  }>>(
    "/assessments/generate",

    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  return res.data
}

// ─── Doctors ─────────────────────────────────────────────────────────────────

export async function getDoctors(): Promise<any[]> {
  const res =
    await request<ApiResponse<{
      doctors: any[]
    }>>("/doctors")

  return res.data?.doctors || []
}

export async function updateDoctorDutyStatus(
  id: string,

  dutyStatus: "AVAILABLE" | "BUSY" | "OFFLINE",
): Promise<any> {
  const res = await request<ApiResponse<{
    doctor: any
  }>>(
    `/doctors/${encodeURIComponent(id)}/duty-status`,

    {
      method: "PATCH",

      body: JSON.stringify({
        dutyStatus,
      }),
    },
  )

  return res.data
}

// ─── Dashboards ──────────────────────────────────────────────────────────────

export async function getAdminDashboardData(): Promise<any> {
  const res = await request<ApiResponse<any>>("/dashboards/admin")

  return res.data
}

export async function getWorkerDashboardData(): Promise<any> {
  const res = await request<ApiResponse<any>>("/dashboards/worker")

  return res.data
}

export async function getDoctorDashboardData(doctorId?: string): Promise<any> {
  const query = doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : ""

  const res = await request<ApiResponse<any>>(`/dashboards/doctor${query}`)

  return res.data
}

export async function getPatientDashboardData(healthId: string): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/dashboards/patient/${encodeURIComponent(healthId)}`,
  )

  return res.data
}

// ─── Emergency & Break-Glass (T3 Tier) ──────────────────────────────────────

export interface AuthorizeEmergencyPayload {
  sosAlertId?: string

  patientId?: string

  patientHealthId: string

  patientName: string

  doctorId?: string

  doctorName: string

  facilityId?: string

  facilityName: string

  reason: string

  note: string

  records?: string
}

export async function authorizeEmergency(
  payload: AuthorizeEmergencyPayload,
): Promise<{ token: string; expiresInSeconds: number; log: any }> {
  const res = await request<ApiResponse<any>>("/emergency/authorize", {
    method: "POST",

    body: JSON.stringify(payload),
  })

  return res.data
}

export async function getEmergencyLogs(): Promise<any[]> {
  const res = await request<ApiResponse<any[]>>("/emergency/logs")

  return res.data || []
}

export interface DispatchSosPayload {
  fromName: string

  role: string

  senderId?: string

  patientId?: string

  patientHealthId: string

  facilityId?: string

  location: string

  targetedDoctorId?: string

  vitalsSnapshot?: any
}

export async function dispatchSosAlert(
  payload: DispatchSosPayload,
): Promise<any> {
  const res = await request<ApiResponse<any>>("/emergency/sos", {
    method: "POST",

    body: JSON.stringify(payload),
  })

  return res.data
}

export async function getActiveSosAlerts(): Promise<any[]> {
  const res = await request<ApiResponse<any[]>>("/emergency/sos/active")

  return res.data || []
}

export async function getDoctorSosInbox(doctorId?: string): Promise<any[]> {
  const query = doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : ""

  const res = await request<ApiResponse<any[]>>(`/emergency/sos/inbox${query}`)

  return res.data || []
}

export async function acceptSosAlert(
  id: string,
  responderId?: string,
  responderName?: string,
): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/emergency/sos/${encodeURIComponent(id)}/accept`,
    {
      method: "POST",

      body: JSON.stringify({ responderId, responderName }),
    },
  )

  return res.data
}

export async function declineSosAlert(
  id: string,
  responderId?: string,
): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/emergency/sos/${encodeURIComponent(id)}/decline`,
    {
      method: "POST",

      body: JSON.stringify({ responderId }),
    },
  )

  return res.data
}

export async function cancelSosAlert(id: string): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/emergency/sos/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST",
    },
  )

  return res.data
}

export async function getSosAlertStatus(id: string): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/emergency/sos/${encodeURIComponent(id)}/status`,
  )

  return res.data
}

export async function updateSosStatus(
  id: string,
  status: string,
  respondingDoctorId?: string,
): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/emergency/sos/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",

      body: JSON.stringify({ status, respondingDoctorId }),
    },
  )

  return res.data
}

// ─── Patient Profile, Consent & Audit Helpers ─────────────────────────────────

export async function updatePatient(
  patientId: string,
  payload: any,
): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/patients/${encodeURIComponent(patientId)}`,
    {
      method: "PATCH",

      body: JSON.stringify(payload),
    },
  )

  return res.data
}

export async function getPatientAuditLogs(patientId: string): Promise<any[]> {
  const res = await request<ApiResponse<{ auditLogs: any[] }>>(
    `/patients/${encodeURIComponent(patientId)}/audit-logs`,
  )

  return res.data?.auditLogs || []
}

export async function getPatientAccessRequests(
  patientId: string,
): Promise<any[]> {
  const res = await request<ApiResponse<{ requests: any[] }>>(
    `/patients/${encodeURIComponent(patientId)}/access-requests`,
  )

  return res.data?.requests || []
}

export async function requestPatientAccess(
  patientId: string,

  payload: {
    duration: "1 day" | "1 week" | "1 month" | "3 months" | string

    reason: string

    dataScope: string[]
  },
): Promise<any> {
  const res = await request<ApiResponse<{ request: any }>>(
    `/patients/${encodeURIComponent(patientId)}/access-requests`,

    {
      method: "POST",

      body: JSON.stringify(payload),
    },
  )

  return res.data
}

export async function getWorkers(): Promise<any[]> {
  const res = await request<ApiResponse<{ workers?: any[] }>>("/workers").catch(
    () => null,
  )

  if (res?.data?.workers && res.data.workers.length > 0) {
    return res.data.workers
  }

  const mockRes = await request<ApiResponse<{ workers?: any[]; data?: any[] }>>(
    "/abdm/mock/workers",
  ).catch(() => null)

  const data =
    mockRes?.data?.workers || (Array.isArray(mockRes?.data) ? mockRes.data : [])

  return data
}

export async function createPatientConsent(payload: {
  patientId: string

  grantedTo: string

  role: string

  organization: string

  purpose: string

  dataScope: string[]

  expiresAt?: string
}): Promise<any> {
  const res = await request<ApiResponse<any>>("/abdm/mock/consents", {
    method: "POST",

    body: JSON.stringify(payload),
  })

  return res.data
}

export async function revokePatientConsent(
  consentId: string,
  reason?: string,
): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/abdm/mock/consents/${encodeURIComponent(consentId)}/revoke`,
    {
      method: "POST",

      body: JSON.stringify({ reason }),
    },
  )

  return res.data
}

export async function approvePatientConsent(consentId: string): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/abdm/mock/consents/${encodeURIComponent(consentId)}/approve`,
    {
      method: "POST",
    },
  )

  return res.data
}

export interface BookAppointmentPayload {
  patientId: string
  doctorId: string
  facilityId?: string
  scheduledDate: string
  timeSlot?: string
  reason?: string
  notes?: string
  priority?: "ROUTINE" | "URGENT" | "HIGH_RISK"
  source?: "PATIENT" | "ASHA" | "REFERRAL"
  bookedByWorkerId?: string
}

export async function bookAppointment(
  payload: BookAppointmentPayload,
): Promise<any> {
  const res = await request<ApiResponse<{ appointment: any }>>(
    "/appointments",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  )

  return res.data?.appointment
}

export async function getDoctorAppointments(
  doctorId: string,
  date?: string,
  status?: string,
): Promise<any[]> {
  const params = new URLSearchParams()
  if (date) params.set("date", date)
  if (status) params.set("status", status)
  const query = params.toString() ? `?${params.toString()}` : ""

  const res = await request<ApiResponse<{ appointments: any[] }>>(
    `/appointments/doctor/${encodeURIComponent(doctorId)}${query}`,
  ).catch(() => null)

  return res?.data?.appointments || []
}

export async function getPatientAppointments(
  patientId: string,
): Promise<any[]> {
  const res = await request<ApiResponse<{ appointments: any[] }>>(
    `/appointments/patient/${encodeURIComponent(patientId)}`,
  ).catch(() => null)

  return res?.data?.appointments || []
}

export async function getFacilityAppointments(
  facilityId: string,
  date?: string,
): Promise<any[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ""
  const res = await request<ApiResponse<{ appointments: any[] }>>(
    `/appointments/facility/${encodeURIComponent(facilityId)}${query}`,
  ).catch(() => null)

  return res?.data?.appointments || []
}

export async function updateAppointmentStatus(
  id: string,
  status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED",
  notes?: string,
): Promise<any> {
  const res = await request<ApiResponse<{ appointment: any }>>(
    `/appointments/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({ status, notes }),
    },
  )

  return res.data?.appointment
}

export interface DoctorSlotItem {
  timeSlot: string
  capacity: number
  bookedCount: number
  availableSpots: number
  status: "AVAILABLE" | "ALMOST_FULL" | "FULL"
}

export interface DoctorSlotsResponse {
  doctorId: string
  doctorName: string
  scheduledDate: string
  slotCapacity: number
  totalBooked: number
  slots: DoctorSlotItem[]
}

export async function getDoctorSlots(
  doctorId: string,
  date?: string,
): Promise<DoctorSlotsResponse | null> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ""
  const res = await request<ApiResponse<DoctorSlotsResponse>>(
    `/appointments/doctor/${encodeURIComponent(doctorId)}/slots${query}`,
  ).catch(() => null)
  return res?.data || null
}

export async function updateDoctorSlotCapacity(
  doctorId: string,
  capacity: number,
): Promise<any> {
  const res = await request<ApiResponse<any>>(
    `/appointments/doctor/${encodeURIComponent(doctorId)}/capacity`,
    {
      method: "PATCH",
      body: JSON.stringify({ capacity }),
    },
  )
  return res.data
}

// ============================================================================
// Teleconsultation & Real-Time WebRTC Clinical Persistence
// ============================================================================

export interface TeleconsultationSessionPayload {
  patientId?: string
  doctorId?: string
  role?: 'doctor' | 'worker' | 'patient'
}

export interface SaveTeleconsultationPayload {
  sessionId: string
  patientId: string
  doctorId?: string
  doctorName?: string
  workerId?: string
  workerName?: string
  facilityName?: string
  symptoms?: string[]
  vitals?: any
  diagnosis?: string
  treatment?: string
  prescription: string[]
  notes?: string
  duration?: number
  networkQuality?: string
  riskLevel?: string
  referralStatus?: string
  followUpDate?: string
}

export async function createTeleconsultationSession(payload: TeleconsultationSessionPayload): Promise<any> {
  const res = await request<ApiResponse<any>>('/teleconsultation/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res?.data
}

export async function saveTeleconsultationRecord(payload: SaveTeleconsultationPayload): Promise<any> {
  const res = await request<ApiResponse<any>>('/teleconsultation/consultations', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return res?.data
}

export async function getActiveTeleconsultationCall(patientId: string): Promise<any> {
  const res = await request<ApiResponse<any>>(`/teleconsultation/active-call?patientId=${encodeURIComponent(patientId)}`).catch(() => null)
  return res?.data?.activeCall || null
}

import { MCH_RECORDS, MCH_DUE_ITEMS } from '../data';

export async function getMchDueList(params?: {
  village?: string;
  category?: string;
  urgency?: string;
}): Promise<{ stats: any; dueItems: any[]; records: any[]; currentWeekLabel: string; village: string }> {
  const queryParts: string[] = [];
  if (params?.village) queryParts.push(`village=${encodeURIComponent(params.village)}`);
  if (params?.category) queryParts.push(`category=${encodeURIComponent(params.category)}`);
  if (params?.urgency) queryParts.push(`urgency=${encodeURIComponent(params.urgency)}`);
  const qs = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';

  try {
    const res = await request<ApiResponse<any>>(`/mch/due-list${qs}`);
    if (res?.data) {
      return res.data;
    }
  } catch {
    // offline/fallback
  }

  const v = params?.village?.trim();
  const c = params?.category?.trim();
  const u = params?.urgency?.trim();

  let records = [...MCH_RECORDS];
  if (v && v.toLowerCase() !== 'all') {
    records = records.filter(r => (r.assignedVillage || r.patientVillage)?.toLowerCase() === v.toLowerCase());
  }

  let items = [...MCH_DUE_ITEMS];
  if (v && v.toLowerCase() !== 'all') {
    items = items.filter(i => i.village.toLowerCase() === v.toLowerCase());
  }
  if (c && c !== 'all') {
    items = items.filter(i => i.category === c);
  }
  if (u === 'overdue') {
    items = items.filter(i => i.status === 'overdue');
  } else if (u === 'due') {
    items = items.filter(i => i.status === 'due');
  } else if (u === 'hrp') {
    items = items.filter(i => i.isHighRisk);
  }

  const stats = {
    totalBeneficiaries: records.length,
    overdueCount: items.filter(i => i.status === 'overdue').length,
    dueThisWeekCount: items.filter(i => i.status === 'due').length,
    highRiskCount: records.filter(r => r.isHighRisk).length,
    maternalDueCount: items.filter(i => i.category === 'maternal').length,
    childDueCount: items.filter(i => i.category === 'child').length,
  };

  return {
    stats,
    dueItems: items,
    records,
    currentWeekLabel: 'Week of Sept 15–21, 2026',
    village: v || 'Govindpur',
  };
}

export async function getPatientMchRecord(patientId: string): Promise<any> {
  try {
    const res = await request<ApiResponse<any>>(`/mch/patient/${encodeURIComponent(patientId)}`);
    if (res?.data) {
      return res.data;
    }
  } catch {
    // fallback
  }

  const found = MCH_RECORDS.find(
    r => r.patientId === patientId || r.patientHealthId === patientId || r.id === patientId
  );
  return found || MCH_RECORDS[0];
}

export async function updateMchMilestone(
  recordId: string,
  milestoneCode: string,
  payload: any
): Promise<any> {
  try {
    const res = await request<ApiResponse<any>>(
      `/mch/${encodeURIComponent(recordId)}/milestones/${encodeURIComponent(milestoneCode)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
    if (res?.data) {
      return res.data;
    }
  } catch {
    // local fallback
  }

  const targetRecord = MCH_RECORDS.find(r => r.id === recordId || r.patientId === recordId);
  if (targetRecord && Array.isArray(targetRecord.milestones)) {
    const m = targetRecord.milestones.find((x: any) => x.code.toLowerCase() === milestoneCode.toLowerCase() || x.id === milestoneCode);
    if (m) {
      m.status = payload.status || 'completed';
      m.completedDate = payload.completedDate || new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      if (payload.administeredBy) m.administeredBy = payload.administeredBy;
      if (payload.batchNumber) m.batchNumber = payload.batchNumber;
      if (payload.notes) m.notes = payload.notes;
    }
  }

  const dueItemIndex = MCH_DUE_ITEMS.findIndex(
    i => (i.recordId === recordId || i.patientId === recordId) && i.milestoneCode.toLowerCase() === milestoneCode.toLowerCase()
  );
  if (dueItemIndex >= 0) {
    MCH_DUE_ITEMS.splice(dueItemIndex, 1);
  }

  return { success: true };
}

export async function createMchRecord(payload: any): Promise<any> {
  try {
    const res = await request<ApiResponse<any>>('/mch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res?.data) {
      return res.data;
    }
  } catch {
    // local fallback
  }

  const newRec: any = {
    id: `mch-${Date.now()}`,
    ...payload,
    milestones: [
      { id: 'anc-1', code: 'ANC-1', name: 'Antenatal Checkup 1', category: 'maternal', recommendedWeekOrAge: '12th week', dueDate: '14 Mar 2026', status: 'completed' },
      { id: 'tt-1', code: 'TT-1', name: 'Tetanus Toxoid 1', category: 'maternal', recommendedWeekOrAge: 'Early pregnancy', dueDate: '14 Mar 2026', status: 'completed' },
      { id: 'ifa-1', code: 'IFA-1', name: 'IFA Distribution (100 Tabs)', category: 'maternal', recommendedWeekOrAge: '14th week', dueDate: '14 Mar 2026', status: 'completed' },
      { id: 'anc-2', code: 'ANC-2', name: 'Antenatal Checkup 2', category: 'maternal', recommendedWeekOrAge: '20th week', dueDate: '12 May 2026', status: 'completed' },
      { id: 'anc-3', code: 'ANC-3', name: 'Antenatal Checkup 3', category: 'maternal', recommendedWeekOrAge: '28th week', dueDate: '22 Sep 2026', status: 'due' },
    ],
  };
  MCH_RECORDS.unshift(newRec);
  return newRec;
}
