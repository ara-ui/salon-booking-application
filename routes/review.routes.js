const express = require('express');
const router = express.Router();
const { createReview, listReviews, respondToReview } = require('../controllers/review.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: Customer reviews and staff responses
 */

/**
 * @swagger
 * /reviews:
 *   post:
 *     summary: Leave a review for a completed appointment (customer)
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appointmentId, rating]
 *             properties:
 *               appointmentId: { type: integer }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       201: { description: Review created }
 *       400: { description: Invalid rating, or appointment not completed }
 *       403: { description: Not your appointment }
 *       404: { description: Appointment not found }
 *       409: { description: Already reviewed }
 */
router.post('/', authenticate, requireRole('customer'), asyncHandler(createReview));

/**
 * @swagger
 * /reviews:
 *   get:
 *     summary: List reviews — filter with ?staffId= or ?serviceId= (public)
 *     tags: [Reviews]
 *     parameters:
 *       - in: query
 *         name: staffId
 *         schema: { type: integer }
 *       - in: query
 *         name: serviceId
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Array of reviews }
 */
router.get('/', asyncHandler(listReviews));

/**
 * @swagger
 * /reviews/{id}/response:
 *   put:
 *     summary: Respond to a review (only the staff member the review is about, or admin)
 *     tags: [Reviews]
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
 *             required: [response]
 *             properties:
 *               response: { type: string }
 *     responses:
 *       200: { description: Updated review }
 *       400: { description: Missing response text }
 *       403: { description: Not your review to respond to }
 *       404: { description: Not found }
 */
router.put('/:id/response', authenticate, asyncHandler(respondToReview));

module.exports = router;
