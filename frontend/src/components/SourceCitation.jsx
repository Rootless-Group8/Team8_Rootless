import './SourceCitation.css';

// Shared "last verified" + source-citation UI (TM08-112).
//
// Before this component existed, Visa Explorer and Visa Comparison each
// rendered their own ad-hoc "Last verified" line and "Source" link, Cost
// of Living showed only a per-category source link with no verified date,
// and Relocation Guides showed only a per-section source link with no
// verified date either. Four different pages, four slightly different
// renderings of the same underlying idea — exactly the pattern the UI
// consistency pass flagged two sprints ago. This component is the single
// place that idea gets rendered, so a fifth page never has to invent its
// own version again.
//
// DATE FORMAT (decided here, applied everywhere): absolute, e.g.
// "Verified Nov 15, 2026" — not relative ("3 months ago"). Relative dates
// go stale the moment they're rendered and would need re-rendering on a
// timer to stay honest; an absolute date is correct forever and matches
// the format useChecklist.js already uses for deadlines, so the app reads
// one consistent way. If a page passes no lastVerifiedAt (see below), that
// part is simply omitted rather than showing a fake or "unknown" date.
//
// MISSING SOURCE (by design, not a bug): some records genuinely have no
// citation — e.g. Cost of Living's Canada/healthcare entry, where there's
// no single defensible figure to cite. Passing sourceUrl={null} renders an
// explicit "Source not applicable" label, never a blank or broken link.
//
// SCHEMA GAP (flagged, not hidden): requirements/{nationality}/{destination}
// (used by Visa Explorer and Visa Comparison) is the only record type that
// currently stores lastVerifiedAt. costOfLiving/{iso2} and
// relocationGuides/{iso2} have no such field yet, so Cost of Living and
// Relocation Guides pass lastVerifiedAt={undefined} for now and this
// component just omits that half of the line — it does not invent a date.
// Adding lastVerifiedAt to those two schemas is a follow-up, not something
// this story's UI work can fix on its own.
export default function SourceCitation({ lastVerifiedAt, sourceUrl, className = "" }) {
  const verifiedLabel = formatLastVerified(lastVerifiedAt);

  return (
    <p className={`source-citation${className ? ` ${className}` : ""}`}>
      {verifiedLabel && <span className="source-citation-verified">{verifiedLabel}</span>}
      {verifiedLabel && (
        <span className="source-citation-sep" aria-hidden="true">
          {" "}
          ·{" "}
        </span>
      )}
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noreferrer" className="source-citation-link">
          Source
        </a>
      ) : (
        <span className="source-citation-na">Source not applicable</span>
      )}
    </p>
  );
}

/**
 * Formats a lastVerifiedAt value (ms epoch, ISO string, or anything
 * `new Date()` accepts) into "Verified <Mon D, YYYY>". Returns null for a
 * missing or unparseable value so the caller can skip rendering that part
 * entirely instead of showing "Verified unknown" or "Invalid Date".
 */
function formatLastVerified(lastVerifiedAt) {
  if (!lastVerifiedAt) return null;
  const date = new Date(lastVerifiedAt);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Verified ${formatted}`;
}
