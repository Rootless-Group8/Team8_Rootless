// The life event service is mocked so these tests control which events the
// user has. The real validateLifeEventInput and LifeEventError are kept so
// the preview endpoint's validation is exercised for real.
jest.mock('../config/firebaseAdmin', () => ({ initializeFirebaseAdmin: jest.fn() }));

jest.mock('../services/lifeEventService', () => {
  const actual = jest.requireActual('../services/lifeEventService');
  return { ...actual, listLifeEvents: jest.fn() };
});

const lifeEventService = require('../services/lifeEventService');
const {
  getLifeEventImpacts,
  previewLifeEventImpacts,
  loadProcessingTimes,
  toCountryCode,
  findProgram,
} = require('../services/lifeEventImpactService');

const NOW = new Date('2026-11-17T12:00:00Z');

// Realtime Database stand-in with the same shape as countryVisaPrograms.
const visaData = {
  CA: {
    visitor_visa: { processingTime: { minDays: 22, maxDays: 27 } },
    study_permit: { processingTime: { minDays: null, maxDays: null } },
  },
  GB: {
    student_visa: { processingTime: { minDays: 21, maxDays: 56 } },
    skilled_worker_visa: { processingTime: { minDays: 21, maxDays: 56 } },
    standard_visitor_visa: { processingTime: { minDays: 21, maxDays: 21 } },
  },
};

function makeDb(data, { fail = false } = {}) {
  const ref = jest.fn((path) => ({
    once: async () => {
      if (fail) throw new Error('database unavailable');
      const code = path.split('/')[1];
      const value = data[code];
      return { exists: () => value !== undefined, val: () => value };
    },
  }));
  return { ref };
}

