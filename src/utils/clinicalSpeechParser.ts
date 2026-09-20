/**
 * Clinical Speech Parser for RuralCare SIH 26133
 * "Vernacular AI for ASHAs"
 *
 * Multilingual clinical phrase extraction supporting:
 * - Marathi (mr-IN, Devanagari & Romanized, colloquial expressions)
 * - Hindi (hi-IN, Devanagari & Romanized Hinglish)
 * - English (en-IN)
 * - Natural Mixed Code-Switching (e.g. Marathi + English, Hindi + English)
 *
 * Core Clinical Principles:
 * - Understands natural clinical meaning, not exact sentence matching
 * - Scans the entire transcript: symptoms can appear anywhere in the sentence
 * - Extracts canonical clinical symptoms mapped to standardized catalog
 * - Contextual negation detection: preserves symptoms with affirmative copula (e.g. "बुखार है")
 *   while accurately negating true negatives (e.g. "ताप नाही", "no fever")
 * - Body location extraction (e.g. Hand, Fingers, Foot, Leg for tingling/numbness)
 * - Duration extraction (e.g. "कल से", "दोन दिवसांपासून", "2 din se" -> < 24 hours / 1-3 days)
 * - Captures general feeling unwell ("मेरी तबीयत अच्छी नहीं है", "not feeling well") as clinical observations
 * - Numeric vitals extraction with physiological bounds
 * - Qualitative finding capture (e.g. "BP high hai" -> observation note without fake numbers)
 * - Strict non-diagnostic safety: Never invents clinical diagnoses (e.g. no stroke, diabetes)
 * - Flags unrecognized clinical phrases for human ASHA review
 */

export interface ParsedVitals {
  temperature?: string;
  bloodPressure?: string;
  heartRate?: string;
  spo2?: string;
  weight?: string;
  // Aliases matching HealthAssessment form state:
  temp?: string;
  bp?: string;
  hr?: string;
}

export interface ParsedClinicalData {
  symptoms: string[];
  vitals: ParsedVitals;
  duration?: string;
  rawText: string;
  locations?: string[];
  symptomLocations?: Record<string, string[]>;
  qualitativeFindings?: string[];
  unrecognized?: boolean;
  unrecognizedMessage?: string;
}

/**
 * Standard symptom names exactly aligned with HealthAssessment and
 * database StandardizedSymptom catalog.
 */
export const CANONICAL_SYMPTOMS = {
  FEVER: 'Fever',
  COUGH: 'Cough',
  COLD: 'Cold / Runny nose',
  SHORTNESS_OF_BREATH: 'Shortness of breath',
  CHEST_TIGHTNESS: 'Chest tightness',
  CHEST_PAIN: 'Chest pain',
  FATIGUE: 'Fatigue / Weakness',
  DIZZINESS: 'Dizziness',
  HEADACHE: 'Headache',
  VOMITING: 'Nausea / Vomiting',
  ABDOMINAL_PAIN: 'Abdominal pain',
  DIARRHOEA: 'Diarrhoea',
  LOSS_OF_APPETITE: 'Loss of appetite',
  JOINT_PAIN: 'Joint pain',
  BACK_PAIN: 'Back pain',
  SWELLING: 'Swelling (oedema)',
  RASH: 'Skin rash',
  BLURRED_VISION: 'Blurred vision',
  FAINTING: 'Fainting',
  PALPITATIONS: 'Palpitations',
  TINGLING: 'Tingling / Numbness',
} as const;

interface BodyLocationRule {
  location: string;
  patterns: RegExp[];
}

const BODY_LOCATION_RULES: BodyLocationRule[] = [
  {
    location: 'Hand',
    patterns: [
      /\b(?:hand|hands|arm|arms|palm|palms|wrist)\b/i,
      /\b(?:haat|hath|haath|hatala|hatat|bahon)\b/i,
      /हाताला/u,
      /हातात/u,
      /हातांना/u,
      /माझ्या\s+हाताला/u,
      /हातापायाला/u,
      /हाथों\s*में/u,
      /हाथ\s*में/u,
      /हाथों/u,
      /हाथ/u,
      /हात/u,
    ],
  },
  {
    location: 'Fingers',
    patterns: [
      /\b(?:finger|fingers|thumb|thumbs)\b/i,
      /\b(?:botat|botanna|bota|ungli|ungliya|ungliyo)\b/i,
      /बोटांना/u,
      /बोटात/u,
      /बोटांमध्ये/u,
      /बोट/u,
      /बोटे/u,
      /उंगलियों\s*में/u,
      /उंगलियां/u,
      /उंगली/u,
    ],
  },
  {
    location: 'Foot',
    patterns: [
      /\b(?:foot|feet|sole|soles)\b/i,
      /\b(?:pay|paay|payala|payat|pair|per|talve)\b/i,
      /पायाला/u,
      /पायात/u,
      /पायांना/u,
      /पाऊल/u,
      /पावलांना/u,
      /पैर\s*में/u,
      /पैरों/u,
      /पैर/u,
      /तलवे/u,
      /हातापायाला/u,
    ],
  },
  {
    location: 'Leg',
    patterns: [
      /\b(?:leg|legs|calf|calves|thigh|thighs|shin)\b/i,
      /\b(?:taang|tange|tang|pindli)\b/i,
      /टांग/u,
      /टांगें/u,
      /पिंडली/u,
      /मांड्या/u,
      /नडगी/u,
    ],
  },
];

interface SymptomRule {
  canonicalName: string;
  patterns: RegExp[];
}

/**
 * Natural colloquial expressions across Marathi, Hindi, English, and Romanized variations.
 */
