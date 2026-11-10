import Button from './Button';
import ProgressIndicator from './ProgressIndicator';
import './DocumentAlerts.css';

export default function DocumentAlerts({
  documents,
  isLoading = false,
  error = null,
  daysDueSoon = 30,
  upcomingWithinDays = 90,
  onViewAll,
}) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const withExpiration = (documents || []).filter((d) => d.expirationDate);

  function daysUntil(expirationDate) {
    const due = new Date(expirationDate);
    due.setHours(0, 0, 0, 0);
    return Math.round((due - now) / (1000 * 60 * 60 * 24));
  }

  const withDays = withExpiration
    .map((d) => ({ ...d, daysLeft: daysUntil(d.expirationDate) }))
    .filter((d) => d.daysLeft <= upcomingWithinDays)
    .sort((a, b) => a.daysLeft - b.daysLeft);

  const overdue = withDays.filter((d) => d.daysLeft < 0);
  const dueSoon = withDays.filter((d) => d.daysLeft >= 0 && d.daysLeft <= daysDueSoon);
  const upcoming = withDays.filter((d) => d.daysLeft > daysDueSoon);

  const needsAttentionCount = overdue.length + dueSoon.length;

  function formatDaysLeft(daysLeft) {
    if (daysLeft < 0) {
      const daysAgo = Math.abs(daysLeft);
      return daysAgo === 1 ? '1 day overdue' : `${daysAgo} days overdue`;
    }
    if (daysLeft === 0) return 'Expires today';
    if (daysLeft === 1) return 'Expires tomorrow';
    return `Expires in ${daysLeft} days`;
  }

  function renderGroup(title, groupDocuments, variant) {
    if (groupDocuments.length === 0) return null;
    return (
      <div className="document-alerts__group">
        <p className="document-alerts__group-title">{title}</p>
        <ul className="document-alerts__list">
          {groupDocuments.map((d) => (
            <li key={d.id} className={`document-alerts__item document-alerts__item--${variant}`}>
              <span className="document-alerts__item-title">{d.fileName}</span>
              <span className="document-alerts__item-days">{formatDaysLeft(d.daysLeft)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="document-alerts">
      <p className="document-alerts__heading">Document expirations</p>

      {!isLoading && !error && needsAttentionCount > 0 && (
        <p className="document-alerts__summary">
          {needsAttentionCount === 1
            ? '1 document needs your attention'
            : `${needsAttentionCount} documents need your attention`}
        </p>
      )}

      {isLoading && (
        <div className="document-alerts__state">
          <ProgressIndicator label="Loading documents..." />
        </div>
      )}

      {!isLoading && error && (
        <div className="document-alerts__state document-alerts__state--error">
          <p>{error}</p>
        </div>
      )}

      {!isLoading && !error && withDays.length === 0 && (
        <div className="document-alerts__state">
          <p>No documents expiring soon.</p>
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
        <div className="document-alerts__footer">
          <Button label="View all documents" variant="secondary" onClick={onViewAll} />
        </div>
      )}
    </div>
  );
}