const crypto = require('crypto');
const express = require('express');
const { runReminderScan } = require('../services/reminderService');

const router = express.Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Same internal key check as notificationRoutes.js (Sprint 6), copied here
 * because that file does not export it. The caller must send the
 * x-internal-api-key header matching INTERNAL_API_KEY. If the variable is not
 * set, the endpoint stays closed.
 */
function requireInternalKey(req, res, next) {
  const expected = process.env.INTERNAL_API_KEY;
  const provided = req.get('x-internal-api-key');

  if (!expected || !provided || !safeEqual(provided, expected)) {
    return res.status(403).json({
      error: 'forbidden',
      message: 'This endpoint is for internal use only.',
    });
  }
  return next();
}

// POST /api/reminders/run (internal use): run one reminder scan now
router.post('/run', requireInternalKey, async (req, res) => {
  try {
    const summary = await runReminderScan();
    return res.status(200).json({ summary });
  } catch (err) {
    console.error('Reminder route error:', err);
    return res.status(500).json({
      error: 'internal_error',
      message: 'Something went wrong.',
    });
  }
});

module.exports = router;
