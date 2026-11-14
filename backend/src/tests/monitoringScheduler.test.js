jest.mock('../services/scraperService', () => ({
  runMonitoring: jest.fn(),
}));

const scraperService = require('../services/scraperService');
const {
  startMonitoringScheduler,
  stopMonitoringScheduler,
  runScheduledMonitoring,
  getIntervalMs,
  isSchedulerEnabled,
} = require('../jobs/monitoringScheduler');

const HOUR = 60 * 60 * 1000;
const summary = { counts: { baseline: 0, unchanged: 4, changed: 0, failed: 0 } };

let originalInterval;

beforeAll(() => {
  originalInterval = process.env.SCRAPER_INTERVAL_HOURS;
});

afterAll(() => {
  if (originalInterval === undefined) {
    delete process.env.SCRAPER_INTERVAL_HOURS;
  } else {
    process.env.SCRAPER_INTERVAL_HOURS = originalInterval;
  }
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  global.fetch = jest.fn(() => {
    throw new Error('Unexpected real fetch in tests');
  });
});

afterEach(() => {
  stopMonitoringScheduler();
  jest.useRealTimers();
  console.log.mockRestore();
  console.error.mockRestore();
  delete process.env.SCRAPER_INTERVAL_HOURS;
});

describe('configuration', () => {
  it('reads SCRAPER_INTERVAL_HOURS and has no default', () => {
    expect(getIntervalMs(undefined)).toBeNull();
    expect(getIntervalMs('')).toBeNull();
    expect(getIntervalMs('daily')).toBeNull();
    expect(getIntervalMs('0')).toBeNull();
    expect(getIntervalMs('0.5')).toBeNull();
    expect(getIntervalMs('1000')).toBeNull();
    expect(getIntervalMs('24')).toBe(24 * HOUR);
    expect(getIntervalMs('1.5')).toBe(1.5 * HOUR);
  });

  it('is disabled under NODE_ENV=test', () => {
    expect(isSchedulerEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(isSchedulerEnabled({ NODE_ENV: 'production' })).toBe(true);
  });
});

describe('startMonitoringScheduler', () => {
  it('never starts under Jest, even with the interval set', () => {
    process.env.SCRAPER_INTERVAL_HOURS = '1';
    const run = jest.fn();

    expect(startMonitoringScheduler({ run })).toBe(false);
    jest.advanceTimersByTime(48 * HOUR);
    expect(run).not.toHaveBeenCalled();
    expect(scraperService.runMonitoring).not.toHaveBeenCalled();
  });

  it('does not start when SCRAPER_INTERVAL_HOURS is not set', () => {
    const run = jest.fn();

    expect(startMonitoringScheduler({ run, force: true })).toBe(false);
    jest.advanceTimersByTime(48 * HOUR);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs on every interval, not at startup', async () => {
    process.env.SCRAPER_INTERVAL_HOURS = '2';
    const run = jest.fn().mockResolvedValue(summary);

    expect(startMonitoringScheduler({ run, force: true })).toBe(true);
    expect(run).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2 * HOUR);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ trigger: 'scheduled' });

    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(2 * HOUR);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('only starts one timer when called twice', () => {
    const run = jest.fn().mockResolvedValue(summary);

    startMonitoringScheduler({ run, intervalMs: 1000, force: true });
    startMonitoringScheduler({ run, intervalMs: 1000, force: true });
    jest.advanceTimersByTime(1000);

    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('runScheduledMonitoring', () => {
  it('logs and swallows run errors', async () => {
    const run = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(runScheduledMonitoring(run)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('[monitoring] run failed:', expect.any(Error));
  });

  it('skips a tick while the previous run is still going', async () => {
    let finish;
    const run = jest.fn(() => new Promise((resolve) => { finish = resolve; }));

    const first = runScheduledMonitoring(run);
    const second = await runScheduledMonitoring(run);
    finish(summary);
    await first;

    expect(second).toBeNull();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
