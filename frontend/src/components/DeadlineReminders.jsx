import React from 'react';
import Button from './Button';
import ProgressIndicator from './ProgressIndicator';
import './DeadlineReminders.css';

/**
 * DeadlineReminders
 * A compact summary of a user's upcoming checklist deadlines, grouped
 * by urgency — overdue, due soon, and everything else. Meant to be
 * dropped into another page (like a dashboard), not used as a
 * standalone screen.
 *
 * This component doesn't fetch or know about checklist logic itself —
 * it just takes steps with due dates and sorts them into buckets.
 * Completed steps are filtered out automatically, since a finished
 * step doesn't need a deadline reminder.
 *
 * Props:
 *  - steps        (array of { id, title, dueDate, completed? })
 *      `dueDate` must be a value `new Date()` can parse (an ISO
 *      string like "2027-01-15" works). `completed` is optional;
 *      completed steps are excluded from the reminders.
 *  - isLoading    (bool)    Shows a loading state instead of the list.
 *  - error        (string)  Shows an error state instead of the list.
 *  - daysDueSoon  (number)  How many days out counts as "due soon".
 *                            Default: 7
 *  - onViewAll    (function, optional)
 *      Called when the "View full checklist" button is clicked. If
 *      omitted, the button isn't shown.
 *
 * ---- Usage example ----
 *
 *   import DeadlineReminders from './components/DeadlineReminders';
 *
 *   const steps = [
 *     { id: 'step-1', title: 'Apply for your visitor visa', dueDate: '2027-01-15' },
 *     { id: 'step-2', title: 'Check passport validity', dueDate: '2026-12-01', completed: true },
 *   ];
 *
 *   <DeadlineReminders
 *     steps={steps}
 *     isLoading={false}
 *     error={null}
 *     onViewAll={() => navigate('/checklist')}
 *   />
 */
export default function DeadlineReminders({
  steps,
  isLoading = false,
  error = null,
  daysDueSoon = 7,
  onViewAll,
}) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const active = (steps || []).filter((s) => !s.completed);

  function daysUntil(dueDate) {
    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);
    return Math.round((due - now) / (1000 * 60 * 60 * 24));
  }

  const withDays = active
    .map((s) => ({ ...s, daysLeft: daysUntil(s.dueDate) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const overdue = withDays.filter((s) => s.daysLeft < 0);
  const dueSoon = withDays.filter((s) => s.daysLeft >= 0 && s.daysLeft <= daysDueSoon);
  const upcoming = withDays.filter((s) => s.daysLeft > daysDueSoon);

  // "Needs attention" = overdue + due soon. Upcoming items are further
  // out and don't need to be surfaced in a quick-glance count.
  const needsAttentionCount = overdue.length + dueSoon.length;

  function formatDaysLeft(daysLeft) {
    if (daysLeft < 0) {
      const daysAgo = Math.abs(daysLeft);
      return daysAgo === 1 ? '1 day overdue' : `${daysAgo} days overdue`;
    }
    if (daysLeft === 0) return 'Due today';
    if (daysLeft === 1) return 'Due tomorrow';
    return `Due in ${daysLeft} days`;
  }

  function renderGroup(title, groupSteps, variant) {
    if (groupSteps.length === 0) return null;
    return (
      <div className="deadline-reminders__group">
        <p className="deadline-reminders__group-title">{title}</p>
        <ul className="deadline-reminders__list">
          {groupSteps.map((s) => (
            <li key={s.id} className={`deadline-reminders__item deadline-reminders__item--${variant}`}>
              <span className="deadline-reminders__item-title">{s.title}</span>
              <span className="deadline-reminders__item-days">{formatDaysLeft(s.daysLeft)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="deadline-reminders">
      <p className="deadline-reminders__heading">Upcoming deadlines</p>

      {!isLoading && !error && needsAttentionCount > 0 && (
        <p className="deadline-reminders__summary">
          {needsAttentionCount === 1
            ? '1 deadline needs your attention'
            : `${needsAttentionCount} deadlines need your attention`}
        </p>
      )}

      {isLoading && (
        <div className="deadline-reminders__state">
          <ProgressIndicator label="Loading deadlines..." />
        </div>
      )}

      {!isLoading && error && (
        <div className="deadline-reminders__state deadline-reminders__state--error">
          <p>{error}</p>
        </div>
      )}

      {!isLoading && !error && withDays.length === 0 && (
        <div className="deadline-reminders__state">
          <p>No upcoming deadlines.</p>
        </div>
      )}

      {!isLoading && !error && withDays.length > 0 && (
        <>
          {renderGroup('Overdue', overdue, 'overdue')}
          {renderGroup('Due soon', dueSoon, 'due-soon')}
          {renderGroup('Upcoming', upcoming, 'upcoming')}
        </>
      )}

      {onViewAll && (
        <div className="deadline-reminders__footer">
          <Button label="View full checklist" variant="secondary" onClick={onViewAll} />
        </div>
      )}
    </div>
  );
}
