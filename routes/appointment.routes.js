const express = require('express');
const router = express.Router();
const {
  getAvailableSlotsHandler, bookAppointment, getAppointmentById, getMyAppointments,
  getStaffAppointments, getAllAppointments, rescheduleAppointment, cancelAppointment,
  updateAppointmentStatus,
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
 *     summary: Get bookable time slots for a service + staff member on a given date
 *     description: >
 *       Intersects the salon's working hours, the staff member's working hours,
 *       and the service duration, then removes any slot that overlaps an
 *       existing booking for that staff member on that date.
 *     tags: [Appointments]
 *     parameters:
 *       - in: query
 *         name: serviceId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: staffId
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, example: "2026-08-29" }
 *     responses:
 *       200:
 *         description: List of free slots
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date: { type: string }
 *                 serviceId: { type: integer }
 *                 staffId: { type: integer }
 *                 slots:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       startTime: { type: string, example: "09:00" }
 *                       endTime: { type: string, example: "09:45" }
 *       400: { description: Missing or malformed query params }
 *       404: { description: Service, staff, or salon settings not found }
 */
router.get('/available-slots', asyncHandler(getAvailableSlotsHandler));

/**
 * @swagger
 * /appointments:
 *   post:
 *     summary: Book an appointment (customer)
 *     description: Re-validates the slot is still free before creating the booking, and sends a confirmation email.
 *     tags: [Appointments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [serviceId, staffId, date, startTime]
 *             properties:
 *               serviceId: { type: integer }
 *               staffId: { type: integer }
 *               date: { type: string, example: "2026-08-29" }
 *               startTime: { type: string, example: "10:00" }
 *     responses:
 *       201: { description: Booking created }
 *       400: { description: Missing fields }
 *       404: { description: Service or staff not found }
 *       409: { description: Slot no longer available }
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
 *       400: { description: Too close to start time, or invalid status }
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

module.exports = router;
