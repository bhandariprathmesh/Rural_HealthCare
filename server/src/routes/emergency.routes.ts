import { Router } from 'express';
import {
  authorizeEmergencyAccess,
  getEmergencyLogs,
  dispatchSosAlert,
  getDoctorSosInboxController,
  acceptSosAlertController,
  declineSosAlertController,
  cancelSosAlertController,
  getSosAlertStatusController,
  getActiveSosAlerts,
  updateSosStatus,
} from '../controllers/emergency.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// Break-Glass Emergency Authorization & Audit
router.post('/authorize', optionalAuth, authorizeEmergencyAccess);
router.post('/access/authorize', optionalAuth, authorizeEmergencyAccess);
router.get('/logs', optionalAuth, getEmergencyLogs);
router.get('/access/logs', optionalAuth, getEmergencyLogs);

// Emergency SOS Endpoints (when mounted under /sos or /emergency)
router.post('/', optionalAuth, dispatchSosAlert);
router.post('/sos', optionalAuth, dispatchSosAlert);
router.post('/alerts', optionalAuth, dispatchSosAlert);
router.post('/sos/alerts', optionalAuth, dispatchSosAlert);

// Inbox for Doctor (receipt of assigned alerts)
router.get('/inbox', optionalAuth, getDoctorSosInboxController);
router.get('/sos/inbox', optionalAuth, getDoctorSosInboxController);

// Active alerts
router.get('/active', optionalAuth, getActiveSosAlerts);
router.get('/sos/active', optionalAuth, getActiveSosAlerts);

// Accept, Decline, Cancel
router.post('/:id/accept', optionalAuth, acceptSosAlertController);
router.post('/sos/:id/accept', optionalAuth, acceptSosAlertController);

router.post('/:id/decline', optionalAuth, declineSosAlertController);
router.post('/sos/:id/decline', optionalAuth, declineSosAlertController);

router.post('/:id/cancel', optionalAuth, cancelSosAlertController);
router.post('/sos/:id/cancel', optionalAuth, cancelSosAlertController);

// Status & Countdown
router.get('/:id/status', optionalAuth, getSosAlertStatusController);
router.get('/sos/:id/status', optionalAuth, getSosAlertStatusController);

// Legacy Status Update
router.patch('/:id/status', optionalAuth, updateSosStatus);
router.patch('/sos/:id/status', optionalAuth, updateSosStatus);

export default router;