const SYMPTOM_RULES: SymptomRule[] = [
  // 1. FEVER
  {
    canonicalName: CANONICAL_SYMPTOMS.FEVER,
    patterns: [
      /\b(?:high\s+|low\s+|mild\s+)?fever(?:ish)?\b/i,
      /\b(?:high\s+)?febrile\b/i,
      /\b(?:pyrexia|hot\s+body)\b/i,
      /\btemperature\s+(?:is\s+)?high\b/i,
      /\b(?:tez\s+|jada\s+|bahut\s+)?bukhar\b/i,
      /\b(?:tez\s+|jada\s+|bahut\s+)?bukhaar\b/i,
      /\b(?:jast\s+|khup\s+|tez\s+)?taap\b/i,
      /\b(?:jast\s+|khup\s+)?tap\b/i,
      /\b(?:ang\s+taplay|ang\s+garam|garam\s+badan|badan\s+garam)\b/i,
      /\bhararat\b/i,
      /बुखार/u,
      /हरारत/u,
      /ताप\s*(?:आहे|आला|येतोय|आली|येते|चढला)/u,
      /खूप\s*ताप/u,
      /तेज\s*ताप/u,
      /अंग\s*(?:तापलंय|गरम\s*आहे|तापले|गरम)/u,
      /बदन\s*गरम/u,
      /शरीर\s*गरम/u,
      /ताप/u,
    ],
  },

  // 2. VOMITING / NAUSEA
  {
    canonicalName: CANONICAL_SYMPTOMS.VOMITING,
    patterns: [
      /\bvomit(?:ing|ings)?\b/i,
      /\bvomat(?:ing|ings)?\b/i,
      /\bnausea\b/i,
      /\bpuking\b/i,
      /\bthrowing\s+up\b/i,
      /\bemesis\b/i,
      /\b(?:ulti|ultian|ultiyan|ultaiyan|ultiya|ultiyaan)(?:\s+ho\s+rahi|\s+hot\s+ahe|\s+aana|\s+aata|\s+hote|\s+hotat)?\b/i,
      /\b(?:ultya|ultyas)(?:\s+hot\s+ahet|\s+hotat|\s+hot\s+aahet)?\b/i,
      /\b(?:okari|vaman)\b/i,
      /\bjee?\s+micha?la(?:na)?\b/i,
      /\bmalmal\b/i,
      /\bmatli\b/i,
      /उल्टी/u,
      /उलटी/u,
      /उल्टियां/u,
      /उल्टियाँ/u,
      /उलटिया/u,
      /उलटियां/u,
      /उल्ट्या/u,
      /उलट्या/u,
      /ओकारी/u,
      /वांती/u,
      /वांत्या/u,
      /जी\s*मिचलाना/u,
      /मळमळ/u,
    ],
  },

  // 3. HEADACHE
  {
    canonicalName: CANONICAL_SYMPTOMS.HEADACHE,
    patterns: [
      /\bheadache\b/i,
      /\bhead\s+(?:is\s+)?(?:hurting|hurts|pain|ache)\b/i,
      /\bmigraine\b/i,
      /\bcephal(?:algia|ea)\b/i,
      /\b(?:sar|sir|seer)\s*(?:dard|me\s+dard|dukh\s+raha)\b/i,
      /\bmatha\s+dard\b/i,
      /\b(?:doke|doka)\s+(?:dukhat|dukhtay|dukhne)\b/i,
      /\bdokedukhi\b/i,
      /डोकं\s*दुखतंय/u,
      /डोके\s*दुखत\s*आहे/u,
      /डोक्यात\s*दुखतंय/u,
      /डोकेदुखी/u,
      /डोकं\s*दुखत/u,
      /सिर\s*दर्द/u,
      /सिरदर्द/u,
      /माथा\s*दर्द/u,
    ],
  },

  // 4. ABDOMINAL PAIN
  {
    canonicalName: CANONICAL_SYMPTOMS.ABDOMINAL_PAIN,
    patterns: [
      /\b(?:abdominal|belly|stomach|tummy)\s+(?:pain|ache|is\s+hurting|cramps?)\b/i,
      /\bcolic\b/i,
      /\bpet\s*(?:dard|mein\s+dard|me\s+dard|dukh\s+raha|dukh)\b/i,
      /\bpot\s*dukhtay\b/i,
      /\bpotat\s*(?:dukhat|dukhtay|vedna|kal)\b/i,
      /\bpotdukhi\b/i,
      /पोट\s*दुखतंय/u,
      /पोटात\s*दुखतंय/u,
      /पोट\s*दुखत\s*आहे/u,
      /पोटात\s*कळ\s*येते/u,
      /पोटात\s*कळा\s*येतात/u,
      /पोटदुखी/u,
      /पोटात\s*दुख/u,
      /पेट\s*में\s*दर्द/u,
      /पेटदर्द/u,
      /पेट\s*दुख/u,
    ],
  },

  // 5. DIARRHOEA
  {
    canonicalName: CANONICAL_SYMPTOMS.DIARRHOEA,
    patterns: [
      /\bdiarrh?oe?a\b/i,
      /\bloose\s+(?:motions?|stools?)\b/i,
      /\bwatery\s+stools?\b/i,
      /\bdast\b/i,
      /\bjulaab\b/i,
      /\bjulab\b/i,
      /\bhagwan\b/i,
      /\bpatal\s+(?:sandas|shouch)\b/i,
      /जुलाब\s*झाले/u,
      /जुलाब\s*होत\s*आहेत/u,
      /सारखे\s*जुलाब/u,
      /पातळ\s*शौच/u,
      /पातळ\s*संडास/u,
      /जुलाब/u,
      /दस्त/u,
    ],
  },

  // 6. DIZZINESS
  {
    canonicalName: CANONICAL_SYMPTOMS.DIZZINESS,
    patterns: [
      /\bdizz(?:y|iness)\b/i,
      /\bfeel\s+dizzy\b/i,
      /\bvertigo\b/i,
      /\bgiddiness\b/i,
      /\blightheaded(?:ness)?\b/i,
      /\bchakkar(?:\s+aana|\s+yet\s+ahe|\s+aata|\s+yete)?\b/i,
      /\bgargarte\b/i,
      /\bgargarlyasarkha\b/i,
      /\bbhowal\b/i,
      /चक्कर\s*येते/u,
      /चक्कर\s*येत\s*आहे/u,
      /गरगरते/u,
      /गरगरल्यासारखं/u,
      /भोवळ/u,
      /चक्कर/u,
    ],
  },

  // 7. FATIGUE / WEAKNESS
  {
    canonicalName: CANONICAL_SYMPTOMS.FATIGUE,
    patterns: [
      /\b(?:fatigue|weakness|tired(?:ness)?|exhaustion|lethargy|malaise)\b/i,
      /\bfeel\s+(?:very\s+)?weak\b/i,
      /\b(?:insomnia|sleepless(?:ness)?)\b/i,
      /\bkamzori\b/i,
      /\bkamjori\b/i,
      /\bthakan\b/i,
      /\bthakva\b/i,
      /\bashaktapana\b/i,
      /\bashakt\s+vat-?tay\b/i,
      /\bangat\s+takad\s+nahi\b/i,
      /\bneend\s+(?:nahi|na)\s+aa(?:ti|rahi|na)\b/i,
      /खूप\s*अशक्तपणा/u,
      /अशक्त\s*वाटतंय/u,
      /अंगात\s*ताकद\s*नाही/u,
      /खूप\s*कमजोरी/u,
      /थकवा\s*जाणवतोय/u,
      /अशक्तपणा/u,
      /थकवा/u,
      /कमजोरी/u,
      /थकान/u,
      /(?:नींद\s+(?:नहीं\s+आती|नहीं\s+आ\s+रही|न\s+आना|भी\s+नहीं\s+आती)|झोप\s+(?:येत\s+नाही|नाही))/u,
    ],
  },

  // 8. TINGLING / NUMBNESS (CRITICAL SYMPTOM)
  {
    canonicalName: CANONICAL_SYMPTOMS.TINGLING,
    patterns: [
      /\b(?:tingl(?:ing|e)|numb(?:ness|s)?|paresthesia)\b/i,
      /\bpins\s+and\s+needles\b/i,
      /\b(?:feels?\s+numb|hand\s+is\s+tingling|foot\s+is\s+tingling)\b/i,
      /\b(?:mungya|mungya\s+yetat|mungya\s+yet\s+aahet|hatala\s+mungya|payala\s+mungya)\b/i,
      /\b(?:jhanjhanahat|jhunjhuni|jhanjhani)\b/i,
      /\b(?:sunn|sunn\s+padla|sunn\s+hotoy|sunnpan)\b/i,
      /मुंग्या\s*(?:येतात|येत\s*आहेत|येणे|येत)/u,
      /मुंग्या/u,
      /झनझनाहट/u,
      /सुन्नपन/u,
      /सुन्न\s*(?:हो\s*रहा|हो\s*रही|पडलं|पडला|वाटतंय|होणे)/u,
      /बधीर/u,
    ],
  },

  // 9. COUGH
  {
    canonicalName: CANONICAL_SYMPTOMS.COUGH,
    patterns: [
      /\b(?:dry\s+|productive\s+|wet\s+)?cough(?:ing)?\b/i,
      /\bkhansi\b/i,
      /\bkhasi\b/i,
      /\bkhokla\b/i,
      /\bkhokli\b/i,
      /खोकला\s*(?:येतोय|आहे|येत\s*आहे)/u,
      /सतत\s*खोकला/u,
      /कोरडा\s*खोकला/u,
      /ओला\s*खोकला/u,
      /खोकला/u,
      /खांसी/u,
      /खोंखला/u,
    ],
  },

  // 10. SHORTNESS OF BREATH
  {
    canonicalName: CANONICAL_SYMPTOMS.SHORTNESS_OF_BREATH,
    patterns: [
      /\b(?:shortness\s+of\s+breath|breathless(?:ness)?|difficulty\s+breathing)\b/i,
      /\bbreathing\s+(?:problem|issue|difficulty|trouble)\b/i,
      /\bdyspnea\b/i,
      /\bsob\b/i,
      /\bsaans\s+(?:lene\s+mein\s+dikkat|phulna|foolna|chadhna|tras)\b/i,
      /\bsans\s+(?:fulna|lene\s+me\s+taklif)\b/i,
      /\bshwas\s+(?:ghyaylat?\s+tras|lagne|ghene\s+tras)\b/i,
      /\b(?:dhap\s+lagte|dam\s+lagto|dam\s+lagne)\b/i,
      /श्वास\s*घ्यायला\s*त्रास/u,
      /श्वास\s*घेता\s*येत\s*नाही/u,
      /धाप\s*लागते/u,
      /दम\s*लागतो/u,
      /सांस\s*लेने\s*में\s*तकलीफ/u,
      /सांस\s*फूल\s*रही/u,
      /सांस\s*फूलना/u,
      /श्वास\s*घेण्यास\s*त्रास/u,
    ],
  },

  // 11. CHEST PAIN
  {
    canonicalName: CANONICAL_SYMPTOMS.CHEST_PAIN,
    patterns: [
      /\bchest\s+pain\b/i,
      /\bangina\b/i,
      /\bcardiac\s+pain\b/i,
      /\bheart\s+pain\b/i,
      /\bseene\s+mein\s+dard\b/i,
      /\bchhati\s+(?:me\s+dard|dard|dukh\s+rahi)\b/i,
      /\bchhatit\s+(?:dukhat\s+ahe|dukhtay|vedna|kal)\b/i,
      /छातीत\s*दुखतंय/u,
      /छातीमध्ये\s*दुखतंय/u,
      /छातीत\s*कळ\s*येते/u,
      /छातीत\s*दुख/u,
      /सीने\s*में\s*दर्द/u,
      /छाती\s*में\s*दर्द/u,
      /छातीत\s*वेदना/u,
    ],
  },

  // 12. CHEST TIGHTNESS
  {
    canonicalName: CANONICAL_SYMPTOMS.CHEST_TIGHTNESS,
    patterns: [
      /\bchest\s+tight(?:ness)?\b/i,
      /\bheaviness\s+in\s+chest\b/i,
      /\bseene\s+mein\s+jakdan\b/i,
      /\bchhati\s+jakadna\b/i,
      /सीने\s+में\s+जकड़न/u,
      /छातीत\s+जकडणे/u,
    ],
  },

  // 13. LOSS OF APPETITE
  {
    canonicalName: CANONICAL_SYMPTOMS.LOSS_OF_APPETITE,
    patterns: [
      /\b(?:loss\s+of\s+appetite|poor\s+appetite|reduced\s+hunger|not\s+eating)\b/i,
      /\bdon'?t\s+feel\s+like\s+eating\b/i,
      /\banorexia\b/i,
      /\bbhookh\s+(?:na\s+lagna|kam\s+lagna|nahi\s+lagti)\b/i,
      /\bbhuk\s+(?:lagat\s+nahi|kam\s+lagte)\b/i,
      /भूक\s*लागत\s*नाही/u,
      /काही\s*खावसं\s*वाटत\s*नाही/u,
      /खाण्याची\s*इच्छा\s*नाही/u,
      /जेवण\s*जात\s*नाही/u,
      /भूख\s*नहीं\s*लगती/u,
      /भूख\s*न\s*लगना/u,
    ],
  },

  // 14. JOINT PAIN
  {
    canonicalName: CANONICAL_SYMPTOMS.JOINT_PAIN,
    patterns: [
      /\bjoint\s+pain\b/i,
      /\barthr(?:algia|itis)\b/i,
      /\bknee\s+pain\b/i,
      /\bjod(?:o)?\s+me(?:in)?\s+dard\b/i,
      /\bsandhidukhi\b/i,
      /\bsandhe\s+dukhat\b/i,
      /\bgudghe\s+dukhat\b/i,
      /सांधे\s*दुखत\s*आहेत/u,
      /संधी\s*दुखत\s*आहेत/u,
      /गुडघे\s*दुखत\s*आहेत/u,
      /कोपर\s*दुखतोय/u,
      /सांधेदुखी/u,
      /जोड़ों\s*में\s*दर्द/u,
      /गुडघे\s*दुखी/u,
    ],
  },

  // 15. BACK PAIN
  {
    canonicalName: CANONICAL_SYMPTOMS.BACK_PAIN,
    patterns: [
      /\bback\s+(?:pain|ache)\b/i,
      /\blumbago\b/i,
      /\bkamar\s+dard\b/i,
      /\bpeeth\s+dard\b/i,
      /\bpath\s+dukhat\s+ahe\b/i,
      /\bpath\s+dukhte\b/i,
      /\bkambar\s+dukhte\b/i,
      /\bkambaret\s+dukhtay\b/i,
      /\bkamardukhi\b/i,
      /पाठ\s*दुखते/u,
      /कंबर\s*दुखते/u,
      /कंबरेत\s*दुखतंय/u,
      /कमर\s*दर्द/u,
      /पीठ\s*दर्द/u,
      /पाठदुखी/u,
    ],
  },

  // 16. SWELLING
  {
    canonicalName: CANONICAL_SYMPTOMS.SWELLING,
    patterns: [
      /\b(?:swelling|oedema|edema|swollen)\b/i,
      /\bsoojan\b/i,
      /\bsujan\b/i,
      /\bsujav\b/i,
      /\bsooj\b/i,
      /हात\s*सुजले/u,
      /पाय\s*सुजले/u,
      /हातापायाला\s*सूज/u,
      /चेहऱ्यावर\s*सूज/u,
      /सूज\s*(?:आली|आहे)/u,
      /सूजन/u,
      /सूज/u,
    ],
  },

  // 17. COLD / RUNNY NOSE
  {
    canonicalName: CANONICAL_SYMPTOMS.COLD,
    patterns: [
      /\b(?:common\s+)?cold\b/i,
      /\brunny\s+nose\b/i,
      /\brhinorrhea\b/i,
      /\bsneezing\b/i,
      /\bnasal\s+congestion\b/i,
      /\bblocked\s+nose\b/i,
      /\bjukam\b/i,
      /\bzukam\b/i,
      /\bsardi\b/i,
      /\bnaak\s+behna\b/i,
      /\bnaak\s+vahan\b/i,
      /\bthandi\s+lagna\b/i,
      /जुकाम/u,
      /सर्दी/u,
      /वाहती\s*नाक/u,
      /शिंका/u,
      /नाकातून\s*पाणी/u,
    ],
  },

  // 18. RASH
  {
    canonicalName: CANONICAL_SYMPTOMS.RASH,
    patterns: [
      /\b(?:skin\s+)?rash(?:es)?\b/i,
      /\bitching\b/i,
      /\bkhujli\b/i,
      /\bkhaj\b/i,
      /\bpurad\b/i,
      /त्वचा\s*पुरळ/u,
      /खुजली/u,
      /खाज/u,
    ],
  },

  // 19. BLURRED VISION
  {
    canonicalName: CANONICAL_SYMPTOMS.BLURRED_VISION,
    patterns: [
      /\b(?:blurred\s+vision|blurry\s+vision|blur\s+vision)\b/i,
      /\bdhundhla\s+(?:dikhna|dikhta)\b/i,
      /\bdhusar\s+(?:disne|distay)\b/i,
      /डोळ्यासमोर\s*धुसर\s*दिसतंय/u,
      /नीट\s*दिसत\s*नाही/u,
      /धूसर\s*दिसतंय/u,
      /धुंधला\s+दिखना/u,
      /धुसर\s+दिसणे/u,
    ],
  },

  // 20. FAINTING
  {
    canonicalName: CANONICAL_SYMPTOMS.FAINTING,
    patterns: [
      /\b(?:faint(?:ing|ed)?|syncope|unconscious(?:ness)?)\b/i,
      /\bbehosh(?:i)?\b/i,
      /\bbeshuddha\b/i,
      /बेशुद्ध\s*पडला/u,
      /बेशुद्ध\s*झाली/u,
      /शुद्ध\s*हरपली/u,
      /बेहोश/u,
      /बेशुद्ध/u,
    ],
  },

  // 21. PALPITATIONS
  {
    canonicalName: CANONICAL_SYMPTOMS.PALPITATIONS,
    patterns: [
      /\bpalpitation(?:s)?\b/i,
      /\bracing\s+heart\b/i,
      /\bdil\s+ki\s+dhadkan\s+tez\b/i,
      /\bghabrahat\b/i,
      /\bchhatit\s+dhad-?dhad\b/i,
      /हृदय\s*जोरात\s*धडधडतंय/u,
      /हृदयाची\s*धडधड\s*वाढली/u,
      /छातीत\s*धडधड\s*जाणवते/u,
      /घबराहट/u,
      /दिल\s+की\s+धड़कन\s+तेज/u,
      /छातीत\s+धडधड/u,
    ],
  },
];

