import { useEffect, useState } from 'react';
import type { Role } from '../types';
import { Icon } from '../components/shared';

import {
  verifyAbha,
  verifyHpr,
  generateHprId,
  getFacilities,
  registerUser,
  loginUser,
  FacilityItem,
} from '../api/client';
import { validateAadhaar } from '../utils/aadhaarValidator';

interface CurrentUser {
  id?: string;
  email?: string;
  role?: string;
  fullName?: string;
  phone?: string;

  doctorProfile?: {
    id?: string;
    name?: string;
    specialty?: string;
    hprId?: string;
    qualification?: string;
    registrationNumber?: string;
    registrationCouncil?: string;
    verificationStatus?: string;
    facility?: {
      id?: string;
      name?: string;
      district?: string;
      state?: string;
    };
  };

  patientProfile?: {
    id?: string;
    name?: string;
    healthId?: string;
    village?: string;
    district?: string;
    state?: string;
  };

  workerProfile?: {
    id?: string;
    name?: string;
    workerCode?: string;
    workerType?: string;
    village?: string;
    subCentre?: string;
    assignedPhc?: string;
    district?: string;
    state?: string;
  };
}

interface Props {
  onLogin: (
    role: Role,
    user?: CurrentUser
  ) => void;
  lang: 'en' | 'hi';
  setLang: (l: 'en' | 'hi') => void;
}

const ROLES = [
  {
    id: 'patient' as Role,
    label: 'Patient',
    labelHi: 'रोगी',
    icon: 'user',
    sub: 'Access your health records & ABHA ID',
    subHi: 'अपने स्वास्थ्य रिकॉर्ड और ABHA ID देखें',
    color:
      'border-teal-300 bg-teal-50 text-teal-800 hover:border-teal-500',
    badge: 'ABDM ABHA',
  },
  {
    id: 'worker' as Role,
    label: 'Health Worker / ASHA',
    labelHi: 'स्वास्थ्य कार्यकर्ता / आशा',
    icon: 'users',
    sub: 'Field assessments & patient registrations',
    subHi: 'मरीजों को पंजीकृत करें और जांच करें',
    color:
      'border-brand-300 bg-brand-50 text-brand-800 hover:border-brand-500',
    badge: 'Field Care',
  },
  {
    id: 'doctor' as Role,
    label: 'Doctor / PHC Staff',
    labelHi: 'डॉक्टर / PHC स्टाफ',
    icon: 'clipboard',
    sub: 'OPD consultations, referrals & prescriptions',
    subHi: 'नैदानिक डैशबोर्ड और रेफरल',
    color:
      'border-purple-300 bg-purple-50 text-purple-800 hover:border-purple-500',
    badge: 'HPR Registry',
  },
  {
    id: 'admin' as Role,
    label: 'Administrator',
    labelHi: 'प्रशासक',
    icon: 'chart',
    sub: 'District health operations & epidemiology',
    subHi: 'विश्लेषण और प्रणाली प्रबंधन',
    color:
      'border-amber-300 bg-amber-50 text-amber-800 hover:border-amber-500',
    badge: 'Authority',
  },
];

