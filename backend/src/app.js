const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const documentRoutes = require('./routes/documentRoutes');
const eligibilityRoutes = require('./eligibilityRoutes');
const { initializeFirebaseAdmin } = require('./config/firebaseAdmin');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api', userRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/documents', documentRoutes);

  // eligibilityRoutes existed with full test coverage (src/eligibility.test.js)
  // but was never actually mounted here — the route was unreachable over
  // HTTP despite being fully built and tested. It expects a Realtime
  // Database instance (uses db.ref(...), not Firestore's db.collection(...)),
  // matching how eligibilityService.js queries countries/countryVisaPrograms/
  // visaRequirements.
  app.use('/api/eligibility', eligibilityRoutes(initializeFirebaseAdmin().database()));

  // Central error handler - never leak stack traces or internals to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  });

  return app;
}

module.exports = { createApp };