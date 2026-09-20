import { Server as HttpServer, IncomingMessage } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { prisma } from '../lib/prisma.js';

export type SessionStatus = 'WAITING' | 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED';

interface SignalingPeer {
  ws: WebSocket;
  sessionId: string;
  role: 'doctor' | 'worker' | 'patient';
  userId?: string;
  userName?: string;
  isLowBandwidth?: boolean;
}

export interface ActiveCallInfo {
  sessionId: string;
  patientId: string;
  patientDbId?: string;
  patientHealthId?: string;
  patientUserId?: string;
  doctorId?: string;
  doctorName: string;
  facilityName?: string;
  status: SessionStatus;
  createdAt: number;
  timeoutTimer?: NodeJS.Timeout;
}

// In-memory registry of active teleconsultation rooms
const rooms = new Map<string, Set<SignalingPeer>>();

// In-memory registry of active doctor calls awaiting patient response (keyed by patientId/healthId)
export const activeCalls = new Map<string, ActiveCallInfo>();

// In-memory sessions keyed by sessionId
export const sessionsBySessionId = new Map<string, ActiveCallInfo>();

export async function getActiveCallForPatient(patientId: string): Promise<ActiveCallInfo | null> {
  if (!patientId) return null;
  const cleanTarget = patientId.trim().toLowerCase();

  // 1. Direct in-memory lookup
  for (const [key, call] of activeCalls.entries()) {
    if (
      key.toLowerCase() === cleanTarget ||
      call.patientId.toLowerCase() === cleanTarget ||
      key.replace(/[^a-zA-Z0-9]/g, '') === cleanTarget.replace(/[^a-zA-Z0-9]/g, '') ||
      call.patientId.replace(/[^a-zA-Z0-9]/g, '') === cleanTarget.replace(/[^a-zA-Z0-9]/g, '')
    ) {
      if (call.status === 'ENDED' || call.status === 'MISSED' || Date.now() - call.createdAt > 300000) {
        activeCalls.delete(key);
        return null;
      }
      return call;
    }
  }

  // 2. Cross-lookup in database for healthId <-> id <-> userId <-> phone
  try {
    const pt = await prisma.patient.findFirst({
      where: {
        OR: [
          { healthId: { equals: patientId, mode: 'insensitive' } },
          { id: patientId },
          { userId: patientId },
          { phone: patientId },
        ],
      },
      select: { id: true, healthId: true, userId: true, phone: true },
    });

    if (pt) {
      const candidates = [pt.healthId, pt.id, pt.userId, pt.phone].filter(Boolean) as string[];
      for (const cand of candidates) {
        const candClean = cand.trim().toLowerCase();
        for (const [key, call] of activeCalls.entries()) {
          if (
            key.toLowerCase() === candClean ||
            call.patientId.toLowerCase() === candClean ||
            key.replace(/[^a-zA-Z0-9]/g, '') === candClean.replace(/[^a-zA-Z0-9]/g, '') ||
            call.patientId.replace(/[^a-zA-Z0-9]/g, '') === candClean.replace(/[^a-zA-Z0-9]/g, '')
          ) {
            if (call.status === 'ENDED' || call.status === 'MISSED' || Date.now() - call.createdAt > 300000) {
              activeCalls.delete(key);
              return null;
            }
            return call;
          }
        }
      }
    }
  } catch (err) {
    console.warn('Error resolving patient alias for active call:', err);
  }

  return null;
}

export function removeActiveCall(sessionId: string) {
  const s = sessionsBySessionId.get(sessionId);
  if (s?.timeoutTimer) {
    clearTimeout(s.timeoutTimer);
  }
  sessionsBySessionId.delete(sessionId);
  for (const [pId, call] of activeCalls.entries()) {
    if (call.sessionId === sessionId) {
      activeCalls.delete(pId);
    }
  }
}

/**
 * Initializes the WebSocket signaling server attached to the existing Express HTTP server.
 * Handles consultation session state machine, WebRTC signaling, network events, and reconnection.
 */
