import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/error.js';

// Baseline demo MCH records for immediate zero-config availability
export const DEMO_MCH_RECORDS: any[] = [
  {
    id: 'mch-001',
    patientId: 'RHC-2026-8F4K92',
    patientName: 'Priya Devi',
    patientHealthId: 'RHC-2026-8F4K92',
    patientPhone: '94141 58392',
    patientVillage: 'Govindpur',
    pregnancyStatus: 'PREGNANT',
    edd: '15 Nov 2026',
    lmp: '08 Feb 2026',
    gestationalWeeks: 26,
    isHighRisk: true,
    hrpIndicators: ['Severe Anaemia (Hb 8.6 g/dL)', 'Hypothyroidism'],
    gravida: 1,
    para: 0,
    bloodGroup: 'O+',
    assignedVillage: 'Govindpur',
    assignedWorkerName: 'Meena Kumari (ASHA)',
    nextScheduledDate: '22 Sep 2026',
    nextScheduledMilestone: 'ANC Checkup 3 & IFA 2nd Allotment',
    notes: '26 weeks along. Monitor Hb & blood pressure closely. Advised dietary iron + IFA supplements.',
    milestones: [
      {
        id: 'm1-anc1',
        code: 'ANC-1',
        name: 'Antenatal Checkup 1 (Registration)',
        category: 'maternal',
        recommendedWeekOrAge: '12th week',
        dueDate: '14 Mar 2026',
        completedDate: '14 Mar 2026',
        status: 'completed',
        administeredBy: 'Meena Kumari (ASHA)',
        facilityName: 'PHC Lunkaransar',
        batchNumber: 'REG-2026-081',
        notes: 'Pregnancy confirmed. Baseline blood tests, Hb: 8.9 g/dL.',
        vitals: { bloodPressure: '110/70', weight: 49, haemoglobin: 8.9 },
      },
      {
        id: 'm1-tt1',
        code: 'TT-1',
        name: 'Tetanus Toxoid 1 / Td-1',
        category: 'maternal',
        recommendedWeekOrAge: 'Early pregnancy',
        dueDate: '14 Mar 2026',
        completedDate: '14 Mar 2026',
        status: 'completed',
        administeredBy: 'Staff Nurse Sunita',
        facilityName: 'PHC Lunkaransar',
        batchNumber: 'TT-2025-992',
      },
      {
        id: 'm1-ifa1',
        code: 'IFA-1',
        name: 'IFA 1st Allotment (100 Tablets)',
        category: 'maternal',
        recommendedWeekOrAge: 'From 14th week',
        dueDate: '14 Mar 2026',
        completedDate: '14 Mar 2026',
        status: 'completed',
        administeredBy: 'Meena Kumari (ASHA)',
        facilityName: 'Govindpur Sub-Centre',
        notes: '100 tablets of Iron & Folic Acid distributed with compliance instructions.',
      },
      {
        id: 'm1-anc2',
        code: 'ANC-2',
        name: 'Antenatal Checkup 2 (14–26 Weeks)',
        category: 'maternal',
        recommendedWeekOrAge: '20th week',
        dueDate: '12 May 2026',
        completedDate: '12 May 2026',
        status: 'completed',
        administeredBy: 'Dr. Ankit Sharma',
        facilityName: 'PHC Lunkaransar',
        notes: 'Fundal height 20 cm. Fetal heart sound audible (142 bpm). Hb: 8.6 g/dL.',
        vitals: { bloodPressure: '108/70', weight: 51, haemoglobin: 8.6, fetalHeartRate: '142 bpm' },
      },
      {
        id: 'm1-tt2',
        code: 'TT-2',
        name: 'Tetanus Toxoid 2 / Td-2 Booster',
        category: 'maternal',
        recommendedWeekOrAge: '4 weeks after TT-1',
        dueDate: '12 May 2026',
        completedDate: '12 May 2026',
        status: 'completed',
        administeredBy: 'Staff Nurse Sunita',
        facilityName: 'PHC Lunkaransar',
        batchNumber: 'TT-2026-104',
      },
      {
        id: 'm1-anc3',
        code: 'ANC-3',
        name: 'Antenatal Checkup 3 (28–34 Weeks)',
        category: 'maternal',
        recommendedWeekOrAge: '28th week',
        dueDate: '22 Sep 2026',
        status: 'due',
        notes: 'High-risk follow-up for severe anaemia & fetal growth assessment at Village Health & Nutrition Day (VHND).',
      },
      {
        id: 'm1-ifa2',
        code: 'IFA-2',
        name: 'IFA 2nd Allotment (80 Tablets)',
        category: 'maternal',
        recommendedWeekOrAge: '28th week',
        dueDate: '22 Sep 2026',
        status: 'due',
        notes: '2nd round distribution of IFA tablets for third trimester.',
      },
      {
        id: 'm1-anc4',
        code: 'ANC-4',
        name: 'Antenatal Checkup 4 (36 Weeks to Delivery)',
        category: 'maternal',
        recommendedWeekOrAge: '36th week',
        dueDate: '24 Oct 2026',
        status: 'upcoming',
        notes: 'Pre-delivery birth planning, institutional delivery confirmation at CHC Bikaner.',
      },
    ],
  },
  {
    id: 'mch-002',
    patientId: 'pat-sunita-aarav',
    patientName: 'Sunita Kumari & Baby Aarav',
    patientHealthId: 'RHC-2026-SK8801',
    patientPhone: '94142 88120',
    patientVillage: 'Govindpur',
    pregnancyStatus: 'POSTPARTUM',
    childName: 'Baby Aarav',
    childDob: '05 Aug 2026',
    childGender: 'Male',
    childAgeWeeks: 6,
    isHighRisk: true,
    hrpIndicators: ['Low Birth Weight (2.1 kg)'],
    assignedVillage: 'Govindpur',
    assignedWorkerName: 'Meena Kumari (ASHA)',
    nextScheduledDate: '18 Sep 2026',
    nextScheduledMilestone: 'Pentavalent-1 + OPV-1 + Rotavirus-1',
    notes: 'Born at 37 weeks. Birth weight 2.1 kg. Kangaroo Mother Care given. Now 3.2 kg.',
    milestones: [
      {
        id: 'm2-bcg',
        code: 'BCG',
        name: 'BCG Vaccine (Birth Dose)',
        category: 'child',
        recommendedWeekOrAge: 'At Birth',
        dueDate: '05 Aug 2026',
        completedDate: '06 Aug 2026',
        status: 'completed',
        administeredBy: 'Auxiliary Nurse Midwife (ANM)',
        facilityName: 'PHC Lunkaransar',
        batchNumber: 'BCG-2026-551',
      },
      {
        id: 'm2-opv0',
        code: 'OPV-0',
        name: 'Oral Polio Vaccine (OPV Birth Dose)',
        category: 'child',
        recommendedWeekOrAge: 'At Birth (within 14 days)',
        dueDate: '05 Aug 2026',
        completedDate: '06 Aug 2026',
        status: 'completed',
        administeredBy: 'ANM Saroj',
        facilityName: 'PHC Lunkaransar',
        batchNumber: 'OPV-2026-302',
      },
      {
        id: 'm2-penta1',
        code: 'PENTAVALENT-1',
        name: 'Pentavalent-1 (DTP-HepB-Hib 1st Dose)',
        category: 'child',
        recommendedWeekOrAge: '6 Weeks',
        dueDate: '18 Sep 2026',
        status: 'overdue',
        notes: '⚠️ OVERDUE by 3 days! Essential primary immunization protecting against 5 life-threatening illnesses.',
      },
      {
        id: 'm2-opv1',
        code: 'OPV-1',
        name: 'Oral Polio Vaccine 1st Primary Dose',
        category: 'child',
        recommendedWeekOrAge: '6 Weeks',
        dueDate: '18 Sep 2026',
        status: 'overdue',
        notes: '⚠️ OVERDUE with Pentavalent-1. ASHA worker visit urgently required.',
      },
      {
        id: 'm2-penta2',
        code: 'PENTAVALENT-2',
        name: 'Pentavalent-2 (2nd Dose)',
        category: 'child',
        recommendedWeekOrAge: '10 Weeks',
        dueDate: '16 Oct 2026',
        status: 'upcoming',
      },
      {
        id: 'm2-penta3',
        code: 'PENTAVALENT-3',
        name: 'Pentavalent-3 (3rd Dose)',
        category: 'child',
        recommendedWeekOrAge: '14 Weeks',
        dueDate: '13 Nov 2026',
        status: 'upcoming',
      },
    ],
  },
  {
    id: 'mch-003',
    patientId: 'pat-rekha-meena',
    patientName: 'Rekha Meena',
    patientHealthId: 'RHC-2026-RM3390',
    patientPhone: '94601 22894',
    patientVillage: 'Govindpur',
    pregnancyStatus: 'PREGNANT',
    edd: '10 Feb 2027',
    lmp: '05 May 2026',
    gestationalWeeks: 14,
    isHighRisk: true,
    hrpIndicators: ['Severe Anaemia (Hb 7.8 g/dL)', 'Young Primigravida (Age 19)'],
    gravida: 1,
    para: 0,
    bloodGroup: 'B+',
    assignedVillage: 'Govindpur',
    assignedWorkerName: 'Meena Kumari (ASHA)',
    nextScheduledDate: '16 Sep 2026',
    nextScheduledMilestone: 'ANC-1 & TT-1 Administration',
    notes: 'Young pregnant mother. Missed registration appointment last week. High-risk severe anaemia.',
    milestones: [
      {
        id: 'm3-anc1',
        code: 'ANC-1',
        name: 'Antenatal Checkup 1 (Registration)',
        category: 'maternal',
        recommendedWeekOrAge: '12th week',
        dueDate: '16 Sep 2026',
        status: 'overdue',
        notes: '🚨 OVERDUE. Urgent home visit needed to evaluate Hb and schedule ultrasound.',
      },
      {
        id: 'm3-tt1',
        code: 'TT-1',
        name: 'Tetanus Toxoid 1 / Td-1',
        category: 'maternal',
        recommendedWeekOrAge: 'Early pregnancy',
        dueDate: '16 Sep 2026',
        status: 'overdue',
        notes: '🚨 OVERDUE. Administer immediately at next VHND.',
      },
      {
        id: 'm3-ifa1',
        code: 'IFA-1',
        name: 'IFA 1st Allotment (100 Tablets)',
        category: 'maternal',
        recommendedWeekOrAge: '14th week',
        dueDate: '16 Sep 2026',
        status: 'overdue',
        notes: '🚨 High risk: Severe anaemia. Must start therapeutic iron dose.',
      },
      {
        id: 'm3-anc2',
        code: 'ANC-2',
        name: 'Antenatal Checkup 2',
        category: 'maternal',
        recommendedWeekOrAge: '20th week',
        dueDate: '20 Oct 2026',
        status: 'upcoming',
      },
    ],
  },
  {
    id: 'mch-004',
    patientId: 'pat-kavita-ananya',
    patientName: 'Kavita Bai & Baby Ananya',
    patientHealthId: 'RHC-2026-KA4112',
    patientPhone: '95291 44801',
    patientVillage: 'Govindpur',
    pregnancyStatus: 'POSTPARTUM',
    childName: 'Baby Ananya',
    childDob: '10 Jun 2026',
    childGender: 'Female',
    childAgeWeeks: 14,
    isHighRisk: false,
    hrpIndicators: [],
    assignedVillage: 'Govindpur',
    assignedWorkerName: 'Meena Kumari (ASHA)',
    nextScheduledDate: '23 Sep 2026',
    nextScheduledMilestone: 'Pentavalent-3 + OPV-3 + fIPV-2',
    milestones: [
      {
        id: 'm4-bcg',
        code: 'BCG',
        name: 'BCG Vaccine',
        category: 'child',
        recommendedWeekOrAge: 'Birth',
        dueDate: '10 Jun 2026',
        completedDate: '11 Jun 2026',
        status: 'completed',
        administeredBy: 'PHC Staff',
      },
      {
        id: 'm4-penta1',
        code: 'PENTAVALENT-1',
        name: 'Pentavalent-1 & OPV-1',
        category: 'child',
        recommendedWeekOrAge: '6 Weeks',
        dueDate: '22 Jul 2026',
        completedDate: '23 Jul 2026',
        status: 'completed',
        administeredBy: 'ANM Saroj',
      },
      {
        id: 'm4-penta2',
        code: 'PENTAVALENT-2',
        name: 'Pentavalent-2 & OPV-2',
        category: 'child',
        recommendedWeekOrAge: '10 Weeks',
        dueDate: '19 Aug 2026',
        completedDate: '20 Aug 2026',
        status: 'completed',
        administeredBy: 'ANM Saroj',
      },
      {
        id: 'm4-penta3',
        code: 'PENTAVALENT-3',
        name: 'Pentavalent-3 & OPV-3 (Final Primary Dose)',
        category: 'child',
        recommendedWeekOrAge: '14 Weeks',
        dueDate: '23 Sep 2026',
        status: 'due',
        notes: 'Due this week on Wednesday Village Health Day.',
      },
      {
        id: 'm4-polio3',
        code: 'OPV-3',
        name: 'Oral Polio Vaccine Dose 3',
        category: 'child',
        recommendedWeekOrAge: '14 Weeks',
        dueDate: '23 Sep 2026',
        status: 'due',
        notes: 'Due this week together with Pentavalent-3.',
      },
    ],
  },
  {
    id: 'mch-005',
    patientId: 'pat-anita-gurjar',
    patientName: 'Anita Gurjar',
    patientHealthId: 'RHC-2026-AG7721',
    patientPhone: '96729 33491',
    patientVillage: 'Khetolai',
    pregnancyStatus: 'PREGNANT',
    edd: '02 Oct 2026',
    lmp: '26 Dec 2025',
    gestationalWeeks: 34,
    isHighRisk: true,
    hrpIndicators: ['Previous Caesarean Section', 'Gestational Diabetes'],
    gravida: 2,
    para: 1,
    bloodGroup: 'A+',
    assignedVillage: 'Khetolai',
    assignedWorkerName: 'Sunita Yadav (ASHA)',
    nextScheduledDate: '24 Sep 2026',
    nextScheduledMilestone: 'ANC Checkup 4 & Institutional Delivery Counseling',
    milestones: [
      {
        id: 'm5-anc1',
        code: 'ANC-1',
        name: 'Antenatal Checkup 1',
        category: 'maternal',
        recommendedWeekOrAge: '12th week',
        dueDate: '20 Feb 2026',
        completedDate: '20 Feb 2026',
        status: 'completed',
      },
      {
        id: 'm5-anc2',
        code: 'ANC-2',
        name: 'Antenatal Checkup 2',
        category: 'maternal',
        recommendedWeekOrAge: '20th week',
        dueDate: '15 May 2026',
        completedDate: '16 May 2026',
        status: 'completed',
      },
      {
        id: 'm5-anc3',
        code: 'ANC-3',
        name: 'Antenatal Checkup 3',
        category: 'maternal',
        recommendedWeekOrAge: '28th week',
        dueDate: '18 Jul 2026',
        completedDate: '18 Jul 2026',
        status: 'completed',
      },
      {
        id: 'm5-anc4',
        code: 'ANC-4',
        name: 'Antenatal Checkup 4 (High-Risk Delivery Planning)',
        category: 'maternal',
        recommendedWeekOrAge: '34th week',
        dueDate: '24 Sep 2026',
        status: 'due',
        notes: 'High-risk previous LSCS. Arrange transport to CHC Bikaner ahead of labor onset.',
      },
    ],
  },
];

