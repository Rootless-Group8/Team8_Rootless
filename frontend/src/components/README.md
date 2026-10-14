# Shared UI Component Library

A small set of reusable React components so screens don't each build their
own buttons, inputs, and dropdowns from scratch.

## What's in here

```
ui-library/
  src/
    tokens.css              <- one source of truth for color/type/spacing
    index.js                <- import everything from here
    components/
      Button.jsx / .css
      TextInput.jsx / .css
      Select.jsx / .css
      ProgressIndicator.jsx / .css
      FormContainer.jsx / .css
      Field.css              <- shared label/error styling for inputs
```

Drop the whole `ui-library` folder into your project's `src/` directory
(or wherever your components live) and import from it — nothing else
needs to change.

## Setup

Import the library's styles once, at your app's entry point:

```js
// App.js or index.js
import './ui-library/src/index.js';
```

Then import components anywhere you need them:

```js
import { Button, TextInput, Select, ProgressIndicator, FormContainer } from './ui-library/src';
```

## Components

### Button
One component covers both primary and secondary buttons via `variant`.

```jsx
<Button label="Save changes" onClick={handleSave} />
<Button label="Cancel" variant="secondary" onClick={handleCancel} />
<Button label="Submit" type="submit" disabled={!isFormValid} />
```
States: default, hover, active, `disabled`.

### TextInput

```jsx
const [email, setEmail] = useState('');

<TextInput
  label="Email address"
  placeholder="you@example.com"
  value={email}
  onChange={setEmail}
  error={emailInvalid ? 'Enter a valid email address' : ''}
/>
```
States: default, focus, `disabled`, `error` (pass a message string to trigger it).

### Select (dropdown)

```jsx
const [role, setRole] = useState('');

<Select
  label="Role"
  placeholder="Choose a role"
  value={role}
  onChange={setRole}
  options={[
    { value: 'admin', label: 'Admin' },
    { value: 'editor', label: 'Editor' },
    { value: 'viewer', label: 'Viewer' },
  ]}
  error={roleMissing ? 'Please select a role' : ''}
/>
```
States: default, focus, `disabled`, `error`.

### ProgressIndicator

```jsx
// Determinate — you know the percentage
<ProgressIndicator label="Uploading file..." value={62} />

// Indeterminate — you don't know how long it'll take
<ProgressIndicator label="Checking your details..." />
```
States: determinate, indeterminate (animated), `disabled` (flat/paused look).

### FormContainer
A consistent card wrapper for any form — wrap your fields and a button in it.

```jsx
<FormContainer
  title="Sign in"
  description="Enter your details to continue."
  onSubmit={(e) => { e.preventDefault(); handleLogin(); }}
>
  <TextInput label="Email" value={email} onChange={setEmail} />
  <TextInput label="Password" type="password" value={password} onChange={setPassword} />
  <Button label="Sign in" type="submit" />
</FormContainer>
```

## Design tokens

All colors, fonts, and spacing live in `src/tokens.css` as CSS variables
(e.g. `--ui-color-primary`, `--ui-space-4`). Change a value there and it
updates everywhere automatically — no component hunts down hardcoded
hex codes.

## Notes for extending this later

- Every component is controlled (`value` + `onChange`), so form state
  always lives in the parent screen, not hidden inside the component.
- Error state is triggered by passing a non-empty `error` string, not a
  separate boolean, so the message and the "is invalid" flag can't drift
  out of sync.
- If you add a new component, give it its own `.jsx` + `.css` pair,
  pull shared values from `tokens.css`, and export it from `src/index.js`.
