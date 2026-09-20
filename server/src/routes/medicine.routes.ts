import { Router } from 'express';
import {
  getMedicines,
  getMedicineById,
  updateMedicineStock,
  getFacilityStockSummary,
} from '../controllers/medicine.controller.js';

const router = Router();

// GET /api/v1/medicines - list medicines
router.get('/', getMedicines);

// GET /api/v1/medicines/facilities/:facilityId/stock-summary - facility stock overview
router.get('/facilities/:facilityId/stock-summary', getFacilityStockSummary);

// GET /api/v1/medicines/:id - get single medicine
router.get('/:id', getMedicineById);

// PATCH /api/v1/medicines/:id/stock - update stock level
router.patch('/:id/stock', updateMedicineStock);

export default router;
