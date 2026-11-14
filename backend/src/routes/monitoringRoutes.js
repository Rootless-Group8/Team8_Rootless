const crypto = require('crypto');
const express = require('express');
const {
  runMonitoring,
  listChanges,
  markChangeReviewed,
  MonitoringError,
} = require('../services/scraperService');

const router = express.Router();

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Same check as the Notifications API: the caller must send the
 * x-internal-api-key header matching the INTERNAL_API_KEY environment
 * variable. If the variable is not set, every request is refused.
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

// Every monitoring route is internal only.
router.use(requireInternalKey);

function sendError(res, err) {
  if (err instanceof MonitoringError) {
    const body = { error: err.code, message: err.message };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(err.status).json(body);
  }
  console.error('Monitoring route error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong.',
  });
}

// POST /api/monitoring/run: check every source now and return the summary
router.post('/run', async (req, res) => {
  try {
    const summary = await runMonitoring({ trigger: 'manual' });
    return res.status(200).json(summary);
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/monitoring/changes?status=pending_review: change records, newest first
router.get('/changes', async (req, res) => {
  try {
    const changes = await listChanges({ status: req.query.status });
    return res.status(200).json({ changes, count: changes.length });
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/monitoring/changes/:id: mark a change as reviewed
router.patch('/changes/:id', async (req, res) => {
  try {
    const change = await markChangeReviewed(req.params.id, req.body);
    return res.status(200).json(change);
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
