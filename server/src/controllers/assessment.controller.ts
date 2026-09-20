import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';
import { checkPatientAccess } from '../services/accessControl.service.js';
import { xgboostRiskEngine } from '../services/ai/xgboostRiskEngine.js';

const vitalsSchema = z.object({
  temp: z.union([z.string(), z.number()]).optional(),
  bp: z.string().optional(),
  hr: z.union([z.string(), z.number()]).optional(),
  spo2: z.union([z.string(), z.number()]).optional(),
  weight: z.union([z.string(), z.number()]).optional(),
});

const generateAssessmentSchema = z.object({
  patientId: z.string().min(1),
  symptoms: z.array(z.string()),
  standardizedSymptomCodes: z.array(z.string()).optional(),
  vitals: vitalsSchema,
  obs: z.string().optional(),
});

const predictRiskSchema = z.object({
  age: z.number().optional(),
  gender: z.string().optional(),
  vitals: vitalsSchema,
  symptoms: z.array(z.string()).default([]),
  standardizedSymptomCodes: z.array(z.string()).optional(),
  obs: z.string().optional(),
});

/**
 * Real-time XGBoost Risk Inference (without saving).
 * POST /api/v1/assessments/predict-risk
 */
export async function predictRisk(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = predictRiskSchema.parse(req.body);
    const result = xgboostRiskEngine.predict({
      age: data.age,
      gender: data.gender,
      vitals: data.vitals,
      symptoms: data.symptoms,
      standardizedSymptomCodes: data.standardizedSymptomCodes,
      obs: data.obs,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Generate and persist clinical AI risk assessment with XGBoost and consent verification.
 * POST /api/v1/assessments/generate
 */
export async function generateAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = generateAssessmentSchema.parse(req.body);
    const user = (req as any).user;
    const emergencyToken = (req.headers['x-emergency-token'] || req.headers['emergency-token']) as string | undefined;

    // Consent-First Authorization Check
    const access = await checkPatientAccess({
      user,
      patientIdOrHealthId: data.patientId,
      requiredScope: 'HEALTH_ASSESSMENT',
      emergencyToken,
    });

    if (!access.hasAccess || !access.patient) {
      throw new AppError(
        access.reason || 'Patient consent required to record health assessment, symptoms, and vitals.',
        403
      );
    }

    const patient = access.patient;

    // Execute XGBoost Clinical Stratification Model
    const prediction = xgboostRiskEngine.predict({
      age: patient.age,
      gender: patient.gender,
      vitals: data.vitals,
      symptoms: data.symptoms,
      standardizedSymptomCodes: data.standardizedSymptomCodes,
      obs: data.obs,
    });

    const assessmentCode = `ASMT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const assessment = await prisma.aIAssessment.create({
      data: {
        assessmentCode,
        patientId: patient.id,
        riskLevel: prediction.riskLevel,
        symptomsConsidered: data.symptoms,
        standardizedSymptomCodes: prediction.standardizedCodes,
        abnormalVitals: prediction.abnormalVitals,
        riskFactors: [
          `Age: ${patient.age}`,
          ...(patient.chronicConditions || []),
        ],
        reasoning: prediction.reasoning,
        recommendedAction: prediction.recommendedAction,
        confidence: prediction.confidence,
        riskProbabilities: prediction.probabilities as any,
        modelVersion: prediction.modelVersion,
        generatedAt: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
      },
      include: {
        patient: {
          select: {
            id: true,
            healthId: true,
            name: true,
            age: true,
            gender: true,
            village: true,
            chronicConditions: true,
            currentMedications: true,
          },
        },
      },
    });

    // Update patient's current risk level if elevated
    if (prediction.riskLevel === 'HIGH' || prediction.riskLevel === 'CRITICAL') {
      await prisma.patient.update({
        where: { id: patient.id },
        data: { riskLevel: prediction.riskLevel },
      }).catch(() => {});
    }

    res.status(201).json({
      success: true,
      message: `AI Risk Assessment generated via ${prediction.modelVersion}`,
      data: {
        assessment,
        prediction,
      },
    });
  } catch (err) {
    next(err);
  }
}
