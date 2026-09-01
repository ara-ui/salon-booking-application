const express = require('express');
const router = express.Router();
const { register, login, forgotPassword, resetPassword } = require('../controllers/auth.controller');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Auth
 *   description: Registration and login
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new customer account
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string, example: "Priya Sharma" }
 *               email: { type: string, example: "priya@example.com" }
 *               password: { type: string, example: "SecurePass123" }
 *               phone: { type: string, example: "+91 9876543210" }
 *     responses:
 *       201:
 *         description: Account created, returns JWT + user
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Email already registered
 */
router.post('/register', asyncHandler(register));

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and receive a JWT
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Returns JWT + user
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Account deactivated
 */
router.post('/login', asyncHandler(login));

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "priya@example.com" }
 *     responses:
 *       200:
 *         description: >
 *           Always returns this same generic message, whether or not the
 *           email is registered, so the endpoint can't be used to check
 *           which emails exist. If it is registered, a reset email is sent.
 */
router.post('/forgot-password', asyncHandler(forgotPassword));

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset a password using the token from the emailed reset link
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string, description: "Raw token from the reset link's ?token= query param" }
 *               password: { type: string, example: "NewSecurePass123" }
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Token missing, invalid, expired, or already used
 */
router.post('/reset-password', asyncHandler(resetPassword));

module.exports = router;
