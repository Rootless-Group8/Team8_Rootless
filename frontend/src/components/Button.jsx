import React from 'react';
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
}) {
  return (
    <button
      type={type}
      className={`ui-btn ui-btn--${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );
}
