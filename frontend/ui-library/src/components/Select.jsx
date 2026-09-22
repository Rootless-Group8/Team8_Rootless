import React from 'react';
import './Select.css';

/**
 * Select
 * A labeled dropdown built on the native <select>, so it's accessible
 * and keyboard-friendly by default.
 *
 * Props:
 *  - label        (string)    Label shown above the field
 *  - value        (string, required)   Currently selected value (controlled)
 *  - onChange     (function, required) Called with the newly selected value
 *  - options      (array, required)    [{ value, label }, ...]
 *  - placeholder  (string)    Shown as a disabled first option when nothing is selected
 *  - disabled     (bool)      Disables the field
 *  - error        (string)    Error message; when set, field shows invalid state
 *
 * ---- Usage example ----
 *
 *   import Select from './components/Select';
 *
 *   const [role, setRole] = useState('');
 *
 *   <Select
 *     label="Role"
 *     placeholder="Choose a role"
 *     value={role}
 *     onChange={setRole}
 *     options={[
 *       { value: 'admin', label: 'Admin' },
 *       { value: 'editor', label: 'Editor' },
 *       { value: 'viewer', label: 'Viewer' },
 *     ]}
 *     error={roleMissing ? 'Please select a role' : ''}
 *   />
 */
export default function Select({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  error = '',
}) {
  const hasError = Boolean(error);
  const selectId = React.useId();

  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field__label" htmlFor={selectId}>
          {label}
        </label>
      )}
      <select
        id={selectId}
        className={`ui-select ${hasError ? 'ui-select--error' : ''}`}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={hasError}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hasError && <p className="ui-field__error">{error}</p>}
    </div>
  );
}
