const express = require('express');
const { getEligibleVisas } = require('./eligibilityService');

module.exports = (db) => {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const { passport, destination, purpose } = req.query;
      const result = await getEligibleVisas(db, passport, destination, purpose);
      res.status(result.status === 'invalid_input' ? 400 : 200).json(result);
    } catch (err) {
      res.status(500).json({ status: 'error', message: 'Something went wrong.', visas: [] });
    }
  });
  return router;
};
