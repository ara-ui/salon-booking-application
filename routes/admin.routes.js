const express = require('express');
const router = express.Router();
const { runReminderJob } = require('../utils/reminderCron');
const { authenticate, requireRole } = require('../middleware/auth.middleware');
const { asyncHandler } = require('../middleware/error.middleware');

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin-only utility actions
 */

/**
 * @swagger
 * /admin/run-reminders:
 *   post:
 *     summary: Manually run the reminder job now (admin only) — same logic the daily cron job runs
 *     description: Useful for demoing the reminder feature without waiting for the 08:00 schedule.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Reminder job result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 date: { type: string }
 *                 remindersSent: { type: integer }
 *       403: { description: Not an admin }
 */
router.post('/run-reminders', authenticate, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await runReminderJob();
  res.json(result);
}));

module.exports = router;
