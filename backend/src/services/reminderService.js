const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');
const { createNotification } = require('./notificationService');

// Sprint 5 stores one checklist per user in checklists/{uid}. Each item has a
// dueDate saved as a 'YYYY-MM-DD' string and a completed boolean. The
// checklist document also carries arrivalDate in the same format.
const CHECKLISTS_COLLECTION = 'checklists';

// One document per (user, item, window). The deterministic id is what stops
// the same reminder from being sent twice.
const REMINDERS_COLLECTION = 'deadline_reminders';

const DEFAULT_WINDOWS_DAYS = [7, 1];
const ARRIVAL_ITEM_ID = 'arrival';
const MAX_TITLE_LENGTH = 200;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// gRPC code Firestore uses when create() hits an existing document.
const ALREADY_EXISTS_CODE = 6;

function getDb() {
  return initializeFirebaseAdmin().firestore();
}

/**
 * Reads reminder windows from REMINDER_WINDOWS_DAYS (for example "7,1").
 * Invalid or empty values fall back to the defaults. Returned smallest first.
 *
 * @returns {number[]}
 */
function getReminderWindows(raw = process.env.REMINDER_WINDOWS_DAYS) {
  if (typeof raw !== 'string' || !raw.trim()) {
    return [...DEFAULT_WINDOWS_DAYS].sort((a, b) => a - b);
  }

  const windows = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0);

  const unique = [...new Set(windows)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [...DEFAULT_WINDOWS_DAYS].sort((a, b) => a - b);
}

/**
 * Parses the 'YYYY-MM-DD' strings Sprint 5 stores into a UTC midnight Date.
 * Returns null for anything else, including impossible dates like 2026-02-31.
 */
function parseDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return date;
}

function startOfTodayUtc(now) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Whole days from today (UTC) until the due date. Negative means past. */
function daysUntil(dueDate, now) {
  return Math.round((dueDate.getTime() - startOfTodayUtc(now)) / MS_PER_DAY);
}

/**
 * Picks the reminder window an item falls in right now, or null.
 *
 * The smallest window that still contains the deadline wins, so an item due
 * tomorrow gets the 1 day reminder and never a late 7 day one. Deadlines
 * that are already past return null. A deadline due today still counts as
 * inside the smallest window, in case the scan missed the day before.
 *
 * @param {number} days result of daysUntil
 * @param {number[]} windows sorted smallest first
 * @returns {number|null}
 */
function selectWindow(days, windows) {
  if (days < 0) {
    return null;
  }
  const match = windows.find((w) => days <= w);
  return match === undefined ? null : match;
}

