// ============================================================================
// RuralCare Multilingual i18n Dictionary (English & Hindi)
// ============================================================================

export type Language = 'en' | 'hi';

export const TRANSLATIONS = {
  // Navigation & Headers
  dashboard: { en: 'Dashboard', hi: 'डैशबोर्ड' },
  overview: { en: 'Overview', hi: 'अवलोकन' },
  register_patient: { en: 'Register Patient', hi: 'नया मरीज पंजीकरण' },
  patient_profile: { en: 'Patient Profile', hi: 'मरीज प्रोफाइल' },
  health_assessment: { en: 'Health Assessment', hi: 'स्वास्थ्य जांच' },
  ai_risk: { en: 'AI Risk Assessment', hi: 'एआई स्वास्थ्य विश्लेषण' },
  referrals: { en: 'Referrals', hi: 'रेफरल' },
  phc_stock: { en: 'PHC Stock', hi: 'दवा स्टॉक' },
  offline_mode: { en: 'Offline Mode', hi: 'ऑफलाइन मोड' },
  sync_center: { en: 'Sync Center', hi: 'सिंक केंद्र' },
  teleconsultation: { en: 'Teleconsultation', hi: 'वीडियो परामर्श' },
  patient_view: { en: 'Patient Directory', hi: 'मरीज सूची' },
  appointments: { en: 'OPD Appointments', hi: 'ओपीडी अपॉइंटमेंट' },
  my_account: { en: 'My Account', hi: 'मेरा खाता' },
  consent_privacy: { en: 'Consent & Privacy', hi: 'सहमति एवं गोपनीयता' },
  access_request: { en: 'Access Request', hi: 'एक्सेस अनुरोध' },
  access_history: { en: 'Access History', hi: 'एक्सेस इतिहास' },
  sos_inbox: { en: 'SOS Inbox', hi: 'आपातकालीन इनबॉक्स' },
  emergency_access: { en: 'Emergency Access', hi: 'आपातकालीन एक्सेस' },
  emergency_log: { en: 'Emergency Log', hi: 'एक्सेस लॉग' },

  // Roles & Users
  role_doctor: { en: 'Doctor / Medical Officer', hi: 'चिकित्सक / डॉक्टर' },
  role_patient: { en: 'Patient', hi: 'रोगी' },
  role_worker: { en: 'Health Worker (ASHA)', hi: 'स्वास्थ्य कार्यकर्ता (आशा)' },
  role_admin: { en: 'District Administrator', hi: 'जिला स्वास्थ्य प्रशासक' },

  // Status & Badges
  online: { en: 'Online', hi: 'ऑनलाइन' },
  offline: { en: 'Offline', hi: 'ऑफलाइन' },
  encrypted: { en: 'ABDM Encrypted', hi: 'सुरक्षित एवं एन्क्रिप्टेड' },
  available: { en: 'Available', hi: 'उपलब्ध' },
  busy: { en: 'Busy', hi: 'व्यस्त' },
  off_duty: { en: 'Off Duty', hi: 'ड्यूटी पर नहीं' },
  high_risk: { en: 'High Risk', hi: 'उच्च जोखिम' },
  moderate_risk: { en: 'Moderate Risk', hi: 'मध्यम जोखिम' },
  low_risk: { en: 'Low Risk', hi: 'सामान्य' },

  // Common Actions
  book_appointment: { en: 'Book Appointment', hi: 'अपॉइंटमेंट बुक करें' },
  call_doctor: { en: 'Call Doctor', hi: 'डॉक्टर से बात करें' },
  start_consultation: { en: 'Start Video Consultation', hi: 'वीडियो परामर्श शुरू करें' },
  save_record: { en: 'Save Record', hi: 'रिकॉर्ड सहेजें' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },
  confirm: { en: 'Confirm', hi: 'पुष्टि करें' },
  search_patient: { en: 'Search patient by name or ABHA ID...', hi: 'मरीज का नाम या ABHA ID खोजें...' },
  logout: { en: 'Log Out', hi: 'लॉग आउट' },
  emergency_sos: { en: 'EMERGENCY SOS', hi: 'आपातकालीन एसओएस (SOS)' },
} as const;

export type TranslationKey = keyof typeof TRANSLATIONS;

export function t(key: TranslationKey, lang: Language = 'en'): string {
  const item = TRANSLATIONS[key];
  if (!item) return key;
  return item[lang] || item.en;
}
