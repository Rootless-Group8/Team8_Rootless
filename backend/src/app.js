const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const documentRoutes = require('./routes/documentRoutes');
const checklistRoutes = require('./routes/checklistRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const deadlineRoutes = require('./deadlineRoutes');
const eligibilityRoutes = require('./eligibilityRoutes');
const costOfLivingRoutes = require('./routes/costOfLivingRoutes');
const lifeEventRoutes = require('./routes/lifeEventRoutes');
const deadlineRoutes = require('./deadlineRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const eligibilityRoutes = require('./eligibilityRoutes');
const rankingRoutes = require('./rankingRoutes');

function createApp({ db } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api', userRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/checklist', checklistRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/life-events', lifeEventRoutes);
  if (db) app.use('/api/deadlines', deadlineRoutes(db));
  app.use('/api/reminders', reminderRoutes);

  if (db) {
    // Matching Engine v2 (ranked results). Mounted before v1 so /v2 isn't
    // swallowed by the v1 router; v1 stays unchanged at /api/eligibility.
    app.use('/api/eligibility/v2', rankingRoutes(db));
    app.use('/api/eligibility', eligibilityRoutes(db));
  }
  if (db) app.use('/api/cost-of-living', costOfLivingRoutes(db));

  // Central error handler - never leak stack traces or internals to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  });

  return app;
}

module.exports = { createApp };
