import { Router } from "express"
import {
  bookAppointment,
  getDoctorAppointments,
  getDoctorSlots,
  updateDoctorSlotCapacity,
  getPatientAppointments,
  getFacilityAppointments,
  updateAppointmentStatus,
} from "../controllers/appointment.controller.js"

const router = Router()

// Book an appointment (patient, ASHA worker, or doctor referral)
router.post("/", bookAppointment)

// Fetch appointments queue for a doctor (sorted by priority & token)
router.get("/doctor/:doctorId", getDoctorAppointments)

// Live slot availability & capacity per 30-min window
router.get("/doctor/:doctorId/slots", getDoctorSlots)

// Doctor slot capacity update
router.patch("/doctor/:doctorId/capacity", updateDoctorSlotCapacity)

// Fetch patient's appointments & OPD tokens
router.get("/patient/:patientId", getPatientAppointments)

// Fetch facility appointments
router.get("/facility/:facilityId", getFacilityAppointments)

// Update status (CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED)
router.patch("/:id/status", updateAppointmentStatus)

export default router
