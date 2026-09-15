# Login/Register (Firebase)

Handles TM08 — register, login, logout. Using Firebase Auth instead of our
own Express/Mongoose auth stuff now.

Everything's flat in frontend/ for now (no subfolders) since that's how
we're organizing things at this stage.

## Files (all live directly in frontend/)
```
config.js            → sets up firebase, pulls config from env vars
RegistrationPage.jsx → signup form, makes the firebase user + a firestore doc
LoginPage.jsx         → login form, sends you to /dashboard if it works
LogoutButton.jsx      → logs you out, back to /login
useAuth.js            → hook to check if someone's logged in
authErrors.js         → turns firebase's error codes into actual readable messages
```

No more auth stuff in backend/ — firebase handles all of that now. Express
is still there for the other features (checklist, visa search, etc), just
not auth.

## old vs new
| before | now |
|---|---|
| we hashed passwords ourselves with bcrypt | firebase does this, we never see the password |
| we made our own JWT + cookie | firebase handles sessions on its own |
| mongoose User model had everything | firestore doc just has fullName/email/createdAt, firebase owns the rest |
| our own /api/auth routes | just calling firebase SDK straight from react |

## setup
1. go to the firebase console, turn on Email/Password auth and turn on Firestore
2. `npm install firebase` inside frontend/
3. grab your firebase config values (project settings > general > your apps) and put them in a `.env` in frontend/ — don't commit this
   ```
   REACT_APP_FIREBASE_API_KEY=...
   REACT_APP_FIREBASE_AUTH_DOMAIN=...
   REACT_APP_FIREBASE_PROJECT_ID=...
   REACT_APP_FIREBASE_STORAGE_BUCKET=...
   REACT_APP_FIREBASE_MESSAGING_SENDER_ID=...
   REACT_APP_FIREBASE_APP_ID=...
   ```
   (if we end up on Vite instead of CRA, these need to be VITE_ prefixed and pulled from import.meta.env instead)
4. put RegistrationPage/LoginPage into the router wherever /register and /login are, and stick LogoutButton somewhere in the navbar
5. for any page that needs to be logged-in only (dashboard etc), use useAuth() to check if there's a user and kick them to /login if not

## don't skip this — firestore rules
need to lock down firestore so people can only touch their own doc:
```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```
without this literally anyone could read/edit anyone else's profile

## not done yet
- no forgot password flow (firebase has sendPasswordResetEmail() ready whenever we want it, just wasn't in the AC)
- useAuth() isn't hooked up to any actual protected routes yet since dashboard/checklist don't exist
- if we reorganize into subfolders later (src/auth/, src/firebase/, etc), remember to update the "./config" imports in the other files
