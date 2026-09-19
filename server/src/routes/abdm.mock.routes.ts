import { Router } from 'express';
import {
  getMockStatus,
  getFacilities,
  getFacilityById,
  searchFacilities,
  getProfessionals,
  getProfessionalById,
  searchProfessionals,
  createProfessional,
  getWorkers,
  getWorkerById,
  searchWorkers,
  getAbhaProfile,
  verifyAbha,
  getConsentById,
  createConsent,
  revokeConsent,
  approveConsent,
  getFHIRPatient,
  getFHIREncounter,
  getFHIRBundle,
  getFHIRServiceRequest,
} from '../controllers/abdm/abdm.mock.controller.js';

const router = Router();

// Status & Metadata
router.get('/status', getMockStatus);

// HFR (Health Facility Registry) Endpoints
router.get('/hfr/search', searchFacilities);
router.get('/hfr/facilities', getFacilities);
router.get('/hfr/facilities/:id', getFacilityById);

// HPR (Healthcare Professionals Registry) Endpoints
router.get('/hpr/search', searchProfessionals);
router.get('/hpr/professionals', getProfessionals);
router.get('/hpr/professionals/:id', getProfessionalById);
router.post('/hpr/professionals', createProfessional);

// Operational Health Worker Directory Endpoints
router.get('/workers/search', searchWorkers);
router.get('/workers', getWorkers);
router.get('/workers/:id', getWorkerById);

// ABHA Identity References
router.post('/abha/verify', verifyAbha);
router.get('/abha/:id', getAbhaProfile);

// Consent & PHR Endpoints
router.get('/consents/:id', getConsentById);
router.post('/consents', createConsent);
router.post('/consents/:id/approve', approveConsent);
router.post('/consents/:id/revoke', revokeConsent);

// FHIR R4 Interoperability Endpoints
router.get('/fhir/patient/:id', getFHIRPatient);
router.get('/fhir/encounter/:id', getFHIREncounter);
router.get('/fhir/bundle/:patientId', getFHIRBundle);
router.get('/fhir/servicerequest/:id', getFHIRServiceRequest);

export default router;