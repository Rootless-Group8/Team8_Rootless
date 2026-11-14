const { runMonitoring } = require('../services/scraperService');

const MS_PER_HOUR = 60 * 60 * 1000;
// Keeps the load on government sites polite.
const MIN_INTERVAL_HOURS = 1;
// setInterval cannot wait longer than about 24.8 days.
const MAX_INTERVAL_HOURS = 24 * 24;

let timer = null;
let running = false;

/**
 * Reads the run interval from SCRAPER_INTERVAL_HOURS. Unlike the reminder
 * job there is no default: if the variable is missing or not a number
 * between 1 and 576, the scheduler does not start.
 *
 * @returns {number|null} interval in milliseconds, or null when not set
 */
function getIntervalMs(raw = process.env.SCRAPER_INTERVAL_HOURS) {
  const hours = Number(raw);
  if (
    !raw ||
    !Number.isFinite(hours) ||
    hours < MIN_INTERVAL_HOURS ||
    hours > MAX_INTERVAL_HOURS
  ) {
    return null;
  }
  return Math.round(hours * MS_PER_HOUR);
}

/** The scheduler stays off under Jest (NODE_ENV=test). */
function isSchedulerEnabled(env = process.env) {
  return env.NODE_ENV !== 'test';
}

/**
 * Runs one monitoring pass in the background. Errors are logged, never
 * thrown, and a tick is skipped if the previous run is still going.
 */
async function runScheduledMonitoring(run = runMonitoring) {
  if (running) {
    console.log('[monitoring] previous run still going, skipping this tick');
    return null;
  }
  running = true;
  try {
    const summary = await run({ trigger: 'scheduled' });
    const { counts } = summary;
    console.log(
      `[monitoring] run done: baseline=${counts.baseline} unchanged=${counts.unchanged} ` +
        `changed=${counts.changed} failed=${counts.failed}`
    );
    return summary;
  } catch (err) {
    console.error('[monitoring] run failed:', err);
    return null;
  } finally {
    running = false;
  }
}

/**
 * Starts the periodic monitoring run, mirroring the Sprint 7 reminder
 * scheduler. The first run happens one interval after startup rather than
 * immediately, so restarting the server during development does not hit
 * the government sites each time. The timer is unref'd so it never keeps
 * the process alive.
 *
 * @param {object} [options]
 * @param {number} [options.intervalMs]
 * @param {Function} [options.run] run function, for tests
 * @param {boolean} [options.force] start even under Jest, for tests
 * @returns {boolean} true if the scheduler started
 */
function startMonitoringScheduler(options = {}) {
  if (!options.force && !isSchedulerEnabled()) {
    return false;
  }
  if (timer) {
    return true;
  }

  const intervalMs = options.intervalMs || getIntervalMs();
  if (!intervalMs) {
    console.log(
      `[monitoring] SCRAPER_INTERVAL_HOURS not set or outside ${MIN_INTERVAL_HOURS} to ` +
        `${MAX_INTERVAL_HOURS}, scheduler not started`
    );
    return false;
  }
  const run = options.run || runMonitoring;

  timer = setInterval(() => runScheduledMonitoring(run), intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  console.log(`[monitoring] scheduler started, every ${intervalMs / MS_PER_HOUR} h`);
  return true;
}

function stopMonitoringScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startMonitoringScheduler,
  stopMonitoringScheduler,
  runScheduledMonitoring,
  getIntervalMs,
  isSchedulerEnabled,
  MIN_INTERVAL_HOURS,
  MAX_INTERVAL_HOURS,
};
