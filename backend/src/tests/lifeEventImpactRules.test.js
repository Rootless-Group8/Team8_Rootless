const {
  evaluateImpacts,
  RULES,
  IMPACT_CONFIG,
  sameVisa,
} = require('../services/lifeEventImpactRules');

const NOW = new Date('2026-11-17T15:00:00Z');

function event(overrides) {
  return {
    id: 'e1',
    type: 'visa_expiry',
    title: 'Study permit expires',
    date: '2027-06-01T00:00:00.000Z',
    status: 'upcoming',
    visaType: 'study_permit',
    destinationCountry: 'Canada',
    notes: null,
    ...overrides,
  };
}

const knownProcessing = () => ({ minDays: 20, maxDays: 30 });

function run(events, options = {}) {
  return evaluateImpacts(events, { now: NOW, ...options });
}

function byRule(impacts, ruleId) {
  return impacts.filter((impact) => impact.ruleId === ruleId);
}

describe('config and rule list', () => {
  test('every life event type has at least one rule', () => {
    const covered = new Set(RULES.map((rule) => rule.appliesTo));
    for (const type of ['visa_expiry', 'renewal', 'status_change', 'appointment', 'milestone']) {
      expect(covered.has(type)).toBe(true);
    }
  });

  test('rule IDs are unique', () => {
    const ids = RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('a custom rule can be added without changing the engine', () => {
    const customRule = {
      id: 'always_note',
      appliesTo: 'milestone',
      evaluate: () => ({ severity: 'info', message: 'custom' }),
    };
    const impacts = run([event({ type: 'milestone', date: '2030-01-01' })], { rules: [customRule] });
    expect(impacts).toEqual([expect.objectContaining({ ruleId: 'always_note', message: 'custom' })]);
  });

  test('config overrides change thresholds', () => {
    const expiry = event({ date: '2027-01-15' }); // 59 days away
    expect(byRule(run([expiry], { processingFor: knownProcessing }), 'renewal_needed')[0].severity).toBe('critical');
    const relaxed = run([expiry], { processingFor: knownProcessing, config: { renewalWindowDays: 30 } });
    expect(byRule(relaxed, 'renewal_needed')[0].severity).not.toBe('critical');
  });
});

describe('renewal_needed', () => {
  test('expiry within the renewal window with no renewal is critical', () => {
    const impacts = run([event({ date: '2027-01-15' })], { processingFor: knownProcessing });
    const [impact] = byRule(impacts, 'renewal_needed');
    expect(impact.severity).toBe('critical');
    expect(impact.eventId).toBe('e1');
    // 2027-01-15 minus 30 processing days minus 14 buffer days
    expect(impact.actionDate).toBe('2026-12-02');
    expect(impact.details).toEqual(
      expect.objectContaining({
        daysUntilExpiry: 59,
        processingTimeSource: 'visa_database',
        processingDays: { minDays: 20, maxDays: 30 },
      })
    );
  });

  test('expiry far away is info with a start-by date', () => {
    const [impact] = byRule(run([event({ date: '2027-12-01' })], { processingFor: knownProcessing }), 'renewal_needed');
    expect(impact.severity).toBe('info');
    expect(impact.actionDate).toBe('2027-10-18');
  });

  test('start-by date within 30 days but expiry outside the window is a warning', () => {
    // 2027-03-15 is 118 days out; start-by with a 90 day default is 2026-12-01 (14 days out)
    const [impact] = byRule(run([event({ date: '2027-03-15' })]), 'renewal_needed');
    expect(impact.severity).toBe('warning');
    expect(impact.actionDate).toBe('2026-12-01');
  });

  test('uses the start-by date from maxDays, not minDays', () => {
    const [impact] = byRule(
      run([event({ date: '2027-12-01' })], { processingFor: () => ({ minDays: 1, maxDays: 100 }) }),
      'renewal_needed'
    );
    expect(impact.actionDate).toBe('2027-08-09');
  });

  test('missing processing time falls back to the default and says so', () => {
    const [impact] = byRule(run([event({ date: '2027-12-01' })], { processingFor: () => null }), 'renewal_needed');
    expect(impact.details.processingTimeSource).toBe('default');
    expect(impact.details.defaultProcessingDays).toBe(IMPACT_CONFIG.defaultProcessingDays);
    // 90 + 14 days before 2027-12-01
    expect(impact.actionDate).toBe('2027-08-19');
  });

  test('processing time with null numbers (Canada study permit) falls back too', () => {
    const [impact] = byRule(
      run([event({ date: '2027-12-01' })], { processingFor: () => ({ minDays: null, maxDays: null }) }),
      'renewal_needed'
    );
    expect(impact.details.processingTimeSource).toBe('default');
  });

  test('a start-by date that has already passed is critical and the action date is today', () => {
    const [impact] = byRule(
      run([event({ date: '2027-05-01' })], { processingFor: () => ({ minDays: 150, maxDays: 200 }) }),
      'renewal_needed'
    );
    expect(impact.severity).toBe('critical');
    expect(impact.actionDate).toBe('2026-11-17');
    expect(impact.message).toMatch(/as soon as possible/);
  });

  test('expiry today still counts as upcoming, not expired', () => {
    const impacts = run([event({ date: '2026-11-17' })]);
    expect(byRule(impacts, 'renewal_needed')).toHaveLength(1);
    expect(byRule(impacts, 'visa_expired')).toHaveLength(0);
  });

  test.each(['upcoming', 'completed'])('a %s renewal for the same visa removes the impact', (status) => {
    const impacts = run([
      event({ date: '2027-01-15' }),
      event({ id: 'r1', type: 'renewal', title: 'Renew permit', date: '2026-11-20', status }),
    ]);
    expect(byRule(impacts, 'renewal_needed')).toHaveLength(0);
  });

  test('a cancelled renewal does not count', () => {
    const impacts = run([
      event({ date: '2027-01-15' }),
      event({ id: 'r1', type: 'renewal', title: 'Renew permit', date: '2026-11-20', status: 'cancelled' }),
    ]);
    expect(byRule(impacts, 'renewal_needed')).toHaveLength(1);
  });

  test('a renewal for a different visa does not count', () => {
    const impacts = run([
      event({ date: '2027-01-15' }),
      event({ id: 'r1', type: 'renewal', title: 'Renew', date: '2026-11-20', visaType: 'work_permit' }),
    ]);
    expect(byRule(impacts, 'renewal_needed')).toHaveLength(1);
  });
});

describe('visa_expired', () => {
  test('an expiry in the past still marked upcoming is critical', () => {
    const impacts = run([event({ date: '2026-11-01' })]);
    expect(byRule(impacts, 'visa_expired')).toEqual([
      expect.objectContaining({ severity: 'critical', actionDate: '2026-11-17' }),
    ]);
    expect(byRule(impacts, 'renewal_needed')).toHaveLength(0);
  });
});

describe('renewal_too_late', () => {
  test('a renewal after the recommended start is a warning', () => {
    const impacts = run(
      [
        event({ date: '2027-03-01' }),
        event({ id: 'r1', type: 'renewal', title: 'Renewal appointment', date: '2027-02-20' }),
      ],
      { processingFor: knownProcessing }
    );
    const [impact] = byRule(impacts, 'renewal_too_late');
    expect(impact.severity).toBe('warning');
    expect(impact.eventId).toBe('r1');
    expect(impact.relatedEventIds).toEqual(['e1']);
    expect(impact.actionDate).toBe('2027-01-16');
  });

  test('a renewal after the visa expires is critical', () => {
    const impacts = run(
      [event({ date: '2027-03-01' }), event({ id: 'r1', type: 'renewal', title: 'Renew', date: '2027-03-10' })],
      { processingFor: knownProcessing }
    );
    expect(byRule(impacts, 'renewal_too_late')[0].severity).toBe('critical');
  });

  test('a renewal on time has no impact', () => {
    const impacts = run(
      [event({ date: '2027-03-01' }), event({ id: 'r1', type: 'renewal', title: 'Renew', date: '2027-01-10' })],
      { processingFor: knownProcessing }
    );
    expect(byRule(impacts, 'renewal_too_late')).toHaveLength(0);
  });
});

describe('appointment_after_expiry', () => {
  test('an appointment after the visa expires is a warning', () => {
    const impacts = run([
      event({ date: '2027-01-15' }),
      event({ id: 'a1', type: 'appointment', title: 'Biometrics', date: '2027-02-01' }),
    ]);
    expect(byRule(impacts, 'appointment_after_expiry')).toEqual([
      expect.objectContaining({ severity: 'warning', eventId: 'a1', relatedEventIds: ['e1'] }),
    ]);
  });

  test('an appointment before expiry has no impact', () => {
    const impacts = run([
      event({ date: '2027-01-15' }),
      event({ id: 'a1', type: 'appointment', title: 'Biometrics', date: '2027-01-01' }),
    ]);
    expect(byRule(impacts, 'appointment_after_expiry')).toHaveLength(0);
  });

  test('an appointment for another country is not compared', () => {
    const impacts = run([
      event({ date: '2027-01-15' }),
      event({ id: 'a1', type: 'appointment', title: 'Interview', date: '2027-02-01', destinationCountry: 'Japan', visaType: null }),
    ]);
    expect(byRule(impacts, 'appointment_after_expiry')).toHaveLength(0);
  });
});

describe('status_change_review', () => {
  test('a status change within 30 days is a warning', () => {
    const [impact] = byRule(
      run([event({ id: 's1', type: 'status_change', title: 'Switch to work permit', date: '2026-12-01' })]),
      'status_change_review'
    );
    expect(impact.severity).toBe('warning');
    expect(impact.actionDate).toBe('2026-12-01');
    expect(impact.message).toMatch(/eligible/);
  });

  test('a status change further out is info', () => {
    const [impact] = byRule(
      run([event({ id: 's1', type: 'status_change', title: 'PR application', date: '2027-06-01' })]),
      'status_change_review'
    );
    expect(impact.severity).toBe('info');
  });

  test('a past status change has no impact', () => {
    expect(run([event({ type: 'status_change', date: '2026-10-01' })])).toEqual([]);
  });
});

describe('milestone_upcoming', () => {
  test('a milestone within 14 days is noted', () => {
    expect(byRule(run([event({ type: 'milestone', title: 'Arrive', date: '2026-11-25' })]), 'milestone_upcoming')).toHaveLength(1);
  });

  test('a milestone further out is not', () => {
    expect(run([event({ type: 'milestone', date: '2027-01-25' })])).toEqual([]);
  });
});

describe('status filtering, sorting and edge cases', () => {
  test.each(['completed', 'cancelled'])('%s events never trigger impacts', (status) => {
    const events = ['visa_expiry', 'renewal', 'status_change', 'appointment', 'milestone'].map((type, i) =>
      event({ id: `x${i}`, type, date: '2026-11-20', status })
    );
    expect(run(events)).toEqual([]);
  });

  test('no events means no impacts', () => {
    expect(run([])).toEqual([]);
  });

  test('impacts are sorted by severity, then action date', () => {
    const impacts = run(
      [
        event({ id: 'm1', type: 'milestone', title: 'Arrive', date: '2026-11-20' }),
        event({ id: 's1', type: 'status_change', title: 'Change', date: '2026-12-01' }),
        event({ id: 'e1', date: '2027-01-15' }),
      ],
      { processingFor: knownProcessing }
    );
    expect(impacts.map((impact) => impact.severity)).toEqual(['critical', 'warning', 'info']);
  });

  test('every impact has the documented shape', () => {
    const [impact] = run([event({ date: '2027-01-15' })]);
    expect(Object.keys(impact).sort()).toEqual(
      ['actionDate', 'details', 'eventId', 'eventType', 'message', 'relatedEventIds', 'ruleId', 'severity'].sort()
    );
  });

  test('an event with an unreadable date is skipped instead of crashing', () => {
    expect(run([event({ date: 'not-a-date' })])).toEqual([]);
  });
});

describe('sameVisa', () => {
  test('matches case-insensitively and ignores fields missing on either side', () => {
    expect(sameVisa({ destinationCountry: 'canada', visaType: 'Study_Permit' }, { destinationCountry: 'Canada', visaType: 'study_permit' })).toBe(true);
    expect(sameVisa({ destinationCountry: 'Canada' }, { destinationCountry: 'Canada', visaType: 'study_permit' })).toBe(true);
    expect(sameVisa({}, {})).toBe(true);
    expect(sameVisa({ destinationCountry: 'Canada' }, { destinationCountry: 'Japan' })).toBe(false);
  });
});
