// ============================================================================
// RuralCare API Client Layer (SIH 26133)
// ============================================================================

export const API_BASE_URL =
  (import.meta as any).env?.VITE_API_BASE_URL ||
  'http://localhost:5000/api/v1';

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errors?: Array<{ path: string; message: string }>;
}

export interface AuthUser {
  id?: string;
  email?: string;
  role?: string;
  fullName?: string;
  phone?: string;

  doctorProfile?: {
    id?: string;
    name?: string;
    specialty?: string;
    qualification?: string;
    hprId?: string;
    registrationNumber?: string;
    registrationCouncil?: string;
    verificationStatus?: string;
    facilityId?: string;
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
    status?: string;
  };

  patientProfile?: {
    id?: string;
    name?: string;
    healthId?: string;
    dob?: string;
    gender?: string;
    phone?: string;
    village?: string;
    district?: string;
    state?: string;
  };
}

export function saveToken(token: string) {
  localStorage.setItem('rc_token', token);
}

export function getToken(): string | null {
  return localStorage.getItem('rc_token');
}

export function clearToken() {
  localStorage.removeItem('rc_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  try {
    const res = await fetch(url, {
      ...options,
      headers,
    });

    let json: any = {};

    try {
      json = await res.json();
    } catch {
      json = {};
    }

    if (!res.ok) {
      const detailedMsg = json.errors?.length
        ? `${json.message || 'Validation failed'}: ${json.errors.map((e: any) => `${e.path} (${e.message})`).join(', ')}`
        : json.message || json.errors?.[0]?.message || `Request failed with status ${res.status}`;
      throw new Error(detailedMsg);
    }

    return json;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }

    throw new Error(
      'Network error or server unreachable. Please verify the backend is running.'
    );
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface RegisterPayload {
  email: string;
  password: string;
  fullName: string;
  role: 'WORKER' | 'DOCTOR' | 'PATIENT' | 'ADMIN';

  phone?: string;

  // Doctor
  hprId?: string;
  specialty?: string;
  qualification?: string;
  gender?: string;
  facility?: string;
  facilityId?: string;
  district?: string;
  state?: string;

  // Worker
  workerType?: string;
  village?: string;
  subCentre?: string;
  assignedPhc?: string;

  // Patient
  dob?: string;
  bloodGroup?: string;
  abhaAddress?: string;
  abhaNumber?: string;

  [key: string]: any;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function registerUser(
  payload: RegisterPayload
): Promise<AuthResponse> {
  const res =
    await request<ApiResponse<AuthResponse>>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );

  if (!res.data?.token) {
    throw new Error(
      'Registration succeeded but the server did not return an authentication token.'
    );
  }

  saveToken(res.data.token);

  return res.data;
}

export async function loginUser(
  email: string,
  password: string,
  role: string
): Promise<AuthResponse> {
  const res =
    await request<ApiResponse<AuthResponse>>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          role,
        }),
      }
    );

  if (!res.data?.token) {
    throw new Error(
      'Login succeeded but the server did not return an authentication token.'
    );
  }

  saveToken(res.data.token);

  return res.data;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = getToken();

  if (!token) {
    return null;
  }

  const res =
    await request<
      ApiResponse<{
        user: AuthUser;
      }>
    >('/auth/me');

  return res.data?.user || null;
}

// ─── ABHA Services ───────────────────────────────────────────────────────────

export interface AbhaVerificationResult {
  exists: boolean;
  verified: boolean;
  status?: string;
  abhaAddress?: string;
  abhaNumber?: string;
  fullName?: string;
  gender?: string;
  dob?: string;
  isMock?: boolean;
  message?: string;
}

export async function verifyAbha(
  abhaAddress: string
): Promise<AbhaVerificationResult> {
  const res =
    await request<
      ApiResponse<AbhaVerificationResult>
    >('/abdm/mock/abha/verify', {
      method: 'POST',
      body: JSON.stringify({
        abhaAddress,
      }),
    });

  return (
    res.data || {
      exists: false,
      verified: false,
    }
  );
}

export async function getAbhaProfile(
  identifier: string
) {
  const res =
    await request<ApiResponse>(
      '/abdm/mock/abha/' +
        encodeURIComponent(identifier)
    );

  return res.data;
}

// ─── HPR Services ────────────────────────────────────────────────────────────

export interface HprProfessionalResult {
  id: string;
  hprId: string;
  fullName: string;
  gender: string;
  professionalType: string;
  qualification: string;
  specialties: string[];
  registrationNumber: string;
  registrationCouncil: string;
  state: string;
  district: string;
  primaryHfrId?: string;
  primaryFacilityName?: string;
  verificationStatus: string;
  isMock: boolean;
}

