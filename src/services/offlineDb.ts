import Dexie, { type Table } from "dexie"

export interface OfflinePatient {
  id: string

  name: string

  village: string

  synced: boolean

  payload?: any

  createdAt?: string

  [key: string]: any
}

export interface OfflineConsultation {
  id: string

  patientId: string

  synced: boolean

  payload?: any

  createdAt?: string

  [key: string]: any
}

export interface OfflineAppointment {
  id: string

  patientId: string

  doctorId: string

  facilityId?: string

  scheduledDate: string

  tokenNumber?: number

  synced: boolean

  payload?: any

  createdAt?: string

  [key: string]: any
}

export interface OutboxItem {
  id?: number

  action: "CREATE_PATIENT" | "CREATE_CONSULTATION" | "CREATE_APPOINTMENT" | string

  payload: any

  createdAt: string
}

export class RuralCareOfflineDB extends Dexie {
  patients!: Table<OfflinePatient, string>

  consultations!: Table<OfflineConsultation, string>

  appointments!: Table<OfflineAppointment, string>

  outboxQueue!: Table<OutboxItem, number>

  constructor() {
    super("RuralCareOfflineDB")

    this.version(1).stores({
      patients: "id, name, village, synced",

      consultations: "id, patientId, synced",

      outboxQueue: "++id, action, createdAt",
    })

    this.version(2).stores({
      patients: "id, name, village, synced",

      consultations: "id, patientId, synced",

      appointments: "id, patientId, doctorId, scheduledDate, synced",

      outboxQueue: "++id, action, createdAt",
    })
  }
}

export const offlineDb = new RuralCareOfflineDB()
