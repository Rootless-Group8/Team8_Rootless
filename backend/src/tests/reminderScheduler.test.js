jest.mock('../services/reminderService', () => ({
  runReminderScan: jest.fn(),
}));

const {
  startReminderScheduler,
  stopReminderScheduler,
  runScheduledScan,
  getIntervalMs,
  isSchedulerEnabled,
} = require('../jobs/reminderScheduler');

const summary = { usersChecked: 1, remindersCreated: 0, errors: 0 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  stopReminderScheduler();
  jest.useRealTimers();
  console.log.mockRestore();
  console.error.mockRestore();
});

describe('configuration', () => {
  it('defaults to a 60 minute interval and reads the env variable', () => {
    expect(getIntervalMs(undefined)).toBe(60 * 60 * 1000);
    expect(getIntervalMs('15')).toBe(15 * 60 * 1000);
    expect(getIntervalMs('0')).toBe(60 * 60 * 1000);
    expect(getIntervalMs('soon')).toBe(60 * 60 * 1000);
  });

  it('is disabled under NODE_ENV=test and when turned off explicitly', () => {
    expect(isSchedulerEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(isSchedulerEnabled({ NODE_ENV: 'production', REMINDER_SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(isSchedulerEnabled({ NODE_ENV: 'production' })).toBe(true);
  });
});

describe('startReminderScheduler', () => {
  it('does not start under Jest', () => {
    const scan = jest.fn();

    expect(startReminderScheduler({ scan })).toBe(false);
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(scan).not.toHaveBeenCalled();
  });

  it('runs once at start and then on every interval', async () => {
    const scan = jest.fn().mockResolvedValue(summary);

    expect(startReminderScheduler({ scan, intervalMs: 1000, force: true })).toBe(true);
    expect(scan).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    jest.advanceTimersByTime(1000);

    expect(scan).toHaveBeenCalledTimes(3);
  });

  it('only starts one timer when called twice', () => {
    const scan = jest.fn().mockResolvedValue(summary);

    startReminderScheduler({ scan, intervalMs: 1000, force: true });
    startReminderScheduler({ scan, intervalMs: 1000, force: true });

    expect(scan).toHaveBeenCalledTimes(1);
  });
});

describe('runScheduledScan', () => {
  it('logs and swallows scan errors', async () => {
    const scan = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(runScheduledScan(scan)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith('[reminders] scan failed:', expect.any(Error));
  });

  it('skips a tick while the previous scan is still running', async () => {
    let finish;
    const scan = jest.fn(() => new Promise((resolve) => { finish = resolve; }));

    const first = runScheduledScan(scan);
    const second = await runScheduledScan(scan);
    finish(summary);
    await first;

    expect(second).toBeNull();
    expect(scan).toHaveBeenCalledTimes(1);
  });
});
