const crypto = require('crypto');
const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const {
  createNotification,
  listNotifications,
  markNotificationAsRead,
  NotificationError,
} = require('../services/notificationService');

const router = express.Router();

// All notification routes require a valid Firebase ID token.
router.use(verifyFirebaseToken);

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/**
 * Limits an endpoint to internal callers (for example the Sprint 7 reminder
 * job). The caller must send the x-internal-api-key header matching the
 * INTERNAL_API_KEY environment variable. If the variable is not set, the
 * endpoint stays closed.
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

function sendError(res, err) {
  if (err instanceof NotificationError) {
    const body = { error: err.code, message: err.message };
    if (err.details) {
      body.details = err.details;
    }
    return res.status(err.status).json(body);
  }
  console.error('Notification route error:', err);
  return res.status(500).json({
    error: 'internal_error',
    message: 'Something went wrong.',
  });
}

// POST /api/notifications (internal use): create a notification
router.post('/', requireInternalKey, async (req, res) => {
  try {
    const notification = await createNotification(req.body);
    return res.status(201).json(notification);
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/notifications: the caller's notifications, newest first
router.get('/', async (req, res) => {
  try {
    const notifications = await listNotifications(req.firebaseUser.uid);
    return res.status(200).json({ notifications, count: notifications.length });
  } catch (err) {
    return sendError(res, err);
  }
});

// PATCH /api/notifications/:id: mark one of the caller's notifications as read
router.patch('/:id', async (req, res) => {
  try {
    const notification = await markNotificationAsRead(
      req.firebaseUser.uid,
      req.params.id
    );
    return res.status(200).json(notification);
  } catch (err) {
    return sendError(res, err);
  }
});

module.exports = router;