export function setupTeleconsultationSignaling(server: HttpServer): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/teleconsultation',
  });

  console.log('📡 WebRTC WebSocket Signaling Server initialized at path /teleconsultation');

  const broadcastAll = (payload: any) => {
    const msg = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  };

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    let currentPeer: SignalingPeer | null = null;
    const clientIp = req.socket.remoteAddress;

    ws.on('message', async (data: string) => {
      try {
        const message = JSON.parse(data.toString());
        const { type, sessionId } = message;

        if (!sessionId && type !== 'call:check') {
          ws.send(JSON.stringify({ type: 'error', message: 'sessionId is required' }));
          return;
        }

        switch (type) {
          // =========================================================================
          // 1. DOCTOR STARTS CONSULTATION (Strictly Doctor Role Only)
          // =========================================================================
          case 'consultation:start': {
            const role = (message.role || currentPeer?.role || '').toLowerCase();
            const doctorId = message.doctorId || currentPeer?.userId || 'doc-1';
            const doctorName = message.doctorName || currentPeer?.userName || 'PHC Medical Officer';
            const targetPatientId = message.patientId;
            const facilityName = message.facilityName || 'PHC Lunkaransar Tele-Clinic';

            // Backend Rule: ONLY Doctor can initiate consultation
            if (role !== 'doctor' && role !== 'phc_staff') {
              console.warn(`[Teleconsultation WS] Blocked non-doctor from starting consultation: ${role}`);
              ws.send(
                JSON.stringify({
                  type: 'error',
                  code: 'ROLE_NOT_AUTHORIZED',
                  message: 'Forbidden: Only doctors are authorized to initiate teleconsultation sessions.',
                })
              );
              return;
            }

            if (!targetPatientId) {
              ws.send(JSON.stringify({ type: 'error', message: 'patientId is required to start consultation.' }));
              return;
            }

            console.log(`[Teleconsultation WS] consultation:start received from ${doctorName} for patient ${targetPatientId} (session: ${sessionId})`);

            // Clear any existing session with same id
            const existing = sessionsBySessionId.get(sessionId);
            if (existing?.timeoutTimer) {
              clearTimeout(existing.timeoutTimer);
            }

            // Create session in RINGING state
            const sessionInfo: ActiveCallInfo = {
              sessionId,
              patientId: targetPatientId,
              doctorId,
              doctorName,
              facilityName,
              status: 'RINGING',
              createdAt: Date.now(),
            };

            // Set 30-second timeout for patient response
            sessionInfo.timeoutTimer = setTimeout(() => {
              const active = sessionsBySessionId.get(sessionId);
              if (active && active.status === 'RINGING') {
                active.status = 'MISSED';
                console.log(`[Teleconsultation WS] Session ${sessionId} timed out after 30s -> MISSED`);

                broadcastAll({
                  type: 'consultation:missed',
                  sessionId,
                  patientId: active.patientId,
                  reason: 'Patient did not respond within 30 seconds',
                });
              }
            }, 30000);

            sessionsBySessionId.set(sessionId, sessionInfo);
            activeCalls.set(targetPatientId, sessionInfo);

            // Resolve patient aliases (healthId, id, userId, phone)
            try {
              const pt = await prisma.patient.findFirst({
                where: {
                  OR: [
                    { healthId: { equals: targetPatientId, mode: 'insensitive' } },
                    { id: targetPatientId },
                    { userId: targetPatientId },
                    { phone: targetPatientId },
                  ],
                },
                select: { id: true, healthId: true, userId: true, phone: true },
              });

              if (pt) {
                sessionInfo.patientDbId = pt.id;
                sessionInfo.patientHealthId = pt.healthId;
                sessionInfo.patientUserId = pt.userId || undefined;

                if (pt.healthId) activeCalls.set(pt.healthId, sessionInfo);
                if (pt.id) activeCalls.set(pt.id, sessionInfo);
                if (pt.userId) activeCalls.set(pt.userId, sessionInfo);
              }
            } catch (e) {
              console.warn('Error resolving patient aliases in consultation:start:', e);
            }

            // Broadcast consultation:incoming to patient (and call:incoming for backward compatibility)
            const incomingPayload = {
              type: 'consultation:incoming',
              sessionId,
              patientId: targetPatientId,
              patientDbId: sessionInfo.patientDbId,
              patientHealthId: sessionInfo.patientHealthId,
              patientUserId: sessionInfo.patientUserId,
              doctorId,
              doctorName,
              facilityName,
              status: 'RINGING',
            };

            broadcastAll(incomingPayload);
            broadcastAll({ ...incomingPayload, type: 'call:incoming' });

            // Acknowledge doctor
            ws.send(
              JSON.stringify({
                type: 'consultation:ringing',
                sessionId,
                status: 'RINGING',
                timeoutSeconds: 30,
              })
            );
            break;
          }

          // =========================================================================
          // 2. PATIENT ACCEPTS CONSULTATION (Strictly Patient Role Only)
          // =========================================================================
          case 'consultation:accept': {
            const role = (message.role || currentPeer?.role || 'patient').toLowerCase();

            // Backend Rule: Patients accept consultations
            if (role === 'doctor') {
              console.warn('[Teleconsultation WS] Doctor cannot accept their own consultation.');
              ws.send(JSON.stringify({ type: 'error', message: 'Invalid action for doctor.' }));
              return;
            }

            const session = sessionsBySessionId.get(sessionId);
            if (!session) {
              console.warn(`[Teleconsultation WS] consultation:accept for unknown or expired session: ${sessionId}`);
              ws.send(JSON.stringify({ type: 'error', message: 'Session expired or not found.' }));
              return;
            }

            // Clear 30s timeout
            if (session.timeoutTimer) {
              clearTimeout(session.timeoutTimer);
              session.timeoutTimer = undefined;
            }

            session.status = 'ACTIVE';
            console.log(`[Teleconsultation WS] Patient accepted consultation for session: ${sessionId} -> ACTIVE`);

            // Broadcast consultation:active to both Doctor and Patient
            broadcastAll({
              type: 'consultation:active',
              sessionId,
              patientId: session.patientId,
              doctorId: session.doctorId,
              doctorName: session.doctorName || 'Dr. rushi pansare (PHC Medical Officer)',
              facilityName: session.facilityName,
              status: 'ACTIVE',
            });

            // If room already has peers, trigger WebRTC start
            const room = rooms.get(sessionId);
            if (room && room.size >= 2) {
              for (const peer of room) {
                if (peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(
                    JSON.stringify({
                      type: 'call:start',
                      sessionId,
                      peerCount: room.size,
                    })
                  );
                }
              }
            }
            break;
          }

          // =========================================================================
          // 3. PATIENT REJECTS CONSULTATION
          // =========================================================================
          case 'consultation:reject': {
            const session = sessionsBySessionId.get(sessionId);
            if (session) {
              if (session.timeoutTimer) {
                clearTimeout(session.timeoutTimer);
                session.timeoutTimer = undefined;
              }
              session.status = 'MISSED';
            }

            console.log(`[Teleconsultation WS] Consultation rejected by patient for session: ${sessionId}`);

            broadcastAll({
              type: 'consultation:missed',
              sessionId,
              reason: 'Patient declined consultation',
            });
            break;
          }

          // =========================================================================
          // 4. CONSULTATION END (Ends call for both users)
          // =========================================================================
          case 'consultation:end': {
            const session = sessionsBySessionId.get(sessionId);
            if (session) {
              if (session.timeoutTimer) {
                clearTimeout(session.timeoutTimer);
                session.timeoutTimer = undefined;
              }
              session.status = 'ENDED';
            }

            console.log(`[Teleconsultation WS] Consultation ended in session ${sessionId}`);

            // Broadcast consultation:end and call:end to all peers in room and clients
            broadcastAll({
              type: 'consultation:end',
              sessionId,
              reason: message.reason || 'Consultation finished by doctor',
            });

            relayToRoomPeers(sessionId, currentPeer, {
              type: 'call:end',
              sessionId,
              senderRole: currentPeer?.role,
              reason: message.reason || 'Consultation finished',
            });

            removeActiveCall(sessionId);
            break;
          }

          // =========================================================================
          // 5. CALL JOIN & RECONNECTION HANDLING
          // =========================================================================
          case 'call:join': {
            const role = message.role || 'patient';
            const userId = message.userId || 'anonymous';
            const userName = message.userName || (role === 'doctor' ? 'PHC Doctor' : 'Patient');
            const targetPatientId = message.patientId;

            currentPeer = {
              ws,
              sessionId,
              role,
              userId,
              userName,
              isLowBandwidth: Boolean(message.isLowBandwidth),
            };

            if (!rooms.has(sessionId)) {
              rooms.set(sessionId, new Set());
            }

            const room = rooms.get(sessionId)!;
            room.add(currentPeer);

            console.log(`[Teleconsultation WS] ${userName} (${role}) joined session: ${sessionId}. Room peers: ${room.size}`);

            const existingSession = sessionsBySessionId.get(sessionId);

            // Reconnection check: if session is already ACTIVE, inform rejoining peer and trigger WebRTC renegotiate
            const isReconnection = existingSession?.status === 'ACTIVE';

            // Acknowledge join
            ws.send(
              JSON.stringify({
                type: 'call:joined',
                sessionId,
                role,
                doctorName: existingSession?.doctorName || 'Dr. rushi pansare (PHC Medical Officer)',
                peerCount: room.size,
                status: existingSession?.status || 'RINGING',
                isReconnection,
                peers: Array.from(room).map((p) => ({ role: p.role, userName: p.userName })),
              })
            );

            // Notify other peers in room
            for (const peer of room) {
              if (peer !== currentPeer && peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(
                  JSON.stringify({
                    type: 'peer:joined',
                    sessionId,
                    peer: { role, userName, userId },
                    peerCount: room.size,
                    isReconnection,
                  })
                );
              }
            }

            // If we now have 2 or more peers, trigger WebRTC call negotiation
            if (room.size >= 2) {
              for (const peer of room) {
                if (peer.ws.readyState === WebSocket.OPEN) {
                  peer.ws.send(
                    JSON.stringify({
                      type: 'call:start',
                      sessionId,
                      peerCount: room.size,
                      initiatorRole: role,
                      isReconnection,
                    })
                  );
                }
              }
            }
            break;
          }

          // =========================================================================
          // 6. WEBRTC SIGNALING (SDP OFFER / ANSWER / ICE CANDIDATES)
          // =========================================================================
          case 'webrtc:offer': {
            relayToRoomPeers(sessionId, currentPeer, {
              type: 'webrtc:offer',
              sessionId,
              sdp: message.sdp,
              senderRole: currentPeer?.role || message.senderRole,
            });
            break;
          }

          case 'webrtc:answer': {
            relayToRoomPeers(sessionId, currentPeer, {
              type: 'webrtc:answer',
              sessionId,
              sdp: message.sdp,
              senderRole: currentPeer?.role || message.senderRole,
            });
            break;
          }

          case 'webrtc:ice-candidate': {
            relayToRoomPeers(sessionId, currentPeer, {
              type: 'webrtc:ice-candidate',
              sessionId,
              candidate: message.candidate,
              senderRole: currentPeer?.role || message.senderRole,
            });
            break;
          }

          case 'network:poor': {
            if (currentPeer) {
              currentPeer.isLowBandwidth = Boolean(message.isLowBandwidth);
            }
            relayToRoomPeers(sessionId, currentPeer, {
              type: 'network:poor',
              sessionId,
              isLowBandwidth: Boolean(message.isLowBandwidth),
              senderRole: currentPeer?.role || message.senderRole,
            });
            break;
          }

          case 'rx:update': {
            relayToRoomPeers(sessionId, currentPeer, {
              type: 'rx:update',
              sessionId,
              diagnosis: message.diagnosis,
              prescriptions: message.prescriptions,
              clinicalNotes: message.clinicalNotes,
              senderRole: currentPeer?.role || message.senderRole,
            });
            break;
          }

          case 'call:end': {
            console.log(`[Teleconsultation WS] Call ended by ${currentPeer?.userName || 'peer'} in session ${sessionId}`);
            const session = sessionsBySessionId.get(sessionId);
            if (session) {
              session.status = 'ENDED';
            }

            relayToRoomPeers(sessionId, currentPeer, {
              type: 'call:end',
              sessionId,
              senderRole: currentPeer?.role,
              reason: message.reason || 'Call ended by participant',
            });
            cleanUpPeer(currentPeer);
            break;
          }

          default:
            console.warn(`[Teleconsultation WS] Unknown message type: ${type}`);
        }
      } catch (err: any) {
        console.error('[Teleconsultation WS] Message processing error:', err.message);
      }
    });

    ws.on('close', () => {
      if (currentPeer) {
        cleanUpPeer(currentPeer);
      }
    });

    ws.on('error', (err: any) => {
      console.error(`[Teleconsultation WS] Socket error (${clientIp}):`, err.message);
      if (currentPeer) {
        cleanUpPeer(currentPeer);
      }
    });
  });

  return wss;
}

