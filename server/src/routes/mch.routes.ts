import { Router } from 'express';
import {
  getMchDueList,
  getPatientMchRecord,
  createMchRecord,
  updateMchMilestone,
} from '../controllers/mch.controller.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/v1/mch/due-list (ASHA due list and alerts)
router.get('/due-list', optionalAuth, getMchDueList);

// GET /api/v1/mch/patient/:patientId (Mother & Child Protection MCP card data)
router.get('/patient/:patientId', optionalAuth, getPatientMchRecord);

// POST /api/v1/mch (Register new MCH / pregnancy / child)
router.post('/', optionalAuth, createMchRecord);

// PATCH /api/v1/mch/:id/milestones/:milestoneCode (Mark milestone done/administered)
router.patch('/:id/milestones/:milestoneCode', optionalAuth, updateMchMilestone);

export default router;
