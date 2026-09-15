const jwt = require('jsonwebtoken');

// Protects routes by requiring a valid JWT in the Authorization header.
// Replace this with your existing auth middleware if you already have one
// from account creation/login (Step 1 of the Rootless pipeline).
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'You must be logged in to do this.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId; // assumes token payload has { userId }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Session expired or invalid. Please log in again.' });
  }
}

module.exports = { requireAuth };
