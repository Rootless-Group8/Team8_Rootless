import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/apiClient";

/**
 * useChecklist
 * Connects ChecklistPage to the real Checklist Generator API.
 *
 * On mount: tries GET /api/checklist. If none exists yet (404), calls
 * POST /api/checklist/generate to build one from the user's saved
 * profile. If the profile is missing or incomplete (400), surfaces a
 * clear error telling the user to finish their profile first.
 *
 * The API returns each item with a plain `dueDate` (e.g. "2026-11-15"),
 * but ChecklistPage expects a human-readable `deadline` string — that
 * formatting happens here, in the integration layer, so ChecklistPage
 * itself stays decoupled from the real API's exact shape.
 *
 * @param {string|undefined} uid - only used to re-run when the logged
 *   in user changes (e.g. after login/logout); the actual request is
 *   authenticated via apiFetch's own Firebase token, not this value.
 */
export function useChecklist(uid) {
  const [steps, setSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const formatSteps = useCallback(
    (items) =>
      (items || []).map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        deadline: formatDeadline(item.dueDate),
        completed: item.completed,
      })),
    [],
  );

  const load = useCallback(async () => {
    if (!uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      let checklist;
      try {
        const data = await apiFetch("/api/checklist");
        checklist = data.checklist;
      } catch (err) {
        if (err.status === 404) {
          const data = await apiFetch("/api/checklist/generate", { method: "POST" });
          checklist = data.checklist;
        } else {
          throw err;
        }
      }
      setSteps(formatSteps(checklist.items));
    } catch (err) {
      if (err.status === 400) {
        setError("Complete your profile before generating a checklist.");
      } else {
        setError("Couldn't load your checklist. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [uid, formatSteps]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- canonical fetch-on-mount; load is also reused standalone via the returned `refresh` function, so it can't be inlined into this effect body.
    load();
  }, [load]);

  const toggleStep = useCallback(async ({ id, completed }) => {
    try {
      await apiFetch(`/api/checklist/items/${id}`, {
        method: "PATCH",
        json: { completed },
      });
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, completed } : s)));
    } catch (err) {
      console.error("Failed to save checklist item:", err);
      // Deliberately not surfacing a page-level error for a single toggle
      // failure — ChecklistPage's own local state still reflects the
      // click, and a one-off save failure shouldn't blow away the whole
      // checklist view. Logged for now; a toast/inline retry is a nice
      // follow-up once this is in real use.
    }
  }, []);

  return { steps, isLoading, error, toggleStep, refresh: load };
}

/** Formats a plain "YYYY-MM-DD" date string into something readable. */
function formatDeadline(dueDate) {
  if (!dueDate) return "";
  const date = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dueDate;
  return `By ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}
