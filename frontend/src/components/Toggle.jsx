import "./Toggle.css";

// A real <input type="checkbox"> under the hood, visually styled as a
// switch — this is what makes it keyboard-operable and screen-reader
// friendly for free, rather than building a custom ARIA switch from a
// plain <div> and reimplementing that behavior by hand.
export default function Toggle({ id, checked, onChange, label, disabled = false }) {
  return (
    <label className="toggle" htmlFor={id}>
      <span className="toggle-label">{label}</span>
      <span className="toggle-switch">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
        />
        <span className="toggle-track" aria-hidden="true">
          <span className="toggle-thumb" />
        </span>
      </span>
    </label>
  );
}
