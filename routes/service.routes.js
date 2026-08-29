const express = require('express');
const router = express.Router();
const {
  listServices, getService, createService, updateService, deleteService,
  getSalonSettings, updateSalonSettings,
} = require('../controllers/service.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Services
 *   description: Service listings and salon working hours
 */

/**
 * @swagger
 * /services:
 *   get:
 *     summary: List all active services (public)
 *     tags: [Services]
 *     responses:
 *       200: { description: Array of services }
 */
router.get('/', asyncHandler(listServices));

/**
 * @swagger
 * /services/{id}:
 *   get:
 *     summary: Get a single service by id (public)
 *     tags: [Services]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: The service }
 *       404: { description: Not found }
 */
router.get('/:id', asyncHandler(getService));

/**
 * @swagger
 * /services:
 *   post:
 *     summary: Create a new service (admin only)
 *     tags: [Services]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, durationMinutes, price]
 *             properties:
 *               name: { type: string, example: "Haircut and style" }
 *               description: { type: string }
 *               durationMinutes: { type: integer, example: 45 }
 *               price: { type: number, example: 35.00 }
 *     responses:
 *       201: { description: Created service }
 *       400: { description: Missing fields }
 *       403: { description: Not an admin }
 */
router.post('/', authenticate, requireRole('admin'), asyncHandler(createService));

/**
 * @swagger
 * /services/{id}:
 *   put:
 *     summary: Update a service (admin only)
 *     tags: [Services]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Updated service }
 *       404: { description: Not found }
 *       403: { description: Not an admin }
 */
router.put('/:id', authenticate, requireRole('admin'), asyncHandler(updateService));

/**
 * @swagger
 * /services/{id}:
 *   delete:
 *     summary: Deactivate a service (admin only, soft delete)
 *     tags: [Services]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Deactivated }
 *       404: { description: Not found }
 *       403: { description: Not an admin }
 */
router.delete('/:id', authenticate, requireRole('admin'), asyncHandler(deleteService));

module.exports = router;

// Salon settings — exported separately since it mounts at a different base path (/api/salon-settings)
const settingsRouter = express.Router();

/**
 * @swagger
 * /salon-settings:
 *   get:
 *     summary: Get the salon's working hours and special-day overrides (public)
 *     tags: [Services]
 *     responses:
 *       200:
 *         description: Salon working hours + special dates (specialDates is always an array, never null)
 *       404: { description: Not configured yet }
 */
settingsRouter.get('/', asyncHandler(getSalonSettings));

/**
 * @swagger
 * /salon-settings:
 *   put:
 *     summary: Set the salon's working hours and/or special-day overrides (admin only)
 *     description: specialDates is optional — omit it to leave the existing special days untouched while only updating workingHours.
 *     tags: [Services]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workingHours]
 *             properties:
 *               workingHours:
 *                 type: object
 *                 example: { "mon": [{"start":"09:00","end":"18:00"}], "tue": [{"start":"09:00","end":"18:00"}] }
 *               specialDates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     date: { type: string, example: "2026-12-25" }
 *                     type: { type: string, enum: [closed, special, early_close] }
 *                     start: { type: string, example: "09:00" }
 *                     end: { type: string, example: "14:00" }
 *     responses:
 *       200: { description: Updated settings }
 *       400: { description: Missing workingHours, or specialDates is not an array }
 *       403: { description: Not an admin }
 */
settingsRouter.put('/', authenticate, requireRole('admin'), asyncHandler(updateSalonSettings));

module.exports.settingsRouter = settingsRouter;
