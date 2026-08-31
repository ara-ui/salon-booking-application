const express = require('express');
const router = express.Router();
const {
  getAvailableSlotsHandler, bookAppointment, getAppointmentById, getMyAppointments,
  getStaffAppointments, getAllAppointments, rescheduleAppointment, cancelAppointment,
  updateAppointmentStatus, downloadInvoice,
} = require('../controllers/appointment.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Appointments
 *   description: Booking, availability, and appointment management
 */

/**
 * @swagger
 * /appointments/available-slots:
 *   get:
 *     summary: Get bookable time slots for a service on a given date
 *     description: >
 *       staffId is optional. If provided, returns slots for that one staff
 *       member only (backward-compatible). If omitted (the customer-facing
 *       case), returns the union of slots bookable with ANY staff member
 *       currently assigned to the service — the customer never picks staff;
 *       a specific one is resolved automatically at booking time using the
 *       same working-hours and conflict rules.
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: serviceId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: staffId
 *         required: false
 *         schema: { type: integer }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, example: "2026-08-29" }
 *     responses:
 *       200:
 *         description: List of free slots (merged across assigned staff if staffId was omitted)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date: { type: string }
 *                 serviceId: { type: integer }
 *                 staffId: { type: integer, description: "Only present if staffId was passed in the request" }
 *                 noStaffAssigned: { type: boolean, description: "true if no staff at all are assigned to this service" }
 *                 slots:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       startTime: { type: string, example: "09:00" }
 *                       endTime: { type: string, example: "09:45" }
 *       400: { description: Missing or malformed query params }
 *       404: { description: Service or staff (if staffId given) not found }
 */
router.get('/available-slots', asyncHandler(getAvailableSlotsHandler));

/**
 * @swagger
 * /appointments:
 *   post:
 *     summary: Book an appointment (customer)
 *     description: >
 *       staffId is optional and should normally be omitted — the customer
 *       does not choose staff. The backend auto-assigns an available staff
 *       member assigned to the service, preferring the customer's saved
 *       preferredStaffId when they're assigned and available. Re-validates
 *       working hours and slot availability before creating the booking,
 *       and sends a confirmation email.
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, date, startTime]
 *             properties:
 *               serviceId: { type: integer }
 *               staffId: { type: integer, description: "Optional — omit to let the backend auto-assign" }
 *               date: { type: string, example: "2026-08-29" }
 *               startTime: { type: string, example: "10:00" }
 *     responses:
 *       201: { description: Booking created }
 *       400: { description: Missing fields, no staff assigned to the service, or requested time is outside salon/staff working hours }
 *       404: { description: Service not found, or given staffId is not assigned to this service }
 *       409: { description: Slot no longer available with the given/any assigned staff member }
 */
router.post('/', authenticate, requireRole('customer'), asyncHandler(bookAppointment));

/**
 * @swagger
 * /appointments/mine:
 *   get:
 *     summary: Get the logged-in customer's own appointments
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of the customer's appointments }
 */
router.get('/mine', authenticate, requireRole('customer'), asyncHandler(getMyAppointments));

/**
 * @swagger
 * /appointments/staff/mine:
 *   get:
 *     summary: Get the logged-in staff member's assigned appointments
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of appointments assigned to this staff member }
 *       404: { description: No staff profile linked to this account }
 */
router.get('/staff/mine', authenticate, requireRole('staff'), asyncHandler(getStaffAppointments));

/**
 * @swagger
 * /appointments:
 *   get:
 *     summary: List all appointments (admin only) — supports ?status= and ?date= filters
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [booked, completed, cancelled, rescheduled] }
 *       - in: query
 *         name: date
 *         schema: { type: string, example: "2026-08-29" }
 *     responses:
 *       200: { description: Array of all appointments }
 *       403: { description: Not an admin }
 */
router.get('/', authenticate, requireRole('admin'), asyncHandler(getAllAppointments));

/**
 * @swagger
 * /appointments/{id}:
 *   get:
 *     summary: Get full appointment detail — date, time, service, staff, status, payment status
 *     description: Viewable by the customer who booked it, the assigned staff member, or an admin.
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Full appointment detail }
 *       403: { description: Not your appointment }
 *       404: { description: Not found }
 */
router.get('/:id', authenticate, asyncHandler(getAppointmentById));

/**
 * @swagger
 * /appointments/{id}/reschedule:
 *   put:
 *     summary: Reschedule an appointment (customer who owns it, or admin)
 *     description: Blocked within 2 hours of the current appointment start time.
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [date, startTime]
 *             properties:
 *               date: { type: string }
 *               startTime: { type: string }
 *     responses:
 *       200: { description: Rescheduled appointment }
 *       400: { description: Too close to start time, invalid status, missing fields, or requested time is outside salon/staff working hours }
 *       403: { description: Not your appointment }
 *       409: { description: New slot not available }
 */
router.put('/:id/reschedule', authenticate, asyncHandler(rescheduleAppointment));

/**
 * @swagger
 * /appointments/{id}/cancel:
 *   put:
 *     summary: Cancel an appointment (customer who owns it, or admin)
 *     description: Blocked within 2 hours of start time for customers; admins can force-cancel any time.
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Cancelled appointment }
 *       400: { description: Too close to start time, or already cancelled/completed }
 *       403: { description: Not your appointment }
 */
router.put('/:id/cancel', authenticate, asyncHandler(cancelAppointment));

/**
 * @swagger
 * /appointments/{id}/status:
 *   put:
 *     summary: Mark an appointment completed (assigned staff member, or admin)
 *     description: If the appointment is marked completed and is already paid, this generates the PDF invoice (see GET /appointments/{id}/invoice).
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [booked, completed] }
 *     responses:
 *       200: { description: Updated appointment }
 *       403: { description: Not the assigned staff member }
 *       404: { description: Not found }
 */
router.put('/:id/status', authenticate, asyncHandler(updateAppointmentStatus));

/**
 * @swagger
 * /appointments/{id}/invoice:
 *   get:
 *     summary: Download the PDF invoice for a paid, completed appointment
 *     description: Available once the appointment is BOTH marked completed AND paid (whichever happens second triggers generation). Viewable by the owning customer or an admin.
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: PDF file
 *         content:
 *           application/pdf: {}
 *       403: { description: Not your appointment }
 *       404: { description: Not found, or invoice not generated yet }
 */
router.get('/:id/invoice', authenticate, asyncHandler(downloadInvoice));

module.exports = router;