export interface GenerateHprPayload {
  fullName: string;
  qualification: string;
  specialties: string[];
  professionalType?: string;
  state?: string;
  district?: string;
  contactEmail: string;
  contactPhone?: string;
  gender?: string;
  primaryFacilityName?: string;
}

function createHprNumber(): string {
  const number =
    Math.floor(
      10000 + Math.random() * 90000
    );

  return `HPR-2026-${number}`;
}

export async function generateHprId(
  payload: GenerateHprPayload
): Promise<HprProfessionalResult> {
  const hprId = createHprNumber();

  const body = {
    hprId,
    fullName: payload.fullName,
    qualification: payload.qualification,
    specialties: payload.specialties,
    professionalType:
      payload.professionalType || 'Doctor',
    state:
      payload.state || 'Rajasthan',
    district:
      payload.district || 'Bikaner',
    contactEmail: payload.contactEmail,
    contactPhone:
      payload.contactPhone,
    gender:
      payload.gender || 'Other',
    primaryFacilityName:
      payload.primaryFacilityName,
  };

  const res =
    await request<
      ApiResponse<HprProfessionalResult>
    >('/abdm/mock/hpr/professionals', {
      method: 'POST',
      body: JSON.stringify(body),
    });

  if (!res.data?.hprId) {
    throw new Error(
      'HPR registry did not return an HPR ID.'
    );
  }

  return res.data;
}

export async function verifyHpr(
  hprId: string
): Promise<HprProfessionalResult> {
  const cleanHprId = hprId.trim();

  if (!cleanHprId) {
    throw new Error(
      'Please enter an HPR ID.'
    );
  }

  const res =
    await request<
      ApiResponse<HprProfessionalResult>
    >(
      '/abdm/mock/hpr/professionals/' +
        encodeURIComponent(cleanHprId)
    );

  if (!res.data?.hprId) {
    throw new Error(
      'HPR ID not found in ABDM HPR Registry.'
    );
  }

  return res.data;
}

// ─── Facility Services ───────────────────────────────────────────────────────

export interface FacilityItem {
  id: string;
  hfrId: string;
  facilityName: string;
  facilityType: string;
  district: string;
  state: string;
  hasEmergency: boolean;
}

export async function getFacilities(): Promise<
  FacilityItem[]
> {
  const res =
    await request<{
      data: FacilityItem[];
    }>('/abdm/mock/hfr/facilities');

  return res.data || [];
}

// ─── Patient Registration ────────────────────────────────────────────────────

export interface PatientRegistrationPayload {
  name: string;
  nameHi?: string;
  dob: string;
  gender:
    | 'M'
    | 'F'
    | 'O'
    | 'Male'
    | 'Female'
    | 'Other';
  bloodGroup?: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  address?: string;
  emergencyContact: {
    name: string;
    relation: string;
    phone: string;
  };
  allergies?: string[];
  chronicConditions?: string[];
  currentMedications?: string[];
  abhaAddress?: string;
  healthWorkerName?: string;
  consent: {
    granted: boolean;
    purpose?: string;
    dataScope?: string[];
  };
}

export interface PatientRegistrationResult {
  patient: {
    id: string;
    healthId: string;
    name: string;
    nameHi?: string;
    dob: string;
    age: number;
    gender: string;
    phone: string;
    village: string;
    district: string;
    state: string;
    abhaAddress?: string;
    abhaNumber?: string;
    abhaSource:
      | 'existing'
      | 'mock-created';
    registeredAt: string;
    consentStatus: string;
  };
}

