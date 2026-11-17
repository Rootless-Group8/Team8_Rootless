const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');
const profileRoutes = require('./routes/profileRoutes');
const documentRoutes = require('./routes/documentRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const checklistRoutes = require('./routes/checklistRoutes');
const deadlineRoutes = require('./deadlineRoutes');
const eligibilityRoutes = require('./eligibilityRoutes');
const rankingRoutes = require('./rankingRoutes');
const costOfLivingRoutes = require('./routes/costOfLivingRoutes');
const lifeEventRoutes = require('./routes/lifeEventRoutes');

// FIXED: this file previously had FIVE duplicate `const ... = require(...)`
// declarations (notificationRoutes, reminderRoutes, deadlineRoutes,
// eligibilityRoutes, costOfLivingRoutes each required twice) and matching
// duplicate app.use() mounts (notifications x2, reminders x3). Redeclaring
// a const in the same scope is a SyntaxError in JavaScript — this file
// could not even be parsed by Node, meaning the backend has been
// completely unbootable. This predates the branch merge that brought
// backend and frontend work together; it was already broken on the
// backend branch's own HEAD. Deduplicated everything below, keeping
// exactly one require and one mount per route.
function createApp({ db } = {}) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api', userRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/documents', documentRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/reminders', reminderRoutes);
  app.use('/api/checklist', checklistRoutes);
  app.use('/api/life-events', lifeEventRoutes);
  if (db) app.use('/api/deadlines', deadlineRoutes(db));

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
