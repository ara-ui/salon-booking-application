const express = require('express');
const router = express.Router();
const { handleCashfreeWebhook } = require('../controllers/cashfreeWebhook.controller');

// This route is mounted before express.json() in server.js so req.body remains
// the exact raw Buffer required for Cashfree signature verification.
router.post('/cashfree', handleCashfreeWebhook);

module.exports = router;