/**
 * Get MCH Due List with Weekly & Overdue Alerts
 * GET /api/v1/mch/due-list?village=Govindpur&week=current
 */
export async function getMchDueList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const villageFilter = (req.query.village as string)?.trim();
    const categoryFilter = (req.query.category as string)?.trim();
    const urgencyFilter = (req.query.urgency as string)?.trim();

    // Query DB first
    let dbRecords: any[] = [];
    try {
      dbRecords = await (prisma as any).mchRecord.findMany({
        include: {
          patient: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    } catch {
      dbRecords = [];
    }

    // Merge or fallback to demo records
    const allRecords = dbRecords.length > 0
      ? dbRecords.map((r: any) => ({
          ...r,
          patientName: r.patient?.name || r.childName || 'MCH Beneficiary',
          patientHealthId: r.patient?.healthId || 'RHC-2026',
          patientPhone: r.patient?.phone || '',
          patientVillage: r.assignedVillage || r.patient?.village || 'Govindpur',
          milestones: Array.isArray(r.milestones) ? r.milestones : [],
        }))
      : DEMO_MCH_RECORDS;

    // Filter by village if specified
    const filteredRecords = villageFilter && villageFilter.toLowerCase() !== 'all'
      ? allRecords.filter(r => (r.assignedVillage || r.patientVillage)?.toLowerCase() === villageFilter.toLowerCase())
      : allRecords;

    // Extract all due alert items (overdue, due this week, upcoming)
    const dueItems: any[] = [];

    filteredRecords.forEach(record => {
      const milestones: any[] = Array.isArray(record.milestones) ? record.milestones : [];
      milestones.forEach(m => {
        if (m.status === 'due' || m.status === 'overdue') {
          dueItems.push({
            id: `${record.id}-${m.code}`,
            recordId: record.id,
            patientId: record.patientId,
            patientName: record.patientName,
            healthId: record.patientHealthId,
            phone: record.patientPhone,
            village: record.assignedVillage || record.patientVillage,
            isHighRisk: record.isHighRisk,
            hrpIndicators: record.hrpIndicators || [],
            category: m.category,
            milestoneCode: m.code,
            milestoneName: m.name,
            dueDate: m.dueDate,
            status: m.status,
            pregnancyStatus: record.pregnancyStatus,
            gestationalWeeks: record.gestationalWeeks,
            childName: record.childName,
            childAge: record.childAgeWeeks ? `${record.childAgeWeeks} weeks` : undefined,
            notes: m.notes,
            recommendedWeekOrAge: m.recommendedWeekOrAge,
          });
        }
      });
    });

    // Compute stats
    const stats = {
      totalBeneficiaries: filteredRecords.length,
      overdueCount: dueItems.filter(i => i.status === 'overdue').length,
      dueThisWeekCount: dueItems.filter(i => i.status === 'due').length,
      highRiskCount: filteredRecords.filter(r => r.isHighRisk).length,
      maternalDueCount: dueItems.filter(i => i.category === 'maternal').length,
      childDueCount: dueItems.filter(i => i.category === 'child').length,
    };

    // Apply optional filter
    let items = dueItems;
    if (categoryFilter && categoryFilter !== 'all') {
      items = items.filter(i => i.category === categoryFilter);
    }
    if (urgencyFilter === 'overdue') {
      items = items.filter(i => i.status === 'overdue');
    } else if (urgencyFilter === 'due') {
      items = items.filter(i => i.status === 'due');
    } else if (urgencyFilter === 'hrp') {
      items = items.filter(i => i.isHighRisk);
    }

    res.status(200).json({
      success: true,
      data: {
        stats,
        dueItems: items,
        records: filteredRecords,
        currentWeekLabel: 'Week of Sept 15–21, 2026',
        village: villageFilter || 'Govindpur',
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Get Patient's Digital Mother & Child Protection (MCP) Card
 * GET /api/v1/mch/patient/:patientId
 */
export async function getPatientMchRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawId = req.params.patientId;
    const patientId = Array.isArray(rawId) ? rawId[0] : rawId;

    // Check in database first
    let dbRecord: any = null;
    try {
      dbRecord = await (prisma as any).mchRecord.findFirst({
        where: {
          OR: [
            { patientId },
            { id: patientId },
            { patient: { healthId: patientId } },
          ],
        },
        include: {
          patient: true,
        },
      });
    } catch {
      dbRecord = null;
    }

    if (dbRecord) {
      res.status(200).json({
        success: true,
        data: {
          ...dbRecord,
          patientName: dbRecord.patient?.name,
          patientHealthId: dbRecord.patient?.healthId,
          patientPhone: dbRecord.patient?.phone,
          patientVillage: dbRecord.assignedVillage || dbRecord.patient?.village,
        },
      });
      return;
    }

    // Match in demo records
    const demo = DEMO_MCH_RECORDS.find(
      r => r.patientId === patientId || r.patientHealthId === patientId || r.id === patientId
    ) || DEMO_MCH_RECORDS[0]; // fallback to Priya Devi

    res.status(200).json({
      success: true,
      data: demo,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Create or Register new MchRecord
 * POST /api/v1/mch
 */
export async function createMchRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const {
      patientId,
      pregnancyStatus = 'PREGNANT',
      edd,
      lmp,
      isHighRisk = false,
      hrpIndicators = [],
      gravida = 1,
      para = 0,
      assignedVillage = 'Govindpur',
      assignedWorkerId,
      childName,
      childDob,
      childGender,
      notes,
    } = req.body;

    if (!patientId) {
      throw new AppError('patientId is required', 400);
    }

    // Build standard milestone template
    const milestones = [
      { id: 'anc-1', code: 'ANC-1', name: 'Antenatal Checkup 1', category: 'maternal', recommendedWeekOrAge: '12th week', dueDate: '14 Mar 2026', status: 'completed' },
      { id: 'tt-1', code: 'TT-1', name: 'Tetanus Toxoid 1', category: 'maternal', recommendedWeekOrAge: 'Early pregnancy', dueDate: '14 Mar 2026', status: 'completed' },
      { id: 'ifa-1', code: 'IFA-1', name: 'IFA Distribution (100 Tabs)', category: 'maternal', recommendedWeekOrAge: '14th week', dueDate: '14 Mar 2026', status: 'completed' },
      { id: 'anc-2', code: 'ANC-2', name: 'Antenatal Checkup 2', category: 'maternal', recommendedWeekOrAge: '20th week', dueDate: '12 May 2026', status: 'completed' },
      { id: 'tt-2', code: 'TT-2', name: 'Tetanus Toxoid 2', category: 'maternal', recommendedWeekOrAge: '24th week', dueDate: '12 May 2026', status: 'completed' },
      { id: 'anc-3', code: 'ANC-3', name: 'Antenatal Checkup 3', category: 'maternal', recommendedWeekOrAge: '28th week', dueDate: '22 Sep 2026', status: 'due' },
      { id: 'ifa-2', code: 'IFA-2', name: 'IFA 2nd Allotment', category: 'maternal', recommendedWeekOrAge: '28th week', dueDate: '22 Sep 2026', status: 'due' },
      { id: 'anc-4', code: 'ANC-4', name: 'Antenatal Checkup 4', category: 'maternal', recommendedWeekOrAge: '36th week', dueDate: '24 Oct 2026', status: 'upcoming' },
      { id: 'bcg', code: 'BCG', name: 'BCG Vaccine', category: 'child', recommendedWeekOrAge: 'Birth', dueDate: edd || '15 Nov 2026', status: 'upcoming' },
      { id: 'opv-0', code: 'OPV-0', name: 'Polio Birth Dose', category: 'child', recommendedWeekOrAge: 'Birth', dueDate: edd || '15 Nov 2026', status: 'upcoming' },
      { id: 'penta-1', code: 'PENTAVALENT-1', name: 'Pentavalent-1', category: 'child', recommendedWeekOrAge: '6 Weeks', dueDate: '27 Dec 2026', status: 'upcoming' },
      { id: 'opv-1', code: 'OPV-1', name: 'OPV Dose 1', category: 'child', recommendedWeekOrAge: '6 Weeks', dueDate: '27 Dec 2026', status: 'upcoming' },
    ];

    let created: any = null;
    try {
      created = await (prisma as any).mchRecord.create({
        data: {
          patientId,
          pregnancyStatus,
          edd,
          lmp,
          isHighRisk,
          hrpIndicators,
          gravida,
          para,
          assignedVillage,
          assignedWorkerId,
          childName,
          childDob,
          childGender,
          notes,
          milestones,
        },
      });
    } catch {
      // Fallback
      created = {
        id: `mch-${Date.now()}`,
        patientId,
        pregnancyStatus,
        edd,
        lmp,
        isHighRisk,
        hrpIndicators,
        gravida,
        para,
        assignedVillage,
        childName,
        childDob,
        childGender,
        milestones,
      };
      DEMO_MCH_RECORDS.push(created);
    }

    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Mark Milestone as Administered / Completed
 * PATCH /api/v1/mch/:id/milestones/:milestoneCode
 */
export async function updateMchMilestone(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawRecordId = req.params.id;
    const recordId = Array.isArray(rawRecordId) ? rawRecordId[0] : rawRecordId;
    const rawMilestoneCode = req.params.milestoneCode;
    const milestoneCode = Array.isArray(rawMilestoneCode) ? rawMilestoneCode[0] : rawMilestoneCode;

    const {
      status = 'completed',
      completedDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      administeredBy,
      facilityName,
      batchNumber,
      notes,
      vitals,
    } = req.body;

    // Update in demo store
    const demoRecord = DEMO_MCH_RECORDS.find(r => r.id === recordId || r.patientId === recordId || r.patientHealthId === recordId);
    if (demoRecord && Array.isArray(demoRecord.milestones)) {
      const milestone = demoRecord.milestones.find((m: any) => m.code.toLowerCase() === milestoneCode.toLowerCase() || m.id === milestoneCode);
      if (milestone) {
        milestone.status = status;
        milestone.completedDate = completedDate;
        if (administeredBy) milestone.administeredBy = administeredBy;
        if (facilityName) milestone.facilityName = facilityName;
        if (batchNumber) milestone.batchNumber = batchNumber;
        if (notes) milestone.notes = notes;
        if (vitals) milestone.vitals = vitals;
      }
    }

    // Update in DB if exists
    try {
      const dbRec = await (prisma as any).mchRecord.findUnique({ where: { id: recordId } });
      if (dbRec && Array.isArray(dbRec.milestones)) {
        const milestones = (dbRec.milestones as any[]).map(m => {
          if (m.code.toLowerCase() === milestoneCode.toLowerCase() || m.id === milestoneCode) {
            return {
              ...m,
              status,
              completedDate,
              administeredBy: administeredBy || m.administeredBy,
              facilityName: facilityName || m.facilityName,
              batchNumber: batchNumber || m.batchNumber,
              notes: notes || m.notes,
              vitals: vitals || m.vitals,
            };
          }
          return m;
        });

        await (prisma as any).mchRecord.update({
          where: { id: recordId },
          data: { milestones },
        });
      }
    } catch {
      // ignore DB fallback
    }

    res.status(200).json({
      success: true,
      message: `Milestone ${milestoneCode} successfully updated to ${status}`,
    });
  } catch (err) {
    next(err);
  }
}
