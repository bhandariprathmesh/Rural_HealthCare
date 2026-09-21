import { Request, Response, NextFunction } from "express"
import { z } from "zod"
import { prisma } from "../lib/prisma.js"
import { AppError } from "../middleware/error.js"
import {
  AppointmentStatus,
  AppointmentPriority,
  RiskLevel,
} from "@prisma/client"

const bookAppointmentSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  doctorId: z.string().min(1, "Doctor ID is required"),
  facilityId: z.string().optional(),
  scheduledDate: z.string().min(8, "Scheduled date is required (YYYY-MM-DD)"),
  timeSlot: z.string().default("10:00 AM - 11:00 AM"),
  reason: z.string().optional(),
  notes: z.string().optional(),
  priority: z.enum(["ROUTINE", "URGENT", "HIGH_RISK"]).optional(),
  source: z.enum(["PATIENT", "ASHA", "REFERRAL"]).default("PATIENT"),
  bookedByWorkerId: z.string().optional(),
})

/**
 * Helper to resolve patient by UUID or healthId
 */
async function resolvePatient(identifier: string) {
  return await prisma.patient.findFirst({
    where: {
      OR: [
        { id: identifier },
        { healthId: identifier },
        { userId: identifier },
        { abhaAddress: identifier },
      ],
    },
  })
}

/**
 * POST /api/v1/appointments
 * Book a new doctor consultation and generate priority OPD token
 */
