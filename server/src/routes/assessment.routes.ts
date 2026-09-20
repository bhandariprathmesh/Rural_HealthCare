import { Router } from 'express';
import { generateAssessment, predictRisk } from '../controllers/assessment.controller.js';
import { requireAuth, optionalAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/v1/assessments/predict-risk (Real-time XGBoost inference)
router.post('/predict-risk', optionalAuth, predictRisk);

// POST /api/v1/assessments/generate (Full assessment generation with consent & DB persistence)
router.post('/generate', requireAuth, generateAssessment);

export default router;