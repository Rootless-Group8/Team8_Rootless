require('dotenv').config();
const { createApp } = require('./app');
const { initializeFirebaseAdmin } = require('./config/firebaseAdmin');
const { startReminderScheduler } = require('./jobs/reminderScheduler');
// FIXED: startReminderScheduler was required twice (duplicate const
// declaration — a SyntaxError in JS, same bug class found in app.js).
// This meant the real server could never boot, even though every test
// passed, because Jest never actually executes this file — it only
// imports app.js (via createApp), never server.js directly.

// 5000 conflicts with macOS AirPlay Receiver - default to 5050 instead.
const PORT = process.env.PORT || 5050;

const app = createApp({ db: initializeFirebaseAdmin().database() });

app.listen(PORT, () => {
  console.log(`Rootless backend (auth) listening on port ${PORT}`);
  startReminderScheduler();
});
