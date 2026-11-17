import { useState, useEffect } from 'react';
import ProgressIndicator from '../components/ProgressIndicator';
import ChecklistItem from '../components/ChecklistItem';
import './ChecklistPage.css';

/**
 * ChecklistPage
 * Shows a user's personalized visa checklist: each step with a title,
 * description, and deadline, a checkbox to mark it done, and an
 * overall progress bar.
 *
 * This component does NOT fetch data itself — it expects the caller
 * to pass the checklist in as `steps`, along with `isLoading`/`error`
 * while that fetch is in flight.
 *
 * Props:
 *  - steps     (array of { id, title, description, deadline, completed })
 *  - isLoading (bool)   Shows a loading state instead of the list.
 *  - error     (string) Shows an error state instead of the list.
 *  - onToggleStep (fn)  Optional. Called as ({ id, completed, completedCount, total })
 *                        after every toggle, so a parent can persist the
 *                        change (e.g. a real per-item API call, or an
 *                        aggregate progress write) without this component
 *                        needing to know anything about where that data goes.
 *
 * ---- Usage example ----
 *
 *   import ChecklistPage from './pages/ChecklistPage';
 *
 *   <ChecklistPage
 *     steps={realSteps}
 *     isLoading={false}
 *     error={null}
 *     onToggleStep={({ id, completed }) => patchItem(id, completed)}
 *   />
 */
export default function ChecklistPage({ steps, isLoading = false, error = null, onToggleStep }) {
  const [completedIds, setCompletedIds] = useState(() => new Set());

  useEffect(() => {
    if (steps) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds local state from a new `steps` prop reference, a single transition tied to the dependency change, not a cascading-render pattern.
      setCompletedIds(new Set(steps.filter((s) => s.completed).map((s) => s.id)));
    }
  }, [steps]);

  function handleToggle(id) {
    const next = new Set(completedIds);
    const willBeCompleted = !next.has(id);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCompletedIds(next);
    onToggleStep?.({
      id,
      completed: willBeCompleted,
      completedCount: next.size,
      total: steps?.length || 0,
    });
  }

  const total = steps?.length || 0;
  const completedCount = completedIds.size;

  return (
    <div className="checklist-page">
      <h1 className="checklist-page__title">Your visa checklist</h1>
      <p className="checklist-page__description">
        Here's what you need to do, step by step, to get ready for your trip.
      </p>

      {isLoading && (
        <div className="checklist-page__state">
          <ProgressIndicator label="Building your checklist..." />
        </div>
      )}

      {!isLoading && error && (
        <div className="checklist-page__state checklist-page__state--error">
          <p>{error}</p>
        </div>
      )}

      {!isLoading && !error && total === 0 && (
        <div className="checklist-page__state">
          <p>No checklist steps yet.</p>
        </div>
      )}

      {!isLoading && !error && total > 0 && (
        <>
          <div className="checklist-page__progress">
            <ProgressIndicator
              label={`${completedCount} of ${total} steps complete`}
              value={(completedCount / total) * 100}
            />
          </div>

          <ul className="checklist-page__list">
            {steps.map((step) => (
              <ChecklistItem
                key={step.id}
                title={step.title}
                description={step.description}
                deadline={step.deadline}
                completed={completedIds.has(step.id)}
                onToggle={() => handleToggle(step.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
