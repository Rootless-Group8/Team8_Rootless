import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Replace these with the values from your Firebase project settings
// (Project Settings > General > Your apps > SDK setup and configuration).
// For a class project it's fine to leave these as plain values here;
// for anything you'd actually ship, move them into a .env file using
// REACT_APP_ prefixed variables (Create React App) or VITE_ prefixed
// variables (Vite) and reference them as process.env.REACT_APP_... / import.meta.env.VITE_...
const firebaseConfig = {
  apiKey: "AIzaSyB0yBxKSNizer44pH-NMNjfOoHmK2cCeFU",
  authDomain: "daab-fcc5c.firebaseapp.com",
  projectId: "daab-fcc5c",
  storageBucket: "daab-fcc5c.firebasestorage.app",
  messagingSenderId: "727254900547",
  appId: "1:727254900547:web:82bec65c1086e5c66659f6"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
