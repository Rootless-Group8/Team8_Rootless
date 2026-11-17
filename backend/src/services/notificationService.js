const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');
const { deliverNotification } = require('./deliveryService');

const NOTIFICATIONS_COLLECTION = 'notifications';

const NOTIFICATION_TYPES = [
  'deadline_reminder',
  'checklist_update',
  'document_update',
  'system',
];

const STATUS_UNREAD = 'unread';
const STATUS_READ = 'read';
const MAX_MESSAGE_LENGTH = 500;

/**
 * Error carrying an HTTP status and a machine-readable code so the route
 * layer can translate service failures into consistent JSON responses.
 */
class NotificationError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'NotificationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getDb() {
  return initializeFirebaseAdmin().firestore();
}

function toMillis(value) {
  if (!value) {
    return 0;
  }
  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  return new Date(value).getTime();
}

function toIso(value) {
  if (!value) {
    return null;
  }
  if (typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date(value).toISOString();
}

function toPublicNotification(id, data) {
  return {
    id,
    recipientUid: data.recipientUid,
    type: data.type,
    message: data.message,
    status: data.status,
    createdAt: toIso(data.createdAt),
    readAt: toIso(data.readAt),
    delivery: data.delivery || {},
  };
}

/**
 * Validates the input for creating a notification. Returns an object mapping
 * field name to error message. An empty object means the input is valid.
 *
 * @param {object} input
 * @returns {Object<string, string>}
 */
function validateNotificationInput(input) {
  const body = input || {};
  const errors = {};

  if (typeof body.recipientUid !== 'string' || !body.recipientUid.trim()) {
    errors.recipientUid = 'recipientUid is required.';
  }

  if (!NOTIFICATION_TYPES.includes(body.type)) {
    errors.type = `type must be one of: ${NOTIFICATION_TYPES.join(', ')}.`;
  }

  if (typeof body.message !== 'string' || !body.message.trim()) {
    errors.message = 'message is required.';
  } else if (body.message.trim().length > MAX_MESSAGE_LENGTH) {
    errors.message = `message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`;
  }

  return errors;
}

/**
 * Loads a notification and confirms the caller owns it.
 * Throws 404 if it does not exist and 403 if it belongs to someone else.
 */
async function loadOwnedNotification(uid, notificationId) {
  const docRef = getDb().collection(NOTIFICATIONS_COLLECTION).doc(notificationId);
  const snapshot = await docRef.get();

  if (!snapshot.exists) {
    throw new NotificationError(404, 'not_found', 'Notification not found.');
  }

  const data = snapshot.data();
  if (data.recipientUid !== uid) {
    throw new NotificationError(
      403,
      'forbidden',
      'You do not have access to this notification.'
    );
  }

  return { docRef, data };
}

/**
 * Creates and stores a notification, then hands it to the delivery skeleton.
 * A delivery problem never prevents the notification from being stored.
 *
 * @param {object} input { recipientUid, type, message }
 * @returns {Promise<object>}
 */
async function createNotification(input) {
  const errors = validateNotificationInput(input);
  if (Object.keys(errors).length > 0) {
    throw new NotificationError(
      400,
      'validation_error',
      'Notification input is invalid.',
      errors
    );
  }

  const data = {
    recipientUid: input.recipientUid.trim(),
    type: input.type,
    message: input.message.trim(),
    status: STATUS_UNREAD,
    createdAt: new Date(),
    readAt: null,
    delivery: {},
  };

  const docRef = await getDb().collection(NOTIFICATIONS_COLLECTION).add(data);

  let delivery;
  try {
    delivery = await deliverNotification({ id: docRef.id, ...data });
  } catch (err) {
    console.error('Notification delivery error:', err);
    delivery = { error: 'failed' };
  }

  await docRef.update({ delivery });

  return toPublicNotification(docRef.id, { ...data, delivery });
}

/**
 * Lists the caller's notifications, newest first.
 *
 * Sorting happens here instead of in the Firestore query so this sprint does
 * not need a composite index. If lists grow large, move the sort into the
 * query and add the index.
 *
 * @param {string} uid
 * @returns {Promise<object[]>}
 */
async function listNotifications(uid) {
  const snapshot = await getDb()
    .collection(NOTIFICATIONS_COLLECTION)
    .where('recipientUid', '==', uid)
    .get();

  return snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .sort((a, b) => toMillis(b.data.createdAt) - toMillis(a.data.createdAt))
    .map(({ id, data }) => toPublicNotification(id, data));
}

/**
 * Marks one of the caller's notifications as read. Marking an already read
 * notification is a no-op and keeps the original readAt.
 *
 * @param {string} uid
 * @param {string} notificationId
 * @returns {Promise<object>}
 */
async function markNotificationAsRead(uid, notificationId) {
  const { docRef, data } = await loadOwnedNotification(uid, notificationId);

  if (data.status === STATUS_READ) {
    return toPublicNotification(notificationId, data);
  }

  const readAt = new Date();
  await docRef.update({ status: STATUS_READ, readAt });

  return toPublicNotification(notificationId, {
    ...data,
    status: STATUS_READ,
    readAt,
  });
}

module.exports = {
  createNotification,
  listNotifications,
  markNotificationAsRead,
  validateNotificationInput,
  NotificationError,
  NOTIFICATION_TYPES,
  MAX_MESSAGE_LENGTH,
  STATUS_UNREAD,
  STATUS_READ,
};
