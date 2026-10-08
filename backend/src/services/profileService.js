const { initializeFirebaseAdmin } = require('../config/firebaseAdmin');

const USERS_COLLECTION = 'users';

/**
 * Allowed relocation goal values. Kept in sync with the frontend
 * RELOCATION_GOALS options in ProfileSetup.jsx.
 */
const RELOCATION_GOALS = [
  'tourist_visit',
  'work',
  'digital_nomad',
  'student',
  'long_term_residency',
  'permanent_move',
];

/**
 * Editable relocation profile fields. Stored as a nested `profile` map on
 * the same user document that userService.js manages (doc id = Firebase
 * UID), so profile data never collides with the auth-sync fields
 * (uid, email, email_verified, created_at, last_login_at).
 */
const PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phoneNumber',
  'citizenship',
  'currentCountry',
  'destinationCountry',
  'relocationGoal',
  'plannedArrivalDate',
];

function getDb() {
  const admin = initializeFirebaseAdmin();
  return admin.firestore();
}

/**
 * Validates a profile update payload.
 * Returns an object mapping field name -> error message for any invalid
 * fields. An empty object means the payload is valid.
 *
 * Only fields present in the payload are validated, so PATCH-style
 * partial updates are supported. A full profile is expected to be built
 * up over one or more calls, matching the frontend's single-submit form.
 *
 * @param {object} payload
 */
function validateProfilePayload(payload) {
  const errors = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'firstName')) {
    if (!payload.firstName || !String(payload.firstName).trim()) {
      errors.firstName = 'First name is required.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'lastName')) {
    if (!payload.lastName || !String(payload.lastName).trim()) {
      errors.lastName = 'Last name is required.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'email')) {
    if (!payload.email || !/^\S+@\S+\.\S+$/.test(payload.email)) {
      errors.email = 'Please provide a valid email address.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'phoneNumber')) {
    if (!payload.phoneNumber || !/^\+?[0-9]{7,15}$/.test(payload.phoneNumber)) {
      errors.phoneNumber = 'Please provide a valid phone number.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'citizenship')) {
    if (!payload.citizenship || !String(payload.citizenship).trim()) {
      errors.citizenship = 'Citizenship/passport country is required.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'currentCountry')) {
    if (!payload.currentCountry || !String(payload.currentCountry).trim()) {
      errors.currentCountry = 'Current country is required.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'destinationCountry')) {
    if (!payload.destinationCountry || !String(payload.destinationCountry).trim()) {
      errors.destinationCountry = 'Destination country is required.';
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'relocationGoal')) {
    if (!RELOCATION_GOALS.includes(payload.relocationGoal)) {
      errors.relocationGoal = `Relocation goal must be one of: ${RELOCATION_GOALS.join(', ')}.`;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'plannedArrivalDate')) {
    const rawDate = payload.plannedArrivalDate;
    const parsed = rawDate ? new Date(rawDate) : null;

    if (!rawDate || Number.isNaN(parsed.getTime())) {
      errors.plannedArrivalDate = 'Planned arrival date must be a valid date.';
    } else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsed < today) {
        errors.plannedArrivalDate = 'Arrival date cannot be in the past.';
      }
    }
  }

  return errors;
}

/**
 * Strips any keys that are not recognized profile fields, so callers
 * can't smuggle arbitrary data (e.g. uid, created_at) into the profile map.
 * @param {object} payload
 */
function pickProfileFields(payload) {
  const picked = {};
  PROFILE_FIELDS.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      picked[field] = payload[field];
    }
  });
  return picked;
}

/**
 * Fetches the relocation profile for a given Firebase UID.
 * Returns null if the user document doesn't exist or has no profile yet.
 *
 * @param {string} uid
 * @returns {Promise<object|null>}
 */
async function getProfile(uid) {
  const db = getDb();
  const snapshot = await db.collection(USERS_COLLECTION).doc(uid).get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data();
  return data.profile || null;
}

/**
 * Creates or updates the relocation profile for a given Firebase UID.
 * Uses a merge upsert so partial updates preserve existing profile fields
 * and never touch the auth-sync fields managed by userService.js.
 *
 * Caller is responsible for validating the payload first via
 * validateProfilePayload.
 *
 * @param {string} uid
 * @param {object} payload
 * @returns {Promise<object>} the resulting profile
 */
async function updateProfile(uid, payload) {
  const db = getDb();
  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const fields = pickProfileFields(payload);
  const now = new Date().toISOString();

  await userRef.set(
    {
      profile: {
        ...fields,
        updated_at: now,
      },
    },
    { merge: true }
  );

  const snapshot = await userRef.get();
  return snapshot.data().profile;
}

module.exports = {
  getProfile,
  updateProfile,
  validateProfilePayload,
  RELOCATION_GOALS,
  PROFILE_FIELDS,
};
