'use strict';

const express = require('express');
const { verifyFirebaseToken } = require('../middleware/authMiddleware');
const costOfLivingService = require('../services/costOfLivingService');

function handleError(res, err) {
  if (err instanceof costOfLivingService.CostOfLivingError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error('Cost of living error:', err);
  return res.status(500).json({
    error: 'cost_of_living_unavailable',
    message: 'Cost of living data could not be loaded. Please try again later.',
  });
}

// Takes the Realtime Database handle, same as eligibilityRoutes, so app.js
// mounts it with: if (db) app.use('/api/cost-of-living', costOfLivingRoutes(db))
module.exports = (db) => {
  const router = express.Router();

  // Token check lives here so app.js only needs the mount line.
  router.use(verifyFirebaseToken);

  router.get('/', async (req, res) => {
    try {
      const locations = await costOfLivingService.listLocations(db);
      res.status(200).json({ locations });
    } catch (err) {
      handleError(res, err);
    }
  });

  router.get('/:location', async (req, res) => {
    try {
      const record = await costOfLivingService.getLocation(db, req.params.location);
      res.status(200).json(record);
    } catch (err) {
      handleError(res, err);
    }
  });

  return router;
};