function buildReminderKey(uid, itemId, windowDays) {
  // Firestore document ids cannot contain a forward slash.
  return `${uid}_${itemId}_${windowDays}d`.replace(/\//g, '_');
}

function describeWhen(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function buildMessage(item, days) {
  const when = describeWhen(days);
  if (item.id === ARRIVAL_ITEM_ID) {
    return `Reminder: your planned arrival${item.place ? ` in ${item.place}` : ''} is ${when} (${item.dueDate}).`;
  }
  const title = String(item.title || 'A checklist item').slice(0, MAX_TITLE_LENGTH);
  return `Reminder: "${title}" is due ${when} (${item.dueDate}).`;
}

/**
 * Lists the deadlines to check for one checklist document: every checklist
 * item plus the arrival date when it is set.
 */
function collectDeadlines(checklist) {
  const items = Array.isArray(checklist.items) ? checklist.items : [];
  const deadlines = items.filter((item) => item && typeof item === 'object');

  if (checklist.arrivalDate) {
    deadlines.push({
      id: ARRIVAL_ITEM_ID,
      title: 'Planned arrival',
      dueDate: checklist.arrivalDate,
      completed: false,
      place: checklist.destinationCountry,
    });
  }

  return deadlines;
}

/**
 * Sends one reminder unless it was already sent.
 *
 * The reminder document is claimed with create(), which fails if it already
 * exists, so two overlapping scans cannot both send. If the notification then
 * fails, the claim is removed so the next scan can retry.
 *
 * @returns {Promise<boolean>} true if a reminder was created, false if duplicate
 */
async function sendReminderOnce(db, { uid, item, windowDays, days }) {
  const key = buildReminderKey(uid, item.id, windowDays);
  const ref = db.collection(REMINDERS_COLLECTION).doc(key);

  try {
    await ref.create({
      uid,
      itemId: item.id,
      windowDays,
      dueDate: item.dueDate,
      status: 'pending',
      createdAt: new Date(),
    });
  } catch (err) {
    if (err && (err.code === ALREADY_EXISTS_CODE || err.code === 'already-exists')) {
      return false;
    }
    throw err;
  }

  let notification;
  try {
    notification = await createNotification({
      recipientUid: uid,
      type: 'deadline_reminder',
      message: buildMessage(item, days),
    });
  } catch (err) {
    await ref.delete().catch((cleanupErr) => {
      console.error(`Could not release reminder claim ${key}:`, cleanupErr);
    });
    throw err;
  }

  await ref.update({
    status: 'sent',
    notificationId: notification.id,
    sentAt: new Date(),
  });
  return true;
}

/**
 * Scans every stored checklist and creates deadline_reminder notifications
 * for deadlines inside a reminder window. Completed items, items without a
 * usable dueDate, and past deadlines are skipped. A failure on one user or
 * item is logged and the scan moves on.
 *
 * @param {object} [options]
 * @param {Date} [options.now] reference time, defaults to the current time
 * @param {number[]} [options.windows] reminder windows in days
 * @returns {Promise<object>} scan summary
 */
async function runReminderScan(options = {}) {
  const now = options.now || new Date();
  const windows = options.windows
    ? [...options.windows].sort((a, b) => a - b)
    : getReminderWindows();

  const summary = {
    usersChecked: 0,
    itemsChecked: 0,
    remindersCreated: 0,
    duplicatesSkipped: 0,
    skipped: { completed: 0, noDeadline: 0, pastDeadline: 0, outsideWindow: 0 },
    errors: 0,
    windows,
    ranAt: now.toISOString(),
  };

  const db = getDb();
  const snapshot = await db.collection(CHECKLISTS_COLLECTION).get();

  for (const doc of snapshot.docs) {
    const uid = doc.id;
    summary.usersChecked += 1;

    let deadlines;
    try {
      deadlines = collectDeadlines(doc.data() || {});
    } catch (err) {
      console.error(`Reminder scan failed for user ${uid}:`, err);
      summary.errors += 1;
      continue;
    }

    for (const item of deadlines) {
      summary.itemsChecked += 1;

      if (item.completed === true) {
        summary.skipped.completed += 1;
        continue;
      }

      const dueDate = parseDueDate(item.dueDate);
      if (!dueDate || !item.id) {
        summary.skipped.noDeadline += 1;
        continue;
      }

      const days = daysUntil(dueDate, now);
      if (days < 0) {
        summary.skipped.pastDeadline += 1;
        continue;
      }

      const windowDays = selectWindow(days, windows);
      if (windowDays === null) {
        summary.skipped.outsideWindow += 1;
        continue;
      }

      try {
        const created = await sendReminderOnce(db, { uid, item, windowDays, days });
        if (created) {
          summary.remindersCreated += 1;
        } else {
          summary.duplicatesSkipped += 1;
        }
      } catch (err) {
        console.error(`Reminder failed for user ${uid}, item ${item.id}:`, err);
        summary.errors += 1;
      }
    }
  }

  return summary;
}

module.exports = {
  runReminderScan,
  getReminderWindows,
  parseDueDate,
  daysUntil,
  selectWindow,
  buildReminderKey,
  buildMessage,
  CHECKLISTS_COLLECTION,
  REMINDERS_COLLECTION,
  DEFAULT_WINDOWS_DAYS,
  ARRIVAL_ITEM_ID,
};
