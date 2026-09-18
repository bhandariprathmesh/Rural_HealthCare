import { useState } from 'react';
import { Icon, HealthIDCard } from '../components/shared';
import { patients, getToken } from '../imports/api';
import { validateAadhaar } from '../utils/aadhaarValidator';

interface Props { navigate: (s: string, patientId?: string) => void; isOffline: boolean; }

const STEPS = ['Personal Info', 'Contact & Location', 'Medical Info', 'Health ID'];

export default function PatientRegistration({ navigate, isOffline }: Props) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: '', nameHi: '', dob: '', gender: '', blood: '', phone: '',
    aadhaar: '', abhaAddress: '', abhaNumber: '',
    name: '', nameHi: '', dob: '', gender: 'Female', blood: '', phone: '',
    village: '', district: 'Bikaner', state: 'Rajasthan', address: '',
    emergencyName: '', emergencyRelation: '', emergencyPhone: '',
    allergies: '', conditions: '', medications: '',
  });
  const [consentGiven, setConsentGiven] = useState(true);
  const [generatedId, setGeneratedId] = useState('');
  const [registeredPatient, setRegisteredPatient] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  function update(key: string, val: string) { setForm(f => ({ ...f, [key]: val })); }

  async function handleSubmit() {
    if(!form.name.trim() || !form.dob.trim() || !form.phone.trim() || !form.village.trim()) {
      setError("Please fill out all required fields marked with *.");
      return;
    }
    if(!form.allergies.trim() || !form.conditions.trim() || !form.medications.trim()) {
      setError("Please fill out all mandatory medical info. Enter 'None' if applicable.");
      return;
    }
    if(!consentGiven) {
      setError("Patient consent is required to register and create a health record.");
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        nameHi: form.nameHi.trim() || form.name.trim(),
        dob: form.dob,
        gender: form.gender,
        bloodGroup: form.blood || 'Not known',
        phone: form.phone.trim(),
        village: form.village.trim(),
        district: form.district.trim(),
        state: form.state.trim(),
        address: form.address.trim() || `${form.village.trim()}, ${form.district.trim()}, ${form.state.trim()}`,
        emergencyContact: {
          name: form.emergencyName.trim(),
          relation: form.emergencyRelation.trim() || 'Family',
          phone: form.emergencyPhone.trim()
        },
        allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        chronicConditions: form.conditions ? form.conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
        currentMedications: form.medications ? form.medications.split(',').map(s => s.trim()).filter(Boolean) : [],
        abhaAddress: form.abhaAddress.trim() || undefined,
        abhaNumber: form.abhaNumber.trim() || undefined,
        consent: { granted: true },
      const payload: any = {
        name: form.name.trim(),
        nameHi: form.nameHi.trim() || undefined,
        dob: form.dob,
        gender: form.gender || 'Female',
        bloodGroup: form.blood || undefined,
        phone: form.phone.trim(),
        village: form.village.trim(),
        district: form.district.trim() || 'Bikaner',
        state: form.state.trim() || 'Rajasthan',
        address: form.address.trim() || undefined,
        allergies: form.allergies ? form.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        chronicConditions: form.conditions ? form.conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
        currentMedications: form.medications ? form.medications.split(',').map(s => s.trim()).filter(Boolean) : [],
        consent: {
          granted: consentGiven,
          purpose: 'Care delivery and longitudinal health record',
          dataScope: ['demographics', 'vitals', 'clinical_notes', 'prescriptions'],
        },
      };

      if (form.emergencyName.trim() && form.emergencyPhone.trim()) {
        payload.emergencyContact = {
          name: form.emergencyName.trim(),
          relation: form.emergencyRelation.trim() || 'Relative',
          phone: form.emergencyPhone.trim(),
        };
      }
      
      const res = await patients.register(payload, getToken() || undefined);
      const newPatient = res?.data?.patient;
      if(newPatient?.healthId) {
        setRegisteredPatient(newPatient);
        setGeneratedId(newPatient.healthId);
        setStep(3); // success
      }
    } catch(err: any) {
      setError(err.message || 'Failed to register patient');
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass = "w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent bg-white";
  const labelClass = "block text-xs font-medium text-gray-600 mb-1";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('worker-dashboard')} className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center">
          <Icon name="chevron_right" size={18} className="rotate-180 text-gray-600" />
        </button>
        <div>
          <h1 className="font-display text-xl font-bold text-gray-900">Register New Patient</h1>
          <p className="text-xs text-gray-500">Create a secure longitudinal health record</p>
        </div>
        {isOffline && (
          <div className="ml-auto px-2 py-1 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-semibold flex items-center gap-1">
            <Icon name="wifi_off" size={11} />
            Offline
          </div>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center gap-2 flex-1">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all
              ${i < step ? 'bg-brand-600 text-white' : i === step ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-gray-100 text-gray-400'}`}>
              {i < step ? <Icon name="check" size={13} /> : i + 1}
            </div>
            <span className={`text-xs hidden sm:block ${i === step ? 'text-brand-700 font-semibold' : 'text-gray-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-brand-400' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
        {/* Step 1: Personal Info */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-gray-800">Personal Information</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Full Name (English) *</label>
                <input value={form.name} onChange={e => update('name', e.target.value)} placeholder="e.g. Anita Meena" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>नाम (हिन्दी)</label>
                <input value={form.nameHi} onChange={e => update('nameHi', e.target.value)} placeholder="e.g. अनिता मीना" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Date of Birth *</label>
                <input type="date" value={form.dob} onChange={e => update('dob', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Gender *</label>
                <div className="flex gap-2">
                  {['Male', 'Female', 'Other'].map(g => (
                    <button key={g} onClick={() => update('gender', g)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-all ${form.gender === g ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 text-gray-600 hover:border-brand-300'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Blood Group</label>
                <select value={form.blood} onChange={e => update('blood', e.target.value)} className={inputClass}>
                  <option value="">Not known</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(b => <option key={b}>{b}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                <label className={labelClass}>Aadhaar Number (12 Digits) *</label>
                <input
                  value={form.aadhaar}
                  onChange={e => {
                    update('aadhaar', e.target.value);
                    if (error) setError('');
                  }}
                  maxLength={14}
                  placeholder="e.g. 9876 5432 1098"
                  className={`${inputClass} font-mono`}
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  12-digit Aadhaar number is mandatory for ABDM ABHA ID generation & identity verification.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-gray-800">Contact & Location</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Mobile Number *</label>
                <div className="flex gap-2">
                  <span className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500">+91</span>
                  <input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="9XXXXXXXXX" className={`${inputClass} flex-1`} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Village / Town *</label>
                <input value={form.village} onChange={e => update('village', e.target.value)} placeholder="e.g. Govindpur" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>District *</label>
                <input value={form.district} onChange={e => update('district', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>State</label>
                <input value={form.state} onChange={e => update('state', e.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Full Address</label>
                <textarea value={form.address} onChange={e => update('address', e.target.value)} placeholder="Ward no., Mohalla, Landmark..." rows={2} className={`${inputClass} resize-none`} />
              </div>

              <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Emergency Contact</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={labelClass}>Name *</label>
                    <input value={form.emergencyName} onChange={e => update('emergencyName', e.target.value)} placeholder="Contact name" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Relation</label>
                    <select value={form.emergencyRelation} onChange={e => update('emergencyRelation', e.target.value)} className={inputClass}>
                      <option value="">Select</option>
                      {['Husband', 'Wife', 'Father', 'Mother', 'Son', 'Daughter', 'Sibling', 'Other'].map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Phone *</label>
                    <input value={form.emergencyPhone} onChange={e => update('emergencyPhone', e.target.value)} placeholder="9XXXXXXXXX" className={inputClass} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Medical */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-gray-800">Basic Medical Information</h2>
            <p className="text-xs text-gray-500">Only collect what is known and relevant. Leave blank if unknown.</p>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Known Allergies *</label>
                <input value={form.allergies} onChange={e => update('allergies', e.target.value)}
                  placeholder="e.g. Penicillin, Aspirin (comma separated) or 'None'" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Existing Medical Conditions *</label>
                <textarea value={form.conditions} onChange={e => update('conditions', e.target.value)}
                  placeholder="e.g. Diabetes, Hypertension, Anaemia, or 'None'..." rows={2} className={`${inputClass} resize-none`} />
              </div>
              <div>
                <label className={labelClass}>Current Medications *</label>
                <textarea value={form.medications} onChange={e => update('medications', e.target.value)}
                  placeholder="e.g. Metformin 500mg, or 'None'..." rows={2} className={`${inputClass} resize-none`} />
              </div>
            </div>

            {/* Consent notice */}
            <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <div className="flex items-start gap-2.5">
                <Icon name="shield" size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-blue-800">Privacy & Consent Notice</p>
                  <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                    By registering, the patient agrees that their health information will be securely stored and can be accessed only by authorized healthcare providers with their explicit consent. Patient can revoke access at any time.
                  </p>
                  <label className="flex items-center gap-2 mt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={consentGiven}
                      onChange={e => setConsentGiven(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className="text-xs font-medium text-blue-800">Patient has given verbal/written consent</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Health ID Generated */}
        {step === 3 && (
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Icon name="check" size={28} className="text-green-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-gray-900">Registration Successful!</h2>
              <p className="text-sm text-gray-500 mt-1">
                <strong>{registeredPatient?.name || form.name}</strong> has been registered in the database.
              </p>
              {registeredPatient?.abhaAddress && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-teal-50 border border-teal-200 rounded-full text-xs text-teal-700 font-mono">
                  <Icon name="shield" size={12} /> ABHA: {registeredPatient.abhaAddress}
                </div>
              )}
            </div>

            <div className="flex justify-center">
              <HealthIDCard id={generatedId} name={registeredPatient?.name || form.name} size="lg" />
              <p className="text-sm text-gray-500 mt-1">{form.name || 'Patient'} has been registered in the system.</p>
            </div>

            <div className="flex justify-center">
              <HealthIDCard id={generatedId} name={form.name || 'Patient'} size="lg" />
            </div>

            {isOffline && (
              <div className="flex items-center justify-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl px-4 py-2.5 border border-amber-200">
                <Icon name="wifi_off" size={13} />
                Record saved locally. Will sync when connectivity is restored.
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
              {[
                { label: 'Copy ID', icon: 'document', action: () => navigator.clipboard?.writeText(generatedId) },
                { label: 'Generate QR', icon: 'qr', action: () => {} },
                { label: 'Share ID', icon: 'share', action: () => {} },
                { label: 'Print Card', icon: 'document', action: () => {} },
              ].map(a => (
                <button key={a.label} onClick={a.action}
                  className="flex items-center gap-2 justify-center px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors">
                  <Icon name={a.icon} size={15} />
                  {a.label}
                </button>
              ))}
            </div>

            {/* QR placeholder */}
            <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 max-w-xs mx-auto">
              <div className="grid grid-cols-5 gap-1 opacity-30">
                {Array.from({ length: 25 }).map((_, i) => (
                  <div key={i} className={`w-full aspect-square rounded-sm ${Math.random() > 0.5 ? 'bg-gray-900' : 'bg-transparent'}`} />
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-3 font-mono">{generatedId}</p>
            </div>

            <button onClick={() => navigate('patient-profile', registeredPatient?.id || registeredPatient?.healthId || generatedId)}
            <button onClick={() => navigate('patient-profile', generatedId)}
              className="w-full py-3 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors">
              View Patient Profile
            </button>
            <button onClick={() => navigate('worker-dashboard')} className="text-sm text-gray-500 hover:text-gray-700">
              Back to Dashboard
            </button>
          </div>
        )}

        {/* Navigation buttons */}
        {step < 3 && (
          <div className="flex flex-col gap-3 mt-6 pt-4 border-t border-gray-100">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium text-center">
                {error}
              </div>
            )}
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={() => {
                    setError('');
                    setStep(s => s - 1);
                  }}
                  disabled={isSubmitting}
                  className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => {
                  setError('');
                  if (step === 0) {
                    if (!form.name.trim()) {
                      setError('Full Name is required.');
                      return;
                    }
                    if (!form.dob) {
                      setError('Date of Birth is required.');
                      return;
                    }
                    if (!form.gender) {
                      setError('Gender selection is required.');
                      return;
                    }
                    const aadhaarCheck = validateAadhaar(form.aadhaar);
                    if (!aadhaarCheck.isValid) {
                      setError(aadhaarCheck.error || 'Valid Aadhaar number is required.');
                      return;
                    }
                    setStep(1);
                  } else if (step === 1) {
                    if (!form.phone.trim()) {
                      setError('Mobile Number is required.');
                      return;
                    }
                    if (!form.village.trim()) {
                      setError('Village / Town is required.');
                      return;
                    }
                    setStep(2);
                  } else {
                    handleSubmit();
                  }
                }}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl transition-colors text-sm disabled:opacity-50"
              >
                {isSubmitting ? 'Registering...' : step < 2 ? 'Continue' : 'Register Patient'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