export async function registerPatient(
  payload: PatientRegistrationPayload
): Promise<PatientRegistrationResult> {
  const res =
    await request<
      ApiResponse<PatientRegistrationResult>
    >('/patients/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  return res.data!;
}

// ─── Doctor Registration ─────────────────────────────────────────────────────

export interface DoctorRegistrationPayload {
  fullName: string;
  phone: string;
  pin: string;
  hprId: string;
  facilityId: string;
  specialty?: string;
}

export interface DoctorRegistrationResult {
  token: string;
  user: AuthUser;
  doctor: {
    id: string;
    hprId: string;
    name: string;
    specialty: string;
    facilityId: string;
    facilityName: string;
    qualification: string;
    registrationNumber: string;
    registrationCouncil: string;
    verificationStatus: string;
  };
}

export async function registerDoctor(
  payload: DoctorRegistrationPayload
): Promise<DoctorRegistrationResult> {
  const res =
    await request<
      ApiResponse<DoctorRegistrationResult>
    >('/doctors/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  return res.data!;
}

// ─── Worker Registration ─────────────────────────────────────────────────────

export interface WorkerRegistrationPayload {
  fullName: string;
  phone: string;
  pin: string;
  workerType?:
    | 'ASHA'
    | 'ANM'
    | 'CHO'
    | 'Health Worker';
  village: string;
  subCentre?: string;
  assignedPhc?: string;
  district?: string;
  state?: string;
}

export interface WorkerRegistrationResult {
  token: string;
  status:
    | 'ACTIVE'
    | 'PENDING_VERIFICATION';
  user: AuthUser;
  worker: {
    id: string;
    workerCode: string;
    name: string;
    role: string;
    village: string;
    subCentre: string;
    assignedPhc: string;
    district: string;
    state: string;
    status: string;
  };
}

export async function registerWorker(
  payload: WorkerRegistrationPayload
): Promise<WorkerRegistrationResult> {
  const res =
    await request<
      ApiResponse<WorkerRegistrationResult>
    >('/workers/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  return res.data!;
}

// ─── Patients ────────────────────────────────────────────────────────────────

export async function getPatients(
  search?: string
): Promise<any[]> {
  const query = search
    ? `?search=${encodeURIComponent(search)}`
    : '';

  const res =
    await request<
      ApiResponse<{
        patients: any[];
      }>
    >(`/patients${query}`);

  return res.data?.patients || [];
}

export async function getPatientByHealthId(
  healthId: string
): Promise<any> {
  const res =
    await request<
      ApiResponse<{
        patient: any;
        consultations: any[];
        referrals: any[];
      }>
    >(
      `/patients/${encodeURIComponent(
        healthId
      )}`
    );

  return res.data;
}

// ─── Consultations ───────────────────────────────────────────────────────────

export interface CreateConsultationPayload {
  patientId: string;
  workerId?: string;
  workerName?: string;
  doctorId?: string;
  doctorName?: string;
  facilityName?: string;
  symptoms?: string[];
  vitals?: Record<string, any>;
  diagnosis?: string;
  treatment?: string;
  prescription?: string[];
  notes?: string;
  riskLevel?:
    | 'low'
    | 'moderate'
    | 'high'
    | 'critical';
  referralStatus?:
    | 'pending'
    | 'accepted'
    | 'in-consultation'
    | 'referred'
    | 'completed';
  followUpDate?: string;
}

export async function getConsultations(
  patientId?: string
): Promise<any[]> {
  const query = patientId
    ? `?patientId=${encodeURIComponent(
        patientId
      )}`
    : '';

  const res =
    await request<
      ApiResponse<{
        consultations: any[];
      }>
    >(`/consultations${query}`);

  return res.data?.consultations || [];
}

export async function createConsultation(
  payload: CreateConsultationPayload
): Promise<any> {
  const res =
    await request<
      ApiResponse<{
        consultation: any;
        aiAssessment?: any;
      }>
    >('/consultations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  return res.data;
}

export async function updateConsultation(
  id: string,
  payload: Partial<CreateConsultationPayload>
): Promise<any> {
  const res =
    await request<
      ApiResponse<{
        consultation: any;
      }>
    >(`/consultations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

  return res.data;
}

// ─── Referrals ───────────────────────────────────────────────────────────────

export interface CreateReferralPayload {
  patientId: string;
  consultationId?: string;
  fromWorkerId?: string;
  fromWorkerName?: string;
  fromWorker?: string;
  toFacilityId?: string;
  toFacilityName?: string;
  toPHC?: string;
  reason: string;
  priority?:
    | 'routine'
    | 'urgent'
    | 'emergency';
  riskLevel?:
    | 'low'
    | 'moderate'
    | 'high'
    | 'critical';
  notes?: string;
  aiSummary?: string;
}

export async function getReferrals(
  patientId?: string,
  status?: string
): Promise<any[]> {
  const params = new URLSearchParams();
  if (patientId) params.append('patientId', patientId);
  if (status && status !== 'all') params.append('status', status);
  const query = params.toString() ? `?${params.toString()}` : '';

  const res =
    await request<
      ApiResponse<{
        referrals: any[];
      }>
    >(`/referrals${query}`);

  return res.data?.referrals || [];
}

export async function getReferralFacilities(): Promise<any[]> {
  const res =
    await request<
      ApiResponse<{
        facilities: any[];
      }>
    >('/referrals/facilities');

  return res.data?.facilities || [];
}

export async function getReferralWorkers(): Promise<any[]> {
  const res =
    await request<
      ApiResponse<{
        workers: any[];
      }>
    >('/referrals/workers');

  return res.data?.workers || [];
}

export async function createReferral(
  payload: CreateReferralPayload
): Promise<any> {
  const res =
    await request<
      ApiResponse<{
        referral: any;
      }>
    >('/referrals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

  return res.data;
}

export async function updateReferralStatus(
  id: string,
  status: string,
  notes?: string
): Promise<any> {
  const res =
    await request<
      ApiResponse<{
        referral: any;
      }>
    >(
      `/referrals/${encodeURIComponent(
        id
      )}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          notes,
        }),
      }
    );

  return res.data;
}

// ─── Medicines ───────────────────────────────────────────────────────────────

export async function getMedicines(
  search?: string,
  category?: string
): Promise<any[]> {
  const params = new URLSearchParams();

  if (search) {
    params.append('search', search);
  }

  if (category) {
    params.append('category', category);
  }

  const query = params.toString()
    ? `?${params.toString()}`
    : '';

  const res =
    await request<
      ApiResponse<{
        medicines: any[];
      }>
    >(`/medicines${query}`);

  return res.data?.medicines || [];
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export async function getAiAssessments(
  patientId?: string
): Promise<any[]> {
  const query = patientId
    ? `?patientId=${encodeURIComponent(
        patientId
      )}`
    : '';

  const res =
    await request<
      ApiResponse<{
        assessments: any[];
      }>
    >(`/ai${query}`);

  return res.data?.assessments || [];
}

// ─── Doctors ─────────────────────────────────────────────────────────────────

export async function getDoctors(): Promise<any[]> {
  const res =
    await request<
      ApiResponse<{
        doctors: any[];
      }>
    >('/doctors');

  return res.data?.doctors || [];
}

export async function updateDoctorDutyStatus(
  id: string,
  dutyStatus:
    | 'AVAILABLE'
    | 'BUSY'
    | 'OFFLINE'
): Promise<any> {
  const res =
    await request<
      ApiResponse<{
        doctor: any;
      }>
    >(
      `/doctors/${encodeURIComponent(
        id
      )}/duty-status`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          dutyStatus,
        }),
      }
    );

  return res.data;
}

