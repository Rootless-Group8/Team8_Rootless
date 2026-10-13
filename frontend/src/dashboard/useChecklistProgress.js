import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

// Reads two fields (checklistCompleted / checklistTotal) off the user's
// Firestore doc, the same one RegistrationPage writes to. App.jsx wires
// ChecklistPage's onToggleStep callback to write these two fields on
// every toggle — see handleChecklistToggle in App.jsx. A user who hasn't
// visited /checklist yet (or whose checklist is empty) correctly reads
// back `hasChecklist: false`, which is what puts the Dashboard's
// Progress card into its zero-state.
export function useChecklistProgress(uid) {
  const [state, setState] = useState({
    loading: true,
    hasChecklist: false,
    completed: 0,
    total: 0,
  });

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- single state transition tied to the `uid` dependency changing, not a cascading-render pattern.
      setState({ loading: false, hasChecklist: false, completed: 0, total: 0 });
      return;
    }

    let cancelled = false;

    async function loadProgress() {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const data = snap.exists() ? snap.data() : {};
        const total = typeof data.checklistTotal === "number" ? data.checklistTotal : 0;
        const completed = typeof data.checklistCompleted === "number" ? data.checklistCompleted : 0;

        if (!cancelled) {
          setState({
            loading: false,
            hasChecklist: total > 0,
            completed,
            total,
          });
        }
      } catch (err) {
        console.error("Failed to load checklist progress:", err);
        if (!cancelled) {
          setState({ loading: false, hasChecklist: false, completed: 0, total: 0 });
        }
      }
    }

    loadProgress();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return state;
}
