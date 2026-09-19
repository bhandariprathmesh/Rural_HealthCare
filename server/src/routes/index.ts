import { Router } from 'express';

import authRoutes from './auth.routes.js';
import patientRoutes from './patient.routes.js';
import assessmentRoutes from './assessment.routes.js';
import doctorRoutes from './doctor.routes.js';
import workerRoutes from './worker.routes.js';
import consultationRoutes from './consultation.routes.js';
import referralRoutes from './referral.routes.js';
import medicineRoutes from './medicine.routes.js';
import aiRoutes from './ai.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import abdmMockRoutes from './abdm.mock.routes.js';
import emergencyRoutes from './emergency.routes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/patients', patientRoutes);
router.use('/assessments', assessmentRoutes);
router.use('/doctors', doctorRoutes);
router.use('/workers', workerRoutes);
router.use('/consultations', consultationRoutes);
router.use('/referrals', referralRoutes);
router.use('/medicines', medicineRoutes);
router.use('/ai-assessments', aiRoutes);
router.use('/dashboards', dashboardRoutes);
router.use('/abdm/mock', abdmMockRoutes);
router.use('/abdm', abdmMockRoutes);
router.use('/emergency', emergencyRoutes);
router.use('/sos', emergencyRoutes);

export default router;