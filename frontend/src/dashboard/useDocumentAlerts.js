import { useEffect, useState } from "react";
import { apiFetch } from "../lib/apiClient";

export function useDocumentAlerts(uid) {
  const [state, setState] = useState({ loading: true, documents: [], error: null });

  useEffect(() => {
    if (!uid) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- single state transition tied to the `uid` dependency changing, not a cascading-render pattern.
      setState({ loading: false, documents: [], error: null });
      return;
    }

    let cancelled = false;

    async function loadDocuments() {
      try {
        const data = await apiFetch("/api/documents");
        if (!cancelled) {
          setState({ loading: false, documents: data?.documents || [], error: null });
        }
      } catch (err) {
        console.error("Failed to load documents:", err);
        if (!cancelled) {
          setState({ loading: false, documents: [], error: "Couldn't load your documents." });
        }
      }
    }

    loadDocuments();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return state;
}