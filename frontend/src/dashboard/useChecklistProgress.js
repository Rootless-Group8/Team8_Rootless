import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase/config";

// There's no checklist feature yet — this reads two optional fields
// (checklistCompleted / checklistTotal) off the user's existing
// Firestore doc, the same one RegistrationPage already writes to. Until
// the real checklist UI starts writing those fields, every user reads
// back `hasChecklist: false` and the dashboard shows its zero-state.
// Once the checklist feature ships and starts writing those two fields,
// this hook (and the real progress bar) start working with no changes
// needed here — that's the "fast follow" the story called for.
export function useChecklistProgress(uid) {
  const [state, setState] = useState({
    loading: true,
    hasChecklist: false,
    completed: 0,
    total: 0,
  });

  useEffect(() => {
    if (!uid) {
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
