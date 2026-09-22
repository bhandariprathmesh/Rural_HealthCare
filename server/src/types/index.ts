import { Request } from 'express';

export type UserRole = 'WORKER' | 'DOCTOR' | 'PATIENT' | 'ADMIN';

export interface AuthUserPayload {
  id: string;
  phone: string;
  role: UserRole;
  fullName: string;
  workerId?: string;
  doctorId?: string;
  patientId?: string;
  facilityId?: string;
  sessionId?: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUserPayload;
}

