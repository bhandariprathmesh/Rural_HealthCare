import { Router } from 'express';

import {
  getReferrals,
  getReferralById,
  createReferral,
  updateReferralStatus,
  getReferralFacilities,
  getReferralWorkers,
} from '../controllers/referral.controller.js';

const router = Router();

router.get('/', getReferrals);
router.post('/', createReferral);
router.get('/facilities', getReferralFacilities);
router.get('/workers', getReferralWorkers);
router.get('/:id', getReferralById);
router.patch('/:id/status', updateReferralStatus);

export default router;