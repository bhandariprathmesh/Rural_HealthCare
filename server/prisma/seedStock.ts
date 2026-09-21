import { PrismaClient, DiagnosticStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('📦 Seeding Pharmacy & Diagnostic Stock for Sanjivani PHC & rural network...');

  // 1. Ensure Sanjivani PHC exists
  let sanjivani = await prisma.facility.findFirst({
    where: {
      OR: [
        { hfrId: 'HFR-2024-SANJIVANI' },
        { name: { contains: 'Sanjivani', mode: 'insensitive' } },
      ],
    },
  });

  if (!sanjivani) {
    sanjivani = await prisma.facility.create({
      data: {
        hfrId: 'HFR-2024-SANJIVANI',
        name: 'Sanjivani PHC',
        facilityType: 'PHC',
        district: 'Bikaner',
        state: 'Rajasthan',
        latitude: 28.3245,
        longitude: 73.5412,
        address: 'Gram Panchayat Health Campus, Sanjivani, Bikaner – 334001',
      },
    });
    console.log('✓ Created Sanjivani PHC:', sanjivani.id);
  } else {
    console.log('✓ Found Sanjivani PHC:', sanjivani.id);
  }

  // Also get PHC Lunkaransar if available
  const lunkaransar = await prisma.facility.findFirst({
    where: { name: { contains: 'Lunkaransar', mode: 'insensitive' } },
  });

  const facilities = [sanjivani];
  if (lunkaransar && lunkaransar.id !== sanjivani.id) {
    facilities.push(lunkaransar);
  }

  for (const fac of facilities) {
    const isSanjivani = fac.id === sanjivani.id;
    console.log(`\nSeeding stock for ${fac.name} (${fac.id})...`);

    // 2. Essential Medicines Catalog
    const medicinesData = [
      {
        code: `MED-PCM-500-${fac.hfrId}`,
        name: 'Paracetamol 500mg',
        genericName: 'Paracetamol',
        brand: 'Calpol / Crocin',
        dosageForm: 'Tablet',
        strength: '500mg',
        category: 'Analgesic & Antipyretic',
        stock: isSanjivani ? 180 : 120,
        minStockLevel: 25,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-PCM-2026A',
        expiryDate: '2027-12-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-ORS-21-${fac.hfrId}`,
        name: 'ORS Sachets (WHO Formula)',
        genericName: 'Oral Rehydration Salts',
        brand: 'Electral / W.H.O. ORS',
        dosageForm: 'Powder Sachet',
        strength: '21.8g Sachet',
        category: 'Gastrointestinal & Hydration',
        stock: isSanjivani ? 140 : 80,
        minStockLevel: 30,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-ORS-2026C',
        expiryDate: '2028-06-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-AMX-500-${fac.hfrId}`,
        name: 'Amoxicillin 500mg',
        genericName: 'Amoxicillin Trihydrate',
        brand: 'Mox / Novamox',
        dosageForm: 'Capsule',
        strength: '500mg',
        category: 'Antibiotics',
        stock: isSanjivani ? 65 : 40,
        minStockLevel: 20,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-AMX-2025D',
        expiryDate: '2027-04-15',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-IFA-100-${fac.hfrId}`,
        name: 'Iron & Folic Acid (IFA) Tablets',
        genericName: 'Ferrous Sulphate (100mg) + Folic Acid (0.5mg)',
        brand: 'IFA Red Tablet',
        dosageForm: 'Tablet',
        strength: '100mg Fe + 0.5mg FA',
        category: 'Maternal Nutrition & Hematinic',
        stock: isSanjivani ? 250 : 190,
        minStockLevel: 50,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-IFA-2026E',
        expiryDate: '2027-09-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-ALB-400-${fac.hfrId}`,
        name: 'Albendazole 400mg',
        genericName: 'Albendazole',
        brand: 'Zentel / Bandy',
        dosageForm: 'Chewable Tablet',
        strength: '400mg',
        category: 'Anthelmintic (Deworming)',
        stock: isSanjivani ? 85 : 50,
        minStockLevel: 20,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-ALB-2026B',
        expiryDate: '2028-01-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-MET-500-${fac.hfrId}`,
        name: 'Metformin 500mg',
        genericName: 'Metformin Hydrochloride',
        brand: 'Glycomet',
        dosageForm: 'Tablet',
        strength: '500mg',
        category: 'Antidiabetic (NCD)',
        stock: isSanjivani ? 8 : 4,
        minStockLevel: 25,
        isLowStock: true,
        availability: 'Low Stock',
        batch: 'BATCH-MET-2025F',
        expiryDate: '2026-11-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-AML-005-${fac.hfrId}`,
        name: 'Amlodipine 5mg',
        genericName: 'Amlodipine Besylate',
        brand: 'Amlong / Stamlo',
        dosageForm: 'Tablet',
        strength: '5mg',
        category: 'Antihypertensive (NCD)',
        stock: isSanjivani ? 12 : 5,
        minStockLevel: 20,
        isLowStock: true,
        availability: 'Low Stock',
        batch: 'BATCH-AML-2025G',
        expiryDate: '2026-10-15',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-AZI-250-${fac.hfrId}`,
        name: 'Azithromycin 250mg',
        genericName: 'Azithromycin Dihydrate',
        brand: 'Azee / Azithral',
        dosageForm: 'Tablet',
        strength: '250mg',
        category: 'Antibiotics',
        stock: 0,
        minStockLevel: 15,
        isLowStock: true,
        availability: 'Out of Stock',
        batch: 'BATCH-AZI-2024H',
        expiryDate: '2025-08-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-CTZ-010-${fac.hfrId}`,
        name: 'Cetirizine 10mg',
        genericName: 'Cetirizine Dihydrochloride',
        brand: 'Cetcip / Alerid',
        dosageForm: 'Tablet',
        strength: '10mg',
        category: 'Antihistaminic & Allergy',
        stock: isSanjivani ? 95 : 60,
        minStockLevel: 20,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-CTZ-2026I',
        expiryDate: '2027-10-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-IBU-400-${fac.hfrId}`,
        name: 'Ibuprofen 400mg',
        genericName: 'Ibuprofen',
        brand: 'Brufen',
        dosageForm: 'Tablet',
        strength: '400mg',
        category: 'NSAID / Anti-inflammatory',
        stock: isSanjivani ? 110 : 75,
        minStockLevel: 20,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-IBU-2026J',
        expiryDate: '2027-08-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `MED-PAN-040-${fac.hfrId}`,
        name: 'Pantoprazole 40mg',
        genericName: 'Pantoprazole Sodium',
        brand: 'Pan 40',
        dosageForm: 'Tablet',
        strength: '40mg',
        category: 'Antacid & PPI',
        stock: isSanjivani ? 70 : 45,
        minStockLevel: 15,
        isLowStock: false,
        availability: 'In Stock',
        batch: 'BATCH-PAN-2026K',
        expiryDate: '2028-02-28',
        facilityId: fac.id,
        facilityName: fac.name,
      },
    ];

    for (const med of medicinesData) {
      await prisma.medicine.upsert({
        where: { code: med.code },
        create: med,
        update: {
          stock: med.stock,
          minStockLevel: med.minStockLevel,
          isLowStock: med.isLowStock,
          availability: med.availability,
          facilityId: med.facilityId,
          facilityName: med.facilityName,
        },
      });
    }
    console.log(`✓ Seeded ${medicinesData.length} medicines for ${fac.name}`);

    // 3. Diagnostic Kits Catalog
    const diagnosticsData = [
      {
        code: `KIT-MAL-RDT-${fac.hfrId}`,
        testName: 'Malaria Rapid Diagnostic Test (RDT) [Pv/Pf]',
        testNameHi: 'मलेरिया रैपिड जांच किट (Pv/Pf)',
        category: 'Rapid Diagnostic',
        kitsAvailable: isSanjivani ? 45 : 30,
        minKitsLevel: 10,
        status: DiagnosticStatus.AVAILABLE,
        batch: 'KIT-MAL-2026A',
        expiryDate: '2027-11-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-HB-STRIP-${fac.hfrId}`,
        testName: 'Hemoglobin Test Strips (Sahli / Digital)',
        testNameHi: 'हीमोग्लोबिन जांच पट्टी (खून की कमी जांच)',
        category: 'Hematology',
        kitsAvailable: isSanjivani ? 35 : 20,
        minKitsLevel: 10,
        status: DiagnosticStatus.AVAILABLE,
        batch: 'KIT-HB-2026B',
        expiryDate: '2027-09-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-GLU-STRIP-${fac.hfrId}`,
        testName: 'Blood Glucose Glucometer Strips (CBG)',
        testNameHi: 'शुगर / ग्लूकोज जांच पट्टी (मधुमेह)',
        category: 'Biochemistry',
        kitsAvailable: isSanjivani ? 6 : 4,
        minKitsLevel: 20,
        status: DiagnosticStatus.LOW_STOCK,
        batch: 'KIT-GLU-2025C',
        expiryDate: '2026-10-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-DNG-NS1-${fac.hfrId}`,
        testName: 'Dengue NS1 Antigen Rapid Test',
        testNameHi: 'डेंगू एंटीजन जांच किट',
        category: 'Rapid Diagnostic',
        kitsAvailable: 0,
        minKitsLevel: 10,
        status: DiagnosticStatus.OUT_OF_STOCK,
        batch: 'KIT-DNG-2025D',
        expiryDate: '2026-06-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-URN-ALB-${fac.hfrId}`,
        testName: 'Urine Albumin & Sugar Dipsticks',
        testNameHi: 'यूरिन एल्बुमिन व शुगर जांच पट्टी (गर्भावस्था/किडनी)',
        category: 'Urine Analysis',
        kitsAvailable: isSanjivani ? 50 : 35,
        minKitsLevel: 15,
        status: DiagnosticStatus.AVAILABLE,
        batch: 'KIT-URN-2026E',
        expiryDate: '2028-03-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-UPT-PREG-${fac.hfrId}`,
        testName: 'Pregnancy Test Kit (Nishchay UPT Card)',
        testNameHi: 'गर्भावस्था जांच किट (निश्चय कार्ड)',
        category: 'Maternal Health',
        kitsAvailable: isSanjivani ? 40 : 25,
        minKitsLevel: 10,
        status: DiagnosticStatus.AVAILABLE,
        batch: 'KIT-UPT-2026F',
        expiryDate: '2028-01-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-TYP-DOT-${fac.hfrId}`,
        testName: 'Typhoid IgG/IgM Rapid Card Test',
        testNameHi: 'टाइफाइड बुखार जांच कार्ड',
        category: 'Rapid Diagnostic',
        kitsAvailable: isSanjivani ? 18 : 10,
        minKitsLevel: 10,
        status: DiagnosticStatus.AVAILABLE,
        batch: 'KIT-TYP-2026G',
        expiryDate: '2027-05-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-SPU-AFB-${fac.hfrId}`,
        testName: 'Sputum AFB Collection & Smear Kit (NTEP)',
        testNameHi: 'बलगम जांच किट (टीबी / क्षयरोग)',
        category: 'Microbiology',
        kitsAvailable: isSanjivani ? 20 : 15,
        minKitsLevel: 10,
        status: DiagnosticStatus.AVAILABLE,
        batch: 'KIT-SPU-2026H',
        expiryDate: '2027-12-31',
        facilityId: fac.id,
        facilityName: fac.name,
      },
      {
        code: `KIT-HBS-AG-${fac.hfrId}`,
        testName: 'Hepatitis B Surface Antigen (HBsAg) Rapid',
        testNameHi: 'हेपेटाइटिस बी जांच कार्ड',
        category: 'Serology',
        kitsAvailable: 0,
        minKitsLevel: 10,
        status: DiagnosticStatus.OUT_OF_STOCK,
        batch: 'KIT-HBS-2025I',
        expiryDate: '2026-04-30',
        facilityId: fac.id,
        facilityName: fac.name,
      },
    ];

    for (const kit of diagnosticsData) {
      await (prisma as any).diagnosticItem.upsert({
        where: { code: kit.code },
        create: kit,
        update: {
          kitsAvailable: kit.kitsAvailable,
          minKitsLevel: kit.minKitsLevel,
          status: kit.status,
          facilityId: kit.facilityId,
          facilityName: kit.facilityName,
        },
      });
    }
    console.log(`✓ Seeded ${diagnosticsData.length} diagnostic test kits for ${fac.name}`);
  }

  console.log('🎉 Stock seeding complete!');
}

main()
  .catch((e) => {
    console.error('Error seeding stock:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
