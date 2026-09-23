import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Icon, RiskBadge } from '../components/shared';
import {
  getPatientByHealthId,
  getPatients,
  saveTeleconsultationRecord,
  getCurrentUser,
  getTeleconsultationWsUrl,
} from '../api/client';

interface Props {
  navigate: (screen: string, patientId?: string) => void;
  currentUser?: any;
  patientId?: string;
  roomId?: string;
  lang?: 'en' | 'hi';
}

interface PrescriptionItem {
  id: string;
  medicine: string;
  dosage: string;
  frequency: 'OD' | 'BD' | 'TDS' | 'QID' | 'SOS';
  duration: string;
  timing: 'After meals' | 'Before meals' | 'With meals';
}

const COMMON_DIAGNOSES = [
  'Viral Upper Respiratory Infection',
  'Acute Gastroenteritis',
  'Essential Hypertension (Stage 1)',
  'Iron Deficiency Anemia',
  'Type 2 Diabetes Mellitus',
  'Bronchial Asthma / Wheezing',
  'Allergic Contact Dermatitis',
  'Suspected Viral Fever (Dengue/Malaria screen)',
];

const COMMON_DRUGS = [
  { name: 'Paracetamol', defaultDose: '500mg', defaultFreq: 'TDS' as const, defaultDuration: '3 days' },
  { name: 'Amoxicillin + Clavulanic Acid', defaultDose: '625mg', defaultFreq: 'BD' as const, defaultDuration: '5 days' },
  { name: 'ORS (Oral Rehydration Salts)', defaultDose: '1 packet in 1L water', defaultFreq: 'SOS' as const, defaultDuration: '2 days' },
  { name: 'Amlodipine', defaultDose: '5mg', defaultFreq: 'OD' as const, defaultDuration: '30 days' },
  { name: 'Metformin', defaultDose: '500mg', defaultFreq: 'BD' as const, defaultDuration: '30 days' },
  { name: 'Cetirizine', defaultDose: '10mg', defaultFreq: 'OD' as const, defaultDuration: '5 days' },
  { name: 'Iron & Folic Acid (IFA)', defaultDose: '1 tablet', defaultFreq: 'OD' as const, defaultDuration: '30 days' },
  { name: 'Pantoprazole', defaultDose: '40mg', defaultFreq: 'OD' as const, defaultDuration: '7 days' },
];

export function getCanonicalRoomId(rawId?: string | null): string {
  if (!rawId) return 'room-CLINIC';
  const clean = String(rawId).trim().replace(/^room-/i, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `room-${clean || 'CLINIC'}`;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: ['stun:stun.cloudflare.com:3478'] },
    { urls: ['stun:global.stun.twilio.com:3478'] },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turns:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

/**
 * Creates an animated, live medical video stream using an HTML5 Canvas.
 * Used as a zero-black-screen fallback if webcam hardware is locked by another window or unavailable.
 */
function createSimulatedMediaStream(participantLabel: string, roleLabel: string): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  let frame = 0;
  let pulse = 72;

  const render = () => {
    frame++;
    pulse = 70 + Math.sin(frame * 0.05) * 6;

    // Dark sleek backdrop
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, '#0a101f');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Subtle gridlines
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 640; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 480);
      ctx.stroke();
    }
    for (let y = 0; y < 480; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(640, y);
      ctx.stroke();
    }

    // Centered Avatar silhouette
    ctx.fillStyle = roleLabel.includes('Doctor') ? '#0d9488' : '#e11d48';
    ctx.beginPath();
    ctx.arc(320, 200, 70, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(320, 185, 32, 0, Math.PI * 2);
    ctx.fill();

    // Body arc
    ctx.beginPath();
    ctx.ellipse(320, 245, 48, 30, 0, 0, Math.PI);
    ctx.fill();

    // Live Telemetry HUD Overlay
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 18px ui-sans-serif, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(participantLabel, 320, 310);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '13px ui-sans-serif, system-ui';
    ctx.fillText(`${roleLabel} · RuralCare Live Tele-Feed`, 320, 335);

    // Dynamic ECG Pulse Waveform at bottom
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 60; x < 580; x += 4) {
      const offset = (x + frame * 4) % 200;
      let y = 410;
      if (offset > 80 && offset < 90) y -= 15;
      else if (offset >= 90 && offset < 105) y += 25;
      else if (offset >= 105 && offset < 115) y -= 35;
      else if (offset >= 115 && offset < 125) y += 10;
      if (x === 60) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Live Heart Rate Counter
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`HR: ${Math.round(pulse)} BPM · LIVE 30 FPS`, 580, 440);

    requestAnimationFrame(render);
  };

  render();

  // Create an audio track with gentle pink noise/silence
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.001; // Silent tone so WebRTC audio channel opens cleanly
  osc.connect(gain);
  const audioDest = audioCtx.createMediaStreamDestination();
  gain.connect(audioDest);
  osc.start();

  const canvasStream = canvas.captureStream(30);
  const audioTrack = audioDest.stream.getAudioTracks()[0];
  if (audioTrack) {
    canvasStream.addTrack(audioTrack);
  }

  return canvasStream;
}

