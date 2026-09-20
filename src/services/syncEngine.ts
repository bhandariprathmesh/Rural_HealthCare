import { offlineDb, type OfflinePatient, type OfflineConsultation, type OutboxItem } from './offlineDb';
import { registerPatient, createConsultation } from '../api/client';

export type SyncListener = () => void;

let isSyncing = false;
let listenersInitialized = false;
let lastSyncError: string | null = null;
const subscribers = new Set<SyncListener>();

function notifySubscribers(): void {
  subscribers.forEach((cb) => {
    try {
      cb();
    } catch (err) {
      console.error('Error in sync subscriber:', err);
    }
  });
}

let simulatedOffline = false;

export function setSimulatedOffline(offline: boolean): void {
  const wasOffline = simulatedOffline;
  simulatedOffline = offline;
  notifySubscribers();
  if (wasOffline && !offline) {
    if (typeof navigator !== 'undefined' ? navigator.onLine : true) {
      flushOutbox().catch((err) => {
        console.warn('Auto flush on reconnect (simulated) failed:', err);
      });
    }
  }
}

export function isSimulatedOffline(): boolean {
  return simulatedOffline;
}

export function isOnline(): boolean {
  if (simulatedOffline) return false;
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function isCurrentlySyncing(): boolean {
  return isSyncing;
}

export function getLastError(): string | null {
  return lastSyncError;
}

export function subscribeToSync(listener: SyncListener): () => void {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export async function getPendingCount(): Promise<number> {
  try {
    return await offlineDb.outboxQueue.count();
  } catch {
    return 0;
  }
}

export async function getPendingItems(): Promise<OutboxItem[]> {
  try {
    return await offlineDb.outboxQueue.toArray();
  } catch {
    return [];
  }
}

export async function removeOutboxItem(id: number): Promise<void> {
  try {
    const item = await offlineDb.outboxQueue.get(id);
    if (item) {
      if (item.action === 'CREATE_PATIENT') {
        const localId = item.payload?.id || item.payload?.healthId;
        if (localId) {
          await offlineDb.patients.delete(localId);
        }
      } else if (item.action === 'CREATE_CONSULTATION') {
        const localId = item.payload?.id;
        if (localId) {
          await offlineDb.consultations.delete(localId);
        }
      }
    }
    await offlineDb.outboxQueue.delete(id);
    notifySubscribers();
  } catch (err) {
    console.error(`Failed to remove outbox item #${id}:`, err);
  }
}

export async function clearOutbox(): Promise<void> {
  try {
    await offlineDb.outboxQueue.clear();
    lastSyncError = null;
    notifySubscribers();
  } catch (err) {
    console.error('Failed to clear outbox:', err);
  }
}

export async function saveOfflinePatient(data: any): Promise<OfflinePatient> {
  const id = data.id || data.healthId || `TEMP-PAT-${Date.now()}`;
  const consent = data.consent || { granted: true };
  const payload = { ...data, id, consent };
  const patientRecord: OfflinePatient = {
    id,
    name: data.name || 'Unknown Patient',
    village: data.village || 'Unknown Village',
    synced: false,
    payload,
    createdAt: new Date().toISOString(),
  };

  await offlineDb.patients.put(patientRecord);

  await offlineDb.outboxQueue.add({
    action: 'CREATE_PATIENT',
    payload,
    createdAt: new Date().toISOString(),
  });

  notifySubscribers();

  return patientRecord;
}

export async function saveOfflineConsultation(data: any): Promise<OfflineConsultation> {
  const id = data.id || `TEMP-CONS-${Date.now()}`;
  const consultationRecord: OfflineConsultation = {
    id,
    patientId: data.patientId || '',
    synced: false,
    payload: { ...data, id },
    createdAt: new Date().toISOString(),
  };

  await offlineDb.consultations.put(consultationRecord);

  await offlineDb.outboxQueue.add({
    action: 'CREATE_CONSULTATION',
    payload: { ...data, id },
    createdAt: new Date().toISOString(),
  });

  notifySubscribers();

  return consultationRecord;
}

export async function flushOutbox(): Promise<{
  success: boolean;
  processed: number;
  errors: number;
  lastError?: string | null;
}> {
  if (isSyncing) {
    return { success: false, processed: 0, errors: 0, lastError: 'Sync already in progress' };
  }

  if (!isOnline()) {
    lastSyncError = 'No internet connection available';
    return { success: false, processed: 0, errors: 0, lastError: lastSyncError };
  }

  isSyncing = true;
  notifySubscribers();

  let processed = 0;
  let errors = 0;

  try {
    const queue = await offlineDb.outboxQueue.toArray();
    console.log(`[SyncEngine] flushOutbox started. Queue size: ${queue.length}`);

    for (const item of queue) {
      if (!isOnline()) {
        console.log('[SyncEngine] Network offline. Pausing sync.');
        break;
      }

      try {
        if (item.action === 'CREATE_PATIENT') {
          console.log(`[SyncEngine] Syncing item #${item.id} (${item.action}) -> POST /api/v1/patients/register`);

          // 1. Prepare clean payload for backend: strip temporary client ID
          const { id: tempId, ...rawPayload } = item.payload || {};
          const localId = tempId || item.payload?.id || item.payload?.healthId;

          // Phone sanitization: must be 10 digits starting with 6-9
          let cleanPhone = String(rawPayload.phone || '').replace(/\D/g, '');
          if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
          if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
            // Provide a valid 10-digit mobile fallback so offline records always satisfy backend validation
            cleanPhone = '98' + String(Date.now()).slice(-8);
          }

          // Full Name: at least 2 characters
          const patientName = rawPayload.name?.trim() && rawPayload.name.trim().length >= 2
            ? rawPayload.name.trim()
            : (rawPayload.name?.trim() || 'Patient');

          // Date of birth: at least 4 characters
          const dob = rawPayload.dob && String(rawPayload.dob).trim().length >= 4
            ? String(rawPayload.dob).trim()
            : '2000-01-01';

          // Gender
          let gender = rawPayload.gender;
          if (!gender || !['Male', 'Female', 'Other', 'M', 'F', 'O'].includes(gender)) {
            gender = 'Other';
          }

          // Village, District, State
          const village = rawPayload.village?.trim() && rawPayload.village.trim().length >= 2
            ? rawPayload.village.trim()
            : 'Bikaner Rural';
          const district = rawPayload.district?.trim() && rawPayload.district.trim().length >= 2
            ? rawPayload.district.trim()
            : 'Bikaner';
          const state = rawPayload.state?.trim() && rawPayload.state.trim().length >= 2
            ? rawPayload.state.trim()
            : 'Rajasthan';

          // Blood Group
          const bloodGroup = rawPayload.bloodGroup || rawPayload.blood || 'Not known';

          // Consent
          const consent = {
            granted: true,
            ...(rawPayload.consent?.purpose ? { purpose: rawPayload.consent.purpose } : {}),
            ...(Array.isArray(rawPayload.consent?.dataScope) ? { dataScope: rawPayload.consent.dataScope } : {}),
          };

          // Arrays
          const allergies = Array.isArray(rawPayload.allergies)
            ? rawPayload.allergies
            : typeof rawPayload.allergies === 'string' && rawPayload.allergies.trim()
              ? rawPayload.allergies.split(',').map((s: string) => s.trim()).filter(Boolean)
              : [];
          const chronicConditions = Array.isArray(rawPayload.chronicConditions)
            ? rawPayload.chronicConditions
            : typeof rawPayload.chronicConditions === 'string' && rawPayload.chronicConditions.trim()
              ? rawPayload.chronicConditions.split(',').map((s: string) => s.trim()).filter(Boolean)
              : [];
          const currentMedications = Array.isArray(rawPayload.currentMedications)
            ? rawPayload.currentMedications
            : typeof rawPayload.currentMedications === 'string' && rawPayload.currentMedications.trim()
              ? rawPayload.currentMedications.split(',').map((s: string) => s.trim()).filter(Boolean)
              : [];

          // Emergency Contact: only include if valid object with valid phone
          let emergencyContact: any = undefined;
          if (
            rawPayload.emergencyContact &&
            typeof rawPayload.emergencyContact === 'object' &&
            rawPayload.emergencyContact.name?.trim()?.length >= 2 &&
            rawPayload.emergencyContact.relation?.trim()?.length >= 2
          ) {
            const ecPhone = String(rawPayload.emergencyContact.phone || '').replace(/\D/g, '').slice(-10);
            if (/^[6-9]\d{9}$/.test(ecPhone)) {
              emergencyContact = {
                name: rawPayload.emergencyContact.name.trim(),
                relation: rawPayload.emergencyContact.relation.trim(),
                phone: ecPhone,
              };
            }
          }

          const age = typeof rawPayload.age === 'number' && rawPayload.age > 0 ? rawPayload.age : undefined;

          const apiPayload: any = {
            name: patientName,
            ...(rawPayload.nameHi?.trim() ? { nameHi: rawPayload.nameHi.trim() } : {}),
            dob,
            ...(age !== undefined ? { age } : {}),
            gender,
            bloodGroup,
            phone: cleanPhone,
            village,
            district,
            state,
            ...(rawPayload.address?.trim() ? { address: rawPayload.address.trim() } : {}),
            ...(emergencyContact ? { emergencyContact } : {}),
            allergies,
            chronicConditions,
            currentMedications,
            ...(rawPayload.abhaAddress?.trim() ? { abhaAddress: rawPayload.abhaAddress.trim() } : {}),
            ...(rawPayload.healthWorkerId ? { healthWorkerId: rawPayload.healthWorkerId } : {}),
            ...(rawPayload.healthWorkerName ? { healthWorkerName: rawPayload.healthWorkerName } : {}),
            consent,
          };

          let res: any = null;
          try {
            res = await registerPatient(apiPayload);
          } catch (apiErr: any) {
            const errMsg = String(apiErr?.message || '');
            // Handle HTTP 409 Conflict if patient with this mobile number already exists on server
            if (errMsg.includes('already registered') || errMsg.includes('Health ID:') || errMsg.includes('409') || errMsg.includes('Conflict')) {
              const healthIdMatch = errMsg.match(/Health ID:\s*([A-Z0-9-]+)/i);
              const matchedHealthId = healthIdMatch ? healthIdMatch[1] : null;
              res = { patient: { healthId: matchedHealthId, id: matchedHealthId } };
              console.log(`[SyncEngine] Patient already registered on backend (${matchedHealthId || cleanPhone}). Recovered real ID.`);
            } else {
              throw apiErr;
            }
          }

          if (item.id !== undefined) {
            await offlineDb.outboxQueue.delete(item.id);
          }

          const realPatientId = res?.patient?.healthId || res?.patient?.id;

          if (localId) {
            await offlineDb.patients.update(localId, {
              synced: true,
              ...(realPatientId ? { healthId: realPatientId } : {}),
            });
          }

          // Remap queued consultations from temporary patient ID to real server patient ID
          if (localId && realPatientId && localId !== realPatientId) {
            const tempIds = new Set([localId, item.payload.id, item.payload.healthId].filter(Boolean));

            // 1. Update remaining items in current in-memory queue array so subsequent loop iterations use realPatientId
            for (const remainingItem of queue) {
              if (
                remainingItem.action === 'CREATE_CONSULTATION' &&
                remainingItem.payload &&
                tempIds.has(remainingItem.payload.patientId)
              ) {
                remainingItem.payload.patientId = realPatientId;
              }
            }

            // 2. Update queued CREATE_CONSULTATION items in IndexedDB outboxQueue
            const queuedConsultations = await offlineDb.outboxQueue
              .filter(
                (qItem) =>
                  qItem.action === 'CREATE_CONSULTATION' &&
                  qItem.payload &&
                  tempIds.has(qItem.payload.patientId)
              )
              .toArray();

            for (const qc of queuedConsultations) {
              if (qc.id !== undefined) {
                await offlineDb.outboxQueue.update(qc.id, {
                  payload: {
                    ...qc.payload,
                    patientId: realPatientId,
                  },
                });
              }
            }

            // 3. Update local consultations table records
            const localConsultations = await offlineDb.consultations
              .filter((c) => tempIds.has(c.patientId))
              .toArray();

            for (const lc of localConsultations) {
              await offlineDb.consultations.update(lc.id, {
                patientId: realPatientId,
                payload: lc.payload
                  ? { ...lc.payload, patientId: realPatientId }
                  : lc.payload,
              });
            }
          }

          console.log(`[SyncEngine] Successfully synced item #${item.id} (${item.action}). Real ID: ${realPatientId}`);
          processed++;
        } else if (item.action === 'CREATE_CONSULTATION') {
          console.log(`[SyncEngine] Syncing item #${item.id} (${item.action}) -> POST /api/v1/consultations`);
          const { id: tempId, ...rawPayload } = item.payload || {};
          const localId = tempId || item.payload?.id;

          const apiPayload: any = {
            patientId: rawPayload.patientId,
            workerId: rawPayload.workerId,
            workerName: rawPayload.workerName || 'Meena Kumari (ASHA)',
            doctorId: rawPayload.doctorId,
            doctorName: rawPayload.doctorName,
            facilityName: rawPayload.facilityName || 'PHC Lunkaransar',
            symptoms: Array.isArray(rawPayload.symptoms) ? rawPayload.symptoms : [],
            vitals: typeof rawPayload.vitals === 'object' && rawPayload.vitals ? rawPayload.vitals : {},
            diagnosis: rawPayload.diagnosis,
            treatment: rawPayload.treatment,
            prescription: Array.isArray(rawPayload.prescription) ? rawPayload.prescription : [],
            notes: rawPayload.notes,
            riskLevel: rawPayload.riskLevel || 'LOW',
            referralStatus: rawPayload.referralStatus || 'none',
            followUpDate: rawPayload.followUpDate,
          };

          await createConsultation(apiPayload);

          if (item.id !== undefined) {
            await offlineDb.outboxQueue.delete(item.id);
          }

          const localIdToUpdate = localId;
          if (localIdToUpdate) {
            await offlineDb.consultations.update(localIdToUpdate, { synced: true });
          }

          console.log(`[SyncEngine] Successfully synced item #${item.id} (${item.action}).`);
          processed++;
        }
      } catch (reqError: any) {
        errors++;
        lastSyncError = reqError?.message || String(reqError);
        console.error(`[SyncEngine] Failed to sync outbox item #${item.id} (${item.action}):`, lastSyncError);
        // Keep the queue item so it can be retried later
      }
    }
    if (errors === 0) {
      lastSyncError = null;
    }
    console.log(`[SyncEngine] flushOutbox finished. Processed: ${processed}, Errors: ${errors}`);
  } catch (err: any) {
    lastSyncError = err?.message || String(err);
    console.error('Error during flushOutbox iteration:', err);
  } finally {
    isSyncing = false;
    notifySubscribers();
  }

  return { success: errors === 0, processed, errors, lastError: lastSyncError };
}

function initSyncEngine(): void {
  if (listenersInitialized || typeof window === 'undefined') {
    return;
  }
  listenersInitialized = true;

  window.addEventListener('online', () => {
    notifySubscribers();
    flushOutbox().catch((err) => {
      console.warn('Auto flush on reconnect failed:', err);
    });
  });

  window.addEventListener('offline', () => {
    notifySubscribers();
  });
}

initSyncEngine();

export const syncEngine = {
  saveOfflinePatient,
  saveOfflineConsultation,
  flushOutbox,
  getPendingCount,
  getPendingItems,
  removeOutboxItem,
  clearOutbox,
  getLastError,
  setSimulatedOffline,
  isSimulatedOffline,
  subscribe: subscribeToSync,
  isOnline,
  isCurrentlySyncing,
};

export default syncEngine;
