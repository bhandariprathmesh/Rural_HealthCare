import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { RiskLevel } from '@prisma/client';
import { AppError } from '../middleware/error.js';
import { checkPatientAccess } from '../services/accessControl.service.js';

const generateAssessmentSchema = z.object({
  patientId: z.string().min(1),
  symptoms: z.array(z.string()),
  vitals: z.object({
    temp: z.string(),
    bp: z.string(),
    hr: z.string(),
    spo2: z.string(),
    weight: z.string()
  }),
  obs: z.string().optional()
});

export async function generateAssessment(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = generateAssessmentSchema.parse(req.body);
    
    // Simple rule-based AI mocking for the "Real AI Risk Score"
    let riskLevel: RiskLevel = 'LOW';
    let reasoning = 'Patient shows stable vitals and non-severe symptoms. Routine monitoring is sufficient.';
    let recommendedAction = 'Routine monitoring and rest.';
    let confidence = 95;
    const abnormalVitals: string[] = [];

    const temp = parseFloat(data.vitals.temp);
    const hr = parseFloat(data.vitals.hr);
    const spo2 = parseFloat(data.vitals.spo2);
    
    if (temp < 36 || temp > 37.5) abnormalVitals.push(`Temp: ${data.vitals.temp}°C`);
    if (hr < 60 || hr > 100) abnormalVitals.push(`HR: ${data.vitals.hr} bpm`);
    if (spo2 < 95) abnormalVitals.push(`SpO2: ${data.vitals.spo2}%`);

    if (spo2 < 90 || hr > 120) {
      riskLevel = 'CRITICAL';
      reasoning = 'Critical abnormalities in vitals (low SpO2 or high HR) detected. Immediate emergency response is required.';
      recommendedAction = 'Immediate hospital transfer. Administer oxygen if available.';
      confidence = 98;
    } else if (spo2 < 95 || (temp > 39) || data.symptoms.includes('Shortness of breath')) {
      riskLevel = 'HIGH';
      reasoning = 'High risk due to abnormal vitals and/or severe symptoms. Urgent medical attention needed.';
      recommendedAction = 'Refer to the nearest PHC immediately for doctor evaluation.';
      confidence = 92;
    } else if (abnormalVitals.length > 0 || data.symptoms.length > 2) {
      riskLevel = 'MODERATE';
      reasoning = 'Moderate risk based on mild abnormalities or multiple symptoms.';
      recommendedAction = 'Consult with a doctor via tele-consultation within 24 hours.';
      confidence = 88;
    }

    const assessmentCode = `ASMT-${Date.now()}`;

    // Consent-First Authorization Check
    const user = (req as any).user;
    const emergencyToken = (req.headers['x-emergency-token'] || req.headers['emergency-token']) as string | undefined;

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

    const assessment = await prisma.aIAssessment.create({
      data: {
        assessmentCode,
        patientId: patient.id,
        riskLevel,
        symptomsConsidered: data.symptoms,
        abnormalVitals,
        riskFactors: ['Age', 'Location'], // Mocked
        reasoning,
        recommendedAction,
        confidence,
        generatedAt: new Date().toLocaleString(),
      }
    });

    res.status(201).json({
      success: true,
      data: {
        assessment
      }
    });
  } catch (err) {
    next(err);
  }
}
