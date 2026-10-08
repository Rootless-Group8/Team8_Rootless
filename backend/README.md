# Rootless Backend — Firebase Authentication (Sprint 2)

Backend-only Firebase Auth integration: the client (Firebase SDK) owns
signup/login/logout, password hashing, and token issuance. This backend's
only jobs are:

1. Verify the Firebase ID token on incoming requests.
2. Keep a linked local user record (Firestore, keyed by Firebase UID) for
   app-specific data.

No custom password handling exists anywhere in this code.

## 1. Firebase project setup (console, one-time)

1. Go to the [Firebase Console](https://console.firebase.google.com/) and
   open (or create) the Rootless project.
2. **Authentication > Sign-in method** → enable **Email/Password** (and any
   other providers you want, e.g. Google).
3. **Project Settings > Service Accounts** → **Generate new private key**.
   This downloads a JSON file — treat it like a password.
4. **Firestore Database** → make sure Firestore is created (Native mode).

## 2. Configure credentials (never committed)

Copy `.env.example` to `.env` and fill in your credentials using **one** of:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — paste the entire downloaded JSON as a
  single-line string. Recommended for CI/hosting secret managers.
- `FIREBASE_SERVICE_ACCOUNT_PATH` — path to the downloaded file, for local
  dev only. Put the file under `secrets/` — already covered by
  `.gitignore`.

`.env`, `secrets/`, and `serviceAccountKey.json` are all git-ignored. Never
log `req.headers.authorization` or the decoded token in production logs.

## 3. Install and run

```bash
npm install
npm start        # starts on PORT (default 5050 — 5000 conflicts with macOS AirPlay)
npm test         # runs the unit test suite (fully mocked, no live Firebase needed)
```

## 4. How it fits together

```
src/
  config/firebaseAdmin.js   Initializes Firebase Admin SDK from env vars
  middleware/authMiddleware.js  Verifies ID tokens, attaches req.firebaseUser / req.localUser
  services/userService.js   Firestore user schema + create/sync-on-first-sign-in logic
  routes/userRoutes.js      Example protected routes
  app.js / server.js        Express wiring
tests/
  authMiddleware.test.js    Token verification: missing/malformed/expired/invalid/valid
  userService.test.js       User record creation + sync-on-existing-user logic
```

### Protecting a route

```js
const { verifyFirebaseToken } = require('./middleware/authMiddleware');

router.get('/some-protected-thing', verifyFirebaseToken, (req, res) => {
  // req.firebaseUser -> decoded Firebase token (uid, email, ...)
  // req.localUser    -> synced Firestore user record
});
```

Requests without a valid `Authorization: Bearer <token>` header are
rejected with `401` and one of: `missing_token`, `token_expired`,
`token_revoked`, `token_invalid`, `token_verification_failed`.

### User schema (Firestore `users/{uid}`)

| Field           | Type    | Notes                                  |
|-----------------|---------|-----------------------------------------|
| `uid`           | string  | Firebase Auth UID (also the doc id)     |
| `email`         | string  | Kept in sync with Firebase on each login|
| `email_verified`| boolean | Set at first sign-in                    |
| `created_at`    | ISO string | Set once, never overwritten          |
| `last_login_at` | ISO string | Refreshed on every verified request   |

Other features (relocation profile, preferences, etc.) can add fields to
the same document — `syncUserRecord` only ever touches `email` and
`last_login_at` on existing users, so it won't clobber them.

### "Logout"

Firebase ID tokens are short-lived and stateless, so there's no backend
session to invalidate on normal logout — that's `firebase.auth().signOut()`
client-side. For a forced logout across all devices (e.g. "log me out
everywhere"), `POST /api/logout-all-devices` revokes the user's refresh
tokens server-side via the Admin SDK.

## Acceptance criteria checklist

- [x] Email/Password sign-in enabled in Firebase console (manual step above)
- [x] Backend verifies valid tokens, rejects invalid/expired ones with clear errors
- [x] Local user record created and linked by Firebase UID on first sign-in
- [x] Protected endpoints reject requests without a valid token
- [x] Credentials loaded from env vars only, `.gitignore`'d, never logged
- [x] No custom password handling on the backend
