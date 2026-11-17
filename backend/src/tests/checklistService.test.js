const mockGet = jest.fn();
const mockSet = jest.fn();
const mockDoc = jest.fn(() => ({ get: mockGet, set: mockSet }));
const mockCollection = jest.fn(() => ({ doc: mockDoc }));

jest.mock('../config/firebaseAdmin', () => ({
  initializeFirebaseAdmin: () => ({
    firestore: () => ({ collection: mockCollection }),
  }),
}));

jest.mock('../services/profileService', () => ({
  getProfile: jest.fn(),
}));

const { getProfile } = require('../services/profileService');
const {
  generateChecklist,
  getChecklist,
  setItemCompleted,
  buildChecklistItems,
  validateProfileForChecklist,
  ChecklistError,
} = require('../services/checklistService');

// Small visa data fixture so these tests do not depend on the real data file.
const programFor = (key, name) => ({
  key,
  name,
  eligibilityCriteria: ['Hold a valid passport', 'Show you can support yourself'],
  requiredDocuments: ['Valid passport', 'Evidence of funds'],
  fees: 'GBP 135 for up to 6 months',
  processingTime: 'About 3 weeks',
  validityDuration: 'Up to 6 months',
  sourceUrl: 'https://example.gov/visa',
  lastVerified: '2026-09-16',
});

const fixture = {
  countries: {
    US: { name: 'United States', iso3: 'USA' },
    IN: { name: 'India', iso3: 'IND' },
    GB: { name: 'United Kingdom', iso3: 'GBR' },
    DE: { name: 'Germany', iso3: 'DEU' },
    FR: { name: 'France', iso3: 'FRA' },
  },
  requirements: {
    US: {
      GB: { requirementType: 'eta', maxStayDays: 180, notes: 'ETA fee about GBP 16.' },
      DE: { requirementType: 'visa_free', maxStayDays: 90, notes: 'Schengen 90/180-day rule applies.' },
      FR: { requirementType: 'visa_required', maxStayDays: null, notes: '' },
    },
    IN: {
      GB: { requirementType: 'visa_required', maxStayDays: 180, notes: '' },
    },
  },
  programs: {
    GB: {
      tourist_visitor: [programFor('standard_visitor_visa', 'Standard Visitor Visa')],
      student: [programFor('student_visa', 'Student Visa')],
    },
  },
};

const baseProfile = {
  destinationCountry: 'Germany',
  citizenship: 'United States',
  relocationGoal: 'tourist_visit',
  plannedArrivalDate: '2027-06-15',
};

const idsOf = (items) => items.map((item) => item.id);

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockDoc.mockClear();
  mockCollection.mockClear();
  getProfile.mockReset();
});

describe('validateProfileForChecklist', () => {
  test('returns no errors for a complete profile', () => {
    expect(validateProfileForChecklist(baseProfile)).toEqual({});
  });

  test('flags a missing arrival date', () => {
    const errors = validateProfileForChecklist({
      destinationCountry: 'Germany',
      relocationGoal: 'tourist_visit',
    });
    expect(errors.plannedArrivalDate).toBeDefined();
  });

  test('flags an invalid arrival date', () => {
    const errors = validateProfileForChecklist({
      ...baseProfile,
      plannedArrivalDate: 'not-a-date',
    });
    expect(errors.plannedArrivalDate).toMatch(/valid date/);
  });

  test('flags missing destination country and visa type', () => {
    const errors = validateProfileForChecklist({ plannedArrivalDate: '2027-06-15' });
    expect(errors.destinationCountry).toBeDefined();
    expect(errors.visaType).toBeDefined();
  });

  test('accepts tourist and student visa types', () => {
    expect(validateProfileForChecklist(baseProfile)).toEqual({});
    expect(
      validateProfileForChecklist({ ...baseProfile, relocationGoal: 'student' })
    ).toEqual({});
  });

  test('accepts tourist as an alias for tourist_visit', () => {
    expect(
      validateProfileForChecklist({ ...baseProfile, relocationGoal: 'Tourist' })
    ).toEqual({});
  });

  test('rejects other visa types', () => {
    const errors = validateProfileForChecklist({
      ...baseProfile,
      relocationGoal: 'work',
    });
    expect(errors.visaType).toMatch(/tourist and student/i);
  });

  test('citizenship is optional', () => {
    const { citizenship, ...withoutCitizenship } = baseProfile;
    expect(validateProfileForChecklist(withoutCitizenship)).toEqual({});
  });
});

