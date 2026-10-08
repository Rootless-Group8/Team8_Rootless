import React from 'react';
import './ProgressIndicator.css';

/**
 * ProgressIndicator
 * A horizontal progress bar. Works in two modes:
 *  - Determinate: pass a `value` (0–100) to show exact progress.
 *  - Indeterminate: omit `value` to show a continuous loading animation
 *    (use this when you don't know how long something will take).
 *
 * Props:
 *  - value    (number)   Progress percentage, 0–100. Omit for indeterminate mode.
 *  - label    (string)   Optional text shown above the bar (e.g. "Uploading...")
 *  - disabled (bool)     Shows a flat, muted bar (e.g. paused/cancelled state)
 *
 * ---- Usage example ----
 *
 *   import ProgressIndicator from './components/ProgressIndicator';
 *
 *   // Determinate — e.g. a file upload at 62%
 *   <ProgressIndicator label="Uploading file..." value={62} />
 *
 *   // Indeterminate — e.g. waiting on a server response
 *   <ProgressIndicator label="Checking your details..." />
 */
export default function ProgressIndicator({ value, label, disabled = false }) {
  const isDeterminate = typeof value === 'number';
  const clamped = isDeterminate ? Math.min(100, Math.max(0, value)) : null;

  return (
    <div className="ui-progress">
      {label && <p className="ui-progress__label">{label}</p>}
      <div
        className="ui-progress__track"
        role="progressbar"
        aria-valuenow={isDeterminate ? clamped : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`ui-progress__fill ${!isDeterminate ? 'ui-progress__fill--indeterminate' : ''} ${
            disabled ? 'ui-progress__fill--disabled' : ''
          }`}
          style={isDeterminate ? { width: `${clamped}%` } : undefined}
        />
      </div>
    </div>
  );
}