// ─── Dashboards ──────────────────────────────────────────────────────────────

export async function getAdminDashboardData(): Promise<any> {
  const res =
    await request<ApiResponse<any>>(
      '/dashboards/admin'
    );

  return res.data;
}

export async function getWorkerDashboardData(): Promise<any> {
  const res =
    await request<ApiResponse<any>>(
      '/dashboards/worker'
    );

  return res.data;
}

export async function getDoctorDashboardData(doctorId?: string): Promise<any> {
  const query = doctorId ? `?doctorId=${encodeURIComponent(doctorId)}` : '';
  const res =
    await request<ApiResponse<any>>(
      `/dashboards/doctor${query}`
    );

  return res.data;
}

export async function getPatientDashboardData(
  healthId: string
): Promise<any> {
  const res =
    await request<ApiResponse<any>>(
      `/dashboards/patient/${encodeURIComponent(
        healthId
      )}`
    );

  return res.data;
}

// ─── Emergency & Break-Glass (T3 Tier) ──────────────────────────────────────

export interface AuthorizeEmergencyPayload {
  patientId?: string;
  patientHealthId: string;
  patientName: string;
  doctorId?: string;
  doctorName: string;
  facilityId?: string;
  facilityName: string;
  reason: string;
  note: string;
  records?: string;
}

export async function authorizeEmergency(
  payload: AuthorizeEmergencyPayload
): Promise<{ token: string; expiresInSeconds: number; log: any }> {
  const res = await request<ApiResponse<any>>('/emergency/authorize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return res.data;
}

export async function getEmergencyLogs(): Promise<any[]> {
  const res = await request<ApiResponse<any[]>>('/emergency/logs');
  return res.data || [];
}

export interface DispatchSosPayload {
  fromName: string;
  role: string;
  senderId?: string;
  patientId?: string;
  patientHealthId: string;
  location: string;
  targetedDoctorId?: string;
}

export async function dispatchSosAlert(payload: DispatchSosPayload): Promise<any> {
  const res = await request<ApiResponse<any>>('/emergency/sos', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  return res.data;
}

export async function getActiveSosAlerts(): Promise<any[]> {
  const res = await request<ApiResponse<any[]>>('/emergency/sos/active');
  return res.data || [];
}

export async function updateSosStatus(id: string, status: string, respondingDoctorId?: string): Promise<any> {
  const res = await request<ApiResponse<any>>(`/emergency/sos/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, respondingDoctorId }),
  });

  return res.data;
}