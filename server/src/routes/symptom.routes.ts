import { Router } from 'express';
import { getSymptoms } from '../controllers/symptom.controller.js';

const router = Router();

// GET /api/v1/symptoms
router.get('/', getSymptoms);

export default router;

