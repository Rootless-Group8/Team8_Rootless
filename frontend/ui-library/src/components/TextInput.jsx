import React from 'react';
import './TextInput.css';

/**
 * TextInput
 * A labeled text field with built-in disabled and error states.
 *
 * Props:
 *  - label        (string)    Label shown above the field
 *  - value        (string, required)   Current value (controlled)
 *  - onChange     (function, required) Called with the new string value
 *  - placeholder  (string)    Placeholder text
 *  - disabled     (bool)      Disables the field
 *  - error        (string)    Error message; when set, field shows invalid state
 *  - type         (string)    Input type, e.g. 'text', 'email', 'password'. Default: 'text'
 *
 * ---- Usage example ----
 *
 *   import TextInput from './components/TextInput';
 *
 *   const [email, setEmail] = useState('');
 *
 *   <TextInput
 *     label="Email address"
 *     placeholder="you@example.com"
 *     value={email}
 *     onChange={setEmail}
 *     error={emailInvalid ? 'Enter a valid email address' : ''}
 *   />
 */
export default function TextInput({
  label,
  value,
  onChange,
  placeholder = '',
  disabled = false,
  error = '',
  type = 'text',
}) {
  const hasError = Boolean(error);
  const inputId = React.useId();

  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        type={type}
        className={`ui-input ${hasError ? 'ui-input--error' : ''}`}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={hasError}
      />
      {hasError && <p className="ui-field__error">{error}</p>}
    </div>
  );
}