export async function bookAppointment(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const body = bookAppointmentSchema.parse(req.body)

    // 1. Resolve Patient
    const patient = await resolvePatient(body.patientId)
    if (!patient) {
      throw new AppError(`Patient '${body.patientId}' was not found.`, 404)
    }

    // 2. Resolve Doctor
    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [{ id: body.doctorId }, { userId: body.doctorId }],
      },
      include: {
        facility: true,
      },
    })

    if (!doctor) {
      throw new AppError(`Doctor '${body.doctorId}' was not found.`, 404)
    }

    const facilityId = body.facilityId || doctor.facilityId
    const cleanDate = body.scheduledDate.trim()

    // 3. Compute priority if not explicitly provided
    let priority: AppointmentPriority = AppointmentPriority.ROUTINE
    if (body.priority) {
      priority = (body.priority as AppointmentPriority)
    } else {
      if (
        patient.riskLevel === RiskLevel.CRITICAL ||
        patient.riskLevel === RiskLevel.HIGH
      ) {
        priority = AppointmentPriority.HIGH_RISK
      } else if (patient.riskLevel === RiskLevel.MODERATE) {
        priority = AppointmentPriority.URGENT
      }
    }

    // 4. Enforce Slot Capacity (prevent overbooking)
    const slotCapacity = doctor.slotCapacity || 3
    const bookedInSlot = await prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        scheduledDate: cleanDate,
        timeSlot: body.timeSlot,
        status: { not: AppointmentStatus.CANCELLED },
      },
    })

    if (bookedInSlot >= slotCapacity) {
      throw new AppError(
        `Time slot '${body.timeSlot}' is fully booked (capacity: ${slotCapacity} patients). Please select another available slot.`,
        400,
      )
    }

    // 5. Calculate sequential tokenNumber for (doctorId, scheduledDate)
    const existingCount = await prisma.appointment.count({
      where: {
        doctorId: doctor.id,
        scheduledDate: cleanDate,
      },
    })

    const tokenNumber = existingCount + 1
    const dateCompact = cleanDate.replace(/[^0-9]/g, "")
    const appointmentCode = `OPD-${dateCompact}-${tokenNumber.toString().padStart(3, "0")}`

    // 6. Create Appointment
    const appointment = await prisma.appointment.create({
      data: {
        tokenNumber,
        appointmentCode,
        patientId: patient.id,
        doctorId: doctor.id,
        facilityId,
        scheduledDate: cleanDate,
        timeSlot: body.timeSlot,
        status: AppointmentStatus.CONFIRMED,
        priority,
        reason: body.reason || null,
        notes: body.notes || null,
        source: body.source,
        bookedByWorkerId: body.bookedByWorkerId || null,
      },
      include: {
        patient: {
          select: {
            id: true,
            healthId: true,
            name: true,
            gender: true,
            age: true,
            phone: true,
            village: true,
            abhaNumber: true,
            abhaAddress: true,
            riskLevel: true,
          },
        },
        doctor: {
          select: {
            id: true,
            name: true,
            specialty: true,
            hprId: true,
            facility: {
              select: {
                id: true,
                name: true,
                facilityType: true,
                district: true,
              },
            },
          },
        },
        facility: {
          select: {
            id: true,
            name: true,
            facilityType: true,
            district: true,
          },
        },
      },
    })

    res.status(201).json({
      success: true,
      message: `Appointment booked successfully. OPD Token #${tokenNumber}`,
      data: { appointment },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/v1/appointments/doctor/:doctorId
 * Fetch OPD queue for a doctor (sorted by priority and token number)
 */
export async function getDoctorAppointments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctorId = String(req.params.doctorId)
    const { date, status } = req.query

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [{ id: doctorId }, { userId: doctorId }],
      },
    })

    if (!doctor) {
      throw new AppError(`Doctor '${doctorId}' was not found.`, 404)
    }

    const where: any = { doctorId: doctor.id }

    if (typeof date === "string" && date.trim()) {
      where.scheduledDate = date.trim()
    }

    if (typeof status === "string" && status.trim()) {
      where.status = (status.toUpperCase() as AppointmentStatus)
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            healthId: true,
            name: true,
            gender: true,
            age: true,
            phone: true,
            village: true,
            abhaNumber: true,
            abhaAddress: true,
            riskLevel: true,
          },
        },
        facility: {
          select: {
            name: true,
            facilityType: true,
            district: true,
          },
        },
      },
      orderBy: [{ scheduledDate: "asc" }, { tokenNumber: "asc" }],
    })

    // Custom sort: HIGH_RISK -> URGENT -> ROUTINE within same date
    const priorityWeight: Record<AppointmentPriority, number> = {
      HIGH_RISK: 1,
      URGENT: 2,
      ROUTINE: 3,
    }

    appointments.sort((a, b) => {
      const pDiff =
        (priorityWeight[a.priority] || 3) - (priorityWeight[b.priority] || 3)
      if (pDiff !== 0) return pDiff
      return a.tokenNumber - b.tokenNumber
    })

    res.json({
      success: true,
      data: { appointments },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/v1/appointments/patient/:patientId
 * Fetch patient's appointments and OPD tokens
 */
export async function getPatientAppointments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const patientId = String(req.params.patientId)

    const patient = await resolvePatient(patientId)
    if (!patient) {
      throw new AppError(`Patient '${patientId}' was not found.`, 404)
    }

    const appointments = await prisma.appointment.findMany({
      where: { patientId: patient.id },
      include: {
        doctor: {
          select: {
            id: true,
            name: true,
            specialty: true,
            hprId: true,
            facility: {
              select: {
                name: true,
                facilityType: true,
                district: true,
              },
            },
          },
        },
        facility: {
          select: {
            name: true,
            facilityType: true,
            district: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    res.json({
      success: true,
      data: { appointments },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * GET /api/v1/appointments/facility/:facilityId
 * Fetch all appointments queue for a given facility
 */
export async function getFacilityAppointments(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const facilityId = String(req.params.facilityId)
    const { date } = req.query

    const where: any = { facilityId }
    if (typeof date === "string" && date.trim()) {
      where.scheduledDate = date.trim()
    }

    const appointments = await prisma.appointment.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            healthId: true,
            name: true,
            age: true,
            gender: true,
            village: true,
            riskLevel: true,
          },
        },
        doctor: {
          select: {
            name: true,
            specialty: true,
          },
        },
      },
      orderBy: [{ tokenNumber: "asc" }],
    })

    res.json({
      success: true,
      data: { appointments },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/v1/appointments/:id/status
 * Update appointment status (CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED)
 */
export async function updateAppointmentStatus(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = String(req.params.id)
    const schema = z.object({
      status: z.enum([
        "PENDING",
        "CONFIRMED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
      ]),
      notes: z.string().optional(),
    })

    const body = schema.parse(req.body)

    const appointment = await prisma.appointment.update({
      where: { id },
      data: {
        status: body.status as AppointmentStatus,
        ...(body.notes ? { notes: body.notes } : {}),
      },
      include: {
        patient: { select: { id: true, name: true, healthId: true } },
        doctor: { select: { id: true, name: true } },
      },
    })

    res.json({
      success: true,
      message: `Appointment marked as ${body.status}`,
      data: { appointment },
    })
  } catch (err) {
    next(err)
  }
}

export const STANDARD_OPD_SLOTS = [
  "09:00 AM - 09:30 AM",
  "09:30 AM - 10:00 AM",
  "10:00 AM - 10:30 AM",
  "10:30 AM - 11:00 AM",
  "11:00 AM - 11:30 AM",
  "11:30 AM - 12:00 PM",
  "12:00 PM - 12:30 PM",
  "02:00 PM - 02:30 PM",
  "02:30 PM - 03:00 PM",
  "03:00 PM - 03:30 PM",
  "03:30 PM - 04:00 PM",
]

/**
 * GET /api/v1/appointments/doctor/:doctorId/slots?date=YYYY-MM-DD
 * Get live slot occupancy, remaining spots, and availability status for a doctor
 */
export async function getDoctorSlots(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctorId = String(req.params.doctorId)
    const dateQuery = typeof req.query.date === "string" && req.query.date.trim()
      ? req.query.date.trim()
      : new Date().toISOString().split("T")[0]

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [{ id: doctorId }, { userId: doctorId }],
      },
      include: { facility: true },
    })

    if (!doctor) {
      throw new AppError(`Doctor '${doctorId}' was not found.`, 404)
    }

    const capacity = doctor.slotCapacity || 3

    // Fetch all active/booked appointments for this doctor on this date
    const bookedAppointments = await prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        scheduledDate: dateQuery,
        status: { not: AppointmentStatus.CANCELLED },
      },
      select: {
        id: true,
        timeSlot: true,
        priority: true,
        tokenNumber: true,
      },
    })

    // Count bookings per slot
    const slotCounts: Record<string, number> = {}
    for (const appt of bookedAppointments) {
      slotCounts[appt.timeSlot] = (slotCounts[appt.timeSlot] || 0) + 1
    }

    const slots = STANDARD_OPD_SLOTS.map((timeSlot) => {
      const bookedCount = slotCounts[timeSlot] || 0
      const availableSpots = Math.max(0, capacity - bookedCount)
      let status: "AVAILABLE" | "ALMOST_FULL" | "FULL" = "AVAILABLE"

      if (bookedCount >= capacity) {
        status = "FULL"
      } else if (availableSpots === 1) {
        status = "ALMOST_FULL"
      }

      return {
        timeSlot,
        capacity,
        bookedCount,
        availableSpots,
        status,
      }
    })

    res.json({
      success: true,
      data: {
        doctorId: doctor.id,
        doctorName: doctor.name,
        scheduledDate: dateQuery,
        slotCapacity: capacity,
        totalBooked: bookedAppointments.length,
        slots,
      },
    })
  } catch (err) {
    next(err)
  }
}

/**
 * PATCH /api/v1/appointments/doctor/:doctorId/capacity
 * Update doctor's slot capacity (max patients per 30-min slot)
 */
export async function updateDoctorSlotCapacity(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const doctorId = String(req.params.doctorId)
    const schema = z.object({
      capacity: z.number().int().min(1).max(10),
    })

    const { capacity } = schema.parse(req.body)

    const doctor = await prisma.doctor.findFirst({
      where: {
        OR: [{ id: doctorId }, { userId: doctorId }],
      },
    })

    if (!doctor) {
      throw new AppError(`Doctor '${doctorId}' was not found.`, 404)
    }

    const updated = await prisma.doctor.update({
      where: { id: doctor.id },
      data: { slotCapacity: capacity },
    })

    res.json({
      success: true,
      message: `Doctor slot capacity updated to ${capacity} patients per slot`,
      data: {
        doctorId: updated.id,
        slotCapacity: updated.slotCapacity,
      },
    })
  } catch (err) {
    next(err)
  }
}
