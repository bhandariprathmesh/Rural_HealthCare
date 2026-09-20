import { Router } from 'express';
import { createSession, saveTeleconsultation, getActiveCall } from '../controllers/teleconsultation.controller.js';

const router = Router();

// Route to check active incoming calls for a patient
router.get('/active-call', getActiveCall);

// Route to initialize a teleconsultation room session
router.post('/sessions', createSession);

// Route to persist digital prescription and in-call notes to PostgreSQL
router.post('/consultations', saveTeleconsultation);

export default router;

