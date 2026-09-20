import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const STANDARDIZED_SYMPTOMS = [
  {
    code: 'SYM-FEV-01',
    name: 'Fever',
    nameHi: 'बुखार',
    category: 'General',
    synonyms: ['fev', 'pyrexia', 'high temp', 'febrile', 'hot body', 'bukhar'],
    icd10Code: 'R50.9',
    defaultWeight: 1.2,
  },
  {
    code: 'SYM-COU-01',
    name: 'Cough',
    nameHi: 'खांसी',
    category: 'Respiratory',
    synonyms: ['coughing', 'dry cough', 'wet cough', 'productive cough', 'khansi'],
    icd10Code: 'R05',
    defaultWeight: 1.0,
  },
  {
    code: 'SYM-COL-01',
    name: 'Cold / Runny nose',
    nameHi: 'जुकाम / बहती नाक',
    category: 'Respiratory',
    synonyms: ['cold', 'rhinorrhea', 'runny nose', 'sneezing', 'nasal congestion', 'flu', 'sardi'],
    icd10Code: 'J00',
    defaultWeight: 0.8,
  },
  {
    code: 'SYM-SOB-01',
    name: 'Shortness of breath',
    nameHi: 'सांस फूलना',
    category: 'Respiratory',
    synonyms: ['sob', 'dyspnea', 'breathlessness', 'difficulty breathing', 'gasping', 'choking', 'sans'],
    icd10Code: 'R06.0',
    defaultWeight: 2.0,
  },
  {
    code: 'SYM-CHT-01',
    name: 'Chest tightness',
    nameHi: 'छाती में जकड़न',
    category: 'Cardiovascular',
    synonyms: ['chest tight', 'chest constriction', 'heaviness in chest', 'tightness'],
    icd10Code: 'R07.89',
    defaultWeight: 1.8,
  },
  {
    code: 'SYM-CHP-01',
    name: 'Chest pain',
    nameHi: 'छाती में दर्द',
    category: 'Cardiovascular',
    synonyms: ['angina', 'cardiac pain', 'heart pain', 'retrosternal pain', 'severe chest pain', 'chhati dard'],
    icd10Code: 'R07.9',
    defaultWeight: 2.2,
  },
  {
    code: 'SYM-FAT-01',
    name: 'Fatigue / Weakness',
    nameHi: 'थकान / कमजोरी',
    category: 'General',
    synonyms: ['fatigue', 'weakness', 'lethargy', 'tiredness', 'exhaustion', 'malaise', 'kamzori'],
    icd10Code: 'R53.83',
    defaultWeight: 0.9,
  },
  {
    code: 'SYM-DIZ-01',
    name: 'Dizziness',
    nameHi: 'चक्कर आना',
    category: 'Neurological',
    synonyms: ['vertigo', 'lightheadedness', 'giddiness', 'loss of balance', 'chakkar'],
    icd10Code: 'R42',
    defaultWeight: 1.3,
  },
  {
    code: 'SYM-HED-01',
    name: 'Headache',
    nameHi: 'सिरदर्द',
    category: 'Neurological',
    synonyms: ['head', 'cephalea', 'migraine', 'throbbing head', 'tension headache', 'sirdard'],
    icd10Code: 'R51',
    defaultWeight: 1.1,
  },
  {
    code: 'SYM-NAU-01',
    name: 'Nausea / Vomiting',
    nameHi: 'जी मिचलाना / उल्टी',
    category: 'Gastrointestinal',
    synonyms: ['nausea', 'vomiting', 'emesis', 'puking', 'queasy', 'throwing up', 'ulti'],
    icd10Code: 'R11',
    defaultWeight: 1.2,
  },
  {
    code: 'SYM-ABD-01',
    name: 'Abdominal pain',
    nameHi: 'पेट दर्द',
    category: 'Gastrointestinal',
    synonyms: ['stomach ache', 'belly pain', 'colic', 'cramps', 'abdominal tenderness', 'pet dard'],
    icd10Code: 'R10.9',
    defaultWeight: 1.5,
  },
  {
    code: 'SYM-DIA-01',
    name: 'Diarrhoea',
    nameHi: 'दस्त',
    category: 'Gastrointestinal',
    synonyms: ['diarrhea', 'loose motions', 'watery stools', 'frequent motions', 'dast'],
    icd10Code: 'A09',
    defaultWeight: 1.3,
  },
  {
    code: 'SYM-APP-01',
    name: 'Loss of appetite',
    nameHi: 'भूख न लगना',
    category: 'Gastrointestinal',
    synonyms: ['anorexia', 'poor appetite', 'not eating', 'reduced hunger', 'bhookh'],
    icd10Code: 'R63.0',
    defaultWeight: 0.8,
  },
  {
    code: 'SYM-JNT-01',
    name: 'Joint pain',
    nameHi: 'जोड़ों का दर्द',
    category: 'Musculoskeletal',
    synonyms: ['arthralgia', 'arthritis', 'knee pain', 'stiff joints', 'jodon ka dard'],
    icd10Code: 'M25.50',
    defaultWeight: 1.0,
  },
  {
    code: 'SYM-BCK-01',
    name: 'Back pain',
    nameHi: 'पीठ / कमर का दर्द',
    category: 'Musculoskeletal',
    synonyms: ['lumbago', 'spinal pain', 'lower back ache', 'dorsalgia', 'kamar dard'],
    icd10Code: 'M54.5',
    defaultWeight: 1.0,
  },
  {
    code: 'SYM-EDM-01',
    name: 'Swelling (oedema)',
    nameHi: 'सूजन',
    category: 'General',
    synonyms: ['edema', 'oedema', 'dropsy', 'fluid retention', 'swollen feet', 'facial puffiness', 'soojan'],
    icd10Code: 'R60.9',
    defaultWeight: 1.4,
  },
  {
    code: 'SYM-RSH-01',
    name: 'Skin rash',
    nameHi: 'त्वचा पर दाने / चकत्ते',
    category: 'Dermatological',
    synonyms: ['rash', 'exanthem', 'hives', 'urticaria', 'itchy spots', 'dermatitis', 'khujli'],
    icd10Code: 'R21',
    defaultWeight: 0.9,
  },
  {
    code: 'SYM-VIS-01',
    name: 'Blurred vision',
    nameHi: 'धुंधला दिखना',
    category: 'Ophthalmic',
    synonyms: ['blurry vision', 'hazy vision', 'vision loss', 'diplopia', 'double vision', 'dhundhla'],
    icd10Code: 'H53.8',
    defaultWeight: 1.5,
  },
  {
    code: 'SYM-SNC-01',
    name: 'Fainting',
    nameHi: 'बेहोशी',
    category: 'Neurological',
    synonyms: ['syncope', 'loss of consciousness', 'blackout', 'passed out', 'collapsed', 'behosh'],
    icd10Code: 'R55',
    defaultWeight: 2.1,
  },
  {
    code: 'SYM-PLP-01',
    name: 'Palpitations',
    nameHi: 'दिल की धड़कन तेज होना',
    category: 'Cardiovascular',
    synonyms: ['racing heart', 'fluttering heart', 'tachycardia', 'pounding chest', 'dhak dhak'],
    icd10Code: 'R00.2',
    defaultWeight: 1.6,
  },
  {
    code: 'SYM-HTN-01',
    name: 'High Blood Pressure',
    nameHi: 'उच्च रक्तचाप',
    category: 'Cardiovascular',
    synonyms: ['hypertension', 'high bp', 'elevated bp', 'hypertensive'],
    icd10Code: 'I10',
    defaultWeight: 1.7,
  },
  {
    code: 'SYM-GLU-01',
    name: 'High Blood Sugar',
    nameHi: 'उच्च रक्त शर्करा',
    category: 'Endocrine',
    synonyms: ['diabetes', 'hyperglycemia', 'high glucose', 'sugar'],
    icd10Code: 'E11.9',
    defaultWeight: 1.4,
  },
  {
    code: 'SYM-THR-01',
    name: 'Sore throat',
    nameHi: 'गले में खराश',
    category: 'Respiratory',
    synonyms: ['pharyngitis', 'throat pain', 'swallowing pain', 'gala kharab'],
    icd10Code: 'J02.9',
    defaultWeight: 0.9,
  },
  {
    code: 'SYM-URI-01',
    name: 'Burning urination',
    nameHi: 'पेशाब में जलन',
    category: 'Renal',
    synonyms: ['dysuria', 'uti', 'urinary tract infection', 'painful urination', 'peshab me jalan'],
    icd10Code: 'R30.0',
    defaultWeight: 1.2,
  },
  {
    code: 'SYM-BDY-01',
    name: 'Body ache',
    nameHi: 'बदन दर्द',
    category: 'General',
    synonyms: ['myalgia', 'generalized ache', 'muscle pain', 'sore body', 'badan dard'],
    icd10Code: 'M79.1',
    defaultWeight: 0.9,
  },
];

async function seed() {
  console.log('Seeding Standardized Clinical Symptoms catalog...');
  let count = 0;
  for (const sym of STANDARDIZED_SYMPTOMS) {
    await prisma.symptom.upsert({
      where: { code: sym.code },
      update: sym,
      create: sym,
    });
    count++;
  }
  console.log(`✓ Successfully seeded ${count} standardized clinical symptoms.`);
  await prisma.$disconnect();
}

seed().catch((err) => {
  console.error('Error seeding symptoms:', err);
  prisma.$disconnect();
  process.exit(1);
});