/**
 * Converts Devanagari numerals (०-९) to ASCII digits (0-9)
 */
export function normalizeDigits(text: string): string {
  const devanagariDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
  return text.replace(/[०-९]/g, (ch) => String(devanagariDigits.indexOf(ch)));
}

/**
 * Normalizes vernacular number words into digits for consistent parsing.
 * Uses strict Unicode boundaries so substrings of larger words aren't accidentally damaged.
 */
export function normalizeSpokenNumberWords(text: string): string {
  const spokenNumberRules: [RegExp, string][] = [
    // Devanagari words with Unicode boundaries
    [/(?<=[^\p{L}\p{N}]|^)दोन(?=[^\p{L}\p{N}]|$)/gu, '2'],
    [/(?<=[^\p{L}\p{N}]|^)तीन(?=[^\p{L}\p{N}]|$)/gu, '3'],
    [/(?<=[^\p{L}\p{N}]|^)चार(?=[^\p{L}\p{N}]|$)/gu, '4'],
    [/(?<=[^\p{L}\p{N}]|^)पाच(?=[^\p{L}\p{N}]|$)/gu, '5'],
    [/(?<=[^\p{L}\p{N}]|^)पाँच(?=[^\p{L}\p{N}]|$)/gu, '5'],
    [/(?<=[^\p{L}\p{N}]|^)पांच(?=[^\p{L}\p{N}]|$)/gu, '5'],
    [/(?<=[^\p{L}\p{N}]|^)सहा(?=[^\p{L}\p{N}]|$)/gu, '6'],
    [/(?<=[^\p{L}\p{N}]|^)छह(?=[^\p{L}\p{N}]|$)/gu, '6'],
    [/(?<=[^\p{L}\p{N}]|^)सात(?=[^\p{L}\p{N}]|$)/gu, '7'],
    [/(?<=[^\p{L}\p{N}]|^)आठ(?=[^\p{L}\p{N}]|$)/gu, '8'],
    [/(?<=[^\p{L}\p{N}]|^)नऊ(?=[^\p{L}\p{N}]|$)/gu, '9'],
    [/(?<=[^\p{L}\p{N}]|^)नौ(?=[^\p{L}\p{N}]|$)/gu, '9'],
    [/(?<=[^\p{L}\p{N}]|^)दहा(?=[^\p{L}\p{N}]|$)/gu, '10'],
    [/(?<=[^\p{L}\p{N}]|^)दस(?=[^\p{L}\p{N}]|$)/gu, '10'],
    [/(?<=[^\p{L}\p{N}]|^)एक(?=[^\p{L}\p{N}]|$)/gu, '1'],
    [/(?<=[^\p{L}\p{N}]|^)दो(?=[^\p{L}\p{N}]|$)/gu, '2'],

    // English & Romanized words
    [/\bthree\b/gi, '3'],
    [/\bseven\b/gi, '7'],
    [/\beight\b/gi, '8'],
    [/\bpaanch\b/gi, '5'],
    [/\bchaar\b/gi, '4'],
    [/\bpanch\b/gi, '5'],
    [/\bteen\b/gi, '3'],
    [/\bsaat\b/gi, '7'],
    [/\baath\b/gi, '8'],
    [/\bfour\b/gi, '4'],
    [/\bfive\b/gi, '5'],
    [/\bnine\b/gi, '9'],
    [/\bone\b/gi, '1'],
    [/\btwo\b/gi, '2'],
    [/\bsix\b/gi, '6'],
    [/\bten\b/gi, '10'],
    [/\bchar\b/gi, '4'],
    [/\bchhe\b/gi, '6'],
    [/\bche\b/gi, '6'],
    [/\bnau\b/gi, '9'],
    [/\bdas\b/gi, '10'],
    [/\bdo\b/gi, '2'],
    [/\bek\b/gi, '1'],
  ];

  let result = text;
  for (const [rx, digit] of spokenNumberRules) {
    result = result.replace(rx, digit);
  }
  return result;
}

