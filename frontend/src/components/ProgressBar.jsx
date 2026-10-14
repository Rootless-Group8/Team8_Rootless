// Presentational only — takes completed/total, renders an accessible
// progress bar. Doesn't know or care where the numbers came from, so it
// can be reused anywhere progress needs showing later (not just the
// dashboard's checklist card).
export default function ProgressBar({ completed, total, label }) {
  const safeTotal = total > 0 ? total : 1; // guard against divide-by-zero
  const percent = Math.round((completed / safeTotal) * 100);

  return (
    <div className="progress-bar-wrapper">
      <div
        className="progress-bar-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label || "Progress"}
      >
        <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {/* Visible text label — progress is never communicated by the bar's
          color/width alone, per the accessibility acceptance criterion. */}
      <p className="progress-bar-text">
        {completed} of {total} steps complete ({percent}%)
      </p>
    </div>
  );
}
