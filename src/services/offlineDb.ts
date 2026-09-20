import Dexie, { type Table } from 'dexie';

export interface OfflinePatient {
  id: string;
  name: string;
  village: string;
  synced: boolean;
  payload?: any;
  createdAt?: string;
  [key: string]: any;
}

export interface OfflineConsultation {
  id: string;
  patientId: string;
  synced: boolean;
  payload?: any;
  createdAt?: string;
  [key: string]: any;
}

export interface OutboxItem {
  id?: number;
  action: 'CREATE_PATIENT' | 'CREATE_CONSULTATION' | string;
  payload: any;
  createdAt: string;
}

export class RuralCareOfflineDB extends Dexie {
  patients!: Table<OfflinePatient, string>;
  consultations!: Table<OfflineConsultation, string>;
  outboxQueue!: Table<OutboxItem, number>;

  constructor() {
    super('RuralCareOfflineDB');
    this.version(1).stores({
      patients: 'id, name, village, synced',
      consultations: 'id, patientId, synced',
      outboxQueue: '++id, action, createdAt',
    });
  }
}

export const offlineDb = new RuralCareOfflineDB();
