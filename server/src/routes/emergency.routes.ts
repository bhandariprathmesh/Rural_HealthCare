import { Router } from 'express';
import {
  authorizeEmergencyAccess,
  getEmergencyLogs,
  dispatchSosAlert,
  getActiveSosAlerts,
  updateSosStatus,
} from '../controllers/emergency.controller.js';

const router = Router();

// Break-Glass Emergency Authorization & Audit
router.post('/authorize', authorizeEmergencyAccess);
router.get('/logs', getEmergencyLogs);

// Emergency SOS Alert Lifecyle (T3 Tier - HTTP/REST)
router.post('/sos', dispatchSosAlert);
router.post('/sos/alerts', dispatchSosAlert);
router.get('/sos/active', getActiveSosAlerts);
router.patch('/sos/:id/status', updateSosStatus);

export default router;
