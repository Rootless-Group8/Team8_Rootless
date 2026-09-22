import React from 'react';
import './FormContainer.css';

/**
 * FormContainer
 * A consistent wrapper for forms: card layout, optional title/description,
 * and a submit handler so every screen doesn't reinvent form spacing.
 * Wrap your TextInput / Select / Button components as children.
 *
 * Props:
 *  - title       (string)    Optional heading shown at the top of the form
 *  - description (string)    Optional supporting text under the title
 *  - onSubmit    (function)  Called on form submit (receives the event)
 *  - children    (node)      Form fields and buttons
 *
 * ---- Usage example ----
 *
 *   import FormContainer from './components/FormContainer';
 *   import TextInput from './components/TextInput';
 *   import Button from './components/Button';
 *
 *   <FormContainer
 *     title="Sign in"
 *     description="Enter your details to continue."
 *     onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
 *   >
 *     <TextInput label="Email" value={email} onChange={setEmail} />
 *     <TextInput label="Password" type="password" value={password} onChange={setPassword} />
 *     <Button label="Sign in" type="submit" />
 *   </FormContainer>
 */
export default function FormContainer({ title, description, onSubmit, children }) {
  return (
    <form className="ui-form" onSubmit={onSubmit}>
      {title && <h2 className="ui-form__title">{title}</h2>}
      {description && <p className="ui-form__description">{description}</p>}
      <div className="ui-form__body">{children}</div>
    </form>
  );
}
