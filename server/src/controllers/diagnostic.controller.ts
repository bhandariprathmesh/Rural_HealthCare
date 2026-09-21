import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';
import { DiagnosticStatus } from '@prisma/client';

/**
 * List diagnostic test kits & availability by facility.
 * GET /api/v1/diagnostics
 */
export async function getDiagnosticItems(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : (typeof req.query.search === 'string' ? req.query.search.trim() : '');
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const facilityId = typeof req.query.facilityId === 'string' ? req.query.facilityId.trim() : '';
    const status = typeof req.query.status === 'string' ? req.query.status.trim() : '';

    const where: any = {};

    if (q) {
      where.OR = [
        { testName: { contains: q, mode: 'insensitive' } },
        { testNameHi: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (category && category !== 'ALL') {
      where.category = { contains: category, mode: 'insensitive' };
    }

    if (facilityId) {
      const targetFac = await prisma.facility.findFirst({
        where: {
          OR: [
            { id: facilityId },
            { hfrId: { equals: facilityId, mode: 'insensitive' as const } },
            { name: { contains: facilityId, mode: 'insensitive' as const } },
            ...(facilityId.toLowerCase().includes('sanjivani') ? [{ name: { contains: 'sanjivani', mode: 'insensitive' as const } }] : []),
          ],
        },
      });
      if (targetFac) {
        where.facilityId = targetFac.id;
      } else {
        where.facilityId = facilityId;
      }
    }

    if (status && status !== 'ALL') {
      where.status = status as DiagnosticStatus;
    }

    const items = await (prisma as any).diagnosticItem.findMany({
      where,
      orderBy: [{ status: 'asc' }, { testName: 'asc' }],
      include: {
        facility: {
          select: {
            id: true,
            name: true,
            hfrId: true,
            facilityType: true,
            district: true,
            state: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: { diagnosticItems: items },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get diagnostic test kit by ID or code.
 * GET /api/v1/diagnostics/:id
 */
export async function getDiagnosticItemById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const item = await (prisma as any).diagnosticItem.findFirst({
      where: {
        OR: [{ id }, { code: id }],
      },
      include: { facility: true },
    });

    if (!item) {
      throw new AppError(`Diagnostic kit '${id}' not found in laboratory catalog`, 404);
    }

    res.status(200).json({
      success: true,
      data: { diagnosticItem: item },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update diagnostic stock level & status.
 * PATCH /api/v1/diagnostics/:id/stock
 */
export async function updateDiagnosticStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { kitsAvailable, status, minKitsLevel } = req.body;

    const existing = await (prisma as any).diagnosticItem.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new AppError(`Diagnostic kit '${id}' not found`, 404);
    }

    const newKits = typeof kitsAvailable === 'number' ? Math.max(0, kitsAvailable) : existing.kitsAvailable;
    const newMin = typeof minKitsLevel === 'number' ? Math.max(1, minKitsLevel) : existing.minKitsLevel;

    let computedStatus: DiagnosticStatus = existing.status;
    if (status && Object.values(DiagnosticStatus).includes(status)) {
      computedStatus = status as DiagnosticStatus;
    } else if (typeof kitsAvailable === 'number') {
      if (newKits <= 0) {
        computedStatus = DiagnosticStatus.OUT_OF_STOCK;
      } else if (newKits <= newMin) {
        computedStatus = DiagnosticStatus.LOW_STOCK;
      } else {
        computedStatus = DiagnosticStatus.AVAILABLE;
      }
    }

    const updated = await (prisma as any).diagnosticItem.update({
      where: { id },
      data: {
        kitsAvailable: newKits,
        minKitsLevel: newMin,
        status: computedStatus,
      },
      include: { facility: true },
    });

    res.status(200).json({
      success: true,
      message: `Diagnostic kit '${updated.testName}' stock updated`,
      data: { diagnosticItem: updated },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create a new diagnostic kit entry.
 * POST /api/v1/diagnostics
 */
export async function createDiagnosticItem(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      code,
      testName,
      testNameHi,
      category,
      kitsAvailable = 0,
      minKitsLevel = 10,
      status,
      batch,
      expiryDate,
      facilityId,
    } = req.body;

    if (!code || !testName || !facilityId) {
      throw new AppError('code, testName, and facilityId are required', 400);
    }

    let facility = await prisma.facility.findFirst({
      where: {
        OR: [
          { id: facilityId },
          { hfrId: { equals: facilityId, mode: 'insensitive' as const } },
          { name: { contains: facilityId, mode: 'insensitive' as const } },
          ...(facilityId.toLowerCase().includes('sanjivani') ? [{ name: { contains: 'sanjivani', mode: 'insensitive' as const } }] : []),
        ],
      },
    });
    if (!facility) {
      facility = await prisma.facility.findFirst({
        where: { name: { contains: 'sanjivani', mode: 'insensitive' } },
      });
    }
    if (!facility) {
      facility = await prisma.facility.findFirst();
    }
    if (!facility) {
      throw new AppError(`Facility '${facilityId}' not found`, 404);
    }

    let initialStatus: DiagnosticStatus = DiagnosticStatus.AVAILABLE;
    if (status && Object.values(DiagnosticStatus).includes(status)) {
      initialStatus = status as DiagnosticStatus;
    } else if (kitsAvailable <= 0) {
      initialStatus = DiagnosticStatus.OUT_OF_STOCK;
    } else if (kitsAvailable <= minKitsLevel) {
      initialStatus = DiagnosticStatus.LOW_STOCK;
    }

    const item = await (prisma as any).diagnosticItem.create({
      data: {
        code,
        testName,
        testNameHi,
        category: category || 'Rapid Diagnostic',
        kitsAvailable: Math.max(0, kitsAvailable),
        minKitsLevel: Math.max(1, minKitsLevel),
        status: initialStatus,
        batch,
        expiryDate,
        facilityId: facility.id,
        facilityName: facility.name,
      },
      include: { facility: true },
    });

    res.status(201).json({
      success: true,
      message: `Diagnostic test kit '${testName}' added`,
      data: { diagnosticItem: item },
    });
  } catch (err) {
    next(err);
  }
}
