const express = require('express');
const router = express.Router();
const { listStaff, getStaff, createStaff, updateStaff, assignServices } = require('../controllers/staff.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Staff
 *   description: Staff profiles, working hours, and service assignments
 */

/**
 * @swagger
 * /staff:
 *   get:
 *     summary: List all staff members (public)
 *     tags: [Staff]
 *     responses:
 *       200: { description: Array of staff, each with their User info and assigned services }
 */
router.get('/', asyncHandler(listStaff));

/**
 * @swagger
 * /staff/{id}:
 *   get:
 *     summary: Get a single staff member by id (public)
 *     tags: [Staff]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: The staff member }
 *       404: { description: Not found }
 */
router.get('/:id', asyncHandler(getStaff));

/**
 * @swagger
 * /staff:
 *   post:
 *     summary: Create a new staff member — creates both the User account and Staff profile (admin only)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *               specialization: { type: string, example: "Hair coloring" }
 *               bio: { type: string }
 *               workingHours:
 *                 type: object
 *                 example: { "mon": [{"start":"09:00","end":"17:00"}] }
 *     responses:
 *       201: { description: Created staff member }
 *       400: { description: Missing fields }
 *       403: { description: Not an admin }
 *       409: { description: Email already in use }
 */
router.post('/', authenticate, requireRole('admin'), asyncHandler(createStaff));

/**
 * @swagger
 * /staff/{id}:
 *   put:
 *     summary: Update a staff member's specialization/bio/working hours (admin only)
 *     tags: [Staff]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated staff member }
 *       404: { description: Not found }
 *       403: { description: Not an admin }
 */
router.put('/:id', authenticate, requireRole('admin'), asyncHandler(updateStaff));

/**
 * @swagger
 * /staff/{id}/services:
 *   post:
 *     summary: Assign one or more services to a staff member (admin only)
 *     tags: [Staff]
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
 *             required: [serviceIds]
 *             properties:
 *               serviceIds:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [1, 2]
 *     responses:
 *       200: { description: Staff member with updated service list }
 *       400: { description: Invalid serviceIds }
 *       404: { description: Staff or a service not found }
 *       403: { description: Not an admin }
 */
router.post('/:id/services', authenticate, requireRole('admin'), asyncHandler(assignServices));

module.exports = router;
