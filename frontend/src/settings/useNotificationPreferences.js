import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";

// No backend endpoint exists anywhere in this project for notification
// preferences — confirmed by checking every backend route built so far
// (profile, documents, eligibility, deadlines, checklist). Rather than
// inventing one, this follows the precedent already set by
// useChecklistProgress: write directly to the same users/{uid} Firestore
// doc RegistrationPage already creates, under a new
// `notificationPreferences` map field. Same pattern, same document,
// just a different field.
const DEFAULT_PREFERENCES = {
  deadlineReminders: true,
  documentExpirationAlerts: true,
  checklistUpdates: true,
  communityUpdates: true,
};

export function useNotificationPreferences(uid) {
  const [state, setState] = useState({
    loading: true,
    preferences: DEFAULT_PREFERENCES,
    error: null,
    saveError: null,
  });

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- single state transition tied to the `uid` dependency changing, not a cascading-render pattern.
      setState({ loading: false, preferences: DEFAULT_PREFERENCES, error: null, saveError: null });
      return;
    }

    let cancelled = false;

    async function loadPreferences() {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const stored = snap.exists() ? snap.data().notificationPreferences : null;
        if (!cancelled) {
          // Merge over defaults so a brand-new user (or one who predates
          // this field existing) gets sensible defaults for any category
          // not yet present in their doc, rather than `undefined`.
          setState({
            loading: false,
            preferences: { ...DEFAULT_PREFERENCES, ...(stored || {}) },
            error: null,
            saveError: null,
          });
        }
      } catch (err) {
        console.error("Failed to load notification preferences:", err);
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: "Couldn't load your notification preferences.",
          }));
        }
      }
    }

    loadPreferences();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  async function updatePreference(key, nextValue) {
    if (!uid) return;

    const previousPreferences = state.preferences;

    // Optimistic: flip the toggle immediately, before the write resolves.
    setState((prev) => ({
      ...prev,
      preferences: { ...prev.preferences, [key]: nextValue },
      saveError: null,
    }));

    try {
      await setDoc(
        doc(db, "users", uid),
        { notificationPreferences: { ...previousPreferences, [key]: nextValue } },
        { merge: true },
      );
    } catch (err) {
      console.error("Failed to save notification preference:", err);
      // Roll back to the pre-toggle state and surface an error, rather
      // than leaving the UI showing a value that was never actually saved.
      setState((prev) => ({
        ...prev,
        preferences: previousPreferences,
        saveError: "Couldn't save that change. Try again.",
      }));
    }
  }

  return { ...state, updatePreference };
}
