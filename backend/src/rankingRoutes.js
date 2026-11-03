const express = require('express');
const { getRankedVisas } = require('./rankingService');

module.exports = (db) => {
  const router = express.Router();
  router.get('/', async (req, res) => {
    try {
      const { citizenship, destination, purpose, arrivalDate } = req.query;
      const result = await getRankedVisas(db, { citizenship, destination, purpose, arrivalDate });
      res.status(result.status === 'invalid_input' ? 400 : 200).json(result);
    } catch (err) {
      res.status(500).json({ status: 'error', message: 'Something went wrong.', results: [] });
    }
  });
  return router;
};
