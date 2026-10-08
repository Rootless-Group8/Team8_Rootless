require('dotenv').config();
const { createApp } = require('./app');

// 5000 conflicts with macOS AirPlay Receiver - default to 5050 instead.
const PORT = process.env.PORT || 5050;

const app = createApp();

app.listen(PORT, () => {
  console.log(`Rootless backend (auth) listening on port ${PORT}`);
});
