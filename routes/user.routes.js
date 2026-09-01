const express = require('express');
const router = express.Router();
const { getMe, updateMe, listUsers, setUserActive,createAdmin } = require('../controllers/user.controller');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Profile management and admin user management
 */

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get the logged-in user's own profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: The user's profile }
 *       401: { description: Not authenticated }
 */
router.get('/me', authenticate, asyncHandler(getMe));

/**
 * @swagger
 * /users/me:
 *   put:
 *     summary: Update the logged-in user's own profile and preferences
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 *               preferredStaffId: { type: integer, nullable: true, description: "Set to null to clear the preference" }
 *               reminderOptIn: { type: boolean, description: "Set to false to stop receiving reminder emails" }
 *               preferenceNotes: { type: string, description: "Free text — allergies, styling notes, anything else" }
 *     responses:
 *       200: { description: Updated profile }
 *       401: { description: Not authenticated }
 *       404: { description: preferredStaffId does not match any staff member }
 */
router.put('/me', authenticate, asyncHandler(updateMe));

/**
 * @swagger
 * /users:
 *   get:
 *     summary: List all users (admin only) — supports ?role=customer|staff|admin
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [customer, staff, admin] }
 *     responses:
 *       200: { description: Array of users }
 *       403: { description: Not an admin }
 */
router.get('/', authenticate, requireRole('admin'), asyncHandler(listUsers));

/**
 * @swagger
 * /users/{id}/active:
 *   put:
 *     summary: Activate or deactivate a user account (admin only)
 *     tags: [Users]
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
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Updated status }
 *       403: { description: Not an admin }
 *       404: { description: User not found }
 */
router.put('/:id/active', authenticate, requireRole('admin'), asyncHandler(setUserActive));
/**
 * @swagger
 * /users/admin:
 *   post:
 *     summary: Create a new admin account (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: Admin account created
 *       400:
 *         description: Required fields missing
 *       403:
 *         description: Not an admin
 *       409:
 *         description: Email already exists
 */
router.post('/admin', authenticate, requireRole('admin'), asyncHandler(createAdmin));


module.exports = router;
