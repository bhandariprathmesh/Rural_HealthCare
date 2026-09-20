import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

/**
 * List or search standardized symptoms.
 * GET /api/v1/symptoms?q=fev
 */
export async function getSymptoms(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const rawQuery = req.query.q;
    const query = typeof rawQuery === 'string' ? rawQuery.trim().toLowerCase() : '';

    const allSymptoms = await prisma.symptom.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    if (!query) {
      res.status(200).json({
        success: true,
        data: { symptoms: allSymptoms, total: allSymptoms.length },
      });
      return;
    }

    // High-performance matching: exact code, prefix match, synonym match, or substring match
    const scored = allSymptoms
      .map((sym) => {
        const nameLower = sym.name.toLowerCase();
        const codeLower = sym.code.toLowerCase();
        const nameHi = sym.nameHi ? sym.nameHi.toLowerCase() : '';
        const synonyms = (sym.synonyms || []).map((s) => s.toLowerCase());

        let score = 0;
        if (codeLower === query || nameLower === query) score += 100;
        else if (nameLower.startsWith(query)) score += 60;
        else if (synonyms.some((s) => s === query)) score += 50;
        else if (synonyms.some((s) => s.startsWith(query))) score += 40;
        else if (nameLower.includes(query)) score += 30;
        else if (nameHi.includes(query)) score += 30;
        else if (synonyms.some((s) => s.includes(query))) score += 20;

        return { symptom: sym, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.symptom);

    res.status(200).json({
      success: true,
      data: { symptoms: scored, total: scored.length },
    });
  } catch (err) {
    next(err);
  }
}

