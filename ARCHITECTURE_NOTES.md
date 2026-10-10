# Architecture Notes & Session Findings

Written after a full diagnostic pass across both `frontend/` and
`backend/` following a branch merge. Purpose: record what was actually
broken (not just suspected), what was fixed and why, and flag the one
decision that needs the team's input rather than a unilateral fix.

## Fixed this session

### 1. ESLint couldn't see Vitest's test globals
`eslint.config.js` only declared `globals.browser`, so every `.test.jsx`
file reported `describe`/`it`/`expect`/`beforeEach` as undefined — 61
false errors across 8 test files. This is almost certainly why CI has
been showing red. **Fix:** added a second config block scoped to
`**/*.test.{js,jsx}` with `globals.vitest` merged in.

### 2. Dashboard Progress bar was permanently stuck at zero
`useChecklistProgress` correctly read `checklistCompleted`/
`checklistTotal` from Firestore, but `ChecklistPage` only ever tracked
completion in local React state — nothing wrote those two fields
anywhere. The hook and the checklist UI were both fully built and both
correct in isolation; they just weren't connected. **Fix:**
`ChecklistPage` already had an `onToggleStep(completedCount, total)`
extension point designed for exactly this (per its own docstring), just
never called. Wired it through `App.jsx`'s `handleChecklistToggle`,
which writes to Firestore on every toggle.

### 3. `eligibilityRoutes.js` had full test coverage but was never mounted
`src/eligibility.test.js` passes 6/6 tests calling `getEligibleVisas`
directly, but `app.js` never called `app.use('/api/eligibility', ...)`.
The route was completely unreachable over HTTP. **Fix:** mounted it.

### 4. Firebase Admin SDK was missing `databaseURL` and `storageBucket`
`firebaseAdmin.js` called `admin.initializeApp({ credential })` with
neither set. This doesn't fail at startup for routes using only
Firestore (profile, users) — it fails the moment something calls
`admin.database()` (eligibility) or `admin.storage()` (documents),
which is exactly why it went unnoticed: those two routes either weren't
wired in yet (eligibility) or were still using simulated/local-only
data (documents), so the real failure path was never exercised.
**Fix:** both are now read from env vars and passed through when
present — not hard-required, since services that don't need them
(profile, users) shouldn't be forced to configure them. (A first attempt
at this fix made them hard-required and broke a legitimately-passing
test — `profileService.test.js` never needed either var. Worth noting
as a reminder that a fix for one problem can introduce another; the
full test suite re-run is what caught it immediately.)

### 5. Document upload was entirely simulated, with a real backend sitting unused
`DocumentUploadPage.jsx` had a `simulateUpload` function with a
`// TODO: replace with a real upload call` comment, while
`backend/src/routes/documentRoutes.js` + `documentService.js` were
fully built and tested (17 tests) for real Firebase Storage + Firestore
uploads. **Fix:** added `frontend/src/lib/apiClient.js` (a shared
helper for calling the backend with a Firebase ID token attached) and
rewired `DocumentUploadPage` to call `POST /api/documents` for real,
including a document-type selector matching the backend's exact enum.

### 6. Duplicate/dead document routes and pages
`/documents` pointed to a placeholder "coming soon" page
(`DocumentsPage.jsx`) while a fully-built (if previously simulated)
upload UI sat at a separate `/upload-test` route. **Fix:** consolidated
to one `/documents` route serving the real (now actually-wired) upload
page; deleted the placeholder.

### 7. Minor cleanup
Removed 8 unused `import React from 'react'` statements (leftover from
pre-automatic-JSX-transform habits — not needed with this project's
Vite/React setup), one unused `catch` binding, and added two justified
`eslint-disable-next-line` comments for `react-hooks/set-state-in-effect`
warnings that are legitimate single-transition state updates, not
cascading-render bugs — with the reasoning written inline rather than
silently suppressed.

## Open — needs a team decision, not a unilateral fix

### Profile data: two incompatible implementations exist

**`frontend/src/ProfileSetup.jsx`** (currently orphaned — no route
points to it):
- Writes directly to Firestore from the client: `profiles/{uid}`
  collection
- Uses `frontend/src/firebaseConfig.js`, a *second*, hardcoded (not
  env-var-based) Firebase config file, separate from the one everything
  else in the app uses (`frontend/src/firebase/config.js`)
- Country fields are full names (`'United States'`, `'Canada'`), not the
  ISO2 codes (`US`, `CA`) used everywhere else in this app's RTDB schema

**`backend/src/routes/profileRoutes.js` + `profileService.js`** (fully
built, 100% test coverage):
- A real REST API: `GET/PATCH/PUT /api/profile`, authenticated via
  Firebase ID token
- Stores profile data nested inside the existing `users/{uid}` Firestore
  document (same document `RegistrationPage` already creates) — not a
  separate top-level collection
- Has real server-side validation (`validateProfilePayload`)

These two approaches store the same conceptual data in two different
places with two different shapes. If both were ever wired in
simultaneously, they would not see each other's data. **This wasn't
reconciled in this session** because it's a real architectural choice —
direct-client-to-Firestore vs. REST-through-Express — not a bug with
one obviously correct fix, and the rest of the app doesn't consistently
follow one pattern either (Visa Explorer/Comparison/Cost of Living all
read Realtime Database directly from the client; Documents now correctly
goes through the backend).

**Recommendation:** given the backend's profile API is the more
complete, tested, and consistent-with-`users/{uid}` option, wire
`ProfileSetup.jsx` to call it via `apiFetch` (the same helper just built
for documents) rather than `profileService.js`'s direct Firestore
writes. That also means switching `ProfileSetup`'s country fields from
full names to ISO2 codes to match the rest of the app, and deleting
`firebaseConfig.js` once nothing references it. This is a reasonable
default, not a unilateral decision — flag it at planning before someone
picks it up.

### Eligibility: frontend doesn't use the backend's matching service either

`VisaExplorerPage.jsx` queries Realtime Database directly
(`requirements/{nationality}/{destination}`) rather than calling the now
-mounted `GET /api/eligibility`. The backend's version additionally
supports filtering by `purpose` (tourism/study/work) and returns richer
data (`countryVisaPrograms` entries with eligibility criteria, documents,
fees) that the direct-RTDB version doesn't surface at all. Worth a team
conversation on whether Visa Explorer should be rebuilt against the
backend API — same category of decision as Profile above, not fixed
unilaterally here.

### Why these weren't just "fixed" during this session

Both of the above are real product/architecture decisions that affect
multiple files and change what data looks like in the database — not
contained bugs with one safe fix, like the `databaseURL` gap was.
Making that call without the team risks either reverting someone's
intentional design shortly after they built it, or locking in a pattern
that conflicts with what's already shipped elsewhere in the app. Surface
it, don't silently resolve it.