/**
 * Contextual negation checker.
 * Determines if a matched symptom instance within a text string is negated
 * (e.g. "ताप नाही", "no fever", "उलटी होत नाही", "हाताला मुंग्या येत नाहीत").
 *
 * CRITICAL FIX: If the symptom is immediately affirmed with a presence copula
 * (e.g. "बुखार है", "ताप आहे", "खोकला आहे"), it is explicitly confirmed and NOT negated,
 * even if another clause later in the sentence contains a negation (e.g. "मेरी तबीयत अच्छी नहीं है").
 */
export function isMatchNegated(text: string, start: number, end: number): boolean {
  // 1. Check preceding text (within 35 characters, stopping at clause boundaries)
  const preWindow = text.slice(Math.max(0, start - 35), start);
  const preBoundaryMatch = preWindow.match(
    /.*(?:[.,;?!]|(?<=[^\p{L}\p{N}]|^)(?:पण|परंतु|लेकिन|मगर|किंतु|पर|but|however|except)(?=[^\p{L}\p{N}]|$)\s*)/u
  );
  const relevantPre = preBoundaryMatch ? preWindow.slice(preBoundaryMatch[0].length) : preWindow;

  const preNegRegex =
    /(?:^|\s|[.,;?!])(?:no|not|denies|denied|without|rule\s+out|rules\s+out|free\s+of|negative\s+for|नहीं|ना|नाही|न|nahi|nahin|bina)(?:\s+any)?(?:\s+|$)$/iu;
  if (preNegRegex.test(relevantPre.trim())) {
    return true;
  }

  // 2. Check following text (within 35 characters)
  const postWindow = text.slice(end, Math.min(text.length, end + 35));

  // If immediately followed by an affirmative presence indicator (e.g. "बुखार है", "ताप आहे", "खोकला आहे", "दुखत आहे", "होत आहे"),
  // this symptom is EXPLICITLY AFFIRMED, NOT NEGATED!
  const affirmativeRegex =
    /^\s*(?:है|था|थी|थे|आया\s+है|आ\s*रहा\s+है|हो\s*रहा\s+है|हो\s*रही\s+है|चढ़ा\s+है|लगा\s+है|आहे|आला\s+आहे|येतोय|झाला\s+आहे|होत\s+आहेत?|येत\s+आहेत?|वाटतंय|दुखत\s+आहे)(?:\s+|$|[.,;?!])/u;
  if (affirmativeRegex.test(postWindow)) {
    return false;
  }

  // Check for immediate negation within the same clause (within 3-4 words or until clause boundary)
  const postBoundaryIndex = postWindow.search(
    /[.;?!]|(?<=[^\p{L}\p{N}]|^)(?:पण|परंतु|लेकिन|मगर|किंतु|but|however|except)(?=[^\p{L}\p{N}]|$)/u
  );
  const relevantPost = postBoundaryIndex !== -1 ? postWindow.slice(0, postBoundaryIndex) : postWindow;

  // Immediate negation pattern: must be within the first 2-3 words of the symptom
  // Also handles verb inflection remnants like "त नाही", "णे नाही", "ता नाही" when a stem like "दुख" matched
  const postNegRegex =
    /^\s*(?:[तने|ता|ते|णे]\s+)?(?:भी\s+|तो\s+|पण\s+|ही\s+|बिल्कुल\s+)?(?:नाही|नाहीत|नसून|होत\s*नाही|येत\s*नाही|येत\s*नाहीत|दुखत\s*नाही|जाणवत\s*नाही|नाहीये|नहीं\s*है|नहीं|न\s*हो|न\s*है|भी\s*नहीं|nahi\s*hai|nahi|nahin|nhi|not\s+present|absent|negative|denied)(?:$|\s|[.,;?!])/u;
  if (postNegRegex.test(relevantPost)) {
    return true;
  }

  return false;
}

