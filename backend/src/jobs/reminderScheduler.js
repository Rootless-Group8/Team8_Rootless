const { runReminderScan } = require('../services/reminderService');

const DEFAULT_INTERVAL_MINUTES = 60;
const MS_PER_MINUTE = 60 * 1000;

let timer = null;
let running = false;

/**
 * Reads the scan interval from REMINDER_SCAN_INTERVAL_MINUTES. Anything that
 * is not a positive number falls back to the default of 60 minutes.
 *
 * @returns {number} interval in milliseconds
 */
function getIntervalMs(raw = process.env.REMINDER_SCAN_INTERVAL_MINUTES) {
  const minutes = Number(raw);
  if (!raw || !Number.isFinite(minutes) || minutes <= 0) {
    return DEFAULT_INTERVAL_MINUTES * MS_PER_MINUTE;
  }
  return Math.round(minutes * MS_PER_MINUTE);
}

/**
 * The scheduler stays off under Jest (NODE_ENV=test) and can be turned off
 * anywhere with REMINDER_SCHEDULER_ENABLED=false.
 */
function isSchedulerEnabled(env = process.env) {
  if (env.NODE_ENV === 'test') {
    return false;
  }
  return env.REMINDER_SCHEDULER_ENABLED !== 'false';
}

/**
 * Runs one scan in the background. Errors are logged, never thrown, and a
 * scan is skipped if the previous one is still running.
 */
async function runScheduledScan(scan = runReminderScan) {
  if (running) {
    console.log('[reminders] previous scan still running, skipping this tick');
    return null;
  }
  running = true;
  try {
    const summary = await scan();
    console.log(
      `[reminders] scan done: users=${summary.usersChecked} ` +
        `created=${summary.remindersCreated} errors=${summary.errors}`
    );
    return summary;
  } catch (err) {
    console.error('[reminders] scan failed:', err);
    return null;
  } finally {
    running = false;
  }
}

/**
 * Starts the periodic reminder scan. Runs once right away, then on every
 * interval. The timer is unref'd so it never keeps the process alive, and
 * scans run asynchronously so requests are never blocked.
 *
 * @param {object} [options]
 * @param {number} [options.intervalMs]
 * @param {Function} [options.scan] scan function, for tests
 * @param {boolean} [options.force] start even when disabled, for tests
 * @returns {boolean} true if the scheduler started
 */
function startReminderScheduler(options = {}) {
  if (!options.force && !isSchedulerEnabled()) {
    return false;
  }
  if (timer) {
    return true;
  }

  const intervalMs = options.intervalMs || getIntervalMs();
  const scan = options.scan || runReminderScan;

  runScheduledScan(scan);
  timer = setInterval(() => runScheduledScan(scan), intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  console.log(`[reminders] scheduler started, every ${Math.round(intervalMs / MS_PER_MINUTE)} min`);
  return true;
}

function stopReminderScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startReminderScheduler,
  stopReminderScheduler,
  runScheduledScan,
  getIntervalMs,
  isSchedulerEnabled,
  DEFAULT_INTERVAL_MINUTES,
};
