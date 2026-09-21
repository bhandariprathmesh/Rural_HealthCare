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

/**
 * Create a new medicine stock item.
 * POST /api/v1/medicines
 */
export async function createMedicine(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      name,
      genericName,
      brand,
      dosageForm = 'Tablet',
      strength = '',
      category = 'Essential Medicine',
      stock = 0,
      minStockLevel = 10,
      batch,
      expiryDate,
      supplier,
      facilityId,
      facilityName,
      unitPrice = 0.0,
      code,
    } = req.body;

    if (!name || !genericName) {
      throw new AppError('Medicine name and genericName are required', 400);
    }

    let targetFacility = null;
    if (facilityId) {
      targetFacility = await prisma.facility.findFirst({
        where: {
          OR: [{ id: facilityId }, { hfrId: facilityId }, { name: { contains: facilityId, mode: 'insensitive' } }],
        },
      });
    }
    if (!targetFacility) {
      targetFacility = await prisma.facility.findFirst({
        where: { name: { contains: 'Sanjivani', mode: 'insensitive' } },
      });
    }
    if (!targetFacility) {
      targetFacility = await prisma.facility.findFirst();
    }

    const cleanCode =
      code ||
      `MED-${name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}-${targetFacility?.hfrId || 'PHC'}`;

    const numStock = typeof stock === 'number' ? Math.max(0, stock) : parseInt(stock, 10) || 0;
    const numMin = typeof minStockLevel === 'number' ? Math.max(1, minStockLevel) : parseInt(minStockLevel, 10) || 10;
    const isLow = numStock <= numMin && numStock > 0;
    const availability = numStock <= 0 ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock';

    const medicine = await prisma.medicine.create({
      data: {
        code: cleanCode,
        name,
        genericName,
        brand: brand || null,
        dosageForm,
        strength,
        category,
        stock: numStock,
        minStockLevel: numMin,
        isLowStock: isLow || numStock <= 0,
        availability,
        batch: batch || `BATCH-${Date.now().toString().slice(-6)}`,
        expiryDate: expiryDate || '2027-12-31',
        supplier: supplier || 'Government Medical Supplies Depot',
        facilityId: targetFacility?.id,
        facilityName: targetFacility?.name || facilityName,
        unitPrice: parseFloat(unitPrice) || 0.0,
      },
      include: { facility: true },
    });

    res.status(201).json({
      success: true,
      message: `Medicine '${medicine.name}' added to inventory`,
      data: { medicine },
    });
  } catch (err) {
    next(err);
  }
}

