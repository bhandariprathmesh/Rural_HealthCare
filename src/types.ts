export type Role = 'login' | 'worker' | 'doctor' | 'patient' | 'admin';
export type RiskLevel = 'low' | 'moderate' | 'high' | 'critical';
export type ConsentStatus = 'granted' | 'temporary' | 'revoked';
export type SyncStatus = 'synced' | 'pending' | 'failed';
export type ReferralStatus = 'pending' | 'accepted' | 'in-consultation' | 'referred' | 'completed' | 'follow-up';

export interface Vitals {
  temperature: number;
  bloodPressure: string;
  heartRate: number;
  spo2: number;
  weight?: number;
  respiratoryRate?: number;
}

export interface Patient {
  id: string;
  name: string;
  nameHi: string;
  age: number;
  dob: string;
  gender: 'M' | 'F' | 'O';
  bloodGroup: string;
  phone: string;
  village: string;
  district: string;
  state: string;
  address: string;
  emergencyContact: { name: string; relation: string; phone: string };
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  riskLevel: RiskLevel;
  lastConsultation: string;
  healthWorker: string;
  registeredAt: string;
  consentStatus: ConsentStatus;
  vaccinationStatus: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  date: string;
  time: string;
  workerName: string;
  doctorName?: string;
  symptoms: string[];
  vitals: Vitals;
  diagnosis?: string;
  treatment?: string;
  prescription?: string[];
  notes?: string;
  riskLevel: RiskLevel;
  referralStatus: 'none' | 'pending' | 'completed';
  followUpDate?: string;
}

export interface AIAssessment {
  id: string;
  consultationId: string;
  patientId: string;
  riskLevel: RiskLevel;
  symptomsConsidered: string[];
  abnormalVitals: string[];
  riskFactors: string[];
  reasoning: string;
  recommendedAction: string;
  confidence: number;
  generatedAt: string;
  modelVersion?: string;
  riskProbabilities?: {
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
  standardizedSymptomCodes?: string[];
}

export interface Referral {
  id: string;
  rawId?: string;
  patientId: string;
  patientName: string;
  fromWorker: string;
  toPHC: string;
  toDoctorName?: string;
  toDoctorSpecialty?: string;
  reason: string;
  riskLevel: RiskLevel;
  status: ReferralStatus;
  date: string;
  priority: 'routine' | 'urgent' | 'emergency';
  notes?: string;
  aiSummary?: string;
}

export interface AuditEntry {
  id: string;
  patientId: string;
  accessorName: string;
  accessorRole: string;
  organization: string;
  action: string;
  dataAccessed: string[];
  timestamp: string;
  purpose: string;
}

export interface ConsentEntry {
  id: string;
  grantedTo: string;
  role: string;
  organization: string;
  status: ConsentStatus;
  purpose: string;
  dataScope: string[];
  grantedAt: string;
  expiresAt?: string;
}

export interface SyncRecord {
  id: string;
  type: string;
  description: string;
  status: SyncStatus;
  recordedAt: string;
  syncedAt?: string;
  error?: string;
}

export interface NavItem {
  id: string;
  label: string;
  labelHi: string;
  icon: string;
  role: Role[];
}

export type PregnancyStatus = 'PREGNANT' | 'POSTPARTUM' | 'DELIVERED' | 'NOT_PREGNANT';

export type MilestoneCategory = 'maternal' | 'child';

export type MilestoneStatus = 'completed' | 'due' | 'overdue' | 'upcoming';

export interface MchMilestone {
  id: string;
  code: string;
  name: string;
  category: MilestoneCategory;
  recommendedWeekOrAge: string;
  dueDate: string;
  completedDate?: string;
  status: MilestoneStatus;
  administeredBy?: string;
  facilityName?: string;
  batchNumber?: string;
  notes?: string;
  vitals?: {
    bloodPressure?: string;
    weight?: number;
    haemoglobin?: number;
    fundalHeight?: string;
    fetalHeartRate?: string;
  };
}

export interface MchRecord {
  id: string;
  patientId: string;
  patientName?: string;
  patientHealthId?: string;
  patientPhone?: string;
  patientVillage?: string;
  pregnancyStatus: PregnancyStatus;
  edd?: string;
  lmp?: string;
  gestationalWeeks?: number;
  isHighRisk: boolean;
  hrpIndicators: string[];
  gravida?: number;
  para?: number;
  bloodGroup?: string;
  milestones: MchMilestone[];
  childName?: string;
  childDob?: string;
  childGender?: string;
  childAgeWeeks?: number;
  nextScheduledDate?: string;
  nextScheduledMilestone?: string;
  assignedVillage?: string;
  assignedWorkerName?: string;
  notes?: string;
}

export interface MchDueAlertItem {
  id: string;
  recordId: string;
  patientId: string;
  patientName: string;
  healthId: string;
  phone: string;
  village: string;
  isHighRisk: boolean;
  hrpIndicators: string[];
  category: MilestoneCategory;
  milestoneCode: string;
  milestoneName: string;
  dueDate: string;
  status: 'due' | 'overdue' | 'upcoming';
  daysOverdue?: number;
  pregnancyStatus?: PregnancyStatus;
  gestationalWeeks?: number;
  childName?: string;
  childAge?: string;
  recommendedWeekOrAge?: string;
  notes?: string;
}
