import { useState, useEffect } from 'react';
import { AI_ASSESSMENTS, PATIENTS } from '../data';
import { RiskBadge, Card, AIDisclaimer, Icon } from '../components/shared';
import { getAiAssessments } from '../api/client';

interface Props { navigate: (s: string, id?: string) => void; }

export default function AIRiskAssessment({ navigate }: Props) {
  const [assessments, setAssessments] = useState(AI_ASSESSMENTS);
  const [activeCase, setActiveCase] = useState(0);

  useEffect(() => {
    getAiAssessments()
      .then(items => {
        if (items && items.length > 0) {
          setAssessments(items.map((a: any) => ({
            id: a.assessmentCode || a.id,
            consultationId: a.consultationId,
            patientId: a.patient?.healthId || a.patientId,
            riskLevel: (a.riskLevel?.toLowerCase() || 'moderate') as any,
            symptomsConsidered: a.symptomsConsidered || [],
            abnormalVitals: a.abnormalVitals || [],
            riskFactors: a.riskFactors || [],
            reasoning: a.reasoning,
            recommendedAction: a.recommendedAction,
            confidence: a.confidence || 85,
            riskProbabilities: a.riskProbabilities || null,
            modelVersion: a.modelVersion || 'xgboost-v1.0',
            standardizedSymptomCodes: a.standardizedSymptomCodes || [],
            generatedAt: new Date(a.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          })));
        }
      })
      .catch(() => {});
  }, []);

  const assessment = assessments[activeCase] || AI_ASSESSMENTS[0];
  const patientFound = PATIENTS.find(p => p.id === assessment.patientId);
  const patient: any = patientFound ?? {
    id: assessment.patientId,
    name: 'Patient',
    age: '--',
    gender: 'M',
    village: '',
    chronicConditions: [],
    currentMedications: [],
  };

  const riskColors = {
    low: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', icon: 'bg-green-100', ring: 'ring-green-300' },
    moderate: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'bg-amber-100', ring: 'ring-amber-300' },
    high: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'bg-red-100', ring: 'ring-red-300' },
    critical: { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-900', icon: 'bg-red-200', ring: 'ring-red-400' },
  };
  const riskKey = assessment.riskLevel.toLowerCase() as keyof typeof riskColors;
  const rc = riskColors[riskKey] || riskColors.low;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('health-assessment')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">AI Risk Assessment</h1>
          <p className="text-xs text-gray-500">AI-assisted clinical decision support</p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {assessments.map((a, i) => {
          const p = PATIENTS.find(pt => pt.id === a.patientId);
          return (
            <button key={a.id} onClick={() => setActiveCase(i)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${i === activeCase ? 'bg-brand-600 text-white border-brand-600' : 'bg-white border-gray-200 text-gray-600 hover:border-brand-300'}`}>
              <div className={`w-2 h-2 rounded-full ${a.riskLevel === 'critical' ? 'bg-red-500' : 'bg-amber-500'}`} />
              {p?.name || a.patientId}
            </button>
          );
        })}
      </div>

      <AIDisclaimer />

      <div className="flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-2xl">
        <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-sm">
          {patient.name.split(' ').map((w: string) => w[0]).join('')}
        </div>
        <div className="flex-1">
          <div className="font-medium text-gray-900 text-sm">{patient.name}</div>
          <div className="text-xs text-gray-500">{patient.age} · {patient.gender === 'M' ? 'Male' : 'Female'} · {patient.village}</div>
          <div className="font-mono text-[10px] text-gray-400 mt-0.5">{patient.id}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 font-mono">{assessment.generatedAt}</div>
          <div className="text-xs text-gray-500 mt-0.5">Confidence: <strong className="text-gray-800">{assessment.confidence}%</strong></div>
        </div>
      </div>

      <div className={`rounded-2xl border-2 p-6 ${rc.bg} ${rc.border}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                AI Risk Stratification
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-white/80 border border-gray-200 rounded text-gray-600 font-medium">
                {assessment.modelVersion || 'XGBoost v1.0'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className={`w-16 h-16 rounded-2xl ${rc.icon} flex items-center justify-center ring-4 ${rc.ring}`}>
                <Icon name="alert" size={28} className={rc.text} />
              </div>
              <div>
                <RiskBadge level={riskKey} size="lg" />
                <div className={`text-sm font-medium mt-1 ${rc.text}`}>
                  {riskKey === 'critical' && 'Requires IMMEDIATE emergency action'}
                  {riskKey === 'high' && 'Requires urgent medical attention'}
                  {riskKey === 'moderate' && 'Requires prompt clinical evaluation'}
                  {riskKey === 'low' && 'Routine monitoring recommended'}
                </div>
              </div>
            </div>
          </div>
          <div className="relative w-20 h-20 shrink-0">
            <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle cx="18" cy="18" r="15.9" fill="none" stroke={riskKey === 'critical' ? '#dc2626' : '#f59e0b'} strokeWidth="3"
                strokeDasharray={`${assessment.confidence} ${100 - assessment.confidence}`} strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-sm font-bold text-gray-800">{assessment.confidence}%</div>
              <div className="text-[9px] text-gray-400">confidence</div>
            </div>
          </div>
        </div>

        {/* XGBoost Class Probabilities Distribution */}
        {assessment.riskProbabilities && (
          <div className="mt-4 p-3 bg-white/80 rounded-xl border border-gray-200/70 text-xs">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>XGBoost Multiclass Softmax Probabilities</span>
              <span className="font-mono text-[9px] text-gray-400">MIETIC / ESI Triage Benchmark</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-1.5 rounded-lg bg-emerald-50 border border-emerald-100">
                <div className="text-[10px] text-emerald-700 font-semibold">Low</div>
                <div className="text-xs font-bold text-emerald-900">
                  {((assessment.riskProbabilities.low || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-blue-50 border border-blue-100">
                <div className="text-[10px] text-blue-700 font-semibold">Moderate</div>
                <div className="text-xs font-bold text-blue-900">
                  {((assessment.riskProbabilities.moderate || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-amber-50 border border-amber-100">
                <div className="text-[10px] text-amber-700 font-semibold">High</div>
                <div className="text-xs font-bold text-amber-900">
                  {((assessment.riskProbabilities.high || 0) * 100).toFixed(1)}%
                </div>
              </div>
              <div className="p-1.5 rounded-lg bg-red-50 border border-red-100">
                <div className="text-[10px] text-red-700 font-semibold">Critical</div>
                <div className="text-xs font-bold text-red-900">
                  {((assessment.riskProbabilities.critical || 0) * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </div>
        )}

        <div className={`mt-4 p-4 rounded-xl bg-white/70 border ${rc.border}`}>
          <div className="flex items-start gap-2.5">
            <div className={`w-8 h-8 rounded-lg ${rc.icon} flex items-center justify-center shrink-0`}>
              <Icon name="arrow_right" size={16} className={rc.text} />
            </div>
            <div>
              <div className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-1">Recommended Action</div>
              <p className={`text-sm font-semibold leading-relaxed ${rc.text}`}>{assessment.recommendedAction}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="clipboard" size={14} className="text-brand-600" />
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Symptoms Analysed</div>
          </div>
          <div className="space-y-1">
            {assessment.symptomsConsidered.map((s: string) => (
              <div key={s} className="flex items-center gap-2 text-xs text-gray-700">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0" />
                {s}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 border-red-100">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="activity" size={14} className="text-red-600" />
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Abnormal Vitals</div>
          </div>
          <div className="space-y-1">
            {assessment.abnormalVitals.map((v: string) => (
              <div key={v} className="flex items-center gap-2 text-xs text-red-700 bg-red-50 px-2 py-1 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                {v}
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-4 border-amber-100">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="alert" size={14} className="text-amber-600" />
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Risk Factors</div>
          </div>
          <div className="space-y-1">
            {assessment.riskFactors.map((f: string) => (
              <div key={f} className="flex items-center gap-2 text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded-lg">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Icon name="brain" size={16} className="text-brand-600" />
          <div className="text-sm font-semibold text-gray-800">AI Reasoning</div>
          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-medium">AI-GENERATED</span>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{assessment.reasoning}</p>
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-400">
          <Icon name="lock" size={11} />
          Assessment generated: {assessment.generatedAt} · Model: RuralHealth AI v2.1
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-sm font-semibold text-gray-800 mb-3">Patient History Considered</div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">Chronic Conditions</div>
            <div className="flex flex-wrap gap-1.5">
              {patient.chronicConditions.map((c: string) => (
                <span key={c} className="px-2 py-0.5 bg-amber-50 border border-amber-100 text-amber-800 rounded text-xs">{c}</span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-1.5">Current Medications</div>
            <div className="flex flex-wrap gap-1.5">
              {patient.currentMedications.map((m: string) => (
                <span key={m} className="px-2 py-0.5 bg-blue-50 border border-blue-100 text-blue-700 rounded text-xs">{m.split(' ')[0]}</span>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={() => navigate('referral', patient.id || patient.healthId)}
          className="flex-1 py-3.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
          <Icon name="share" size={18} />
          Create Emergency Referral
        </button>
        <button onClick={() => navigate('patient-profile')}
          className="flex-1 py-3.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm">
          <Icon name="user" size={18} />
          View Full Patient Record
        </button>
        <button className="px-5 py-3.5 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm">
          Save Assessment
        </button>
      </div>

      <div className="text-center text-xs text-gray-400 leading-relaxed px-4">
        <Icon name="shield" size={11} className="inline-block mr-1" />
        This assessment is a decision-support tool only. The final clinical decision must be made by an authorized healthcare professional. Do not delay emergency care based on AI output.
      </div>
    </div>
  );
}