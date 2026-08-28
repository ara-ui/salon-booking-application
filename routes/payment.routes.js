const express = require('express');
const router = express.Router();
const { createCheckoutSession, handleWebhook } = require('../controllers/payment.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Stripe checkout (test mode) and payment status
 */

/**
 * @swagger
 * /payments/checkout:
 *   post:
 *     summary: Create a Stripe checkout session for an appointment (customer)
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
 *         description: Stripe checkout URL to redirect the customer to
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string }
 *                 sessionId: { type: string }
 *       400: { description: Already paid, or missing appointmentId }
 *       403: { description: Not your appointment }
 *       404: { description: Appointment not found }
 */
router.post('/checkout', authenticate, requireRole('customer'), asyncHandler(createCheckoutSession));

/**
 * @swagger
 * /payments/webhook:
 *   post:
 *     summary: Stripe webhook — marks payment + appointment paid and generates the invoice
 *     description: >
 *       Called by Stripe directly, not by the frontend. Verifies the
 *       `stripe-signature` header against STRIPE_WEBHOOK_SECRET. Requires the
 *       raw request body, so this route is mounted with express.raw() in
 *       server.js instead of express.json().
 *     tags: [Payments]
 *     responses:
 *       200: { description: Event processed }
 *       400: { description: Signature verification failed }
 */
router.post('/webhook', asyncHandler(handleWebhook));

module.exports = router;
