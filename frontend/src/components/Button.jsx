import './Button.css';

/**
 * Button
 * A single Button component that covers both the primary and
 * secondary look via the `variant` prop, so there's one component
 * to maintain instead of two near-duplicates.
 *
 * Props:
 *  - label      (string, required)  Text shown on the button
 *  - onClick    (function)          Click handler
 *  - variant    ('primary' | 'secondary')  Visual style. Default: 'primary'
 *  - disabled   (bool)              Disables interaction + shows disabled state
 *  - type       ('button' | 'submit' | 'reset')  HTML button type. Default: 'button'
 *  - className  (string)  Optional extra class(es) appended alongside the
 *                         button's own styling — for layout concerns only
 *                         (e.g. margin in a specific context), never for
 *                         overriding the button's own look. Omit unless a
 *                         specific layout genuinely needs it.
 *
 * ---- Usage example ----
 *
 *   import Button from './components/Button';
 *
 *   <Button label="Save changes" onClick={handleSave} />
 *   <Button label="Cancel" variant="secondary" onClick={handleCancel} />
 *   <Button label="Submit" type="submit" disabled={!isFormValid} />
 */
export default function Button({
  label,
  onClick,
  variant = 'primary',
  disabled = false,
  type = 'button',
  className = '',
}) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn--${variant}${className ? ` ${className}` : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