/**
 * Relays a message to all other peers in a specific session room.
 */
function relayToRoomPeers(sessionId: string, sender: SignalingPeer | null, payload: any) {
  const room = rooms.get(sessionId);
  if (!room) return;

  const dataStr = JSON.stringify(payload);
  for (const peer of room) {
    if (peer !== sender && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(dataStr);
    }
  }
}

/**
 * Removes a peer from the room and notifies remaining participants.
 */
function cleanUpPeer(peer: SignalingPeer | null) {
  if (!peer) return;

  const room = rooms.get(peer.sessionId);
  if (room) {
    room.delete(peer);
    console.log(`[Teleconsultation WS] Removed ${peer.userName} (${peer.role}) from session ${peer.sessionId}. Remaining: ${room.size}`);

    for (const remaining of room) {
      if (remaining.ws.readyState === WebSocket.OPEN) {
        remaining.ws.send(
          JSON.stringify({
            type: 'peer:left',
            sessionId: peer.sessionId,
            role: peer.role,
            userName: peer.userName,
            peerCount: room.size,
          })
        );
      }
    }

    if (room.size === 0) {
      rooms.delete(peer.sessionId);
      console.log(`[Teleconsultation WS] Session ${peer.sessionId} closed (0 peers).`);
    }
  }
}