export default function LoginScreen({
  onLogin,
  lang,
  setLang,
}: Props) {
  const [selectedRole, setSelectedRole] =
    useState<Role | null>(null);

  const [authTab, setAuthTab] =
    useState<'login' | 'register'>('login');

  const [errorMessage, setErrorMessage] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const hi = lang === 'hi';

  const [loginEmail, setLoginEmail] =
    useState('');

  const [loginPassword, setLoginPassword] =
    useState('');

  const [regEmail, setRegEmail] =
    useState('');

  const [regPassword, setRegPassword] =
    useState('');

  const [regFullName, setRegFullName] =
    useState('');

  const [hasExistingAbha, setHasExistingAbha] =
    useState<boolean | null>(null);

  const [abhaSearchAddress, setAbhaSearchAddress] =
    useState('');

  const [aadhaarSimInput, setAadhaarSimInput] =
    useState('');

  const [patientAbhaVerified, setPatientAbhaVerified] =
    useState(false);

  const [patientAbhaNumber, setPatientAbhaNumber] =
    useState('');

  const [patientExtra, setPatientExtra] =
    useState({
      dob: '',
      gender: 'Female',
      bloodGroup: '',
      phone: '',
      village: '',
      district: 'Bikaner',
      state: 'Rajasthan',
    });

  const [workerExtra, setWorkerExtra] =
    useState({
      workerType: 'ASHA',
      village: '',
      subCentre: '',
      assignedPhc: '',
      district: 'Bikaner',
      state: 'Rajasthan',
    });

  const [doctorQualification, setDoctorQualification] =
    useState('');

  const [doctorSpecialty, setDoctorSpecialty] =
    useState('');

  const [doctorGender, setDoctorGender] =
    useState('Other');

  const [doctorPhone, setDoctorPhone] =
    useState('');

  const [hprInput, setHprInput] =
    useState('');

  const [hprRecord, setHprRecord] =
    useState<any>(null);

  const [hprGenerated, setHprGenerated] =
    useState(false);

  const [facilities, setFacilities] =
    useState<FacilityItem[]>([]);

  const [doctorFacilityId, setDoctorFacilityId] =
    useState('');

  const [otherFacilityName, setOtherFacilityName] =
    useState('');

  useEffect(() => {
    getFacilities()
      .then((items) => {
        if (items?.length) {
          setFacilities(items);

          if (!doctorFacilityId) {
            setDoctorFacilityId(items[0].id);
          }
        }
      })
      .catch(() => {});
  }, [doctorFacilityId]);

  function handleSelectRole(role: Role) {
    setSelectedRole(role);
    setAuthTab('login');
    setErrorMessage(null);

    setHasExistingAbha(null);
    setPatientAbhaVerified(false);

    setHprInput('');
    setHprRecord(null);
    setHprGenerated(false);

    setOtherFacilityName('');
  }

  function handleBack() {
    setSelectedRole(null);
    setErrorMessage(null);
  }

  async function handleVerifyAbha() {
    if (!abhaSearchAddress.trim()) {
      setErrorMessage(
        'Please enter your ABHA address.'
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result =
        await verifyAbha(
          abhaSearchAddress.trim()
        );

      if (result.exists) {
        setPatientAbhaVerified(true);

        setPatientAbhaNumber(
          result.abhaNumber || ''
        );

        if (result.fullName) {
          setRegFullName(
            result.fullName
          );
        }
      } else {
        setErrorMessage(
          'ABHA address not found in ABDM Registry.'
        );
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Could not reach ABHA verification service.'
      );
    } finally {
      setLoading(false);
    }
  }

  function handleSimulateCreateAbha() {
    const aadhaarCheck = validateAadhaar(aadhaarSimInput);
    if (!aadhaarCheck.isValid) {
      setErrorMessage(aadhaarCheck.error || 'Aadhaar validation failed.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    setTimeout(() => {
      const generatedAbha =
        `${(
          regFullName || 'patient'
        )
          .toLowerCase()
          .replace(/\s+/g, '')}.abdm@abdm`;

      const generatedNumber =
        `91-${Math.floor(
          1000 + Math.random() * 9000
        )}-${Math.floor(
          1000 + Math.random() * 9000
        )}-${Math.floor(
          1000 + Math.random() * 9000
        )}`;

      setAbhaSearchAddress(
        generatedAbha
      );

      setPatientAbhaNumber(
        generatedNumber
      );

      setPatientAbhaVerified(
        true
      );

      setLoading(false);
    }, 600);
  }

  async function handleGenerateDoctorHpr() {
    setErrorMessage(null);

    if (!regFullName.trim()) {
      setErrorMessage(
        'Please enter the doctor full name first.'
      );
      return;
    }

    if (!doctorQualification.trim()) {
      setErrorMessage(
        'Please enter the qualification first.'
      );
      return;
    }

    if (!doctorSpecialty.trim()) {
      setErrorMessage(
        'Please enter the specialty first.'
      );
      return;
    }

    if (!regEmail.trim()) {
      setErrorMessage(
        'Please enter the doctor email first.'
      );
      return;
    }

    if (!doctorPhone.trim()) {
      setErrorMessage(
        'Please enter the doctor phone number first.'
      );
      return;
    }

    if (!regPassword) {
      setErrorMessage(
        'Please enter a password first.'
      );
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage(
        'Password must be at least 6 characters.'
      );
      return;
    }

    if (
      doctorFacilityId === 'OTHER' &&
      !otherFacilityName.trim()
    ) {
      setErrorMessage(
        'Please enter the PHC / Facility name.'
      );
      return;
    }

    setLoading(true);
    setHprRecord(null);
    setHprInput('');
    setHprGenerated(false);

    try {
      const selectedFacility =
        facilities.find(
          (facility) =>
            facility.id ===
            doctorFacilityId
        );

      const selectedFacilityName =
        doctorFacilityId === 'OTHER'
          ? otherFacilityName.trim()
          : selectedFacility?.facilityName ||
            undefined;

      const result =
        await generateHprId({
          fullName:
            regFullName.trim(),

          qualification:
            doctorQualification.trim(),

          specialties: [
            doctorSpecialty.trim(),
          ],

          professionalType:
            'Doctor',

          state:
            selectedFacility?.state ||
            'Rajasthan',

          district:
            selectedFacility?.district ||
            'Bikaner',

          contactEmail:
            regEmail.trim(),

          contactPhone:
            doctorPhone.trim(),

          gender:
            doctorGender,

          primaryFacilityName:
            selectedFacilityName,
        });

      if (!result?.hprId) {
        throw new Error(
          'HPR ID was not returned by the registry.'
        );
      }

      setHprInput(
        result.hprId
      );

      setHprGenerated(true);

      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Failed to generate HPR ID.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyDoctorHpr() {
    const cleanHprId =
      hprInput.trim();

    if (!cleanHprId) {
      setErrorMessage(
        'Please generate an HPR ID first.'
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const record =
        await verifyHpr(
          cleanHprId
        );

      if (!record?.hprId) {
        throw new Error(
          'Invalid HPR record returned by registry.'
        );
      }

      setHprRecord(record);
      setHprInput(
        record.hprId
      );

      if (record.fullName) {
        setRegFullName(
          record.fullName
        );
      }

      if (
        record.qualification
      ) {
        setDoctorQualification(
          record.qualification
        );
      }

      if (
        record.specialties?.length
      ) {
        setDoctorSpecialty(
          record.specialties[0]
        );
      }

      setErrorMessage(null);
    } catch (err: any) {
      setHprRecord(null);

      setErrorMessage(
        err?.message ||
          'HPR ID not found in ABDM HPR Registry.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    if (
      !selectedRole ||
      !loginEmail.trim() ||
      !loginPassword
    ) {
      setErrorMessage(
        'Please enter your email and password.'
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const result =
        await loginUser(
          loginEmail.replace(/\s+/g, ''),
          loginPassword,
          selectedRole.toUpperCase()
        );

      if (!result?.user) {
        throw new Error(
          'Login succeeded but no user profile was returned.'
        );
      }

      onLogin(
        selectedRole,
        result.user
      );
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Login failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    if (!selectedRole) {
      return;
    }

    if (!regFullName.trim()) {
      setErrorMessage(
        'Please enter your full name.'
      );
      return;
    }

    if (!regEmail.trim()) {
      setErrorMessage(
        'Please enter your email address.'
      );
      return;
    }

    if (!regPassword) {
      setErrorMessage(
        'Please enter a password.'
      );
      return;
    }

    if (regPassword.length < 6) {
      setErrorMessage(
        'Password must be at least 6 characters.'
      );
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const payload: any = {
        email:
          regEmail.replace(/\s+/g, ''),

        password:
          regPassword,

        fullName:
          regFullName.trim(),

        role:
          selectedRole.toUpperCase(),
      };

      if (
        selectedRole ===
        'patient'
      ) {
        if (!patientAbhaVerified) {
          setErrorMessage(
            'Please verify or create an ABHA ID first.'
          );

          setLoading(false);
          return;
        }

        Object.assign(
          payload,
          patientExtra,
          {
            abhaAddress:
              abhaSearchAddress,

            abhaNumber:
              patientAbhaNumber,
          }
        );
      }

      if (
        selectedRole ===
        'worker'
      ) {
        Object.assign(
          payload,
          workerExtra
        );
      }

      if (
        selectedRole ===
        'doctor'
      ) {
        if (!hprRecord) {
          setErrorMessage(
            'Please generate and verify your HPR ID first.'
          );

          setLoading(false);
          return;
        }

        if (!doctorFacilityId) {
          setErrorMessage(
            'Please select a PHC / Facility first.'
          );

          setLoading(false);
          return;
        }

        if (
          doctorFacilityId ===
            'OTHER' &&
          !otherFacilityName.trim()
        ) {
          setErrorMessage(
            'Please enter the PHC / Facility name.'
          );

          setLoading(false);
          return;
        }

        if (!doctorPhone.trim()) {
          setErrorMessage(
            'Please enter your phone number.'
          );

          setLoading(false);
          return;
        }

        const selectedFacility =
          facilities.find(
            (facility) =>
              facility.id ===
              doctorFacilityId
          );

        const selectedFacilityName =
          doctorFacilityId === 'OTHER'
            ? otherFacilityName.trim()
            : selectedFacility?.facilityName ||
              hprRecord.primaryFacilityName ||
              'Rural Health Centre';

        payload.hprId =
          hprRecord.hprId;

        payload.specialty =
          hprRecord.specialties?.[0] ||
          doctorSpecialty.trim() ||
          'General Medicine';

        payload.facility =
          selectedFacilityName;

        payload.facilityId =
          doctorFacilityId !== 'OTHER'
            ? doctorFacilityId
            : undefined;

        payload.district =
          selectedFacility?.district ||
          hprRecord.district ||
          'Bikaner';

        payload.state =
          selectedFacility?.state ||
          hprRecord.state ||
          'Rajasthan';

        payload.phone =
          doctorPhone.trim();

        payload.gender =
          doctorGender;

        payload.qualification =
          doctorQualification.trim();

        payload.hprVerificationStatus =
          hprRecord.verificationStatus;

        payload.hprProfessionalId =
          hprRecord.id;
      }

      const result =
        await registerUser(
          payload
        );

      if (!result?.user) {
        throw new Error(
          'Registration succeeded but no user profile was returned.'
        );
      }

      onLogin(
        selectedRole,
        result.user
      );
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'Registration failed.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 flex items-center justify-center p-4 relative overflow-hidden">

      <div className="absolute inset-0 opacity-5 pointer-events-none">
        <svg
          width="100%"
          height="100%"
        >
          <defs>
            <pattern
              id="grid"
              x="0"
              y="0"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect
            width="100%"
            height="100%"
            fill="url(#grid)"
          />
        </svg>
      </div>

      <div
        className={`relative z-10 w-full ${
          selectedRole
            ? 'max-w-3xl'
            : 'max-w-xl'
        }`}
      >
        <div className="flex justify-between items-center mb-4 px-2">

          <div className="flex items-center gap-2 text-white/80 text-xs">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />

            <span>
              Ayushman Bharat Digital Mission
              (ABDM) Compatible
            </span>
          </div>

          <button
            onClick={() =>
              setLang(
                lang === 'en'
                  ? 'hi'
                  : 'en'
              )
            }
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs transition-colors border border-white/20"
          >
            <Icon
              name="settings"
              size={13}
            />

            {lang === 'en'
              ? 'हिन्दी'
              : 'English'}
          </button>
        </div>

        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-white/20">

          <div className="bg-brand-600 px-8 py-6 text-white">

            <div className="flex items-center justify-between">

              <div className="flex items-center gap-3">

                <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center">
                  <Icon
                    name="shield"
                    size={22}
                  />
                </div>

                <div>
                  <div className="font-display font-bold text-xl leading-tight">
                    RuralHealth
                  </div>

                  <div className="text-brand-200 text-xs">
                    ग्रामीण डिजिटल स्वास्थ्य प्रणाली ·
                    SIH-26133
                  </div>
                </div>

              </div>

              <span className="px-2.5 py-1 bg-white/15 text-brand-100 rounded-lg text-[11px] font-semibold">
                v2.6 Live DB
              </span>

            </div>
          </div>

          <div className="p-6 sm:p-8">

            {!selectedRole && (
              <div>

                <h2 className="font-display text-lg font-bold text-gray-900 mb-4">
                  {hi
                    ? 'अपनी भूमिका चुनें'
                    : 'Select Your Healthcare Role'}
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">

                  {ROLES.map(
                    (role) => (
                      <button
                        key={role.id}
                        onClick={() =>
                          handleSelectRole(
                            role.id
                          )
                        }
                        className={`p-4 rounded-2xl border-2 text-left transition-all hover:shadow-md ${role.color}`}
                      >

                        <div className="flex items-center justify-between mb-2">

                          <div className="w-9 h-9 rounded-xl bg-white/80 flex items-center justify-center">
                            <Icon
                              name={role.icon}
                              size={18}
                            />
                          </div>

                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/80">
                            {role.badge}
                          </span>

                        </div>

                        <div className="font-bold text-sm text-gray-900">
                          {hi
                            ? role.labelHi
                            : role.label}
                        </div>

                        <div className="text-xs text-gray-600 mt-1">
                          {hi
                            ? role.subHi
                            : role.sub}
                        </div>

                      </button>
                    )
                  )}

                </div>

              </div>
            )}

            {selectedRole && (
              <div>

                <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">

                  <button
                    onClick={
                      handleBack
                    }
                    className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-800"
                  >
                    <Icon
                      name="chevron_right"
                      size={14}
                      className="rotate-180"
                    />

                    Back
                  </button>

                  <span className="text-xs text-gray-400">
                    Role:{' '}
                    <strong className="text-gray-700">
                      {
                        ROLES.find(
                          (role) =>
                            role.id ===
                            selectedRole
                        )?.label
                      }
                    </strong>
                  </span>

                </div>

                <div className="flex items-center gap-2 mb-6">

                  <button
                    onClick={() => {
                      setAuthTab(
                        'login'
                      );
                      setErrorMessage(
                        null
                      );
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      authTab ===
                      'login'
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Login
                  </button>

                  <button
                    onClick={() => {
                      setAuthTab(
                        'register'
                      );
                      setErrorMessage(
                        null
                      );
                    }}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      authTab ===
                      'register'
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Register
                  </button>

                </div>

                {errorMessage && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">

                    <Icon
                      name="alert"
                      size={14}
                      className="shrink-0"
                    />

                    <span>
                      {errorMessage}
                    </span>

                  </div>
                )}

                {authTab ===
                  'login' && (
                  <div className="space-y-4">

                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">
                        Email Address
                      </label>

                      <input
                        type="email"
                        value={
                          loginEmail
                        }
                        onChange={(e) =>
                          setLoginEmail(
                            e.target
                              .value
                          )
                        }
                        placeholder="name@example.com"
                        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-700 block mb-1">
                        Password
                      </label>

                      <input
                        type="password"
                        value={
                          loginPassword
                        }
                        onChange={(e) =>
                          setLoginPassword(
                            e.target
                              .value
                          )
                        }
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                      />
                    </div>

                    <button
                      onClick={
                        handleLogin
                      }
                      disabled={
                        loading ||
                        !loginEmail ||
                        !loginPassword
                      }
                      className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold rounded-xl text-sm"
                    >
                      {loading
                        ? 'Please wait...'
                        : `Login as ${
                            ROLES.find(
                              (role) =>
                                role.id ===
                                selectedRole
                            )?.label
                          }`}
                    </button>

                  </div>
                )}

                {authTab ===
                  'register' && (
                  <div className="space-y-4">

                    {selectedRole ===
                      'patient' &&
                      !patientAbhaVerified && (
                        <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-2xl space-y-3">

                          <div className="text-xs font-bold text-teal-900">
                            ABDM ABHA Verification
                          </div>

                          <div className="flex gap-2">

                            <button
                              onClick={() =>
                                setHasExistingAbha(
                                  true
                                )
                              }
                              className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                                hasExistingAbha ===
                                true
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-white text-teal-800 border-teal-300'
                              }`}
                            >
                              Yes, has ABHA
                            </button>

                            <button
                              onClick={() =>
                                setHasExistingAbha(
                                  false
                                )
                              }
                              className={`flex-1 py-2 rounded-xl text-xs font-semibold border ${
                                hasExistingAbha ===
                                false
                                  ? 'bg-teal-700 text-white border-teal-700'
                                  : 'bg-white text-teal-800 border-teal-300'
                              }`}
                            >
                              No, create new
                            </button>

                          </div>

                          {hasExistingAbha ===
                            true && (
                            <div className="flex gap-2">

                              <input
                                value={
                                  abhaSearchAddress
                                }
                                onChange={(e) =>
                                  setAbhaSearchAddress(
                                    e.target
                                      .value
                                  )
                                }
                                placeholder="name@abdm"
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-xs"
                              />

                              <button
                                onClick={
                                  handleVerifyAbha
                                }
                                disabled={
                                  loading
                                }
                                className="px-4 py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold"
                              >
                                {loading
                                  ? 'Verifying...'
                                  : 'Verify'}
                              </button>

                            </div>
                          )}

                          {hasExistingAbha ===
                            false && (
                            <div className="space-y-2">

                              <input
                                value={
                                  aadhaarSimInput
                                }
                                onChange={(e) =>
                                  setAadhaarSimInput(
                                    e.target
                                      .value
                                  )
                                }
                                maxLength={12}
                                placeholder="12-digit Aadhaar"
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs font-mono"
                              />

                              <button
                                onClick={
                                  handleSimulateCreateAbha
                                }
                                disabled={
                                  loading
                                }
                                className="w-full py-2 bg-teal-600 text-white rounded-xl text-xs font-semibold"
                              >
                                {loading
                                  ? 'Creating...'
                                  : 'Generate ABHA via Aadhaar'}
                              </button>

                            </div>
                          )}

                        </div>
                      )}

                    {selectedRole ===
                      'patient' &&
                      patientAbhaVerified && (
                        <div className="p-3 bg-green-50 border border-green-200 rounded-xl text-xs text-green-900">
                          <strong>
                            ABHA Verified ✓
                          </strong>{' '}
                          <span className="font-mono">
                            {patientAbhaNumber ||
                              abhaSearchAddress}
                          </span>
                        </div>
                      )}

                    {selectedRole ===
                      'doctor' && (
                      <div className="space-y-4">

                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl">

                          <div className="text-sm font-bold text-purple-900 mb-1">
                            Doctor Registration
                          </div>

                          <div className="text-xs text-purple-700 mb-4">
                            Create your professional identity and HPR profile
                          </div>

                          <div className="space-y-3">

                            <div>
                              <label className="text-xs font-medium text-gray-700 block mb-1">
                                Full Name
                              </label>

                              <input
                                value={
                                  regFullName
                                }
                                onChange={(e) =>
                                  setRegFullName(
                                    e.target
                                      .value
                                  )
                                }
                                placeholder="Doctor full name"
                                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                              <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                  Qualification
                                </label>

                                <input
                                  value={
                                    doctorQualification
                                  }
                                  onChange={(e) =>
                                    setDoctorQualification(
                                      e.target
                                        .value
                                    )
                                  }
                                  placeholder="MBBS"
                                  className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white"
                                />
                              </div>

                              <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                  Specialty
                                </label>

                                <input
                                  value={
                                    doctorSpecialty
                                  }
                                  onChange={(e) =>
                                    setDoctorSpecialty(
                                      e.target
                                        .value
                                    )
                                  }
                                  placeholder="General Medicine"
                                  className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white"
                                />
                              </div>

                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                              <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                  Email Address
                                </label>

                                <input
                                  type="email"
                                  value={
                                    regEmail
                                  }
                                  onChange={(e) =>
                                    setRegEmail(
                                      e.target
                                        .value
                                    )
                                  }
                                  placeholder="doctor@example.com"
                                  className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white"
                                />
                              </div>

                              <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                  Phone
                                </label>

                                <input
                                  value={
                                    doctorPhone
                                  }
                                  onChange={(e) =>
                                    setDoctorPhone(
                                      e.target
                                        .value
                                    )
                                  }
                                  maxLength={10}
                                  placeholder="10-digit mobile number"
                                  className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white"
                                />
                              </div>

                            </div>

                            <div>
                              <label className="text-xs font-medium text-gray-700 block mb-1">
                                Password
                              </label>

                              <input
                                type="password"
                                value={
                                  regPassword
                                }
                                onChange={(e) =>
                                  setRegPassword(
                                    e.target
                                      .value
                                  )
                                }
                                placeholder="Enter password (minimum 6 characters)"
                                className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white"
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                              <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                  Gender
                                </label>

                                <select
                                  value={
                                    doctorGender
                                  }
                                  onChange={(e) =>
                                    setDoctorGender(
                                      e.target
                                        .value
                                    )
                                  }
                                  className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white cursor-pointer"
                                >
                                  <option value="Male">
                                    Male
                                  </option>

                                  <option value="Female">
                                    Female
                                  </option>

                                  <option value="Other">
                                    Other
                                  </option>
                                </select>
                              </div>

                              <div>
                                <label className="text-xs font-medium text-gray-700 block mb-1">
                                  PHC / Facility
                                </label>

                                <div className="relative">

                                  <select
                                    value={
                                      doctorFacilityId
                                    }
                                    onChange={(e) => {
                                      setDoctorFacilityId(
                                        e.target.value
                                      );

                                      if (
                                        e.target.value !==
                                        'OTHER'
                                      ) {
                                        setOtherFacilityName(
                                          ''
                                        );
                                      }
                                    }}
                                    className="w-full appearance-auto px-3.5 py-3 pr-10 border border-gray-200 rounded-xl text-sm bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-purple-400"
                                  >
                                    <option value="">
                                      Select PHC / Facility
                                    </option>

                                    {facilities.map(
                                      (
                                        facility
                                      ) => (
                                        <option
                                          key={
                                            facility.id
                                          }
                                          value={
                                            facility.id
                                          }
                                        >
                                          {
                                            facility.facilityName
                                          }
                                        </option>
                                      )
                                    )}

                                    <option value="OTHER">
                                      Other
                                    </option>
                                  </select>

                                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                                    <Icon
                                      name="chevron_right"
                                      size={15}
                                      className="rotate-90"
                                    />
                                  </div>

                                </div>

                                {facilities.length ===
                                  0 && (
                                  <div className="text-[11px] text-gray-500 mt-1">
                                    No registered PHCs are currently loaded. Select Other to enter a facility manually.
                                  </div>
                                )}

                                {doctorFacilityId ===
                                  'OTHER' && (
                                  <div className="mt-2">

                                    <input
                                      value={
                                        otherFacilityName
                                      }
                                      onChange={(e) =>
                                        setOtherFacilityName(
                                          e.target
                                            .value
                                        )
                                      }
                                      placeholder="Enter PHC / Facility name"
                                      className="w-full px-3.5 py-3 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                                    />

                                  </div>
                                )}

                              </div>

                            </div>

                          </div>
                        </div>

                        <div className="p-4 bg-purple-50 border border-purple-200 rounded-2xl">

                          <div className="text-sm font-bold text-purple-800">
                            ABDM HPR Registration
                          </div>

                          <div className="text-xs text-purple-600 mt-1">
                            Generate and verify the doctor's professional identity.
                          </div>

                          <button
                            onClick={
                              handleGenerateDoctorHpr
                            }
                            disabled={
                              loading
                            }
                            className="w-full mt-3 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm"
                          >
                            {loading &&
                            !hprGenerated
                              ? 'Generating...'
                              : 'Get New HPR ID'}
                          </button>

                          <div className="flex gap-2 mt-3">

                            <input
                              value={
                                hprInput
                              }
                              onChange={(e) =>
                                setHprInput(
                                  e.target
                                    .value
                                )
                              }
                              placeholder="HPR-2026-XXXXX"
                              className="flex-1 px-3.5 py-3 border border-gray-200 rounded-xl text-sm font-mono bg-white"
                            />

                            <button
                              onClick={
                                handleVerifyDoctorHpr
                              }
                              disabled={
                                loading ||
                                !hprInput.trim()
                              }
                              className="px-5 py-3 bg-purple-500 hover:bg-purple-600 disabled:opacity-50 text-white rounded-xl text-sm font-bold"
                            >
                              {loading
                                ? 'Verifying...'
                                : 'Verify HPR'}
                            </button>

                          </div>

                          <div className="text-[11px] text-gray-500 mt-2">
                            Generate an HPR ID first. It is stored in the mock HPR registry, then verify it before completing registration.
                          </div>

                        </div>

                        {hprRecord && (
                          <div className="p-4 bg-green-50 border border-green-200 rounded-xl">

                            <div className="text-sm font-bold text-green-800">
                              ✓ HPR Verified
                            </div>

                            <div className="mt-2 text-xs text-green-900 space-y-1">

                              <div>
                                <strong>
                                  HPR ID:
                                </strong>{' '}
                                <span className="font-mono">
                                  {
                                    hprRecord.hprId
                                  }
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Name:
                                </strong>{' '}
                                {
                                  hprRecord.fullName
                                }
                              </div>

                              <div>
                                <strong>
                                  Qualification:
                                </strong>{' '}
                                {
                                  hprRecord.qualification
                                }
                              </div>

                              <div>
                                <strong>
                                  Specialty:
                                </strong>{' '}
                                {hprRecord.specialties?.join(
                                  ', '
                                )}
                              </div>

                              <div>
                                <strong>
                                  Status:
                                </strong>{' '}
                                {
                                  hprRecord.verificationStatus
                                }
                              </div>

                            </div>
                          </div>
                        )}

                        {hprRecord && (
                          <button
                            onClick={
                              handleRegister
                            }
                            disabled={
                              loading ||
                              !regPassword
                            }
                            className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm"
                          >
                            {loading
                              ? 'Registering...'
                              : 'Complete Doctor Registration'}
                          </button>
                        )}

                      </div>
                    )}

                    {(selectedRole ===
                      'worker' ||
                      selectedRole ===
                        'admin' ||
                      (selectedRole ===
                        'patient' &&
                        patientAbhaVerified)) && (
                      <>

                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1">
                            Full Name
                          </label>

                          <input
                            value={
                              regFullName
                            }
                            onChange={(e) =>
                              setRegFullName(
                                e.target
                                  .value
                              )
                            }
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1">
                            Email Address
                          </label>

                          <input
                            type="email"
                            value={
                              regEmail
                            }
                            onChange={(e) =>
                              setRegEmail(
                                e.target
                                  .value
                              )
                            }
                            placeholder="name@example.com"
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm"
                          />
                        </div>

                        <div>
                          <label className="text-xs font-medium text-gray-700 block mb-1">
                            Password
                          </label>

                          <input
                            type="password"
                            value={
                              regPassword
                            }
                            onChange={(e) =>
                              setRegPassword(
                                e.target
                                  .value
                              )
                            }
                            placeholder="min 6 characters"
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm"
                          />
                        </div>

                        {selectedRole ===
                          'worker' && (
                          <div className="grid grid-cols-2 gap-2.5">

                            <input
                              placeholder="Village"
                              value={
                                workerExtra.village
                              }
                              onChange={(e) =>
                                setWorkerExtra({
                                  ...workerExtra,
                                  village:
                                    e.target
                                      .value,
                                })
                              }
                              className="px-3 py-2 border rounded-xl text-xs"
                            />

                            <input
                              placeholder="Sub-Centre"
                              value={
                                workerExtra.subCentre
                              }
                              onChange={(e) =>
                                setWorkerExtra({
                                  ...workerExtra,
                                  subCentre:
                                    e.target
                                      .value,
                                })
                              }
                              className="px-3 py-2 border rounded-xl text-xs"
                            />

                            <input
                              placeholder="Assigned PHC"
                              value={
                                workerExtra.assignedPhc
                              }
                              onChange={(e) =>
                                setWorkerExtra({
                                  ...workerExtra,
                                  assignedPhc:
                                    e.target
                                      .value,
                                })
                              }
                              className="col-span-2 px-3 py-2 border rounded-xl text-xs"
                            />

                          </div>
                        )}

                        {selectedRole ===
                          'patient' && (
                          <div className="grid grid-cols-2 gap-2.5">

                            <input
                              type="date"
                              value={
                                patientExtra.dob
                              }
                              onChange={(e) =>
                                setPatientExtra({
                                  ...patientExtra,
                                  dob:
                                    e.target
                                      .value,
                                })
                              }
                              className="px-3 py-2 border rounded-xl text-xs"
                            />

                            <select
                              value={
                                patientExtra.gender
                              }
                              onChange={(e) =>
                                setPatientExtra({
                                  ...patientExtra,
                                  gender:
                                    e.target
                                      .value,
                                })
                              }
                              className="px-3 py-2 border rounded-xl text-xs"
                            >
                              <option>
                                Female
                              </option>

                              <option>
                                Male
                              </option>

                              <option>
                                Other
                              </option>
                            </select>

                            <input
                              placeholder="Phone"
                              value={
                                patientExtra.phone
                              }
                              onChange={(e) =>
                                setPatientExtra({
                                  ...patientExtra,
                                  phone:
                                    e.target
                                      .value,
                                })
                              }
                              className="px-3 py-2 border rounded-xl text-xs"
                            />

                            <input
                              placeholder="Village"
                              value={
                                patientExtra.village
                              }
                              onChange={(e) =>
                                setPatientExtra({
                                  ...patientExtra,
                                  village:
                                    e.target
                                      .value,
                                })
                              }
                              className="px-3 py-2 border rounded-xl text-xs"
                            />

                          </div>
                        )}

                        <button
                          onClick={
                            handleRegister
                          }
                          disabled={
                            loading ||
                            !regFullName ||
                            !regEmail ||
                            !regPassword
                          }
                          className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm"
                        >
                          {loading
                            ? 'Registering...'
                            : 'Complete Registration'}
                        </button>

                      </>
                    )}

                  </div>
                )}

              </div>
            )}

          </div>

          <div className="px-8 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">

            <div className="flex items-center gap-1.5">
              <Icon
                name="lock"
                size={12}
                className="text-brand-600"
              />

              <span>
                AES-256 Encrypted · ABDM Sandbox
              </span>
            </div>

            <div className="flex items-center gap-1.5">

              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />

              <span>
                Offline-First Sync Engine
              </span>

            </div>

          </div>

        </div>
      </div>
    </div>
  );
}