describe('buildChecklistItems: structure', () => {
  test('every item has id, title, description, category, dueDate, and completed', () => {
    const items = buildChecklistItems(baseProfile, fixture);
    expect(items.length).toBeGreaterThan(0);
    items.forEach((item) => {
      expect(typeof item.id).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(typeof item.description).toBe('string');
      expect(typeof item.category).toBe('string');
      expect(item.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.completed).toBe(false);
      expect(['high', 'medium', 'low']).toContain(item.priority);
    });
  });

  test('item ids are unique', () => {
    ['tourist_visit', 'student'].forEach((relocationGoal) => {
      const ids = idsOf(buildChecklistItems({ ...baseProfile, relocationGoal }, fixture));
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  test('items are sorted by due date', () => {
    const dates = buildChecklistItems(baseProfile, fixture).map((i) => i.dueDate);
    expect(dates).toEqual([...dates].sort());
  });

  test('due dates are calculated relative to the arrival date', () => {
    const byId = Object.fromEntries(
      buildChecklistItems(baseProfile, fixture).map((item) => [item.id, item])
    );
    // 45 days before 2027-06-15
    expect(byId['travel-book-flights'].dueDate).toBe('2027-05-01');
    // 1 day after arrival
    expect(byId['visa-keep-entry-record'].dueDate).toBe('2027-06-16');
  });

  test('covers all six categories', () => {
    const categories = new Set(
      buildChecklistItems(baseProfile, fixture).map((i) => i.category)
    );
    [
      'Visa and Immigration',
      'Documents',
      'Housing',
      'Finance',
      'Health',
      'Travel',
    ].forEach((category) => expect(categories.has(category)).toBe(true));
  });

  test('uses the proper country name in descriptions', () => {
    const item = buildChecklistItems(
      { ...baseProfile, destinationCountry: 'germany' },
      fixture
    ).find((i) => i.id === 'docs-passport-validity');
    expect(item.description).toContain('Germany');
  });

  test('an explicit visaType takes priority over relocationGoal', () => {
    const ids = idsOf(
      buildChecklistItems(
        { ...baseProfile, relocationGoal: 'work', visaType: 'student' },
        fixture
      )
    );
    expect(ids).toContain('student-orientation');
  });
});

describe('buildChecklistItems: tourist visas', () => {
  test('visa free entry gives a confirmation item and no application steps', () => {
    const items = buildChecklistItems(baseProfile, fixture);
    const ids = idsOf(items);
    expect(ids).toContain('visa-entry-visa_free');
    expect(ids).not.toContain('visa-submit-application');
    const entry = items.find((i) => i.id === 'visa-entry-visa_free');
    expect(entry.description).toContain('90 days');
    expect(entry.description).toContain('Schengen 90/180-day rule applies.');
    expect(items.find((i) => i.id === 'visa-stay-limit').description).toContain('90 days');
  });

  test('an eTA requirement gives an authorization item with the data notes', () => {
    const items = buildChecklistItems(
      { ...baseProfile, destinationCountry: 'United Kingdom' },
      fixture
    );
    const entry = items.find((i) => i.id === 'visa-entry-eta');
    expect(entry).toBeDefined();
    expect(entry.priority).toBe('high');
    expect(entry.description).toContain('180 days');
    expect(entry.description).toContain('ETA fee about GBP 16.');
    expect(idsOf(items)).not.toContain('visa-standard_visitor_visa-documents');
  });

  test('a visa requirement with program data adds the program steps', () => {
    const items = buildChecklistItems(
      { ...baseProfile, destinationCountry: 'United Kingdom', citizenship: 'India' },
      fixture
    );
    const ids = idsOf(items);
    expect(ids).toContain('visa-entry-visa_required');
    expect(ids).toEqual(
      expect.arrayContaining([
        'visa-standard_visitor_visa-eligibility',
        'visa-standard_visitor_visa-documents',
        'visa-standard_visitor_visa-fees',
        'visa-standard_visitor_visa-apply',
      ])
    );
    expect(ids).not.toContain('visa-submit-application');
    const docs = items.find((i) => i.id === 'visa-standard_visitor_visa-documents');
    expect(docs.description).toContain('Evidence of funds');
    const apply = items.find((i) => i.id === 'visa-standard_visitor_visa-apply');
    expect(apply.description).toContain('https://example.gov/visa');
    expect(apply.description).toContain('About 3 weeks');
  });

  test('a visa requirement without program data uses the generic application steps', () => {
    const ids = idsOf(
      buildChecklistItems({ ...baseProfile, destinationCountry: 'France' }, fixture)
    );
    expect(ids).toContain('visa-entry-visa_required');
    expect(ids).toContain('visa-submit-application');
  });

  test('an unknown passport country gets a confirm item and generic steps', () => {
    const ids = idsOf(
      buildChecklistItems({ ...baseProfile, citizenship: 'Narnia' }, fixture)
    );
    expect(ids).toContain('visa-entry-confirm');
    expect(ids).toContain('visa-submit-application');
  });

  test('a missing citizenship is handled the same way', () => {
    const { citizenship, ...noCitizenship } = baseProfile;
    expect(idsOf(buildChecklistItems(noCitizenship, fixture))).toContain(
      'visa-entry-confirm'
    );
  });

  test('tourist checklists have no student items', () => {
    const ids = idsOf(buildChecklistItems(baseProfile, fixture));
    expect(ids).not.toContain('student-orientation');
    expect(ids).not.toContain('housing-student-options');
  });

  test('an unrecognized destination still builds a checklist', () => {
    const items = buildChecklistItems(
      { ...baseProfile, destinationCountry: 'Narnia' },
      fixture
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items.find((i) => i.id === 'docs-passport-validity').description).toContain(
      'Narnia'
    );
  });
});

describe('buildChecklistItems: student visas', () => {
  const studentProfile = {
    ...baseProfile,
    relocationGoal: 'student',
    destinationCountry: 'United Kingdom',
  };

  test('uses the destination student program data when available', () => {
    const items = buildChecklistItems(studentProfile, fixture);
    const ids = idsOf(items);
    expect(ids).toEqual(
      expect.arrayContaining([
        'visa-student_visa-eligibility',
        'visa-student_visa-documents',
        'visa-student_visa-fees',
        'visa-student_visa-apply',
        'visa-student_visa-track',
        'visa-student_visa-validity',
      ])
    );
    expect(ids).not.toContain('student-admission-letter');
    expect(items.find((i) => i.id === 'visa-student_visa-fees').description).toContain(
      'GBP 135'
    );
  });

  test('student applications start earlier than tourist ones', () => {
    const student = buildChecklistItems(studentProfile, fixture).find(
      (i) => i.id === 'visa-student_visa-apply'
    );
    const tourist = buildChecklistItems(
      { ...studentProfile, relocationGoal: 'tourist_visit', citizenship: 'India' },
      fixture
    ).find((i) => i.id === 'visa-standard_visitor_visa-apply');
    // 120 days before vs 60 days before 2027-06-15
    expect(student.dueDate).toBe('2027-02-15');
    expect(tourist.dueDate).toBe('2027-04-16');
  });

  test('falls back to generic student steps when there is no program data', () => {
    const ids = idsOf(
      buildChecklistItems({ ...studentProfile, destinationCountry: 'Germany' }, fixture)
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        'student-admission-letter',
        'student-proof-of-funds',
        'visa-student-apply',
      ])
    );
  });

  test('adds student housing and orientation, and no tourist entry items', () => {
    const ids = idsOf(buildChecklistItems(studentProfile, fixture));
    expect(ids).toContain('housing-student-options');
    expect(ids).toContain('student-orientation');
    expect(ids).not.toContain('housing-book-accommodation');
    expect(ids.some((id) => id.startsWith('visa-entry-'))).toBe(false);
  });
});

describe('buildChecklistItems: real visa data', () => {
  test('a US tourist going to the UK needs an ETA', () => {
    const ids = idsOf(
      buildChecklistItems({
        ...baseProfile,
        destinationCountry: 'United Kingdom',
        citizenship: 'US',
      })
    );
    expect(ids).toContain('visa-entry-eta');
  });

  test('a student going to the UK gets the Student Visa program steps', () => {
    const ids = idsOf(
      buildChecklistItems({
        ...baseProfile,
        relocationGoal: 'student',
        destinationCountry: 'UK',
      })
    );
    expect(ids).toContain('visa-student_visa-documents');
  });

  test('a student going to Canada gets the Study Permit program steps', () => {
    const ids = idsOf(
      buildChecklistItems({
        ...baseProfile,
        relocationGoal: 'student',
        destinationCountry: 'Canada',
      })
    );
    expect(ids).toContain('visa-study_permit-documents');
  });
});

describe('generateChecklist', () => {
  test('throws a 400 ChecklistError when the user has no profile', async () => {
    getProfile.mockResolvedValueOnce(null);

    await expect(generateChecklist('uid1')).rejects.toMatchObject({
      name: 'ChecklistError',
      code: 'PROFILE_NOT_FOUND',
      status: 400,
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('throws a 400 ChecklistError when the arrival date is missing', async () => {
    getProfile.mockResolvedValueOnce({
      destinationCountry: 'Germany',
      relocationGoal: 'tourist_visit',
    });

    const promise = generateChecklist('uid1');
    await expect(promise).rejects.toBeInstanceOf(ChecklistError);
    await expect(promise).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
      status: 400,
    });
    await expect(promise).rejects.toThrow(/arrival date/i);
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('throws a 400 ChecklistError for an unsupported visa type', async () => {
    getProfile.mockResolvedValueOnce({ ...baseProfile, relocationGoal: 'work' });

    await expect(generateChecklist('uid1')).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
      status: 400,
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('creates and stores a checklist keyed by the user uid', async () => {
    getProfile.mockResolvedValueOnce(baseProfile);
    mockGet.mockResolvedValueOnce({ exists: false });

    const { checklist, created } = await generateChecklist('uid1');

    expect(created).toBe(true);
    expect(mockCollection).toHaveBeenCalledWith('checklists');
    expect(mockDoc).toHaveBeenCalledWith('uid1');
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockSet.mock.calls[0][0]).toEqual(checklist);
    expect(checklist.uid).toBe('uid1');
    expect(checklist.destinationCountry).toBe('Germany');
    expect(checklist.visaType).toBe('tourist_visit');
    expect(checklist.arrivalDate).toBe('2027-06-15');
    expect(checklist.items.length).toBeGreaterThan(0);
    expect(checklist.items.every((item) => item.completed === false)).toBe(true);
  });

  test('regeneration replaces incomplete items and keeps completed status', async () => {
    getProfile.mockResolvedValueOnce({
      destinationCountry: 'Canada',
      citizenship: 'United States',
      relocationGoal: 'tourist_visit',
      plannedArrivalDate: '2027-09-01',
    });
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        createdAt: '2026-10-01T00:00:00.000Z',
        items: [
          // still applies and was completed: should stay completed
          {
            id: 'travel-book-flights',
            completed: true,
            completedAt: '2026-10-02T00:00:00.000Z',
          },
          // still applies but not completed: gets recalculated
          { id: 'housing-book-accommodation', completed: false },
          // completed but no longer applies (old destination rule): dropped
          { id: 'visa-entry-eta', completed: true },
        ],
      }),
    });

    const { checklist, created } = await generateChecklist('uid1');
    const byId = Object.fromEntries(checklist.items.map((i) => [i.id, i]));

    expect(created).toBe(false);
    expect(checklist.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(byId['travel-book-flights'].completed).toBe(true);
    expect(byId['travel-book-flights'].completedAt).toBe('2026-10-02T00:00:00.000Z');
    // due date recalculated from the new arrival date (45 days before 2027-09-01)
    expect(byId['travel-book-flights'].dueDate).toBe('2027-07-18');
    expect(byId['housing-book-accommodation'].completed).toBe(false);
    expect(byId['visa-entry-eta']).toBeUndefined();
    expect(byId['visa-entry-visa_free']).toBeDefined();
  });
});

describe('getChecklist', () => {
  test('returns the checklist when it exists', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({ uid: 'uid1', items: [] }),
    });

    const result = await getChecklist('uid1');

    expect(mockCollection).toHaveBeenCalledWith('checklists');
    expect(mockDoc).toHaveBeenCalledWith('uid1');
    expect(result).toEqual({ uid: 'uid1', items: [] });
  });

  test('returns null when no checklist exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });
    expect(await getChecklist('uid1')).toBeNull();
  });
});

