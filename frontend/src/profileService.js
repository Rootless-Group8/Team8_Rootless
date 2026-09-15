import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';

// Profiles are stored as one document per user, keyed by their Firebase
// Auth uid, in a top-level "profiles" collection: profiles/{uid}.
// This is what lets Firestore security rules restrict each user to
// only their own document (see firestore.rules).

function requireCurrentUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('You must be logged in to do this.');
  }
  return user;
}

export async function fetchProfile() {
  const user = requireCurrentUser();
  const profileRef = doc(db, 'profiles', user.uid);
  const snapshot = await getDoc(profileRef);

  if (!snapshot.exists()) {
    return null; // no profile yet, caller treats this as "new user"
  }

  return { id: snapshot.id, ...snapshot.data() };
}

export async function saveProfile(profileData) {
  const user = requireCurrentUser();
  const profileRef = doc(db, 'profiles', user.uid);

  // merge: true means this works for both first-time create and later
  // updates without needing separate create/update functions.
  await setDoc(
    profileRef,
    {
      ...profileData,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  const snapshot = await getDoc(profileRef);
  return { id: snapshot.id, ...snapshot.data() };
}
