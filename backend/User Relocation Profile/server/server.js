require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const profileRoutes = require('./routes/profileRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------
// FAKE LOGIN — for testing the profile feature in isolation only.
// Delete this route once your real account/login system is built.
// It skips password checking entirely and just hands back a valid
// JWT for a fixed test user id, so req.userId works in the
// profile controller exactly like it will after real login.
// ---------------------------------------------------------------
const FAKE_USER_ID = '000000000000000000000001'; // fake ObjectId-shaped string

app.post('/api/auth/fake-login', (req, res) => {
  const token = jwt.sign({ userId: FAKE_USER_ID }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
  res.json({ token, userId: FAKE_USER_ID });
});

// Real feature under test
app.use('/api/profile', profileRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 5000;

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`Test server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