describe('setItemCompleted', () => {
  const storedChecklist = () => ({
    exists: true,
    data: () => ({
      items: [
        { id: 'a', title: 'A', completed: false, completedAt: null },
        { id: 'b', title: 'B', completed: false, completedAt: null },
      ],
    }),
  });

  test('marks an item complete and returns the updated item', async () => {
    mockGet.mockResolvedValueOnce(storedChecklist());

    const item = await setItemCompleted('uid1', 'b', true);

    expect(item.id).toBe('b');
    expect(item.completed).toBe(true);
    expect(item.completedAt).toEqual(expect.any(String));
    const saved = mockSet.mock.calls[0][0];
    expect(saved.items.find((i) => i.id === 'a').completed).toBe(false);
    expect(saved.items.find((i) => i.id === 'b').completed).toBe(true);
    expect(mockSet.mock.calls[0][1]).toEqual({ merge: true });
  });

  test('marks an item incomplete again', async () => {
    mockGet.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        items: [{ id: 'a', completed: true, completedAt: '2026-10-02T00:00:00.000Z' }],
      }),
    });

    const item = await setItemCompleted('uid1', 'a', false);

    expect(item.completed).toBe(false);
    expect(item.completedAt).toBeNull();
  });

  test('throws a 404 ChecklistError for an unknown item id', async () => {
    mockGet.mockResolvedValueOnce(storedChecklist());

    await expect(setItemCompleted('uid1', 'nope', true)).rejects.toMatchObject({
      code: 'ITEM_NOT_FOUND',
      status: 404,
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  test('throws a 404 ChecklistError when no checklist exists', async () => {
    mockGet.mockResolvedValueOnce({ exists: false });

    await expect(setItemCompleted('uid1', 'a', true)).rejects.toMatchObject({
      code: 'CHECKLIST_NOT_FOUND',
      status: 404,
    });
  });
});
