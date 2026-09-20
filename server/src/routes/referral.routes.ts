import { Router } from 'express';

import {
  getReferrals,
  getReferralById,
  createReferral,
  updateReferralStatus,
  getReferralFacilities,
  getReferralWorkers,
  getReferralDoctors,
} from '../controllers/referral.controller.js';
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/facilities', optionalAuth, getReferralFacilities);
router.get('/workers', optionalAuth, getReferralWorkers);
router.get('/doctors', optionalAuth, getReferralDoctors);

router.get('/', requireAuth, getReferrals);
router.post('/', requireAuth, requireRole('DOCTOR', 'WORKER', 'ADMIN'), createReferral);
router.get('/:id', requireAuth, getReferralById);
router.patch('/:id/status', requireAuth, requireRole('DOCTOR', 'WORKER', 'ADMIN'), updateReferralStatus);

export default router;