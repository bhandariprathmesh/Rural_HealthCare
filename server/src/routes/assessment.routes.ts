import { Router } from 'express';
import { generateAssessment } from '../controllers/assessment.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post('/generate', requireAuth, generateAssessment);

export default router;