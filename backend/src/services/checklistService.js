const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');
const { getProfile } = require('./profileService');
const { ChecklistError } = require('./checklistError');
const checklistData = require('../data/checklistData.json');
const {
  VISA_TYPES,
  SUPPORTED_VISA_TYPES,
  VISA_TYPE_ALIASES,
  COMMON_ITEMS,
  TOURIST_ITEMS,
  STUDENT_ITEMS,
} = require('./checklistTemplates');
const { resolveCountry, visaItemsFor } = require('./checklistRules');

// Checklists live in their own collection, one document per user, and the
// document id is the Firebase UID.
const CHECKLISTS_COLLECTION = 'checklists';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

function getDb() {
  const admin = initializeFirebaseAdmin();
  return admin.firestore();
}

function getChecklistRef(uid) {
  return getDb().collection(CHECKLISTS_COLLECTION).doc(uid);
}

/**
 * Converts a Date, ISO string, or Firestore Timestamp into a valid Date.
 * Returns null when the value is missing or cannot be parsed.
 */
function toDate(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const date =
    typeof value.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a Date as YYYY-MM-DD in UTC. */
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * The profile stores the visa type as relocationGoal. A dedicated visaType
 * field is honored first if the profile ever has one.
 */
function getVisaType(profile) {
  const raw = profile.visaType || profile.relocationGoal;
  if (typeof raw !== 'string' || !raw.trim()) {
    return null;
  }
  const normalized = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return VISA_TYPE_ALIASES[normalized] || normalized;
}

/**
 * Checks that a profile has what the generator needs.
 * Returns an object of field name -> message. Empty means the profile is OK.
 */
function validateProfileForChecklist(profile) {
  const errors = {};

  if (
    typeof profile.destinationCountry !== 'string' ||
    !profile.destinationCountry.trim()
  ) {
    errors.destinationCountry = 'Destination country is required.';
  }

  if (!getVisaType(profile)) {
    errors.visaType = 'Visa type (relocation goal) is required.';
  } else if (!SUPPORTED_VISA_TYPES.includes(getVisaType(profile))) {
    errors.visaType = `Checklists are currently available for tourist and student visas only (visa type "${getVisaType(profile)}" is not supported yet).`;
  }

  if (!profile.plannedArrivalDate) {
    errors.plannedArrivalDate = 'Planned arrival date is required.';
  } else if (!toDate(profile.plannedArrivalDate)) {
    errors.plannedArrivalDate = 'Planned arrival date must be a valid date.';
  }

  return errors;
}

/** Sort by due date (earliest first, no due date last), then priority, then title. */
function compareItems(a, b) {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  const rankDiff =
    (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  return a.title.localeCompare(b.title);
}

/**
 * Builds the checklist items for a profile using the static templates plus
 * the data driven visa rules. Pure function: no Firestore access. Every item
 * is returned incomplete and sorted by due date.
 *
 * @param {object} profile must already pass validateProfileForChecklist
 * @param {object} [data] visa data, defaults to src/data/checklistData.json
 * @returns {Array<object>}
 */
function buildChecklistItems(profile, data = checklistData) {
  const arrival = toDate(profile.plannedArrivalDate);
  const visaType = getVisaType(profile);
  const typedDestination = profile.destinationCountry.trim();
  const destination = resolveCountry(typedDestination, data);
  const passport = resolveCountry(profile.citizenship, data);
  const destinationName = destination ? destination.name : typedDestination;

  const ctx = {
    visaType,
    destinationIso2: destination ? destination.iso2 : null,
    destinationName,
    passportIso2: passport ? passport.iso2 : null,
    passportName: passport ? passport.name : null,
  };

  const templates = [
    ...COMMON_ITEMS,
    ...(visaType === VISA_TYPES.STUDENT ? STUDENT_ITEMS : TOURIST_ITEMS),
    ...visaItemsFor(ctx, data),
  ];

  // Template keys are the item ids, so keep the first template for any key.
  const unique = new Map();
  templates.forEach((template) => {
    if (!unique.has(template.key)) {
      unique.set(template.key, template);
    }
  });

  const items = [...unique.values()].map((template) => ({
    id: template.key,
    title: template.title,
    description: template.description.replace(/\{destination\}/g, destinationName),
    category: template.category,
    priority: template.priority,
    dueDate: formatDate(new Date(arrival.getTime() + template.offsetDays * MS_PER_DAY)),
    completed: false,
    completedAt: null,
  }));

  return items.sort(compareItems);
}

/**
 * Carries completed status over from an existing checklist. Only items that
 * still exist in the newly built list are kept, so incomplete items are
 * replaced and completed items that no longer apply are dropped.
 */
function mergeCompletedStatus(newItems, existingItems) {
  const completedById = new Map();
  (existingItems || []).forEach((item) => {
    if (item && item.completed) {
      completedById.set(item.id, item);
    }
  });

  return newItems.map((item) => {
    const previous = completedById.get(item.id);
    if (!previous) {
      return item;
    }
    return {
      ...item,
      completed: true,
      completedAt: previous.completedAt || null,
    };
  });
}

/**
 * Generates (or regenerates) the checklist for a user from their saved
 * profile and stores it in checklists/{uid}.
 *
 * @param {string} uid
 * @returns {Promise<{checklist: object, created: boolean}>}
 * @throws {ChecklistError} 400 when the profile is missing or incomplete
 */
async function generateChecklist(uid) {
  const profile = await getProfile(uid);

  if (!profile) {
    throw new ChecklistError(
      'PROFILE_NOT_FOUND',
      'No relocation profile found. Complete your profile before generating a checklist.',
      400
    );
  }

  const missing = validateProfileForChecklist(profile);
  if (Object.keys(missing).length > 0) {
    throw new ChecklistError(
      'PROFILE_INCOMPLETE',
      `Your profile is missing required information: ${Object.values(missing).join(' ')}`,
      400,
      missing
    );
  }

  const ref = getChecklistRef(uid);
  const snapshot = await ref.get();
  const existing = snapshot.exists ? snapshot.data() : null;
  const now = new Date().toISOString();

  const items = mergeCompletedStatus(
    buildChecklistItems(profile),
    existing && existing.items
  );

  const checklist = {
    uid,
    destinationCountry: profile.destinationCountry.trim(),
    passportCountry:
      typeof profile.citizenship === 'string' && profile.citizenship.trim()
        ? profile.citizenship.trim()
        : null,
    visaType: getVisaType(profile),
    arrivalDate: formatDate(toDate(profile.plannedArrivalDate)),
    items,
    createdAt: (existing && existing.createdAt) || now,
    generatedAt: now,
    updatedAt: now,
  };

  // Full replace (no merge) so stale incomplete items are removed.
  await ref.set(checklist);

  return { checklist, created: !existing };
}

/**
 * Returns the user's checklist, or null if none has been generated yet.
 */
async function getChecklist(uid) {
  const snapshot = await getChecklistRef(uid).get();
  return snapshot.exists ? snapshot.data() : null;
}

/**
 * Sets the completed status of one item and returns the updated item.
 *
 * @throws {ChecklistError} 404 if the checklist or the item does not exist
 */
async function setItemCompleted(uid, itemId, completed) {
  const ref = getChecklistRef(uid);
  const snapshot = await ref.get();

  if (!snapshot.exists) {
    throw new ChecklistError(
      'CHECKLIST_NOT_FOUND',
      'No checklist found. Generate your checklist first.',
      404
    );
  }

  const items = snapshot.data().items || [];
  const index = items.findIndex((item) => item.id === itemId);

  if (index === -1) {
    throw new ChecklistError(
      'ITEM_NOT_FOUND',
      `Checklist item "${itemId}" was not found.`,
      404
    );
  }

  const now = new Date().toISOString();
  const updatedItem = {
    ...items[index],
    completed,
    completedAt: completed ? now : null,
  };
  const updatedItems = items.map((item, i) => (i === index ? updatedItem : item));

  await ref.set({ items: updatedItems, updatedAt: now }, { merge: true });

  return updatedItem;
}

module.exports = {
  generateChecklist,
  getChecklist,
  setItemCompleted,
  buildChecklistItems,
  validateProfileForChecklist,
  mergeCompletedStatus,
  ChecklistError,
  CHECKLISTS_COLLECTION,
};
