const express = require('express');
const router = express.Router();
const { createCashfreeOrder, verifyCashfreePayment, getMyPayments, getAllPayments } = require('../controllers/payment.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');
const { createRateLimiter } = require('../middleware/rateLimit.middleware');
const paymentLimiter = createRateLimiter({ windowMs: 10 * 60 * 1000, max: 20 });

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Cashfree Sandbox checkout, verification, and payment history
 */

/**
 * @swagger
 * /payments/checkout:
 *   post:
 *     summary: Create a Cashfree Sandbox order for an appointment (customer)
 *     description: Uses the appointment's actual service price. Returns a paymentSessionId for the frontend to open the embedded Cashfree checkout modal.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointmentId]
 *             properties:
 *               appointmentId: { type: integer }
 *     responses:
 *       200:
 *         description: Cashfree order created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 orderId: { type: string }
 *                 paymentSessionId: { type: string }
 *                 paymentId: { type: integer }
 *       400: { description: Already paid, or missing appointmentId }
 *       403: { description: Not your appointment }
 *       404: { description: Appointment not found }
 */
router.post('/checkout', paymentLimiter, authenticate, requireRole('customer'), asyncHandler(createCashfreeOrder));

/**
 * @swagger
 * /payments/verify:
 *   post:
 *     summary: Verify a Cashfree payment result server-side (customer)
 *     description: >
 *       Called by the frontend after the Cashfree checkout modal resolves.
 *       Does NOT trust that callback alone — independently re-verifies the
 *       result via Cashfree's server-side PGOrderFetchPayments API before
 *       marking the payment/appointment as paid. This is the actual trust
 *       boundary, replacing the old Stripe webhook.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId: { type: string }
 *     responses:
 *       200: { description: Payment verified successfully }
 *       202: { description: Cashfree has not exposed a successful payment yet; retry is safe }
 *       400: { description: Missing orderId, expired order, amount mismatch, or completion gate failure }
 *       403: { description: Not your payment }
 *       404: { description: No payment found for this order }
 */
router.post('/verify', paymentLimiter, authenticate, requireRole('customer'), asyncHandler(verifyCashfreePayment));

/**
 * @swagger
 * /payments/mine:
 *   get:
 *     summary: Get the logged-in customer's own payment history
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of the customer's own payments, each including its Appointment and Service }
 */
router.get('/mine', authenticate, requireRole('customer'), asyncHandler(getMyPayments));

/**
 * @swagger
 * /payments:
 *   get:
 *     summary: List all payments (admin only) — "Payments Received"
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of every payment, each including its Appointment, Service, and customer }
 *       403: { description: Not an admin }
 */
router.get('/', authenticate, requireRole('admin'), asyncHandler(getAllPayments));

module.exports = router;