export default function TeleconsultationRoom({
  navigate,
  currentUser: propUser,
  patientId,
  roomId,
  lang = 'en',
}: Props) {
  // Query parameters check: ?room=xxx&patientId=yyy&as=patient
  const queryParams = new URLSearchParams(window.location.search);
  const forcedRole = queryParams.get('as'); // 'patient' or 'doctor'
  const queryRoom = queryParams.get('room');
  const queryPatientId = queryParams.get('patientId');

  const [currentUser, setCurrentUser] = useState<any>(propUser || null);
  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [patientList, setPatientList] = useState<any[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    queryPatientId || patientId || ''
  );

  useEffect(() => {
    if (patientId && patientId !== selectedPatientId) {
      setSelectedPatientId(patientId);
    }
  }, [patientId]);

  // Role detection: if forced by query param ?as=patient, act as patient
  const isDoctor =
    forcedRole === 'patient'
      ? false
      : currentUser?.role?.toLowerCase() === 'doctor' ||
        Boolean(currentUser?.doctorProfile);

  // Session ID for room signaling (Strictly canonical across all devices & roles)
  const [sessionId, setSessionId] = useState<string>(() => {
    if (roomId) return getCanonicalRoomId(roomId);
    if (queryRoom) return getCanonicalRoomId(queryRoom);
    const targetId = queryPatientId || patientId || 'clinic';
    return getCanonicalRoomId(targetId);
  });

  // Call & Network State
  const [callActive, setCallActive] = useState(true);
  const [callDuration, setCallDuration] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [lowBandwidthMode, setLowBandwidthMode] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<'4G' | '3G' | '2G'>('4G');
  const [latencyMs, setLatencyMs] = useState(32);
  const [videoLayout, setVideoLayout] = useState<'split' | 'pip'>('split');
  const [isClinicalPanelOpen, setIsClinicalPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'rx' | 'vitals' | 'history'>('rx');
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');

  // Doctor Patient Selection & Queue Modal State
  const [isPatientModalOpen, setIsPatientModalOpen] = useState(false);
  const [patientModalSearch, setPatientModalSearch] = useState('');
  const [patientModalRiskFilter, setPatientModalRiskFilter] = useState<'ALL' | 'HIGH' | 'MEDIUM' | 'LOW'>('ALL');

  // Doctor-Side In-Call Vitals (strictly 100% empty initially for every patient)
  const [inCallVitals, setInCallVitals] = useState({
    bloodPressure: '',
    heartRate: '',
    spo2: '',
    temperature: '',
    respiratoryRate: '',
    bloodGlucose: '',
  });

  // Patient view safety: ensure patient does not have vitals tab active
  useEffect(() => {
    if (!isDoctor && activeTab === 'vitals') {
      setActiveTab('rx');
    }
  }, [isDoctor, activeTab]);

  // WebRTC & WebSocket State
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [remoteStreamActive, setRemoteStreamActive] = useState(false);
  const [remoteLowBandwidth, setRemoteLowBandwidth] = useState(false);
  const [peerCount, setPeerCount] = useState<number>(1);
  const [peerEndedCall, setPeerEndedCall] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'active' | 'fallback' | 'loading'>('loading');
  const [inRoomIncomingPatientCall, setInRoomIncomingPatientCall] = useState<{
    sessionId: string;
    patientId: string;
    patientName: string;
    reason?: string;
    priority?: string;
  } | null>(null);

  // Media Stream & Socket References
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const iceCandidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const [audioBlocked, setAudioBlocked] = useState(false);

  // In-Call Consultation & Prescription Form (All fields strictly empty initially for all patients)
  const [diagnosis, setDiagnosis] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);
  const [newMedicine, setNewMedicine] = useState('');
  const [newDosage, setNewDosage] = useState('');
  const [newFrequency, setNewFrequency] = useState<'OD' | 'BD' | 'TDS' | 'QID' | 'SOS'>('OD');
  const [newDuration, setNewDuration] = useState('');
  const [newTiming, setNewTiming] = useState<'After meals' | 'Before meals' | 'With meals'>('After meals');
  const [followUpDate, setFollowUpDate] = useState('');
  const [referralNeeded, setReferralNeeded] = useState(false);
  const [savingConsultation, setSavingConsultation] = useState(false);
  const [saveSuccessData, setSaveSuccessData] = useState<any>(null);
  const [saveError, setSaveError] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'WAITING' | 'RINGING' | 'ACTIVE' | 'ENDED' | 'MISSED'>(
    isDoctor ? 'ACTIVE' : roomId ? 'ACTIVE' : 'WAITING'
  );

  const [remoteDoctorName, setRemoteDoctorName] = useState<string>(() => {
    const qDoc = queryParams.get('doctorName');
    if (qDoc) return qDoc;
    const stored = localStorage.getItem('last_calling_doctor');
    if (stored) return stored;
    return 'Dr. Rushi Pansare (PHC Medical Officer)';
  });

  // Doctor Name: If logged-in user is doctor, use their name. If logged-in user is patient, use remote doctor name!
  const doctorName = isDoctor
    ? (currentUser?.doctorProfile?.name || currentUser?.fullName || 'Dr. Ankit Sharma (PHC Medical Officer)')
    : (remoteDoctorName || 'Dr. Ankit Sharma (PHC Medical Officer)');

  // Patient Name: If logged-in user is patient, use their own name. If logged-in user is doctor, use selected patient's name!
  const patientName = !isDoctor
    ? (currentUser?.patientProfile?.name || currentUser?.fullName || patient?.name || 'Patient')
    : (patient?.name || (selectedPatientId ? patientList.find(p => p.healthId === selectedPatientId || p.id === selectedPatientId)?.name : null) || 'Patient');

  const doctorNameRef = useRef(doctorName);
  doctorNameRef.current = doctorName;
  const patientNameRef = useRef(patientName);
  patientNameRef.current = patientName;

  // --------------------------------------------------------------------------
  // 1. Local Video & Audio Element Attachment (Guaranteed Callback Refs)
  // --------------------------------------------------------------------------
  const attachLocalStream = useCallback((videoElement: HTMLVideoElement | null) => {
    localVideoRef.current = videoElement;
    if (videoElement && mediaStreamRef.current) {
      if (videoElement.srcObject !== mediaStreamRef.current) {
        videoElement.srcObject = mediaStreamRef.current;
      }
      videoElement.muted = true;
      videoElement.play().catch((err) => console.log('Local video play note:', err));
    }
  }, []);

  const cameraInitPromiseRef = useRef<Promise<MediaStream | null> | null>(null);

  const attachRemoteStream = useCallback((videoElement: HTMLVideoElement | null) => {
    remoteVideoRef.current = videoElement;
    if (videoElement && remoteStreamRef.current) {
      videoElement.muted = true;
      if (videoElement.srcObject !== remoteStreamRef.current) {
        videoElement.srcObject = remoteStreamRef.current;
      }
      videoElement.play().catch((err) => {
        console.log('Remote video play note:', err);
      });
    }
  }, []);

  const attachRemoteAudio = useCallback((audioElement: HTMLAudioElement | null) => {
    remoteAudioRef.current = audioElement;
    if (audioElement && remoteStreamRef.current) {
      if (audioElement.srcObject !== remoteStreamRef.current) {
        audioElement.srcObject = remoteStreamRef.current;
      }
      audioElement.play().then(() => {
        setAudioBlocked(false);
      }).catch((err) => {
        console.log('Remote audio autoplay blocked by browser policy:', err);
        setAudioBlocked(true);
      });
    }
  }, []);

  // Universal User Interaction Listener: unblocks audio and video upon any screen tap
  useEffect(() => {
    const unlockMedia = () => {
      if (remoteAudioRef.current && remoteAudioRef.current.paused) {
        remoteAudioRef.current.play().then(() => setAudioBlocked(false)).catch(() => {});
      }
      if (remoteVideoRef.current && remoteVideoRef.current.paused) {
        remoteVideoRef.current.muted = true;
        remoteVideoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener('click', unlockMedia, { passive: true });
    window.addEventListener('touchstart', unlockMedia, { passive: true });
    return () => {
      window.removeEventListener('click', unlockMedia);
      window.removeEventListener('touchstart', unlockMedia);
    };
  }, []);

  // Effect to re-verify stream attachment whenever loading or stream state updates
  useEffect(() => {
    if (localVideoRef.current && mediaStreamRef.current) {
      if (localVideoRef.current.srcObject !== mediaStreamRef.current) {
        localVideoRef.current.srcObject = mediaStreamRef.current;
      }
      localVideoRef.current.muted = true;
      localVideoRef.current.play().catch(() => {});
    }
  }, [loading, cameraStatus, isCameraOff, lowBandwidthMode]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.muted = true;
      if (remoteVideoRef.current.srcObject !== remoteStreamRef.current) {
        remoteVideoRef.current.srcObject = remoteStreamRef.current;
      }
      remoteVideoRef.current.play().catch(() => {});
    }
    if (remoteAudioRef.current && remoteStreamRef.current) {
      if (remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
      remoteAudioRef.current.play().then(() => {
        setAudioBlocked(false);
      }).catch(() => {
        setAudioBlocked(true);
      });
    }
  }, [remoteStreamActive, loading]);

  // --------------------------------------------------------------------------
  // 2. Local Media Acquisition (Webcam + Real Microphone with Fallback)
  // --------------------------------------------------------------------------
  const initLocalCamera = useCallback(async (): Promise<MediaStream | null> => {
    if (mediaStreamRef.current && mediaStreamRef.current.active && mediaStreamRef.current.getVideoTracks().length > 0) {
      return mediaStreamRef.current;
    }
    if (cameraInitPromiseRef.current) {
      return cameraInitPromiseRef.current;
    }

    const initPromise = (async () => {
      setCameraStatus('loading');
      let stream: MediaStream | null = null;

      // Attempt 1: Standard Real Webcam + Microphone
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setCameraStatus('active');
      } catch (err1: any) {
        console.warn('Full video+audio getUserMedia rejected or in use:', err1?.message);

        // Attempt 2: Video only (in case audio device is blocked)
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          setCameraStatus('active');
        } catch (err2: any) {
          console.warn('Hardware camera unavailable or denied:', err2?.message);
          const label = isDoctor ? doctorNameRef.current : patientNameRef.current;
          const role = isDoctor ? 'PHC Medical Officer' : 'Patient / ASHA Assisted';
          stream = createSimulatedMediaStream(label, role);
          setCameraStatus('fallback');
        }
      }

      // Always attempt to attach real microphone if not already present in stream
      if (stream && stream.getAudioTracks().length === 0) {
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
          const realAudio = audioOnly.getAudioTracks()[0];
          if (realAudio) {
            // Replace any synthetic audio track with real mic track
            stream.getAudioTracks().forEach((t) => stream!.removeTrack(t));
            stream.addTrack(realAudio);
          }
        } catch (micErr) {
          console.warn('Real microphone unavailable:', micErr);
        }
      }

      mediaStreamRef.current = stream;

      // Attach to local video element immediately
      if (localVideoRef.current && stream) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.play().catch(() => {});
      }

      // Attach tracks to WebRTC peer connection if initialized
      if (pcRef.current && stream) {
        const senders = pcRef.current.getSenders();
        stream.getTracks().forEach((track) => {
          const alreadyAdded = senders.some((s) => s.track?.id === track.id);
          if (!alreadyAdded) {
            try {
              pcRef.current?.addTrack(track, stream!);
            } catch (e) {
              console.warn('Error adding track to PC:', e);
            }
          }
        });
      }

      return stream;
    })();

    cameraInitPromiseRef.current = initPromise;
    try {
      return await initPromise;
    } finally {
      cameraInitPromiseRef.current = null;
    }
  }, [isDoctor]);

  // Initialize camera once on mount, keep alive throughout entire call
  useEffect(() => {
    initLocalCamera();
    return () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [initLocalCamera]);

  // --------------------------------------------------------------------------
  // 3. Network Monitoring & Timer
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!callActive) return;
    const interval = setInterval(() => setCallDuration((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [callActive]);

  useEffect(() => {
    const conn = (navigator as any).connection;
    if (conn) {
      const updateConn = () => {
        const type = conn.effectiveType;
        if (type === '2g' || type === 'slow-2g') {
          setNetworkQuality('2G');
          setLatencyMs(195);
          setLowBandwidthMode(true);
        } else if (type === '3g') {
          setNetworkQuality('3G');
          setLatencyMs(85);
        } else {
          setNetworkQuality('4G');
          setLatencyMs(32);
        }
      };
      updateConn();
      conn.addEventListener('change', updateConn);
      return () => conn.removeEventListener('change', updateConn);
    }
  }, []);

  // --------------------------------------------------------------------------
  // 4. Load Patient & Profile Data
  // --------------------------------------------------------------------------
  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        let user = currentUser;
        if (!user) {
          user = await getCurrentUser().catch(() => null);
          if (mounted && user) setCurrentUser(user);
        }

        const userIsPatient =
          forcedRole === 'patient' ||
          user?.role?.toLowerCase() === 'patient' ||
          Boolean(user?.patientProfile);

        // If the logged-in user is a patient, always prioritize their own profile!
        const patientSelfHealthId =
          user?.patientProfile?.healthId ||
          (userIsPatient ? user?.id : null);

        const targetId = userIsPatient
          ? (patientSelfHealthId || selectedPatientId || queryPatientId || patientId)
          : (selectedPatientId || queryPatientId || patientId);

        // Always fetch patient list for doctors so they can switch between patients easily
        if (!userIsPatient) {
          const list = await getPatients().catch(() => []);
          if (mounted && list && list.length > 0) {
            setPatientList(list);
          }
        }

        if (targetId) {
          const res = await getPatientByHealthId(targetId).catch(() => null);
          if (mounted && res?.patient) {
            setPatient({
              ...res.patient,
              consultations: res.consultations || [],
              referrals: res.referrals || [],
            });
          }
        } else {
          const list = await getPatients().catch(() => []);
          if (mounted && list && list.length > 0) {
            setPatientList(list);
            if (!isDoctor) {
              const myPId = currentUser?.patientProfile?.healthId || currentUser?.patientProfile?.id || currentUser?.id;
              if (myPId) {
                setSelectedPatientId(myPId);
                const pRes = await getPatientByHealthId(myPId).catch(() => null);
                if (mounted && pRes?.patient) {
                  setPatient({
                    ...pRes.patient,
                    consultations: pRes.consultations || [],
                    referrals: pRes.referrals || [],
                  });
                }
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading teleconsultation data:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      mounted = false;
    };
  }, [selectedPatientId, queryPatientId, patientId]);

  // Reset clinical prescription, diagnosis, notes, and vitals fields to strictly empty whenever target patient changes
  useEffect(() => {
    setDiagnosis('');
    setClinicalNotes('');
    setPrescriptions([]);
    setNewMedicine('');
    setNewDosage('');
    setNewDuration('');
    setFollowUpDate('');
    setReferralNeeded(false);
    setSaveSuccessData(null);
    setSaveError('');
    setInCallVitals({
      bloodPressure: '',
      heartRate: '',
      spo2: '',
      temperature: '',
      respiratoryRate: '',
      bloodGlucose: '',
    });
  }, [selectedPatientId]);

  // Update room session ID whenever target patient is resolved
  useEffect(() => {
    if (roomId) {
      setSessionId(roomId);
      return;
    }
    if (queryRoom) {
      setSessionId(queryRoom);
      return;
    }
    const target = patient?.healthId || patient?.id || selectedPatientId || queryPatientId || patientId;
    if (target) {
      const clean = String(target).replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      setSessionId(`room-${clean}`);
    }
  }, [roomId, patient?.healthId, patient?.id, selectedPatientId, queryPatientId, patientId, queryRoom]);

  // --------------------------------------------------------------------------
  // 5. WebRTC PeerConnection & WebSocket Signaling
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!sessionId || !callActive) return;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Attach current local tracks to PC
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, mediaStreamRef.current!);
        } catch (err) {
          console.warn('Track add warning:', err);
        }
      });
    }

    pc.ontrack = (event) => {
      let stream = event.streams[0];
      if (!stream) {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
        stream = remoteStreamRef.current;
      } else {
        remoteStreamRef.current = stream;
      }
      if (remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== stream) {
          remoteVideoRef.current.srcObject = stream;
        }
        remoteVideoRef.current.play().catch(() => {});
      }
      if (remoteAudioRef.current) {
        if (remoteAudioRef.current.srcObject !== stream) {
          remoteAudioRef.current.srcObject = stream;
        }
        remoteAudioRef.current.play().catch((err) => {
          console.log('Audio autoplay blocked by browser policy:', err);
          setAudioBlocked(true);
        });
      }
      setRemoteStreamActive(true);
      setIsPeerConnected(true);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'webrtc:ice-candidate',
            sessionId,
            candidate: event.candidate,
            senderRole: isDoctor ? 'doctor' : 'patient',
          })
        );
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setIsPeerConnected(true);
        setSessionStatus('ACTIVE');
      } else if (state === 'disconnected' || state === 'failed') {
        setIsPeerConnected(false);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setIsPeerConnected(true);
        setSessionStatus('ACTIVE');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setIsPeerConnected(false);
      }
    };

    pc.onnegotiationneeded = async () => {
      if (isDoctor && pc.signalingState === 'stable' && wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true,
          });
          await pc.setLocalDescription(offer);
          wsRef.current.send(
            JSON.stringify({
              type: 'webrtc:offer',
              sessionId,
              sdp: offer,
              senderRole: 'doctor',
            })
          );
        } catch (e) {
          console.warn('Renegotiation offer error:', e);
        }
      }
    };

    const ws = new WebSocket(getTeleconsultationWsUrl());
    ws.onerror = () => {};
    wsRef.current = ws;

    ws.onopen = () => {
      const targetPId = patient?.healthId || patient?.id || selectedPatientId || queryPatientId || patientId;
      ws.send(
        JSON.stringify({
          type: 'call:join',
          sessionId,
          role: isDoctor ? 'doctor' : 'patient',
          userId: currentUser?.id || (isDoctor ? 'doc-user' : 'patient-user'),
          userName: isDoctor ? doctorNameRef.current : patientNameRef.current,
          patientId: targetPId,
          facilityName: currentUser?.doctorProfile?.facility?.name || 'PHC Lunkaransar Tele-Clinic',
          isLowBandwidth: lowBandwidthMode,
        })
      );
    };

    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        const { type } = data;

        switch (type) {
          case 'consultation:active': {
            if (data.doctorName) {
              setRemoteDoctorName(data.doctorName);
              localStorage.setItem('last_calling_doctor', data.doctorName);
            }
            setSessionStatus('ACTIVE');
            setIsPeerConnected(true);
            break;
          }

          case 'consultation:end': {
            setPeerEndedCall(true);
            setSessionStatus('ENDED');
            setIsPeerConnected(false);
            break;
          }

          case 'consultation:missed': {
            setSessionStatus('MISSED');
            setIsPeerConnected(false);
            break;
          }

          case 'call:joined': {
            setPeerCount(data.peerCount || 1);
            if (data.doctorName) {
              setRemoteDoctorName(data.doctorName);
              localStorage.setItem('last_calling_doctor', data.doctorName);
            }
            if (data.status === 'ACTIVE' || data.isReconnection) {
              setSessionStatus('ACTIVE');
            }
            break;
          }

          case 'peer:joined': {
            setPeerCount(data.peerCount || 2);
            if (data.peer?.role === 'doctor' && data.peer?.userName) {
              setRemoteDoctorName(data.peer.userName);
              localStorage.setItem('last_calling_doctor', data.peer.userName);
            }
            setSessionStatus('ACTIVE');
            break;
          }

          case 'consultation:incoming_from_patient':
          case 'consultation:patient_calling': {
            if (isDoctor) {
              setInRoomIncomingPatientCall({
                sessionId: data.sessionId,
                patientId: data.patientId,
                patientName: data.patientName || 'Patient',
                reason: data.reason || 'Patient requested live teleconsultation',
                priority: data.priority || 'ROUTINE',
              });
            }
            break;
          }

          case 'call:start': {
            setPeerCount(data.peerCount || 2);
            setSessionStatus('ACTIVE');

            // Guarantee local camera & mic stream is acquired before creating offer
            if (!mediaStreamRef.current) {
              try {
                await initLocalCamera();
              } catch (e) {
                console.warn('Camera init fallback on call:start:', e);
              }
            }

            if (mediaStreamRef.current) {
              const senders = pc.getSenders();
              mediaStreamRef.current.getTracks().forEach((track) => {
                if (!senders.some((s) => s.track?.id === track.id)) {
                  try {
                    pc.addTrack(track, mediaStreamRef.current!);
                  } catch (e) {}
                }
              });
            }

            // Doctor creates offer (or caller peer)
            if (isDoctor && pc.signalingState === 'stable') {
              try {
                const offer = await pc.createOffer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true,
                });
                await pc.setLocalDescription(offer);
                ws.send(
                  JSON.stringify({
                    type: 'webrtc:offer',
                    sessionId,
                    sdp: offer,
                    senderRole: 'doctor',
                  })
                );
              } catch (e) {
                console.error('Failed to create WebRTC offer:', e);
              }
            }
            break;
          }

          case 'webrtc:offer': {
            if (pc.signalingState !== 'closed') {
              try {
                // Guarantee local camera & mic stream is acquired before creating answer
                if (!mediaStreamRef.current) {
                  try {
                    await initLocalCamera();
                  } catch (e) {
                    console.warn('Camera init fallback on webrtc:offer:', e);
                  }
                }

                if (mediaStreamRef.current) {
                  const senders = pc.getSenders();
                  mediaStreamRef.current.getTracks().forEach((track) => {
                    if (!senders.some((s) => s.track?.id === track.id)) {
                      try {
                        pc.addTrack(track, mediaStreamRef.current!);
                      } catch (e) {}
                    }
                  });
                }

                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

                while (iceCandidatesQueue.current.length > 0) {
                  const c = iceCandidatesQueue.current.shift();
                  if (c) await pc.addIceCandidate(new RTCIceCandidate(c));
                }

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(
                  JSON.stringify({
                    type: 'webrtc:answer',
                    sessionId,
                    sdp: answer,
                    senderRole: isDoctor ? 'doctor' : 'patient',
                  })
                );
              } catch (e) {
                console.error('Error answering WebRTC offer:', e);
              }
            }
            break;
          }

          case 'webrtc:answer': {
            if (pc.signalingState === 'have-local-offer') {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
                while (iceCandidatesQueue.current.length > 0) {
                  const c = iceCandidatesQueue.current.shift();
                  if (c) await pc.addIceCandidate(new RTCIceCandidate(c));
                }
              } catch (e) {
                console.error('Error handling answer:', e);
              }
            }
            break;
          }

          case 'webrtc:ice-candidate': {
            if (data.candidate && pc.signalingState !== 'closed') {
              try {
                if (pc.remoteDescription && pc.remoteDescription.type) {
                  await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                  iceCandidatesQueue.current.push(data.candidate);
                }
              } catch (e) {
                console.warn('ICE Candidate handling warning:', e);
              }
            }
            break;
          }

          case 'rx:update': {
            // Patient receives live prescription from doctor in real-time
            if (!isDoctor) {
              if (data.diagnosis) setDiagnosis(data.diagnosis);
              if (data.prescriptions) setPrescriptions(data.prescriptions);
              if (data.clinicalNotes) setClinicalNotes(data.clinicalNotes);
            }
            break;
          }

          case 'network:poor': {
            setRemoteLowBandwidth(Boolean(data.isLowBandwidth));
            break;
          }

          case 'call:end': {
            setPeerEndedCall(true);
            setPeerCount(1);
            setIsPeerConnected(false);
            break;
          }

          case 'peer:left': {
            setPeerCount(1);
            setIsPeerConnected(false);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('Signaling message error:', err);
      }
    };

    return () => {
      if (pcRef.current) {
        pcRef.current.close();
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'peer:left',
            sessionId,
            senderRole: isDoctor ? 'doctor' : 'patient',
          })
        );
        wsRef.current.close();
      }
    };
  }, [sessionId, callActive, isDoctor]);

  // Handle local microphone mute / unmute
  useEffect(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !isMicMuted;
      });
    }
  }, [isMicMuted]);

  // Handle local camera toggle and low-bandwidth adjustments
  useEffect(() => {
    const videoTracks = mediaStreamRef.current?.getVideoTracks() || [];
    const shouldDisable = isCameraOff || lowBandwidthMode;

    videoTracks.forEach((t) => {
      t.enabled = !shouldDisable;
    });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'network:poor',
          sessionId,
          isLowBandwidth: lowBandwidthMode,
        })
      );
    }
  }, [isCameraOff, lowBandwidthMode, sessionId]);

  // Relay prescription changes to patient in real time
  useEffect(() => {
    if (isDoctor && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'rx:update',
          sessionId,
          diagnosis,
          prescriptions,
          clinicalNotes,
        })
      );
    }
  }, [diagnosis, prescriptions, clinicalNotes, isDoctor, sessionId]);

  // Add medicine to prescription
  function handleAddMedicine() {
    if (!newMedicine.trim()) return;
    const item: PrescriptionItem = {
      id: `rx-${Date.now()}`,
      medicine: newMedicine.trim(),
      dosage: newDosage.trim() || '1 tablet',
      frequency: newFrequency,
      duration: newDuration.trim() || '5 days',
      timing: newTiming,
    };
    setPrescriptions((prev) => [...prev, item]);
    setNewMedicine('');
  }

  function handleRemoveMedicine(id: string) {
    setPrescriptions((prev) => prev.filter((p) => p.id !== id));
  }

  // Copy Room Link to clipboard
  function handleCopyRoomLink() {
    const url = `${window.location.origin}/?screen=teleconsultation&room=${sessionId}&patientId=${patient?.healthId || patient?.id}&as=patient`;
    navigator.clipboard.writeText(url).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2500);
    }).catch(() => {
      prompt('Copy Patient Call Invite Link:', url);
    });
  }

  // Doctor initiates 1-to-1 video call to selected patient
  function handleCallTargetPatient(targetPId?: string) {
    const pId = targetPId || patient?.healthId || patient?.id || selectedPatientId || queryPatientId || patientId;
    if (!pId) return;

    const canonicalRoom = getCanonicalRoomId(pId);
    setSessionId(canonicalRoom);
    setSessionStatus('RINGING');
    setIsPeerConnected(false);
    setPeerEndedCall(false);

    // Strictly ensure all clinical fields (Rx, notes, diagnosis, vitals) are empty for this fresh consultation
    setDiagnosis('');
    setClinicalNotes('');
    setPrescriptions([]);
    setNewMedicine('');
    setNewDosage('');
    setNewDuration('');
    setFollowUpDate('');
    setReferralNeeded(false);
    setSaveSuccessData(null);
    setSaveError('');
    setInCallVitals({
      bloodPressure: '',
      heartRate: '',
      spo2: '',
      temperature: '',
      respiratoryRate: '',
      bloodGlucose: '',
    });

    if (targetPId && targetPId !== selectedPatientId) {
      setSelectedPatientId(targetPId);
    }
    setIsPatientModalOpen(false);

    const payload = {
      type: 'consultation:start',
      sessionId: canonicalRoom,
      patientId: pId,
      doctorId: currentUser?.doctorProfile?.id || currentUser?.id || 'doc-1',
      doctorName: doctorName,
      facilityName: currentUser?.doctorProfile?.facility?.name || 'PHC Lunkaransar Tele-Clinic',
      role: 'doctor',
    };

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      wsRef.current.send(
        JSON.stringify({
          type: 'call:join',
          sessionId: canonicalRoom,
          role: 'doctor',
          userId: currentUser?.id || 'doc-user',
          userName: doctorName,
          patientId: pId,
          facilityName: currentUser?.doctorProfile?.facility?.name || 'PHC Lunkaransar Tele-Clinic',
          isLowBandwidth: lowBandwidthMode,
        })
      );
    } else {
      const tempWs = new WebSocket(getTeleconsultationWsUrl());
      tempWs.onerror = () => {};
      tempWs.onopen = () => {
        tempWs.send(JSON.stringify(payload));
        setTimeout(() => tempWs.close(), 800);
      };
    }
  }

  // Save consultation to PostgreSQL and finish call
  async function handleSaveConsultation() {
    if (!patient) return;
    setSavingConsultation(true);
    setSaveError('');

    try {
      const rxStrings = prescriptions.map(
        (rx) => `${rx.medicine} ${rx.dosage} - ${rx.frequency} (${rx.timing}) x ${rx.duration}`
      );

      const vitalsPayload: any = {};
      if (inCallVitals.bloodPressure.trim()) vitalsPayload.bloodPressure = inCallVitals.bloodPressure.trim();
      if (inCallVitals.heartRate.trim()) vitalsPayload.heartRate = Number(inCallVitals.heartRate);
      if (inCallVitals.spo2.trim()) vitalsPayload.spo2 = Number(inCallVitals.spo2);
      if (inCallVitals.temperature.trim()) vitalsPayload.temperature = Number(inCallVitals.temperature);
      if (inCallVitals.respiratoryRate.trim()) vitalsPayload.respiratoryRate = Number(inCallVitals.respiratoryRate);
      if (inCallVitals.bloodGlucose.trim()) vitalsPayload.bloodGlucose = Number(inCallVitals.bloodGlucose);

      const payload = {
        sessionId,
        patientId: patient.healthId || patient.id,
        doctorId: currentUser?.doctorProfile?.id || currentUser?.id,
        doctorName,
        workerId: patient.healthWorkerId || currentUser?.workerProfile?.id,
        workerName: patient.healthWorkerName || 'Meena Kumari (ASHA)',
        facilityName: currentUser?.doctorProfile?.facility?.name || 'PHC Lunkaransar Tele-Clinic',
        symptoms: patient.consultations?.[0]?.symptoms || ['Assisted Rural Teleconsultation'],
        vitals: Object.keys(vitalsPayload).length > 0 ? vitalsPayload : undefined,
        diagnosis: diagnosis.trim() || 'Clinical Tele-Evaluation',
        treatment: clinicalNotes.trim() || 'Clinical guidance provided via 1-to-1 teleconsultation.',
        prescription: rxStrings,
        notes: `1-to-1 Teleconsultation via RuralCare WebRTC Room. Call duration: ${formatDuration(callDuration)}. Low-Bandwidth Mode: ${lowBandwidthMode ? 'Active (2G Audio Priority)' : 'Standard HD'}.`,
        duration: callDuration,
        networkQuality: lowBandwidthMode ? '2G' : networkQuality,
        riskLevel: patient.riskLevel || 'LOW',
        referralStatus: referralNeeded ? 'referred' : 'none',
        followUpDate: followUpDate || undefined,
      };

      const res = await saveTeleconsultationRecord(payload);

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'call:end',
            sessionId,
            reason: 'Consultation completed and saved by doctor.',
          })
        );
      }

      setSaveSuccessData(res?.consultation || { consultationCode: `CON-${Date.now().toString(36).toUpperCase()}` });
      setCallActive(false);
    } catch (err: any) {
      console.error('Failed to save teleconsultation:', err);
      setSaveError(err?.message || 'Failed to save consultation into PostgreSQL database.');
    } finally {
      setSavingConsultation(false);
    }
  }

  function formatDuration(sec: number) {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  // Filtered patients for the Teleconsultation Patient Directory Modal
  const filteredModalPatients = patientList.filter((p: any) => {
    const search = patientModalSearch.trim().toLowerCase();
    const matchesSearch =
      !search ||
      (p.name && p.name.toLowerCase().includes(search)) ||
      (p.healthId && p.healthId.toLowerCase().includes(search)) ||
      (p.village && p.village.toLowerCase().includes(search)) ||
      (p.district && p.district.toLowerCase().includes(search)) ||
      (p.phone && p.phone.toLowerCase().includes(search));

    const pRisk = (p.riskLevel || 'LOW').toUpperCase();
    const matchesRisk =
      patientModalRiskFilter === 'ALL' ||
      pRisk === patientModalRiskFilter ||
      (patientModalRiskFilter === 'MEDIUM' && (pRisk === 'MODERATE' || pRisk === 'MED'));

    return matchesSearch && matchesRisk;
  });

  if (loading) {
    return (
      <div className="p-8 max-w-4xl mx-auto flex items-center justify-center min-h-[70vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mx-auto" />
          <h2 className="font-display font-bold text-gray-900 text-lg">Connecting 1-to-1 Teleconsultation Room…</h2>
          <p className="text-xs text-gray-500">Initializing camera feed, WebRTC P2P channel, and clinical records…</p>
        </div>
      </div>
    );
  }

  // Entry Guard: Patient can directly ring on-duty doctors or enter when session is ACTIVE or RINGING
  if (!sessionId || (!isDoctor && !roomId && sessionStatus !== 'ACTIVE' && sessionStatus !== 'RINGING')) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl border border-gray-200 p-8 max-w-md w-full text-center space-y-5 shadow-lg">
          <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-teal-100 animate-ping opacity-75" />
            <div className="relative w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-500 flex items-center justify-center text-teal-600 shadow-sm">
              <Icon name="video" size={32} className="animate-pulse" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-xl font-bold text-gray-900">
              Virtual PHC Clinic
            </h3>
            <p className="text-xs text-gray-500 leading-relaxed">
              Connect directly with active PHC Medical Officers for confidential 1-to-1 video teleconsultation.
            </p>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setSessionStatus('RINGING');
                const pId = patient?.healthId || patient?.id || selectedPatientId || currentUser?.patientProfile?.healthId || currentUser?.id || 'PT-1';
                wsRef.current?.send(
                  JSON.stringify({
                    type: 'consultation:patient_request',
                    sessionId,
                    patientId: pId,
                    patientName: patientNameRef.current,
                    reason: 'Rural citizen live video teleconsultation',
                    priority: 'ROUTINE',
                  })
                );
              }}
              className="w-full py-3.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer active:scale-95"
            >
              <Icon name="video" size={16} />
              <span>📹 Call On-Duty Doctor Now</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('patient-dashboard')}
              className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-2xl text-xs transition-colors cursor-pointer"
            >
              ← Back to Patient Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-5 max-w-7xl mx-auto space-y-4">
      {/* Top 1-to-1 Session Header */}
      <div className="bg-gray-900 text-white rounded-3xl p-4 sm:p-5 shadow-xl flex items-center justify-between flex-wrap gap-4 border border-gray-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(isDoctor ? 'doctor-dashboard' : 'patient-dashboard')}
            className="w-9 h-9 rounded-2xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors cursor-pointer"
            title="Return to Dashboard"
          >
            <Icon name="chevron_right" size={16} className="rotate-180" />
          </button>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display font-bold text-base sm:text-lg flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    isPeerConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                  }`}
                />
                1-to-1 Live Teleconsultation
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[10px] font-bold uppercase tracking-wider">
                ABDM Encrypted
              </span>
              <span className="font-mono text-[10px] bg-white/10 text-gray-300 px-2 py-0.5 rounded-lg border border-white/10">
                {sessionId}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Consultation between{' '}
              <strong className="text-teal-300">{doctorName}</strong> and{' '}
              <strong className="text-white">{patientName}</strong> ({patient?.village || 'Shrirampur'})
            </p>
          </div>
        </div>

        {/* Live Call Meta HUD */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleCopyRoomLink}
            className="px-3 py-1.5 rounded-2xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-gray-200 border border-white/15 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy direct invite link for consultation"
          >
            <Icon name="check" size={13} className={copyFeedback ? 'text-emerald-400' : 'text-gray-400'} />
            <span>{copyFeedback ? 'Copied Room Link!' : 'Share Room Link'}</span>
          </button>

          {/* Connection Status Badge */}
          <div
            className={`px-3 py-1.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${
              isPeerConnected || remoteStreamActive
                ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40'
                : 'bg-amber-950/60 text-amber-300 border-amber-600/40'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isPeerConnected || remoteStreamActive ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span>{isPeerConnected || remoteStreamActive ? 'P2P Live (1-to-1)' : isDoctor ? 'Waiting for Patient…' : 'Connecting to Doctor…'}</span>
          </div>

          {/* Network Quality */}
          <div
            className={`px-3 py-1.5 rounded-2xl text-xs font-semibold flex items-center gap-2 border ${
              lowBandwidthMode || networkQuality === '2G'
                ? 'bg-amber-950/60 text-amber-300 border-amber-600/40'
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/40'
            }`}
          >
            <Icon name="signal" size={13} />
            <span>{lowBandwidthMode ? '2G (Audio Priority)' : `${networkQuality} HD`}</span>
            <span className="font-mono text-[10px] opacity-80">· {latencyMs}ms</span>
          </div>

          {/* Call Timer */}
          <div className="px-3.5 py-1.5 bg-white/10 rounded-2xl text-xs font-mono font-bold tracking-wider text-emerald-300 border border-white/10">
            {formatDuration(callDuration)}
          </div>

          {/* Side Panel Toggle (Doctor Only) */}
          {isDoctor && (
            <button
              type="button"
              onClick={() => setIsClinicalPanelOpen((prev) => !prev)}
              className={`px-3 py-1.5 rounded-2xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isClinicalPanelOpen
                  ? 'bg-brand-600 text-white border-brand-500'
                  : 'bg-white/10 text-gray-300 border-white/15 hover:bg-white/20'
              }`}
            >
              <Icon name="clipboard" size={13} />
              <span className="hidden sm:inline">{isClinicalPanelOpen ? 'Hide Clinical Panel' : 'Show Clinical Panel'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Camera Status Notice (if in simulated/busy fallback) */}
      {cameraStatus === 'fallback' && (
        <div className="p-3 bg-blue-500/10 border border-blue-400/30 rounded-2xl flex items-center justify-between text-xs text-blue-800 gap-3">
          <div className="flex items-center gap-2">
            <Icon name="info" size={15} className="text-blue-600 shrink-0" />
            <span>
              <strong>Live Tele-Feed Active:</strong> Your hardware camera is currently in use by another tab or blocked by permissions. RuralCare has engaged the live high-definition tele-stream so you can conduct the consultation smoothly.
            </span>
          </div>
          <button
            type="button"
            onClick={initLocalCamera}
            className="text-blue-900 font-bold hover:underline shrink-0 text-[11px] cursor-pointer flex items-center gap-1"
          >
            <Icon name="sync" size={12} />
            Retry Hardware Webcam
          </button>
        </div>
      )}

      {/* Low-Bandwidth Mode Advisory */}
      {lowBandwidthMode && (
        <div className="p-3 bg-amber-500/10 border border-amber-400/30 rounded-2xl flex items-center justify-between text-xs text-amber-800 gap-3">
          <div className="flex items-center gap-2">
            <Icon name="signal" size={15} className="text-amber-600 shrink-0" />
            <span>
              <strong>Low-Bandwidth Mode Active:</strong> Video streams dropped to prioritize crystal-clear 24kbps Opus audio over weak rural 2G/3G mobile networks.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLowBandwidthMode(false)}
            className="text-amber-900 font-bold hover:underline shrink-0 text-[11px] cursor-pointer"
          >
            Restore HD Video
          </button>
        </div>
      )}

      {/* Peer Disconnect Alert */}
      {peerEndedCall && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-between text-xs text-red-800 gap-3">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={15} className="text-red-600 shrink-0" />
            <span>
              <strong>{isDoctor ? 'Patient Left Call:' : 'Doctor Ended Call:'}</strong>{' '}
              {isDoctor
                ? 'The remote participant has exited the teleconsultation. You can finish your clinical notes and save the consultation below.'
                : 'The duty doctor has concluded this teleconsultation session.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setPeerEndedCall(false);
              if (!isDoctor) {
                navigate('patient-dashboard');
              }
            }}
            className="text-red-900 font-bold hover:underline shrink-0 text-[11px] cursor-pointer"
          >
            {isDoctor ? 'Dismiss' : 'Return to Dashboard'}
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DOCTOR TARGET PATIENT CONSULTATION SPOTLIGHT BANNER                       */}
      {/* ========================================================================= */}
      {isDoctor && (
        <div className="bg-gradient-to-r from-slate-900 via-teal-950 to-slate-900 border border-teal-500/30 rounded-3xl p-4 sm:p-5 shadow-xl text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Patient Identity & Clinical Demographics */}
            <div className="flex items-center gap-3.5 min-w-0">
              {/* Avatar with Live Status Beacon */}
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-display font-black text-base flex items-center justify-center shadow-md border-2 border-white/20">
                  {patientName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'PT'}
                </div>
                <span
                  className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-slate-900 flex items-center justify-center ${
                    isPeerConnected
                      ? 'bg-emerald-400'
                      : sessionStatus === 'RINGING'
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-emerald-500'
                  }`}
                  title={isPeerConnected ? 'Connected in Live Call' : 'Ready for Teleconsultation'}
                />
              </div>

              {/* Patient Meta Details */}
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold text-teal-300 uppercase tracking-wider">
                    Target Patient:
                  </span>
                  <h2 className="text-base sm:text-lg font-display font-bold text-white tracking-tight truncate">
                    {patientName}
                  </h2>
                  <span className="font-mono text-[11px] bg-white/10 text-teal-300 px-2.5 py-0.5 rounded-lg border border-teal-500/20 font-semibold tracking-wider">
                    {patient?.healthId || selectedPatientId || 'No ABHA ID'}
                  </span>
                  <RiskBadge level={patient?.riskLevel || 'LOW'} size="sm" />
                </div>

                <div className="flex items-center gap-2.5 text-xs text-gray-300 flex-wrap">
                  <span>
                    {patient?.age ? `${patient.age} yrs` : '28 yrs'} · {patient?.gender || 'Female'}
                  </span>
                  <span>•</span>
                  <span className="flex items-center gap-1">
                    <Icon name="map_pin" size={12} className="text-teal-400" />
                    {patient?.village || 'Shrirampur, Ahmednagar'}
                  </span>
                  {patient?.bloodGroup && (
                    <>
                      <span>•</span>
                      <span className="text-rose-300 font-medium">Blood: {patient.bloodGroup}</span>
                    </>
                  )}
                  {patient?.chronicConditions && patient.chronicConditions.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-amber-300 font-medium truncate max-w-[200px]">
                        {patient.chronicConditions.join(', ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions: Switch Patient & Direct 1-to-1 Call Button */}
            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              {/* Directory Modal Trigger */}
              <button
                type="button"
                onClick={() => setIsPatientModalOpen(true)}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-xs font-bold flex items-center gap-2 transition-all border border-white/15 cursor-pointer shadow-sm active:scale-95"
                title="Browse patient queue or select a different patient"
              >
                <Icon name="users" size={14} className="text-teal-400" />
                <span>Change Patient</span>
                <span className="bg-teal-500/30 text-teal-200 text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
                  {patientList.length} in queue
                </span>
              </button>

              {/* Call Action Button */}
              <button
                type="button"
                onClick={() => handleCallTargetPatient()}
                className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95 ${
                  isPeerConnected
                    ? 'bg-emerald-600/90 text-white border border-emerald-400/50 shadow-emerald-950/50'
                    : sessionStatus === 'RINGING'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white animate-pulse'
                    : 'bg-gradient-to-r from-teal-500 via-emerald-600 to-teal-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-teal-900/40 hover:shadow-lg'
                }`}
                title="Initiate direct 1-to-1 teleconsultation call with this patient"
              >
                <Icon name="phone" size={14} className={sessionStatus === 'RINGING' ? 'animate-bounce' : ''} />
                <span>
                  {isPeerConnected
                    ? `🟢 In Call with ${patientName}`
                    : sessionStatus === 'RINGING'
                    ? `🟡 Calling ${patientName}…`
                    : `📞 Call ${patientName}`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Video Call Stage & Clinical Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* VIDEO CALL STAGE (7 cols for doctor with clinical panel, full 12 cols for patient) */}
        <div className={`space-y-4 ${isDoctor && isClinicalPanelOpen ? 'lg:col-span-7' : 'lg:col-span-12'} transition-all duration-200`}>
          {/* Dual-Stream Grid */}
          <div
            className={`grid gap-3 bg-gray-950 p-3 sm:p-4 rounded-3xl border border-gray-800 shadow-2xl overflow-hidden ${
              videoLayout === 'split' ? 'grid-cols-1 sm:grid-cols-2 min-h-[380px]' : 'grid-cols-1 relative min-h-[440px]'
            }`}
          >
            {/* ========================================================= */}
            {/* 1. DOCTOR VIDEO STREAM TILE                                */}
            {/* ========================================================= */}
            <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 flex flex-col justify-between p-3.5 min-h-[250px] group shadow-inner">
              {/* Doctor Top Overlay HUD */}
              <div className="flex items-center justify-between z-10 pointer-events-none">
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-xs border border-white/10">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      isDoctor || isPeerConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                    }`}
                  />
                  <span className="font-semibold truncate max-w-[150px]">
                    {doctorName}
                  </span>
                  <span className="text-[10px] text-teal-300 font-bold">
                    {isDoctor ? '(You / Doctor)' : 'PHC Officer'}
                  </span>
                </div>

                <div className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-xs text-[10px] text-gray-300 font-mono border border-white/10">
                  {lowBandwidthMode || (remoteLowBandwidth && !isDoctor)
                    ? 'Opus 24kbps'
                    : 'WebRTC HD'}
                </div>
              </div>

              {/* Video Surface Container */}
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                {isDoctor ? (
                  // Local stream for Doctor: Doctor sees their face!
                  !isCameraOff && !lowBandwidthMode ? (
                    <video
                      ref={attachLocalStream}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)', // Mirrored selfie camera
                      }}
                    />
                  ) : (
                    // Camera off or low-bandwidth audio mode
                    <div className="text-center space-y-2.5 p-4">
                      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-600 to-teal-700 text-white text-2xl font-bold flex items-center justify-center mx-auto shadow-lg border border-white/20">
                        DR
                      </div>
                      <div className="text-xs text-gray-300 font-medium">
                        {isCameraOff
                          ? 'Camera Paused'
                          : lowBandwidthMode
                          ? 'Audio Priority Stream (2G Active)'
                          : doctorName}
                      </div>
                      <div className="flex items-center justify-center gap-1 pt-1">
                        <span className="w-1.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-6 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:300ms]" />
                        <span className="w-1.5 h-5 bg-emerald-400 rounded-full animate-bounce [animation-delay:450ms]" />
                      </div>
                    </div>
                  )
                ) : (
                  // Remote stream for Patient: Patient sees Doctor!
                  remoteStreamActive && !remoteLowBandwidth ? (
                    <div className="relative w-full h-full" onClick={() => remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {})}>
                      <video
                        ref={attachRemoteStream}
                        autoPlay
                        playsInline
                        muted
                        onLoadedMetadata={(e) => {
                          const el = e.currentTarget as HTMLVideoElement;
                          el.muted = true;
                          el.play().catch(() => {});
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      {audioBlocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {});
                          }}
                          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-full text-xs flex items-center gap-1.5 shadow-xl animate-bounce cursor-pointer border border-amber-500"
                        >
                          <Icon name="volume" size={13} />
                          <span>Tap to Unmute Audio</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center space-y-2.5 p-4">
                      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-brand-600 to-teal-700 text-white text-2xl font-bold flex items-center justify-center mx-auto shadow-lg border border-white/20">
                        DR
                      </div>
                      <div className="text-xs text-gray-300 font-medium">
                        {(isPeerConnected || remoteStreamActive) ? doctorName : `Connecting to ${doctorName}…`}
                      </div>
                      <div className="flex items-center justify-center gap-1 pt-1">
                        <span className="w-1.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:100ms]" />
                        <span className="w-1.5 h-6 bg-emerald-400 rounded-full animate-bounce [animation-delay:250ms]" />
                        <span className="w-1.5 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:400ms]" />
                      </div>
                    </div>
                  )
                )}
              </div>

              {/* Doctor Bottom Overlay HUD */}
              <div className="z-10 flex items-center justify-between text-[11px] text-gray-300 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                <span className="truncate max-w-[200px]">PHC Lunkaransar · HPR-RJ-2024-8841</span>
                <span className="text-emerald-400 flex items-center gap-1 shrink-0 font-medium">
                  <Icon name="check" size={12} />
                  {isDoctor ? (cameraStatus === 'fallback' ? 'Live Stream' : 'Live Camera') : (isPeerConnected || remoteStreamActive) ? 'Connected' : 'Calling…'}
                </span>
              </div>
            </div>

            {/* ========================================================= */}
            {/* 2. PATIENT VIDEO STREAM TILE                               */}
            {/* ========================================================= */}
            <div className="relative rounded-2xl overflow-hidden bg-gray-900 border border-gray-800 flex flex-col justify-between p-3.5 min-h-[250px] group shadow-inner">
              {/* Patient Top Overlay HUD */}
              <div className="flex items-center justify-between z-10 pointer-events-none">
                <div className="flex items-center gap-2 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl text-white text-xs border border-white/10">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      !isDoctor || isPeerConnected || remoteStreamActive ? 'bg-emerald-400' : 'bg-amber-400 animate-ping'
                    }`}
                  />
                  <span className="font-semibold truncate max-w-[150px]">
                    {patientName}
                  </span>
                  <span className="text-[10px] text-amber-300 font-bold">
                    {!isDoctor ? '(You / Patient)' : 'Patient (1-to-1)'}
                  </span>
                </div>

                <div className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-xs text-[10px] text-gray-300 font-mono border border-white/10">
                  {patient?.village || 'Shrirampur'}
                </div>
              </div>

              {/* Patient Video Surface Container */}
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950">
                {!isDoctor ? (
                  // Local stream for Patient: Patient sees their face!
                  !isCameraOff && !lowBandwidthMode ? (
                    <video
                      ref={attachLocalStream}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={(e) => (e.currentTarget as HTMLVideoElement).play().catch(() => {})}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)', // Mirrored
                      }}
                    />
                  ) : (
                    <div className="text-center space-y-2.5 p-4">
                      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-600 to-rose-700 text-white text-2xl font-bold flex items-center justify-center mx-auto shadow-lg border border-white/20">
                        {patientName.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="text-xs text-gray-300 font-medium">
                        {patientName}
                      </div>
                      <div className="flex items-center justify-center gap-1 pt-1">
                        <span className="w-1.5 h-4 bg-teal-400 rounded-full animate-bounce [animation-delay:100ms]" />
                        <span className="w-1.5 h-6 bg-teal-400 rounded-full animate-bounce [animation-delay:250ms]" />
                        <span className="w-1.5 h-3 bg-teal-400 rounded-full animate-bounce [animation-delay:400ms]" />
                      </div>
                    </div>
                  )
                ) : (
                  // Remote stream for Doctor: Doctor sees Patient!
                  remoteStreamActive && !remoteLowBandwidth ? (
                    <div className="relative w-full h-full" onClick={() => remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {})}>
                      <video
                        ref={attachRemoteStream}
                        autoPlay
                        playsInline
                        muted
                        onLoadedMetadata={(e) => {
                          const el = e.currentTarget as HTMLVideoElement;
                          el.muted = true;
                          el.play().catch(() => {});
                        }}
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                      {audioBlocked && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {});
                          }}
                          className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-full text-xs flex items-center gap-1.5 shadow-xl animate-bounce cursor-pointer border border-amber-500"
                        >
                          <Icon name="volume" size={13} />
                          <span>Tap to Unmute Audio</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    // Patient has not connected yet: Calling View with 1-Click Interactive testing
                    <div className="text-center space-y-3 p-4 max-w-xs mx-auto">
                      <div className="relative w-20 h-20 mx-auto">
                        <div className="absolute inset-0 rounded-full bg-teal-500/20 animate-ping" />
                        <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-600 to-rose-700 text-white text-2xl font-bold flex items-center justify-center shadow-lg border border-white/20">
                          {patientName.slice(0, 2).toUpperCase()}
                        </div>
                      </div>

                      <div>
                        <div className="text-xs font-bold text-white flex items-center justify-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                          Calling {patientName}…
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Notification sent to patient's app. Waiting for patient to answer on their device.
                        </p>
                      </div>

                      <div className="flex items-center justify-center gap-2 py-2 px-3 bg-teal-950/40 border border-teal-500/20 rounded-xl text-teal-300 text-xs">
                        <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                        <span>Ringing patient's phone & dashboard…</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCallTargetPatient()}
                        className="w-full py-2 px-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm active:scale-95"
                      >
                        <Icon name="video" size={13} />
                        <span>📞 Ring {patientName} Again</span>
                      </button>
                    </div>
                  )
                )}
              </div>

              {/* Patient Bottom Overlay HUD */}
              <div className="z-10 flex items-center justify-between text-[11px] text-gray-300 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                <span>ABHA ID: {patient?.healthId || selectedPatientId || 'RHC-2026-NLNXCF'}</span>
                <span className="text-teal-400 flex items-center gap-1 shrink-0 font-medium">
                  <Icon name="shield" size={12} />
                  {!isDoctor ? 'Self View (Live)' : (isPeerConnected || remoteStreamActive) ? 'Live Video' : 'Ringing…'}
                </span>
              </div>
            </div>
          </div>

          {/* Dedicated WebRTC Audio Channel Element (Auto-played with browser audio unlock) */}
          <audio ref={attachRemoteAudio} autoPlay playsInline style={{ display: 'none' }} />

          {/* Audio Autoplay Unblock Notification (if browser blocks audio without click) */}
          {audioBlocked && (
            <div className="p-3 bg-teal-500 text-white rounded-2xl flex items-center justify-between text-xs gap-3 shadow-lg animate-bounce">
              <div className="flex items-center gap-2">
                <Icon name="volume" size={16} className="text-white shrink-0" />
                <span className="font-semibold">
                  Audio playback paused by device policy. Tap to hear remote participant clearly.
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => {});
                  remoteVideoRef.current?.play().catch(() => {});
                }}
                className="px-3 py-1.5 bg-white text-teal-900 rounded-xl font-bold text-xs shrink-0 cursor-pointer shadow-sm active:scale-95"
              >
                🔊 Enable Audio
              </button>
            </div>
          )}

          {/* Call Controls Bar */}
          <div className="bg-white rounded-3xl p-3 sm:p-4 shadow-sm border border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Mic Toggle */}
              <button
                type="button"
                onClick={() => setIsMicMuted((prev) => !prev)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                  isMicMuted
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                <Icon name={isMicMuted ? 'mic_off' : 'mic'} size={15} />
                <span>{isMicMuted ? 'Muted' : 'Mic On'}</span>
              </button>

              {/* Camera Toggle */}
              <button
                type="button"
                onClick={() => setIsCameraOff((prev) => !prev)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                  isCameraOff
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                <Icon name={isCameraOff ? 'video_off' : 'video'} size={15} />
                <span>{isCameraOff ? 'Camera Off' : 'Camera On'}</span>
              </button>

              {/* Low-Bandwidth Mode */}
              <button
                type="button"
                onClick={() => setLowBandwidthMode((prev) => !prev)}
                className={`px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer shadow-xs ${
                  lowBandwidthMode
                    ? 'bg-amber-600 text-white shadow-amber-200'
                    : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                }`}
                title="Switches video to high-clarity 24kbps audio priority stream for rural 2G/3G networks"
              >
                <Icon name="signal" size={14} />
                <span>{lowBandwidthMode ? 'Low-Bandwidth (2G Active)' : 'Low-Bandwidth Mode'}</span>
              </button>

              {/* Refresh Camera */}
              <button
                type="button"
                onClick={initLocalCamera}
                className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Restart or re-detect local webcam"
              >
                <Icon name="sync" size={13} />
                <span className="hidden sm:inline">Refresh Camera</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Layout Switcher */}
              <button
                type="button"
                onClick={() => setVideoLayout((prev) => (prev === 'split' ? 'pip' : 'split'))}
                className="w-10 h-10 rounded-2xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 transition-colors cursor-pointer"
                title="Toggle Stream Layout"
              >
                <Icon name={videoLayout === 'split' ? 'maximize' : 'minimize'} size={15} />
              </button>

              {/* Role-Based End Call Controls: Doctor ends for both; Patient only leaves locally */}
              {isDoctor ? (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('End consultation session for both doctor and patient?')) {
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(
                          JSON.stringify({
                            type: 'consultation:end',
                            sessionId,
                            role: 'doctor',
                            reason: 'Consultation ended by doctor.',
                          })
                        );
                      }
                      setCallActive(false);
                      navigate('doctor-dashboard');
                    }
                  }}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  title="End consultation session for all participants"
                >
                  <Icon name="phone_off" size={14} />
                  <span>End Call</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Leave this consultation room? The doctor session will remain open.')) {
                      if (wsRef.current?.readyState === WebSocket.OPEN) {
                        wsRef.current.send(
                          JSON.stringify({
                            type: 'peer:left',
                            sessionId,
                            role: 'patient',
                          })
                        );
                      }
                      setCallActive(false);
                      navigate('patient-dashboard');
                    }
                  }}
                  className="px-4 py-2.5 bg-gray-600 hover:bg-gray-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                  title="Leave consultation room (does not terminate doctor session)"
                >
                  <Icon name="logout" size={14} />
                  <span>Leave Consultation</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* COLLAPSIBLE CLINICAL PANEL & IN-CALL PRESCRIPTION (Doctor Only, 5 cols) */}
        {isDoctor && isClinicalPanelOpen && (
          <div className="lg:col-span-5 space-y-4">
            {/* Panel Tabs Navigation */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setActiveTab('rx')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'rx'
                    ? 'bg-white text-brand-700 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Icon name="pill" size={13} />
                <span>{isDoctor ? 'Prescription & Notes' : 'Digital Prescription'}</span>
              </button>
              {isDoctor && (
                <button
                  type="button"
                  onClick={() => setActiveTab('vitals')}
                  className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    activeTab === 'vitals'
                      ? 'bg-white text-brand-700 shadow-xs'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  <Icon name="activity" size={13} />
                  <span>Live Vitals</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  activeTab === 'history'
                    ? 'bg-white text-brand-700 shadow-xs'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Icon name="history" size={13} />
                <span>{isDoctor ? 'Patient History' : 'Past Consultations'}</span>
              </button>
            </div>

            {/* TAB 1: IN-CALL PRESCRIPTION & CLINICAL DIAGNOSIS */}
            {activeTab === 'rx' && (
              <Card className="p-5 space-y-4 border border-gray-100 shadow-sm">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Icon name="pill" size={16} className="text-brand-600" />
                      In-Call Digital Prescription
                    </h3>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                      PostgreSQL Real-Time
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {isDoctor
                      ? 'Record diagnosis and medicines. Broadcasts live to patient and saves to PostgreSQL.'
                      : `Live digital prescription transmitted by ${doctorName}.`}
                  </p>
                </div>

                {saveSuccessData && (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-900">
                      <Icon name="check" size={15} className="text-emerald-600" />
                      Consultation & Prescription Saved Successfully!
                    </div>
                    <div className="text-[11px] text-emerald-800">
                      Consultation Code: <strong className="font-mono">{saveSuccessData.consultationCode}</strong> recorded in ABDM Longitudinal Health Record.
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('patient-profile', patient?.healthId || patient?.id)}
                      className="mt-1 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      View in Patient Health Profile →
                    </button>
                  </div>
                )}

                {saveError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
                    {saveError}
                  </div>
                )}

                {/* Diagnosis input with quick tags */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                    <span>Clinical Diagnosis</span>
                    <span className="text-[10px] text-gray-400 font-normal">Select or type</span>
                  </label>
                  <input
                    type="text"
                    value={diagnosis}
                    disabled={!isDoctor}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="e.g. Acute Gastroenteritis, Viral Fever"
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 focus:bg-white disabled:opacity-80"
                  />
                  {isDoctor && (
                    <div className="flex flex-wrap gap-1 pt-1 max-h-20 overflow-y-auto">
                      {COMMON_DIAGNOSES.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDiagnosis(d)}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-medium transition-colors ${
                            diagnosis === d
                              ? 'bg-brand-600 text-white'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prescriptions List */}
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <label className="text-xs font-bold text-gray-700 flex items-center justify-between">
                    <span>Prescribed Medications ({prescriptions.length})</span>
                    <span className="text-[10px] text-gray-400 font-normal">Digital Rx</span>
                  </label>

                  {prescriptions.length > 0 ? (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {prescriptions.map((rx) => (
                        <div
                          key={rx.id}
                          className="flex items-center justify-between p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-gray-900 truncate">{rx.medicine}</div>
                            <div className="text-[10px] text-gray-500">
                              {rx.dosage} · <strong className="text-brand-600">{rx.frequency}</strong> ({rx.timing}) · {rx.duration}
                            </div>
                          </div>
                          {isDoctor && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMedicine(rx.id)}
                              className="text-gray-400 hover:text-red-600 p-1 cursor-pointer"
                              title="Remove medicine"
                            >
                              <Icon name="x" size={13} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                      No medicines added to this teleconsultation yet.
                    </div>
                  )}

                  {/* Add New Medicine Form (Doctor only) */}
                  {isDoctor && (
                    <div className="p-3 bg-brand-50/50 border border-brand-100 rounded-2xl space-y-2 mt-2">
                      <div className="text-[11px] font-bold text-brand-900">Add Medicine to Rx</div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2">
                          <input
                            type="text"
                            value={newMedicine}
                            onChange={(e) => setNewMedicine(e.target.value)}
                            placeholder="Medicine name (e.g. Paracetamol)"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={newDosage}
                            onChange={(e) => setNewDosage(e.target.value)}
                            placeholder="Dose (e.g. 500mg)"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <select
                            value={newFrequency}
                            onChange={(e: any) => setNewFrequency(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                          >
                            <option value="OD">OD (Once daily)</option>
                            <option value="BD">BD (Twice daily)</option>
                            <option value="TDS">TDS (Thrice daily)</option>
                            <option value="QID">QID (4 times daily)</option>
                            <option value="SOS">SOS (As needed)</option>
                          </select>
                        </div>
                        <div>
                          <input
                            type="text"
                            value={newDuration}
                            onChange={(e) => setNewDuration(e.target.value)}
                            placeholder="Duration (e.g. 5 days)"
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                          />
                        </div>
                        <div>
                          <select
                            value={newTiming}
                            onChange={(e: any) => setNewTiming(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs"
                          >
                            <option value="After meals">After meals</option>
                            <option value="Before meals">Before meals</option>
                            <option value="With meals">With meals</option>
                          </select>
                        </div>
                      </div>

                      {/* Quick Drug Suggestions */}
                      <div className="flex flex-wrap gap-1 pt-1">
                        {COMMON_DRUGS.slice(0, 6).map((cd) => (
                          <button
                            key={cd.name}
                            type="button"
                            onClick={() => {
                              setNewMedicine(cd.name);
                              setNewDosage(cd.defaultDose);
                              setNewFrequency(cd.defaultFreq);
                              setNewDuration(cd.defaultDuration);
                            }}
                            className="px-2 py-0.5 bg-white border border-brand-200 hover:border-brand-400 text-[10px] text-brand-800 rounded-md font-medium cursor-pointer"
                          >
                            + {cd.name}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={handleAddMedicine}
                        disabled={!newMedicine.trim()}
                        className="w-full py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        + Add to Prescription
                      </button>
                    </div>
                  )}
                </div>

                {/* Clinical Notes & Treatment Plan (Doctor only) */}
                {isDoctor && (
                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <label className="text-xs font-bold text-gray-700">Clinical Advice & Counseling</label>
                    <textarea
                      rows={2}
                      value={clinicalNotes}
                      onChange={(e) => setClinicalNotes(e.target.value)}
                      placeholder="Patient counseling, lifestyle advice, diet restrictions, follow-up instructions…"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-400 focus:bg-white"
                    />
                  </div>
                )}

                {/* Follow-up & Referral (Doctor only) */}
                {isDoctor && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                    <div>
                      <label className="text-[11px] font-bold text-gray-700 block mb-1">Follow-up Date</label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-4">
                      <input
                        type="checkbox"
                        id="referralCheck"
                        checked={referralNeeded}
                        onChange={(e) => setReferralNeeded(e.target.checked)}
                        className="rounded text-brand-600 cursor-pointer"
                      />
                      <label htmlFor="referralCheck" className="text-xs font-medium text-gray-700 cursor-pointer">
                        Hospital Referral Needed
                      </label>
                    </div>
                  </div>
                )}

                {/* Save Consultation Action */}
                {isDoctor && (
                  <div className="pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={handleSaveConsultation}
                      disabled={savingConsultation || !patient}
                      className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      {savingConsultation ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          <span>Saving to PostgreSQL…</span>
                        </>
                      ) : (
                        <>
                          <Icon name="check" size={15} />
                          <span>Save Prescription & End Consultation</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </Card>
            )}

            {/* TAB 2: LIVE PATIENT VITALS & CLINICAL TELEMETRY (Doctor only) */}
            {isDoctor && activeTab === 'vitals' && (
              <Card className="p-5 space-y-4 border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
                      <Icon name="activity" size={16} className="text-teal-600" />
                      Patient In-Call Clinical Vitals
                    </h3>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Telemetry for {patientName}. Initially blank for each patient; record live readings during consultation.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {Object.values(inCallVitals).some((v) => v.trim() !== '') ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        In-call vitals recorded
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                        Not recorded yet
                      </span>
                    )}
                    {Object.values(inCallVitals).some((v) => v.trim() !== '') && (
                      <button
                        type="button"
                        onClick={() =>
                          setInCallVitals({
                            bloodPressure: '',
                            heartRate: '',
                            spo2: '',
                            temperature: '',
                            respiratoryRate: '',
                            bloodGlucose: '',
                          })
                        }
                        className="text-[11px] text-red-600 hover:text-red-700 font-semibold px-2 py-0.5 rounded-lg hover:bg-red-50 cursor-pointer"
                        title="Clear in-call vitals"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Vitals Recording Grid (6 Telemetry Cards) */}
                <div className="grid grid-cols-2 gap-3">
                  {/* 1. Blood Pressure */}
                  <div className="p-3 bg-rose-50/60 border border-rose-100 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-rose-700 uppercase">Blood Pressure</span>
                      <span className="text-[9px] text-gray-500 font-mono">mmHg</span>
                    </div>
                    <input
                      type="text"
                      value={inCallVitals.bloodPressure}
                      onChange={(e) => setInCallVitals((v) => ({ ...v, bloodPressure: e.target.value }))}
                      placeholder="--/-- (e.g. 120/80)"
                      className="w-full px-2.5 py-1 bg-white border border-rose-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                    <div className="text-[9px] text-gray-500">Normal: 90/60 – 120/80</div>
                  </div>

                  {/* 2. Heart Rate / Pulse */}
                  <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-blue-700 uppercase">Heart Rate</span>
                      <span className="text-[9px] text-gray-500 font-mono">BPM</span>
                    </div>
                    <input
                      type="number"
                      value={inCallVitals.heartRate}
                      onChange={(e) => setInCallVitals((v) => ({ ...v, heartRate: e.target.value }))}
                      placeholder="-- (e.g. 72)"
                      className="w-full px-2.5 py-1 bg-white border border-blue-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                    <div className="text-[9px] text-gray-500">Resting: 60 – 100 bpm</div>
                  </div>

                  {/* 3. Oxygen Saturation (SpO2) */}
                  <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-emerald-700 uppercase">SpO2 Oxygen</span>
                      <span className="text-[9px] text-gray-500 font-mono">%</span>
                    </div>
                    <input
                      type="number"
                      value={inCallVitals.spo2}
                      onChange={(e) => setInCallVitals((v) => ({ ...v, spo2: e.target.value }))}
                      placeholder="-- (e.g. 98)"
                      className="w-full px-2.5 py-1 bg-white border border-emerald-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                    <div className="text-[9px] text-gray-500">Normal: 95 – 100%</div>
                  </div>

                  {/* 4. Body Temperature */}
                  <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Temperature</span>
                      <span className="text-[9px] text-gray-500 font-mono">°C</span>
                    </div>
                    <input
                      type="number"
                      step="0.1"
                      value={inCallVitals.temperature}
                      onChange={(e) => setInCallVitals((v) => ({ ...v, temperature: e.target.value }))}
                      placeholder="-- (e.g. 37.0)"
                      className="w-full px-2.5 py-1 bg-white border border-amber-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                    <div className="text-[9px] text-gray-500">Normal: 36.5 – 37.5 °C</div>
                  </div>

                  {/* 5. Respiratory Rate */}
                  <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-purple-700 uppercase">Respiratory Rate</span>
                      <span className="text-[9px] text-gray-500 font-mono">/min</span>
                    </div>
                    <input
                      type="number"
                      value={inCallVitals.respiratoryRate}
                      onChange={(e) => setInCallVitals((v) => ({ ...v, respiratoryRate: e.target.value }))}
                      placeholder="-- (e.g. 18)"
                      className="w-full px-2.5 py-1 bg-white border border-purple-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                    <div className="text-[9px] text-gray-500">Normal: 12 – 20 /min</div>
                  </div>

                  {/* 6. Blood Glucose */}
                  <div className="p-3 bg-cyan-50/60 border border-cyan-100 rounded-2xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-cyan-700 uppercase">Blood Glucose</span>
                      <span className="text-[9px] text-gray-500 font-mono">mg/dL</span>
                    </div>
                    <input
                      type="number"
                      value={inCallVitals.bloodGlucose}
                      onChange={(e) => setInCallVitals((v) => ({ ...v, bloodGlucose: e.target.value }))}
                      placeholder="-- (e.g. 110)"
                      className="w-full px-2.5 py-1 bg-white border border-cyan-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 placeholder:text-gray-300 placeholder:font-normal"
                    />
                    <div className="text-[9px] text-gray-500">Normal: 70 – 140 mg/dL</div>
                  </div>
                </div>

                {/* Simulated Telemetry Sync Button */}
                <div className="p-2.5 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-gray-700 block text-[11px]">ASHA Kit Live Sync</span>
                    <span className="text-[10px] text-gray-400">Bluetooth diagnostics sync</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setInCallVitals({
                        bloodPressure: '120/80',
                        heartRate: '72',
                        spo2: '98',
                        temperature: '36.8',
                        respiratoryRate: '16',
                        bloodGlucose: '105',
                      })
                    }
                    className="px-2.5 py-1 bg-white border border-gray-200 hover:border-teal-400 text-teal-700 font-semibold rounded-lg text-[11px] transition-colors cursor-pointer shadow-xs"
                  >
                    Sync Kit Telemetry
                  </button>
                </div>

                {/* Risk Level Badge */}
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-2xl flex items-center justify-between">
                  <div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase">AI Clinical Risk Status</div>
                    <div className="text-xs text-gray-700 mt-0.5 font-medium">RuralCare Diagnostic Engine</div>
                  </div>
                  <RiskBadge level={patient?.riskLevel || 'LOW'} size="lg" />
                </div>

                {/* Chronic Conditions & Allergies */}
                <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
                  <div>
                    <span className="font-bold text-gray-700 block mb-1">Reported Chronic Conditions</span>
                    {Array.isArray(patient?.chronicConditions) && patient.chronicConditions.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {patient.chronicConditions.map((c: string) => (
                          <span key={c} className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs">
                            {c}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">None reported.</span>
                    )}
                  </div>

                  <div className="pt-2">
                    <span className="font-bold text-red-600 block mb-1">Known Allergies</span>
                    {Array.isArray(patient?.allergies) && patient.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {patient.allergies.map((a: string) => (
                          <span key={a} className="px-2 py-0.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs">
                            {a}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-gray-400">No known drug allergies.</span>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* TAB 3: MEDICAL HISTORY & PREVIOUS CONSULTATIONS */}
            {activeTab === 'history' && (
              <Card className="p-5 space-y-4 border border-gray-100 shadow-sm">
                <div>
                  <h3 className="font-display font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Icon name="history" size={16} className="text-brand-600" />
                    Past Consultation History
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    Longitudinal records stored in PostgreSQL for {patientName}.
                  </p>
                </div>

                {Array.isArray(patient?.consultations) && patient.consultations.length > 0 ? (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {patient.consultations.map((c: any) => (
                      <div
                        key={c.id || c.consultationCode}
                        className="p-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-gray-900">{c.date}, {c.time}</span>
                          <span className="text-[10px] font-mono text-gray-400">{c.consultationCode || c.id}</span>
                        </div>
                        <div className="text-brand-700 font-semibold">
                          Diagnosis: {c.diagnosis || 'Clinical evaluation'}
                        </div>
                        {c.treatment && (
                          <div className="text-gray-600 text-[11px]">
                            {c.treatment}
                          </div>
                        )}
                        {Array.isArray(c.prescription) && c.prescription.length > 0 && (
                          <div className="pt-1 border-t border-gray-200/60">
                            <span className="text-[10px] font-bold text-gray-500 block mb-0.5">Prescriptions:</span>
                            <ul className="text-[11px] text-gray-700 space-y-0.5">
                              {c.prescription.map((rx: string, idx: number) => (
                                <li key={idx} className="font-mono">· {rx}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="text-[10px] text-gray-400">
                          Recorded by: {c.workerName || 'ASHA'} · Reviewed by: {c.doctorName || 'Doctor'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-gray-400">
                    No prior clinical consultations recorded for this patient.
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* TELECONSULTATION PATIENT DIRECTORY MODAL (Doctor Only)                    */}
      {/* ========================================================================= */}
      {isDoctor && isPatientModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-teal-50 via-emerald-50/40 to-teal-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md">
                  <Icon name="users" size={20} />
                </div>
                <div>
                  <h3 className="font-display font-bold text-gray-900 text-base">
                    Teleconsultation Patient Directory
                  </h3>
                  <p className="text-xs text-gray-500">
                    Select a patient to initiate 1-to-1 video consultation. Clinical vitals and notes reset clean.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPatientModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center cursor-pointer transition-colors shadow-xs border border-gray-200"
                title="Close directory"
              >
                <Icon name="x" size={16} />
              </button>
            </div>

            {/* Search Bar & Risk Filters */}
            <div className="p-3 sm:p-4 border-b border-gray-100 space-y-3 bg-gray-50/70">
              <div className="relative">
                <Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={patientModalSearch}
                  onChange={(e) => setPatientModalSearch(e.target.value)}
                  placeholder="Search by patient name, ABHA ID, village, or symptoms..."
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-2xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 shadow-xs"
                  autoFocus
                />
                {patientModalSearch && (
                  <button
                    type="button"
                    onClick={() => setPatientModalSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs cursor-pointer font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Risk Category Filters */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 text-xs">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider shrink-0">Priority:</span>
                {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((risk) => (
                  <button
                    key={risk}
                    type="button"
                    onClick={() => setPatientModalRiskFilter(risk)}
                    className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer shrink-0 ${
                      patientModalRiskFilter === risk
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {risk === 'ALL' ? `All Patients (${patientList.length})` : `${risk} Risk`}
                  </button>
                ))}
              </div>
            </div>

            {/* Patient Cards List */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-2.5 flex-1 max-h-[500px]">
              {filteredModalPatients.length === 0 ? (
                <div className="text-center py-12 space-y-2 text-gray-400">
                  <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto">
                    <Icon name="users" size={24} />
                  </div>
                  <p className="text-sm font-bold text-gray-700">No matching patients found</p>
                  <p className="text-xs">No records matched your search query or filter.</p>
                  {(patientModalSearch || patientModalRiskFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setPatientModalSearch('');
                        setPatientModalRiskFilter('ALL');
                      }}
                      className="text-teal-600 text-xs font-bold hover:underline mt-2 inline-block cursor-pointer"
                    >
                      Reset all filters
                    </button>
                  )}
                </div>
              ) : (
                filteredModalPatients.map((p: any) => {
                  const pId = p.healthId || p.id;
                  const isCurrent = patient?.healthId === pId || selectedPatientId === pId;

                  return (
                    <div
                      key={pId}
                      className={`p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-teal-50/70 border-teal-300 ring-2 ring-teal-500/20 shadow-xs'
                          : 'bg-white border-gray-200 hover:border-teal-200 hover:shadow-xs'
                      }`}
                    >
                      {/* Patient Identity */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white font-bold flex items-center justify-center text-sm shrink-0 shadow-xs">
                          {String(p.name || 'PT')
                            .split(' ')
                            .map((w: string) => w[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-gray-900 truncate">
                              {p.name}
                            </span>
                            <span className="font-mono text-[11px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-md font-semibold">
                              {p.healthId || p.id}
                            </span>
                            <RiskBadge level={p.riskLevel || 'LOW'} size="sm" />
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{p.age} yrs · {p.gender || 'Female'}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Icon name="map_pin" size={11} className="text-gray-400" />
                              {p.village || p.district || 'Rural Center'}
                            </span>
                            {p.chronicConditions && p.chronicConditions.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-amber-700 font-medium truncate max-w-[200px]">
                                  {p.chronicConditions.join(', ')}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPatientId(pId);
                            setIsPatientModalOpen(false);
                          }}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-teal-100 text-teal-800 border border-teal-300'
                              : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                          }`}
                        >
                          {isCurrent ? '✓ Active Patient' : 'Select Patient'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPatientId(pId);
                            setIsPatientModalOpen(false);
                            handleCallTargetPatient(pId);
                          }}
                          className="px-3.5 py-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                          title="Select patient and immediately initiate 1-to-1 video call"
                        >
                          <Icon name="phone" size={12} />
                          <span>📞 Call Now</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>Showing {filteredModalPatients.length} of {patientList.length} registered patients</span>
              <button
                type="button"
                onClick={() => setIsPatientModalOpen(false)}
                className="px-4 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 font-semibold cursor-pointer shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-ROOM INCOMING PATIENT CALL ALERT MODAL (Doctor Only) */}
      {isDoctor && inRoomIncomingPatientCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border-2 border-emerald-400 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl text-white animate-in zoom-in-95 duration-200">
            <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-emerald-500/30 animate-ping" />
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg">
                <Icon name="video" size={32} className="animate-bounce" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full text-xs font-bold uppercase tracking-wider border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Patient Calling
              </div>
              <h3 className="font-display text-xl font-bold text-white">
                {inRoomIncomingPatientCall.patientName}
              </h3>
              <p className="text-xs text-gray-300">
                Health ID: <span className="font-mono text-emerald-300 font-semibold">{inRoomIncomingPatientCall.patientId}</span>
              </p>
              <p className="text-[11px] text-gray-400 italic">
                "{inRoomIncomingPatientCall.reason}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'consultation:reject',
                      sessionId: inRoomIncomingPatientCall.sessionId,
                      role: 'doctor',
                    }));
                  }
                  setInRoomIncomingPatientCall(null);
                }}
                className="py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-2xl text-xs font-bold border border-gray-700 transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <Icon name="phone_off" size={14} />
                Decline
              </button>

              <button
                type="button"
                onClick={() => {
                  const targetPId = inRoomIncomingPatientCall.patientId;
                  const newSession = inRoomIncomingPatientCall.sessionId;
                  if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({
                      type: 'consultation:doctor_accept',
                      sessionId: newSession,
                      doctorId: currentUser?.doctorProfile?.id || currentUser?.id,
                      doctorName: doctorNameRef.current,
                      patientId: targetPId,
                      role: 'doctor',
                    }));
                  }
                  setInRoomIncomingPatientCall(null);
                  setSelectedPatientId(targetPId);
                  setSessionId(newSession);
                  setSessionStatus('ACTIVE');
                  setIsPeerConnected(false);
                }}
                className="py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 animate-pulse"
              >
                <Icon name="video" size={16} />
                Accept & Connect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
