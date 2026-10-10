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
 * (e.g. a parent page, or a hook wired to the Checklist Generator API
 * once that's ready) to pass the checklist in as `steps`, along with
 * `isLoading`/`error` while that fetch is in flight.
 *
 * Checked/unchecked state is tracked only in local state for now —
 * refreshing the page or navigating away loses it. Real persistence
 * to a backend is a separate task; when that's ready, an `onToggleStep`
 * prop can be added here without changing how this component looks
 * or behaves otherwise.
 *
 * Props:
 *  - steps     (array of { id, title, description, deadline, completed })
 *      The checklist to display. Each step's `completed` is just the
 *      starting value — this component tracks changes to it locally.
 *  - isLoading (bool)   Shows a loading state instead of the list.
 *  - error     (string) Shows an error state instead of the list, e.g.
 *                        "No checklist available for this destination yet."
 *  - onToggleStep (fn)  Optional. Called as (completedCount, total) after
 *                        every toggle, so a parent can persist progress
 *                        (e.g. to Firestore) without this component
 *                        needing to know anything about where that data
 *                        goes or in what shape.
 *
 * ---- Usage example ----
 *
 *   import ChecklistPage from './pages/ChecklistPage';
 *
 *   const sampleSteps = [
 *     {
 *       id: 'step-1',
 *       title: 'Apply for your visitor visa',
 *       description: 'Submit your application through the official portal.',
 *       deadline: 'At least 30 days before arrival',
 *       completed: false,
 *     },
 *     {
 *       id: 'step-2',
 *       title: 'Check passport validity',
 *       description: 'Your passport must be valid for at least 6 months past your arrival date.',
 *       deadline: 'Before you apply',
 *       completed: true,
 *     },
 *   ];
 *
 *   <ChecklistPage steps={sampleSteps} isLoading={false} error={null} />
 */
export default function ChecklistPage({ steps, isLoading = false, error = null, onToggleStep }) {
  const [completedIds, setCompletedIds] = useState(() => new Set());

  // Re-seed local completed state whenever a new set of steps comes in
  // (e.g. once the real API call resolves after a loading state).
  useEffect(() => {
    if (steps) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-seeds local state from a new `steps` prop reference, a single transition tied to the dependency change, not a cascading-render pattern.
      setCompletedIds(new Set(steps.filter((s) => s.completed).map((s) => s.id)));
    }
  }, [steps]);

  function handleToggle(id) {
    // Computed outside the setState updater deliberately — updater
    // functions should stay pure (no side effects), and React can invoke
    // them more than once in some cases, which would risk double-firing
    // onToggleStep's Firestore write.
    const next = new Set(completedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setCompletedIds(next);
    onToggleStep?.(next.size, steps?.length || 0);
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