function event(overrides) {
  return {
    id: 'e1',
    type: 'visa_expiry',
    title: 'Student visa expires',
    date: '2027-06-01T00:00:00.000Z',
    status: 'upcoming',
    visaType: 'student_visa',
    destinationCountry: 'GB',
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('toCountryCode', () => {
  test.each([
    ['CA', 'CA'],
    ['ca', 'CA'],
    ['Canada', 'CA'],
    ['United Kingdom', 'GB'],
    ['UK', 'GB'],
    ['new zealand', 'NZ'],
    ['Atlantis', null],
    ['', null],
    [null, null],
  ])('%p -> %p', (input, expected) => {
    expect(toCountryCode(input)).toBe(expected);
  });
});

describe('findProgram', () => {
  test('exact key, spaced text and a unique partial match all work', () => {
    expect(findProgram(visaData.GB, 'student_visa')).toBe(visaData.GB.student_visa);
    expect(findProgram(visaData.GB, 'Student Visa')).toBe(visaData.GB.student_visa);
    expect(findProgram(visaData.GB, 'student')).toBe(visaData.GB.student_visa);
  });

  test('an ambiguous or unknown visa type is not guessed', () => {
    expect(findProgram(visaData.GB, 'visa')).toBeNull();
    expect(findProgram(visaData.GB, 'working_holiday')).toBeNull();
    expect(findProgram(undefined, 'student_visa')).toBeNull();
  });
});

describe('loadProcessingTimes', () => {
  test('reads each country once and maps processing time to visa_expiry events', async () => {
    const db = makeDb(visaData);
    const times = await loadProcessingTimes(db, [
      event({ id: 'a' }),
      event({ id: 'b', destinationCountry: 'United Kingdom', visaType: 'skilled worker visa' }),
      event({ id: 'c', type: 'appointment' }),
    ]);

    expect(db.ref).toHaveBeenCalledTimes(1);
    expect(db.ref).toHaveBeenCalledWith('countryVisaPrograms/GB');
    expect(times.get('a')).toEqual({ minDays: 21, maxDays: 56 });
    expect(times.get('b')).toEqual({ minDays: 21, maxDays: 56 });
    expect(times.has('c')).toBe(false);
  });

  test('null processing numbers, unknown countries and unknown visas come back null', async () => {
    const times = await loadProcessingTimes(makeDb(visaData), [
      event({ id: 'a', destinationCountry: 'Canada', visaType: 'study_permit' }),
      event({ id: 'b', destinationCountry: 'Atlantis' }),
      event({ id: 'c', destinationCountry: 'CA', visaType: 'working_holiday' }),
      event({ id: 'd', destinationCountry: 'JP' }),
    ]);
    expect([...times.values()]).toEqual([null, null, null, null]);
  });

  test('a database error falls back to null instead of throwing', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const times = await loadProcessingTimes(makeDb(visaData, { fail: true }), [event()]);
    expect(times.get('e1')).toBeNull();
    spy.mockRestore();
  });

  test('works without a database handle', async () => {
    const times = await loadProcessingTimes(undefined, [event()]);
    expect(times.size).toBe(0);
  });
});

describe('getLifeEventImpacts', () => {
  test('loads the caller\'s events and uses the database processing time', async () => {
    lifeEventService.listLifeEvents.mockResolvedValueOnce([event({ date: '2027-01-15' })]);

    const result = await getLifeEventImpacts(makeDb(visaData), 'uid-1', { now: NOW });

    expect(lifeEventService.listLifeEvents).toHaveBeenCalledWith('uid-1');
    expect(result.count).toBe(1);
    expect(result.impacts[0]).toEqual(
      expect.objectContaining({
        ruleId: 'renewal_needed',
        severity: 'critical',
        // 2027-01-15 minus 56 processing days minus 14 buffer days is
        // 2026-11-06, which has passed, so the action date is today.
        actionDate: '2026-11-17',
      })
    );
    expect(result.impacts[0].details.processingTimeSource).toBe('visa_database');
  });

  test('the Canada study permit with no numbers uses the default', async () => {
    lifeEventService.listLifeEvents.mockResolvedValueOnce([
      event({ destinationCountry: 'Canada', visaType: 'study_permit', date: '2027-12-01' }),
    ]);
    const result = await getLifeEventImpacts(makeDb(visaData), 'uid-1', { now: NOW });
    expect(result.impacts[0].details.processingTimeSource).toBe('default');
  });

  test('a user with no events gets an empty list', async () => {
    lifeEventService.listLifeEvents.mockResolvedValueOnce([]);
    expect(await getLifeEventImpacts(makeDb(visaData), 'uid-1', { now: NOW })).toEqual({ impacts: [], count: 0 });
  });
});

describe('previewLifeEventImpacts', () => {
  test('planning a renewal resolves "renewal needed" without saving anything', async () => {
    lifeEventService.listLifeEvents.mockResolvedValue([event({ date: '2027-03-01' })]);

    const result = await previewLifeEventImpacts(
      makeDb(visaData),
      'uid-1',
      { type: 'renewal', title: 'Renew student visa', date: '2026-12-01', visaType: 'student_visa', destinationCountry: 'GB' },
      { now: NOW }
    );

    expect(result.event).toEqual(expect.objectContaining({ id: 'preview', type: 'renewal', status: 'upcoming' }));
    expect(result.resolved.map((impact) => impact.ruleId)).toEqual(['renewal_needed']);
    expect(result.introduced).toEqual([]);
    expect(result.impacts.some((impact) => impact.ruleId === 'renewal_needed')).toBe(false);
  });

  test('a late appointment shows up as introduced', async () => {
    lifeEventService.listLifeEvents.mockResolvedValue([
      event({ date: '2027-03-01' }),
      event({ id: 'r1', type: 'renewal', title: 'Renew', date: '2026-12-01' }),
    ]);

    const result = await previewLifeEventImpacts(
      makeDb(visaData),
      'uid-1',
      { type: 'appointment', title: 'Biometrics', date: '2027-04-01', visaType: 'student_visa', destinationCountry: 'GB' },
      { now: NOW }
    );

    expect(result.introduced).toEqual([
      expect.objectContaining({ ruleId: 'appointment_after_expiry', eventId: 'preview' }),
    ]);
    expect(result.resolved).toEqual([]);
  });

  test('an invalid hypothetical event is rejected with the life event validation error', async () => {
    lifeEventService.listLifeEvents.mockResolvedValue([]);
    await expect(
      previewLifeEventImpacts(makeDb(visaData), 'uid-1', { type: 'party', title: '' }, { now: NOW })
    ).rejects.toMatchObject({ status: 400, code: 'invalid_life_event' });
    expect(lifeEventService.listLifeEvents).not.toHaveBeenCalled();
  });
});