/**
 * Extracts duration from text matching common medical time spans.
 * Accurately recognizes "कल से", "आज से", "कालपासून", "since yesterday", etc.
 */
export function parseDuration(text: string): string | undefined {
  const normalizedDigits = normalizeDigits(text);
  const wordsNorm = normalizeSpokenNumberWords(normalizedDigits);
  const checkStrings = [text, normalizedDigits, wordsNorm];

  for (const s of checkStrings) {
    // 1. < 24 hours: "कल से", "आज से", "since yesterday", "since today", "1 day", "24 hours", "कालपासून", "आजपासून"
    if (
      /(?:less\s+than\s+24\s+hours|< ?24\s*h|aaj\s*se|kal\s*se|कल\s*से|आज\s*से|24\s*(?:ghante|hours|taas|घंटे|तास)|1\s*(?:day|din|दिन|दिवस)|ek\s*din|आजपासून|कालपासून|काल\s*पासून|आज\s*पासून|aajpasun|kalpasun|since\s+yesterday|since\s+today|yesterday|today)/iu.test(
        s
      )
    ) {
      return '< 24 hours';
    }

    // 2. 1-3 days: "2 दिन से", "3 दिन से", "दो दिन से", "तीन दिन से", "दोन दिवसांपासून", "तीन दिवसांपासून"
    if (
      /(?:(?:[123]|दोन|तीन|दो|teen|do|two|three)\s*(?:-\s*(?:[23]|तीन|दो))?\s*(?:din|days?|divas|divasapasun|दिन|दिवस|दिवसांपासून)|दोन\s*दिवसांपासून|तीन\s*दिवसांपासून|दोन\s*दिवस|तीन\s*दिवस|दो\s*दिन\s*से|तीन\s*दिन\s*से|दो\s*दिन|तीन\s*दिन|for\s+(?:two|three|[123])\s+days|[123]\s+days|तीन\s+दिवस\s+झाले|दोन\s+दिवस\s+झाले|don\s*divasapasun|teen\s*divasapasun|do\s*din\s*se|teen\s*din\s*se)/iu.test(
        s
      )
    ) {
      return '1-3 days';
    }

    // 3. 4-7 days: "4 दिन से", "चार दिवसांपासून", "एक हफ्ते से", "आठवड्यापासून", "since last week"
    if (
      /(?:(?:[4567]|चार|पाच|सहा|char|panch|four|five)\s*(?:days?|din|दिन|दिवस|दिवसांपासून)|चार\s*दिवसांपासून|पाच\s*दिवसांपासून|चार\s*दिन\s*से|पाच\s*दिन\s*से|char\s*din\s*se|1\s*(?:week|हफ्ता|आठवडा)|ek\s*hafta|ek\s*aathwada|एक\s*आठवडा|एक\s*हफ्ता|आठवड्यापासून|एक\s*हफ्ते\s*से|पिछले\s*हफ्ते\s*से|गेल्या\s*आठवड्यापासून|for\s+a\s+week|since\s+last\s+week)/iu.test(
        s
      )
    ) {
      return '4-7 days';
    }

    // 4. 1-2 weeks: "1-2 weeks", "2 weeks", "दो हफ्ते से", "दोन आठवडे"
    if (
      /(?:1\s*-\s*2\s*(?:weeks?|हफ्ते|आठवडे)|2\s*(?:weeks?|हफ्ते|आठवडे)|do\s*hafte|दोन\s*आठवडे|दोन\s*आठवड्यांपासून|दो\s*हफ्ते\s*से|दो\s*हफ्ते)/iu.test(
        s
      )
    ) {
      return '1-2 weeks';
    }

    // 5. > 2 weeks: "एक महीने से", "महिन्यापासून", "for one month", "chronic", "> 2 weeks"
    if (
      /(?:>\s*2\s*weeks|month|mahina|mahine\s*se|chronic|महिनाभर|महीने\s*से|महिना|एक\s*महीने\s*से|एक\s*महिना|महिन्यापासून|for\s+one\s+month|more\s+than\s+2\s+weeks)/iu.test(
        s
      )
    ) {
      return '> 2 weeks';
    }
  }

  return undefined;
}

