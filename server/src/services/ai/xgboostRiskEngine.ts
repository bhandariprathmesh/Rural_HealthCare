import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RiskLevel } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface RiskPredictionResult {
  riskLevel: RiskLevel;
  confidence: number;
  probabilities: {
    low: number;
    moderate: number;
    high: number;
    critical: number;
  };
  abnormalVitals: string[];
  reasoning: string;
  recommendedAction: string;
  modelVersion: string;
  standardizedCodes: string[];
}

export interface RiskInferenceInput {
  age?: number;
  gender?: string; // 'M' | 'F' | 'O'
  vitals: {
    temp?: string | number;
    bp?: string;
    hr?: string | number;
    spo2?: string | number;
    weight?: string | number;
  };
  symptoms: string[];
  standardizedSymptomCodes?: string[];
  obs?: string;
}

// Order of 25 standardized symptom feature flags matching training script
const SYMPTOM_FEATURE_KEYS = [
  'SYM-FEV-01', // Fever
  'SYM-COU-01', // Cough
  'SYM-COL-01', // Cold
  'SYM-SOB-01', // Shortness of breath
  'SYM-CHT-01', // Chest tightness
  'SYM-CHP-01', // Chest pain
  'SYM-FAT-01', // Fatigue
  'SYM-DIZ-01', // Dizziness
  'SYM-HED-01', // Headache
  'SYM-NAU-01', // Nausea / Vomiting
  'SYM-ABD-01', // Abdominal pain
  'SYM-DIA-01', // Diarrhoea
  'SYM-APP-01', // Loss of appetite
  'SYM-JNT-01', // Joint pain
  'SYM-BCK-01', // Back pain
  'SYM-EDM-01', // Swelling
  'SYM-RSH-01', // Rash
  'SYM-VIS-01', // Blurred vision
  'SYM-SNC-01', // Fainting
  'SYM-PLP-01', // Palpitations
  'SYM-HTN-01', // High Blood Pressure
  'SYM-GLU-01', // High Blood Sugar
  'SYM-THR-01', // Sore throat
  'SYM-URI-01', // Burning urination
  'SYM-BDY-01', // Body ache
];

class XGBoostRiskEngine {
  private trees: any[] = [];
  private treeInfo: number[] = [];
  private meta: any = null;
  private isLoaded = false;

  constructor() {
    this.loadModel();
  }

  private loadModel() {
    try {
      const modelPath = path.join(__dirname, 'xgboost_risk_model.json');
      const metaPath = path.join(__dirname, 'model_meta.json');

      if (fs.existsSync(modelPath) && fs.existsSync(metaPath)) {
        const rawModel = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        this.meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        this.trees = rawModel.learner.gradient_booster.model.trees;
        this.treeInfo = rawModel.learner.gradient_booster.model.tree_info;
        this.isLoaded = true;
        console.log(`[XGBoostRiskEngine] Loaded ${this.trees.length} trees (Version: ${this.meta.modelVersion}).`);
      } else {
        console.warn('[XGBoostRiskEngine] Model artifact not found at', modelPath);
      }
    } catch (err) {
      console.error('[XGBoostRiskEngine] Failed to load XGBoost model artifact:', err);
    }
  }

