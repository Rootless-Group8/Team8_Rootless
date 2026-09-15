const Profile = require('../models/Profile');

// GET /api/profile
// Retrieves the logged-in user's saved profile.
async function getProfile(req, res) {
  try {
    const profile = await Profile.findOne({ user: req.userId });

    if (!profile) {
      return res.status(404).json({ message: 'No profile found for this account yet.' });
    }

    return res.status(200).json(profile);
  } catch (err) {
    return res.status(500).json({ message: 'Something went wrong retrieving your profile.' });
  }
}

// POST /api/profile
// Creates a new profile for the logged-in user. Fails if one already exists.
async function createProfile(req, res) {
  try {
    const existing = await Profile.findOne({ user: req.userId });
    if (existing) {
      return res.status(409).json({ message: 'A profile already exists for this account. Use update instead.' });
    }

    const profile = new Profile({ ...req.body, user: req.userId });
    await profile.save();

    return res.status(201).json(profile);
  } catch (err) {
    return res.status(400).json({ message: formatMongooseError(err) });
  }
}

// PUT /api/profile
// Updates the logged-in user's existing profile (or creates one if missing).
async function updateProfile(req, res) {
  try {
    const profile = await Profile.findOneAndUpdate(
      { user: req.userId },
      { $set: req.body },
      {
        new: true, // return the updated document
        upsert: true, // create it if it doesn't exist yet
        runValidators: true, // enforce schema validation on update
        context: 'query', // needed for some validators to run correctly on update
      }
    );

    return res.status(200).json(profile);
  } catch (err) {
    return res.status(400).json({ message: formatMongooseError(err) });
  }
}

// Turns Mongoose validation errors into a single readable message
// so the frontend can display something meaningful.
function formatMongooseError(err) {
  if (err.name === 'ValidationError') {
    return Object.values(err.errors)
      .map((e) => e.message)
      .join(' ');
  }
  return 'Please check your information and try again.';
}

module.exports = { getProfile, createProfile, updateProfile };
