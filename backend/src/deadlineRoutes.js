const express = require('express');
const { getDeadlines, DeadlineError } = require('./deadlineService');

// Same shape as eligibilityRoutes: takes db, returns a router.
// Passing db in is what lets the tests hand it a mocked Firebase object.
module.exports = (db) => {
  const router = express.Router();

  router.post('/', async (req, res) => {
    try {
      const result = await getDeadlines(db, req.body);
      res.status(200).json({ status: 'ok', ...result });
    } catch (err) {
      if (err instanceof DeadlineError) {
        const status = err.status === 404 ? 'not_found' : 'invalid_input';
        return res.status(err.status).json({ status, message: err.message, deadlines: [] });
      }
      res.status(500).json({ status: 'error', message: 'Something went wrong.', deadlines: [] });
    }
  });

  return router;
};
