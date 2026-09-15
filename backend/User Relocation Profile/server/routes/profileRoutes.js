const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const { getProfile, createProfile, updateProfile } = require('../controllers/profileController');

// All profile routes require the user to be logged in first,
// which satisfies "User must be logged in before accessing profile setup."
router.use(requireAuth);

router.get('/', getProfile);
router.post('/', createProfile);
router.put('/', updateProfile);

module.exports = router;