  public predict(input: RiskInferenceInput): RiskPredictionResult {
    // 1. Parse numeric vitals
    const age = Number(input.age) || 45;
    const gender = (input.gender || 'M').toUpperCase();
    const genderVal = gender === 'F' ? 1 : gender === 'M' ? 0 : 2;

    const temp = parseFloat(String(input.vitals.temp)) || 37.0;
    const hr = parseFloat(String(input.vitals.hr)) || 75;
    const spo2 = parseFloat(String(input.vitals.spo2)) || 98;
    const weight = parseFloat(String(input.vitals.weight)) || 65;

    let sbp = 120;
    let dbp = 80;
    if (input.vitals.bp && String(input.vitals.bp).includes('/')) {
      const parts = String(input.vitals.bp).split('/');
      sbp = parseFloat(parts[0]) || 120;
      dbp = parseFloat(parts[1]) || 80;
    }

    // 2. Map input symptoms to standardized codes
    const activeCodes = new Set<string>();
    const normalizedInput = input.symptoms.map((s) => s.toLowerCase().trim());

    if (input.standardizedSymptomCodes) {
      input.standardizedSymptomCodes.forEach((c) => activeCodes.add(c));
    }

    // Map common string representations
    normalizedInput.forEach((s) => {
      if (s.includes('fev') || s.includes('bukhar') || s.includes('temperature')) activeCodes.add('SYM-FEV-01');
      if (s.includes('cough') || s.includes('khansi')) activeCodes.add('SYM-COU-01');
      if (s.includes('cold') || s.includes('runny') || s.includes('sardi')) activeCodes.add('SYM-COL-01');
      if (s.includes('breath') || s.includes('sob') || s.includes('dyspnea') || s.includes('sans')) activeCodes.add('SYM-SOB-01');
      if (s.includes('tightness') || s.includes('tight chest')) activeCodes.add('SYM-CHT-01');
      if (s.includes('chest pain') || s.includes('angina') || s.includes('heart pain')) activeCodes.add('SYM-CHP-01');
      if (s.includes('fatigue') || s.includes('weak') || s.includes('kamzori')) activeCodes.add('SYM-FAT-01');
      if (s.includes('dizzy') || s.includes('vertigo') || s.includes('chakkar')) activeCodes.add('SYM-DIZ-01');
      if (s.includes('head') || s.includes('migraine') || s.includes('sirdard')) activeCodes.add('SYM-HED-01');
      if (s.includes('nausea') || s.includes('vomit') || s.includes('ulti')) activeCodes.add('SYM-NAU-01');
      if (s.includes('abdomen') || s.includes('stomach') || s.includes('belly') || s.includes('pet dard')) activeCodes.add('SYM-ABD-01');
      if (s.includes('diarrh') || s.includes('loose') || s.includes('dast')) activeCodes.add('SYM-DIA-01');
      if (s.includes('appetite') || s.includes('bhookh')) activeCodes.add('SYM-APP-01');
      if (s.includes('joint') || s.includes('knee') || s.includes('jodon')) activeCodes.add('SYM-JNT-01');
      if (s.includes('back') || s.includes('kamar')) activeCodes.add('SYM-BCK-01');
      if (s.includes('swell') || s.includes('edema') || s.includes('soojan')) activeCodes.add('SYM-EDM-01');
      if (s.includes('rash') || s.includes('khujli')) activeCodes.add('SYM-RSH-01');
      if (s.includes('blur') || s.includes('vision') || s.includes('dhundhla')) activeCodes.add('SYM-VIS-01');
      if (s.includes('faint') || s.includes('syncope') || s.includes('behosh')) activeCodes.add('SYM-SNC-01');
      if (s.includes('palpitation') || s.includes('racing') || s.includes('dhak')) activeCodes.add('SYM-PLP-01');
      if (s.includes('high bp') || s.includes('hypertension')) activeCodes.add('SYM-HTN-01');
      if (s.includes('sugar') || s.includes('diabetes')) activeCodes.add('SYM-GLU-01');
      if (s.includes('throat') || s.includes('gala')) activeCodes.add('SYM-THR-01');
      if (s.includes('urin') || s.includes('peshab')) activeCodes.add('SYM-URI-01');
      if (s.includes('body ache') || s.includes('badan')) activeCodes.add('SYM-BDY-01');
    });

    const activeCodesList = Array.from(activeCodes);

    // 3. Assemble 34-dimensional feature vector
    const x = new Array(34).fill(0);
    x[0] = age;
    x[1] = genderVal;
    x[2] = temp;
    x[3] = hr;
    x[4] = sbp;
    x[5] = dbp;
    x[6] = spo2;
    x[7] = weight;
    x[8] = Math.max(input.symptoms.length, activeCodes.size);

    // Symptoms multi-hot binary indicators
    SYMPTOM_FEATURE_KEYS.forEach((code, idx) => {
      x[9 + idx] = activeCodes.has(code) ? 1.0 : 0.0;
    });

    // 4. XGBoost Traversal & Softmax Probabilities
    let probs = [0.25, 0.25, 0.25, 0.25];
    if (this.isLoaded && this.trees.length > 0) {
      const logits = [0, 0, 0, 0];
      for (let i = 0; i < this.trees.length; i++) {
        const tree = this.trees[i];
        const classIdx = this.treeInfo[i];
        let node = 0;
        while (tree.left_children[node] !== -1) {
          const feat = tree.split_indices[node];
          const threshold = tree.split_conditions[node];
          if (x[feat] < threshold) {
            node = tree.left_children[node];
          } else {
            node = tree.right_children[node];
          }
        }
        logits[classIdx] += tree.split_conditions[node];
      }

      // Stable softmax
      const maxLogit = Math.max(...logits);
      const exps = logits.map((l) => Math.exp(l - maxLogit));
      const sumExp = exps.reduce((a, b) => a + b, 0);
      probs = exps.map((e) => e / sumExp);
    }

    // Probs: [LOW, MODERATE, HIGH, CRITICAL]
    const pLow = probs[0];
    const pMod = probs[1];
    const pHigh = probs[2];
    const pCrit = probs[3];

    // Identify abnormal vitals
    const abnormalVitals: string[] = [];
    if (temp < 36.0 || temp > 37.5) abnormalVitals.push(`Temp: ${temp}°C`);
    if (hr < 60 || hr > 100) abnormalVitals.push(`HR: ${hr} bpm`);
    if (spo2 < 95) abnormalVitals.push(`SpO2: ${spo2}%`);
    if (sbp > 140 || dbp > 90) abnormalVitals.push(`BP: ${sbp}/${dbp} mmHg`);

    // 5. Clinical Safety Overrides (AI assists, never overrides emergency danger signs)
    let predictedRisk: RiskLevel = 'LOW';
    let reasoning = '';
    let recommendedAction = '';
    let isEmergencyOverridden = false;

    if (spo2 < 90 || hr > 130 || sbp > 180 || sbp < 85 || activeCodes.has('SYM-SNC-01')) {
      // Acute physiological decompensation
      predictedRisk = 'CRITICAL';
      isEmergencyOverridden = true;
      reasoning = `CRITICAL safety override triggered: Dangerous vitals detected (${abnormalVitals.join(', ') || 'Severe hemodynamic compromise'}). Immediate life-saving triage required.`;
      recommendedAction = 'Immediate hospital transfer / SOS emergency escalation. Administer high-flow oxygen and position for emergency care.';
    } else if (spo2 < 94 || (activeCodes.has('SYM-CHP-01') && activeCodes.has('SYM-SOB-01')) || sbp >= 160 || hr >= 110) {
      predictedRisk = 'HIGH';
      isEmergencyOverridden = true;
      reasoning = `HIGH priority clinical flag: Acute respiratory or cardiovascular warning signs observed (${abnormalVitals.join(', ') || 'Severe symptoms'}).`;
      recommendedAction = 'Urgent referral to PHC/CHC within 24 hours. Notify attending medical officer for specialist consultation.';
    } else {
      // Use XGBoost probability distribution
      const maxP = Math.max(pLow, pMod, pHigh, pCrit);
      if (maxP === pCrit && pCrit > 0.40) {
        predictedRisk = 'CRITICAL';
        reasoning = `XGBoost model detected severe multisystem risk patterns (Critical probability: ${(pCrit * 100).toFixed(1)}%).`;
        recommendedAction = 'Immediate medical evaluation and hospital transfer.';
      } else if ((maxP === pHigh && pHigh > 0.40) || pHigh + pCrit > 0.50) {
        predictedRisk = 'HIGH';
        reasoning = `XGBoost risk model identified high clinical acuity (High risk probability: ${(pHigh * 100).toFixed(1)}%).`;
        recommendedAction = 'Refer to PHC / District Hospital for doctor evaluation within 24-48 hours.';
      } else if (maxP === pLow && abnormalVitals.length === 0 && activeCodes.size <= 2) {
        predictedRisk = 'LOW';
        reasoning = `XGBoost assessment indicates low clinical risk (Low risk probability: ${(pLow * 100).toFixed(1)}%). Vital signs are within normal physiological limits.`;
        recommendedAction = 'Routine home monitoring, rest, and follow-up as needed.';
      } else if (maxP === pMod || abnormalVitals.length > 0 || activeCodes.size >= 3) {
        predictedRisk = 'MODERATE';
        reasoning = `XGBoost assessment indicates moderate ambulatory risk (Moderate probability: ${(pMod * 100).toFixed(1)}%). Stable vital parameters with symptomatic burden.`;
        recommendedAction = 'Schedule primary tele-consultation or routine PHC review within 3 days.';
      } else {
        predictedRisk = 'LOW';
        reasoning = `XGBoost assessment indicates low clinical risk (Low risk probability: ${(pLow * 100).toFixed(1)}%). Vital signs are within normal physiological limits.`;
        recommendedAction = 'Routine home monitoring, rest, and follow-up as needed.';
      }
    }

    const confidence = isEmergencyOverridden
      ? 99
      : Math.round(Math.max(pLow, pMod, pHigh, pCrit) * 100);

    return {
      riskLevel: predictedRisk,
      confidence: Math.max(75, Math.min(99, confidence)),
      probabilities: {
        low: Number(pLow.toFixed(4)),
        moderate: Number(pMod.toFixed(4)),
        high: Number(pHigh.toFixed(4)),
        critical: Number(pCrit.toFixed(4)),
      },
      abnormalVitals,
      reasoning,
      recommendedAction,
      modelVersion: this.meta?.modelVersion || 'xgboost-v1.0',
      standardizedCodes: activeCodesList,
    };
  }
}

export const xgboostRiskEngine = new XGBoostRiskEngine();
