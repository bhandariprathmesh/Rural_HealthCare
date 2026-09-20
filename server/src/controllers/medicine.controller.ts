import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';

/**
 * List dispensary medicines & stock levels.
 * GET /api/v1/medicines
 */
export async function getMedicines(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : (typeof req.query.search === 'string' ? req.query.search.trim() : '');
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : '';
    const facilityId = typeof req.query.facilityId === 'string' ? req.query.facilityId.trim() : '';
    const lowStock = req.query.lowStock === 'true';
    const availability = typeof req.query.availability === 'string' ? req.query.availability.trim() : '';

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { genericName: { contains: q, mode: 'insensitive' } },
        { brand: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (category && category !== 'ALL') {
      where.category = { contains: category, mode: 'insensitive' };
    }
    if (facilityId) {
      where.facilityId = facilityId;
    }
    if (lowStock) {
      where.isLowStock = true;
    }
    if (availability && availability !== 'ALL') {
      where.availability = availability;
    }

    const medicines = await prisma.medicine.findMany({
      where,
      orderBy: { name: 'asc' },
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
      data: { medicines },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get medicine details by ID or code.
 * GET /api/v1/medicines/:id
 */
export async function getMedicineById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;

    const medicine = await prisma.medicine.findFirst({
      where: {
        OR: [{ id }, { code: id }],
      },
      include: { facility: true },
    });

    if (!medicine) {
      throw new AppError(`Medicine '${id}' not found in dispensary catalog`, 404);
    }

    res.status(200).json({
      success: true,
      data: { medicine },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Update stock level for a medicine.
 * PATCH /api/v1/medicines/:id/stock
 */
export async function updateMedicineStock(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.id;
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    const { stock, minStockLevel, availability } = req.body;

    const existing = await prisma.medicine.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError(`Medicine '${id}' not found`, 404);
    }

    const newStock = typeof stock === 'number' ? Math.max(0, stock) : existing.stock;
    const newMin = typeof minStockLevel === 'number' ? Math.max(1, minStockLevel) : existing.minStockLevel;
    const isLow = newStock <= newMin && newStock > 0;

    let computedAvailability = availability;
    if (!computedAvailability) {
      if (newStock <= 0) {
        computedAvailability = 'Out of Stock';
      } else if (isLow) {
        computedAvailability = 'Low Stock';
      } else {
        computedAvailability = 'In Stock';
      }
    }

    const updated = await prisma.medicine.update({
      where: { id },
      data: {
        stock: newStock,
        minStockLevel: newMin,
        isLowStock: isLow || newStock <= 0,
        availability: computedAvailability,
      },
      include: { facility: true },
    });

    res.status(200).json({
      success: true,
      message: `Medicine '${updated.name}' stock updated`,
      data: { medicine: updated },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get comprehensive facility stock summary (both medicines and diagnostic kits).
 * GET /api/v1/medicines/facilities/:facilityId/stock-summary
 */
export async function getFacilityStockSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.facilityId;
    const facilityId = Array.isArray(rawId) ? rawId[0] : rawId;

    // Find facility by ID or name
    let facility = await prisma.facility.findFirst({
      where: {
        OR: [
          { id: facilityId },
          { hfrId: facilityId },
          { name: { contains: facilityId, mode: 'insensitive' } },
        ],
      },
    });

    // Fallback if not found: find first facility or Sanjivani PHC
    if (!facility) {
      facility = await prisma.facility.findFirst({
        where: { name: { contains: 'Sanjivani', mode: 'insensitive' } },
      });
    }
    if (!facility) {
      facility = await prisma.facility.findFirst();
    }

    const targetFacId = facility?.id;

    const medicines = targetFacId
      ? await prisma.medicine.findMany({
          where: { facilityId: targetFacId },
          orderBy: { name: 'asc' },
        })
      : [];

    const diagnosticItems = targetFacId
      ? await (prisma as any).diagnosticItem.findMany({
          where: { facilityId: targetFacId },
          orderBy: { testName: 'asc' },
        })
      : [];

    const medStats = {
      total: medicines.length,
      inStock: medicines.filter(m => m.stock > m.minStockLevel).length,
      lowStock: medicines.filter(m => m.stock > 0 && m.stock <= m.minStockLevel).length,
      outOfStock: medicines.filter(m => m.stock <= 0).length,
    };

    const diagnosticStats = {
      total: diagnosticItems.length,
      available: diagnosticItems.filter((d: any) => d.status === 'AVAILABLE').length,
      lowStock: diagnosticItems.filter((d: any) => d.status === 'LOW_STOCK').length,
      outOfStock: diagnosticItems.filter((d: any) => d.status === 'OUT_OF_STOCK').length,
    };

    res.status(200).json({
      success: true,
      data: {
        facility,
        medicines,
        diagnosticItems,
        stats: {
          medicines: medStats,
          diagnostics: diagnosticStats,
          hasCriticalShortages: medStats.outOfStock > 0 || diagnosticStats.outOfStock > 0,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
