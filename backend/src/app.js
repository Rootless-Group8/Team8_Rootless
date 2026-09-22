const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/userRoutes');

function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api', userRoutes);

  // Central error handler - never leak stack traces or internals to clients.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error', message: 'Something went wrong.' });
  });

  return app;
}

module.exports = { createApp };
