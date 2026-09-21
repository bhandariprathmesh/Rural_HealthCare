import { Router } from 'express';
import {
  getDiagnosticItems,
  getDiagnosticItemById,
  updateDiagnosticStock,
  createDiagnosticItem,
} from '../controllers/diagnostic.controller.js';

const router = Router();

// GET /api/v1/diagnostics - list diagnostic kits
router.get('/', getDiagnosticItems);

// POST /api/v1/diagnostics - create kit
router.post('/', createDiagnosticItem);

// GET /api/v1/diagnostics/:id - get kit details
router.get('/:id', getDiagnosticItemById);

// PATCH /api/v1/diagnostics/:id/stock - update kit stock
router.patch('/:id/stock', updateDiagnosticStock);

export default router;
