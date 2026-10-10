import './ChecklistItem.css';

/**
 * ChecklistItem
 * A single step in a visa checklist: a title, description, deadline,
 * and a checkbox to mark it complete. Purely presentational — it
 * doesn't track its own state, so it can be used inside any list
 * that manages completion itself (like ChecklistPage).
 *
 * Props:
 *  - title       (string, required)  The step's title, e.g. "Apply for visa"
 *  - description (string)            What to do for this step
 *  - deadline    (string)            Human-readable timing, e.g.
 *                                     "By Jan 15, 2027" or "At least 30 days before arrival"
 *  - completed   (bool)              Whether this step is checked off
 *  - onToggle    (function, required) Called with no arguments when the
 *                                     checkbox is clicked; the parent
 *                                     decides what "toggled" means
 *
 * ---- Usage example ----
 *
 *   import ChecklistItem from './ChecklistItem';
 *
 *   <ChecklistItem
 *     title="Apply for your visitor visa"
 *     description="Submit your application through the official portal."
 *     deadline="At least 30 days before arrival"
 *     completed={false}
 *     onToggle={() => markStepDone('step-1')}
 *   />
 */
export default function ChecklistItem({ title, description, deadline, completed, onToggle }) {
  return (
    <li className={`ui-checklist-item ${completed ? 'ui-checklist-item--completed' : ''}`}>
      <button
        type="button"
        className="ui-checklist-item__checkbox"
        role="checkbox"
        aria-checked={completed}
        aria-label={completed ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
        onClick={onToggle}
      >
        {completed && <span className="ui-checklist-item__check">✓</span>}
      </button>

      <div className="ui-checklist-item__content">
        <p className="ui-checklist-item__title">{title}</p>
        {description && <p className="ui-checklist-item__description">{description}</p>}
        {deadline && <p className="ui-checklist-item__deadline">{deadline}</p>}
      </div>
    </li>
  );
}
