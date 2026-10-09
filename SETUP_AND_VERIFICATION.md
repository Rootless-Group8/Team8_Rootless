# Rootless — Setup & Verification Guide

This is the repeatable process for getting the full project (frontend +
backend) running from scratch, and for verifying it actually works after
any merge — not just that it compiles. Written after a session where
several real bugs were found specifically *because* this process was
followed start to finish, rather than assuming a clean merge meant a
working app.

## Project structure

```
Rootless/
  frontend/    React + Vite app (client-side, talks to Firebase directly
               for auth/data, and to backend/ for documents/profile/
               eligibility)
  backend/     Express API (Node.js). Owns document storage, profile
               CRUD, user sync, and visa eligibility matching.
    scraper/   Node scripts that pull visa data from government sites
    seed/      Python scripts that write seed data into Firebase
  seed_cost_of_living.py / .json   Cost-of-living seed data (root level)
```

Two separate Node projects (`frontend/`, `backend/`) — install and run
each independently.

## Prerequisites

- Node.js 18+
- Python 3.9+ with `pip install firebase-admin --break-system-packages`
  (for the seed scripts)
- A Firebase project with these enabled (see below for exact rules):
  - **Authentication** (Email/Password provider)
  - **Cloud Firestore** (a *separate product* from Realtime Database —
    see the warning below, this has bitten us before)
  - **Realtime Database**
  - **Storage** (for document uploads)
- A service account key: Firebase Console → Project Settings → Service
  Accounts → Generate new private key. Needed by the backend and by the
  Python seed scripts. **Never commit this file.**

## ⚠️ Firestore and Realtime Database are two different products

This has caused real confusion on this project before. In the Firebase
Console left sidebar, under Build, there are two *separate* entries:
**Firestore Database** and **Realtime Database**. Each has its own
Data/Rules/Indexes tabs, and rules set on one have zero effect on the
other. If something is "permission denied" or "not found," check you're
editing rules for the correct product — not just *a* rules tab.

| Data | Lives in |
|---|---|
| Auth user profile (`users/{uid}`) | Firestore |
| Visa requirements, countries, cost of living, visa types | Realtime Database |
| Document metadata | Firestore (file itself goes to Storage) |

## Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `.env`:

```
PORT=5050
FIREBASE_DATABASE_URL=https://<your-project>-default-rtdb.firebaseio.com
FIREBASE_STORAGE_BUCKET=<your-project>.firebasestorage.app
FIREBASE_SERVICE_ACCOUNT_JSON=<paste the entire downloaded JSON as one line>
```

All three Firebase-related vars matter even though it might look like
only the service account should be required — `FIREBASE_DATABASE_URL`
and `FIREBASE_STORAGE_BUCKET` are needed by Firebase Admin SDK's
`initializeApp()` call for Realtime Database and Storage access to work
at all. Missing either one doesn't fail at `npm install` or even at
server startup for routes that don't need them — it fails the first
time a route that *does* need it is actually called (e.g., the first
document upload, or the first eligibility check), which makes it an
easy gap to miss in a quick smoke test. (This exact gap existed in this
repo and is why this warning is here.)

```bash
npm start          # boots on PORT (default 5050)
npm test           # runs the Jest suite — should be 74 passing
```

## Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
```

Fill in `.env` from Firebase Console → Project Settings → General →
Your apps → SDK setup and configuration, plus the Realtime Database URL
and the backend's local URL:

```
VITE_API_BASE_URL=http://localhost:5050
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_URL=...
```

```bash
npm run dev         # starts at http://localhost:5173
npm test            # runs Vitest
npm run lint         # runs ESLint
```

Note: `VITE_API_BASE_URL` only matters for features that call the
backend (currently: document upload). Everything else (auth, visa
explorer, comparison, cost of living, checklist progress) talks to
Firebase directly from the browser and doesn't need the backend running
at all.

## Required security rules

The backend uses the Firebase **Admin SDK**, which runs with full
privileges and **bypasses every security rule below entirely**. These
rules only matter for the frontend's direct client-side Firebase calls.

**Firestore** (Console → Firestore Database → Rules):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

**Realtime Database** (Console → Realtime Database → Rules):
```json
{
  "rules": {
    "requirements": { ".read": true, ".write": false },
    "visaTypes": { ".read": true, ".write": false },
    "countries": { ".read": true, ".write": false },
    "costOfLiving": { ".read": true, ".write": false },
    "countryVisaPrograms": { ".read": true, ".write": false },
    "appConfig": { ".read": true, ".write": false },
    "scraperMeta": { ".read": false, ".write": false },
    "users": {
      "$uid": {
        ".read": "$uid === auth.uid",
        ".write": "$uid === auth.uid"
      }
    },
    "trips": {
      "$tripId": {
        ".read": "data.child('ownerId').val() === auth.uid",
        ".write": "data.child('ownerId').val() === auth.uid || !data.exists()"
      }
    },
    "feedback": {
      "$feedbackId": {
        ".read": false,
        ".write": "auth != null"
      }
    }
  }
}
```

Per CONTRIBUTING.md: any PR introducing a new top-level RTDB path or
Firestore collection must add its rule here (and in the console) in the
same PR — a path with no rule defaults to deny, and this has broken
things silently before.

## Seeding data

```bash
cd backend/seed
python seed_visa_programs.py --data seed_visa_programs_ca_uk.json --cred path/to/serviceAccountKey.json --db-url https://<your-project>-default-rtdb.firebaseio.com
python seed_visa_programs.py --data seed_visa_programs_de_pt.json --cred path/to/serviceAccountKey.json --db-url https://<your-project>-default-rtdb.firebaseio.com
python verify_visa_programs.py --cred path/to/serviceAccountKey.json --db-url https://<your-project>-default-rtdb.firebaseio.com

cd ../..
python seed_cost_of_living.py --data seed_cost_of_living.json --cred path/to/serviceAccountKey.json --db-url https://<your-project>-default-rtdb.firebaseio.com
```

## Verification checklist (run this after every merge to main)

This is the actual process that found every real bug described in
ARCHITECTURE_NOTES.md — "no conflicts" from git is not the same as
"still works."

1. **`cd backend && npm test`** — expect all suites passing. A red
   suite here is a real regression, not a flaky test, until proven
   otherwise.
2. **`cd backend && npm start`** — confirm it prints "listening on
   port 5050" with no error. A crash here, even with 100% passing
   tests, means something routes/config depend on isn't actually
   configured (this has happened — see ARCHITECTURE_NOTES.md).
3. **`cd frontend && npm run lint`** — expect zero errors. If test
   files suddenly show `no-undef` errors for `describe`/`it`/`expect`,
   check `eslint.config.js` still has the Vitest globals block.
4. **`cd frontend && npm test`** — expect all suites passing.
5. **`cd frontend && npm run dev`**, then manually click through:
   register a new account → log in → visit Dashboard, Visa Explorer,
   Visa Comparison, Cost of Living, Checklist, Documents → log out →
   confirm a protected route redirects to `/login` when logged out.
6. **Check the browser console** during that click-through, not just
   whether pages visually render — several real bugs on this project
   (missing Firestore database, missing RTDB rule) rendered a visible
   but broken/stuck UI with the actual error only in the console.