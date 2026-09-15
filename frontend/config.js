import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Pull these from your Firebase project settings (Project settings > General
// > Your apps > SDK setup and configuration). Store them as env vars —
// don't hardcode them or commit a .env file.
//
// If you're using Create React App: prefix each with REACT_APP_
// If you're using Vite: prefix each with VITE_ and use import.meta.env instead of process.env
//
// This file lives flat in frontend/ for now — if you later reorganize into
// subfolders (e.g. src/auth/, src/firebase/), just update the import paths
// in the other files that reference "./config".
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