/**
 * Extracts qualitative clinical findings when explicit numbers are not given
 * (e.g. "BP high ho raha hai", "BP zyada hai", "BP low hai", "BP जास्त आहे",
 * or general feeling unwell like "मेरी तबीयत अच्छी नहीं है", "not feeling well").
 */
export function parseQualitativeFindings(text: string): string[] {
  const findings: string[] = [];

  // High Blood Pressure / Hypertension reported qualitatively
  if (
    /(?:बीपी|बी\.पी\.|ब्लड\s*प्रेशर|रक्तदाब|bp|b\.?p\.?)\s*(?:भी\s+)?(?:हाई|हाय|ज्यादा|बढ़|वाढ|जास्त|high|elevated)/i.test(text) ||
    /(?:उच्च\s*रक्तचाप|रक्तदाब\s*जास्त)/i.test(text) ||
    /\b(?:high\s+(?:bp|blood\s*pressure)|hypertension)\b/i.test(text)
  ) {
    findings.push('High Blood Pressure reported (बीपी हाई / रक्तदाब जास्त)');
  }

  // Low Blood Pressure / Hypotension reported qualitatively
  if (
    /(?:बीपी|बी\.पी\.|ब्लड\s*प्रेशर|रक्तदाब|bp|b\.?p\.?)\s*(?:भी\s+)?(?:लो|कम|कमी|low)/i.test(text) ||
    /\b(?:low\s+(?:bp|blood\s*pressure)|hypotension)\b/i.test(text)
  ) {
    findings.push('Low Blood Pressure reported (बीपी लो / रक्तदाब कमी)');
  }

  // General feeling unwell / malaise reported ("मेरी तबीयत अच्छी नहीं है", "not feeling well", "बरं वाटत नाही")
  if (
    /(?:तबीयत\s*(?:अच्छी\s*नहीं|ठीक\s*नहीं|खराब)|तब्येत\s*(?:ठीक\s*नाही|बरी\s*नाही)|बरं\s*वाटत\s*नाही|बरं\s*नाही\s*वाटत|आई\s*एम\s*नॉट\s*फिलिंग\s*वेल|not\s*feeling\s*well|feeling\s*unwell|don'?t\s*feel\s*well|unwell)/iu.test(text)
  ) {
    findings.push('General unwellness reported (तबीयत ठीक नहीं / Feeling unwell)');
  }

  // Dental / Tooth discomfort reported ("दांतों में भी हो रही है", "दांत में दर्द")
  if (
    /(?:दांतों\s*में|दांत\s*में|दातांमध्ये|दात\s*दुख|toothache|teeth)/iu.test(text)
  ) {
    findings.push('Dental / Tooth discomfort noted (दांतों में)');
  }

  return findings;
}

/**
 * Extracts vitals strictly when an explicit numeric value is provided.
 * Qualitative statements (e.g. "BP zyada hai", "bukhar hai") DO NOT set numeric vitals.
 */
export function parseVitals(text: string): ParsedVitals {
  const vitals: ParsedVitals = {};
  const normalized = normalizeDigits(text);

  // 1. Blood Pressure: Look for "BP 150 over 95", "120/80", "BP 140 by 90", "बीपी 140 90", "बीपी 140 और 90", "BP 140 by 90 आहे"
  const bpRegexes = [
    /(?:bp|blood\s*pressure|b\.?p\.?|बीपी|बी\.पी\.|ब्लड\s*प्रेशर|रक्तदाब)\s*(?:is|=|:|hai|ahe|है|आहे)?\s*(\d{2,3})\s*(?:over|\/|by|se|aur|\-|और|आणि|ते|\s+)\s*(\d{2,3})/i,
    /(\d{2,3})\s*(?:over|\/|by|se|\-)\s*(\d{2,3})\s*(?:bp|blood\s*pressure|b\.?p\.?|बीपी|बी\.पी\.|ब्लड\s*प्रेशर|रक्तदाब)/i,
    /\b(\d{2,3})\s*\/\s*(\d{2,3})\b/,
  ];

  for (const rx of bpRegexes) {
    const match = normalized.match(rx);
    if (match) {
      const systolic = parseInt(match[1], 10);
      const diastolic = parseInt(match[2], 10);
      // Physiologic plausibility guard
      if (systolic >= 60 && systolic <= 260 && diastolic >= 30 && diastolic <= 160) {
        vitals.bloodPressure = `${systolic}/${diastolic}`;
        vitals.bp = `${systolic}/${diastolic}`;
        break;
      }
    }
  }

  // 2. Temperature: Look for explicit numbers: "temperature 102", "temp 99.5", "102 degree", "tapman 101", "बुखार 102", "ताप 101"
  // Plain "bukhar hai" or "tez bukhar" MUST NOT invent temperature!
  const tempRegexes = [
    /(?:temperature|temp|tapman|taapman|fever|bukhar|taap|tap|तापमान|टेम्परेचर|बुखार|ताप)\s*(?:is|=|:|hai|ahe|है|आहे)?\s*(\d{2,3}(?:\.\d+)?)/i,
    /(\d{2,3}(?:\.\d+)?)\s*(?:degree|f|fahrenheit|c|celsius|बुखार|ताप)/i,
  ];

  for (const rx of tempRegexes) {
    const match = normalized.match(rx);
    if (match) {
      const val = parseFloat(match[1]);
      // Plausible human range: 35-43 °C or 94-110 °F
      if ((val >= 35 && val <= 43) || (val >= 94 && val <= 110)) {
        vitals.temperature = String(val);
        vitals.temp = String(val);
        break;
      }
    }
  }

  // 3. Heart Rate / Pulse: Look for "heart rate 110", "pulse 90", "HR 88", "110 bpm", "हार्ट रेट 85", "पल्स 90"
  const hrRegexes = [
    /(?:heart\s*rate|pulse(?:\s*rate)?|hr|heart\s*beat|हार्ट\s*रेट|पल्स|धड़कन|नाडी)\s*(?:is|=|:|hai|ahe|है|आहे)?\s*(\d{2,3})/i,
    /(\d{2,3})\s*(?:bpm|beats\s*per\s*minute)/i,
  ];

  for (const rx of hrRegexes) {
    const match = normalized.match(rx);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= 35 && val <= 240) {
        vitals.heartRate = String(val);
        vitals.hr = String(val);
        break;
      }
    }
  }

  // 4. Oxygen / SpO2: Look for "oxygen 95", "spo2 98", "O2 96%", "95 percent oxygen", "ऑक्सीजन 95"
  const spo2Regexes = [
    /(?:oxygen|spo2|saturations?|o2|ऑक्सीजन|सॅच्युरेशन)\s*(?:is|=|:|hai|ahe|है|आहे)?\s*(\d{2,3})\s*%?/i,
    /(\d{2,3})\s*%\s*(?:oxygen|spo2|o2)/i,
  ];

  for (const rx of spo2Regexes) {
    const match = normalized.match(rx);
    if (match) {
      const val = parseInt(match[1], 10);
      if (val >= 40 && val <= 100) {
        vitals.spo2 = String(val);
        break;
      }
    }
  }

  // 5. Weight: Look for "weight 65", "wazan 70", "vajan 55 kg", "वजन 55"
  const weightRegexes = [
    /(?:weight|wazan|vajan|वजन)\s*(?:is|=|:|hai|ahe|है|आहे)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:kg|kilo|किलो)?/i,
    /(\d{1,3}(?:\.\d+)?)\s*(?:kg|किलो)/i,
  ];

  for (const rx of weightRegexes) {
    const match = normalized.match(rx);
    if (match) {
      const val = parseFloat(match[1]);
      if (val >= 2 && val <= 250) {
        vitals.weight = String(val);
        break;
      }
    }
  }

  return vitals;
}

/**
 * Extracts body locations referenced in the clinical narrative
 * (e.g. Hand, Fingers, Foot, Leg).
 */
export function parseBodyLocations(text: string): string[] {
  const found = new Set<string>();
  for (const rule of BODY_LOCATION_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        found.add(rule.location);
        break;
      }
    }
  }
  return Array.from(found);
}

/**
 * Parses spoken speech text into structured clinical assessment fields.
 */
export function parseClinicalSpeech(rawText: string): ParsedClinicalData {
  if (!rawText || !rawText.trim()) {
    return {
      symptoms: [],
      vitals: {},
      rawText: '',
    };
  }

  const trimmed = rawText.trim();
  const normalized = normalizeDigits(trimmed);
  const wordsNormalized = normalizeSpokenNumberWords(normalized);

  // 1. Detect symptoms with contextual negation check across the entire transcript
  const detectedSymptoms = new Set<string>();

  for (const rule of SYMPTOM_RULES) {
    let hasPositiveMatch = false;

    for (const pattern of rule.patterns) {
      // Create a global copy to find all match occurrences across the whole transcript
      const globalRegex = new RegExp(
        pattern.source,
        pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'
      );

      let match: RegExpExecArray | null;
      while ((match = globalRegex.exec(trimmed)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        if (!isMatchNegated(trimmed, start, end)) {
          hasPositiveMatch = true;
          break;
        }
      }

      if (hasPositiveMatch) break;
    }

    if (hasPositiveMatch) {
      detectedSymptoms.add(rule.canonicalName);
    }
  }

  // 2. Detect vitals safely with strict numerical validation
  const vitals = parseVitals(wordsNormalized);

  // 3. Detect duration if explicitly mentioned anywhere in the transcript
  const duration = parseDuration(trimmed);

  // 4. Detect qualitative clinical findings (e.g. reported high BP without explicit numeric reading, feeling unwell)
  const qualitativeFindings = parseQualitativeFindings(trimmed);

  // 5. Detect body locations (e.g. Hand, Fingers, Foot, Leg)
  const locations = parseBodyLocations(trimmed);

  const symptomLocations: Record<string, string[]> = {};
  if (locations.length > 0) {
    if (detectedSymptoms.has(CANONICAL_SYMPTOMS.TINGLING)) {
      symptomLocations[CANONICAL_SYMPTOMS.TINGLING] = locations;
    } else if (detectedSymptoms.has(CANONICAL_SYMPTOMS.SWELLING)) {
      symptomLocations[CANONICAL_SYMPTOMS.SWELLING] = locations;
    } else if (detectedSymptoms.has(CANONICAL_SYMPTOMS.JOINT_PAIN)) {
      symptomLocations[CANONICAL_SYMPTOMS.JOINT_PAIN] = locations;
    }
  }

  const symptomsArray = Array.from(detectedSymptoms);
  const vitalsCount = Object.keys(vitals).length;
  const qualCount = qualitativeFindings.length;

  // 6. Unknown / Unrecognized clinical phrase handling (Section 15)
  // If words were spoken but no clinical entities or observations were recognized
  const wordsCount = trimmed.split(/\s+/).length;
  const isUnrecognized =
    wordsCount >= 2 &&
    symptomsArray.length === 0 &&
    vitalsCount === 0 &&
    !duration &&
    qualCount === 0;

  return {
    symptoms: symptomsArray,
    vitals,
    duration,
    rawText: trimmed,
    locations: locations.length > 0 ? locations : undefined,
    symptomLocations: Object.keys(symptomLocations).length > 0 ? symptomLocations : undefined,
    qualitativeFindings: qualCount > 0 ? qualitativeFindings : undefined,
    unrecognized: isUnrecognized ? true : undefined,
    unrecognizedMessage: isUnrecognized
      ? 'Unrecognized clinical phrase — please review manually.'
      : undefined,
  };
}

/**
 * Utility helper to check if a specific symptom (or alias like 'Vomiting') was detected.
 */
export function isSymptomDetected(
  parsed: ParsedClinicalData,
  symptomNameOrAlias: string
): boolean {
  const target = symptomNameOrAlias.toLowerCase().trim();
  return parsed.symptoms.some((s) => {
    const sLow = s.toLowerCase();
    return sLow === target || sLow.includes(target) || target.includes(sLow);
  });
}
