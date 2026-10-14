# Coding Standards for Rootless

Team 8

## Related docs

- **SETUP_AND_VERIFICATION.md** — how to get frontend + backend running
  from scratch, required env vars, Firebase console setup, and the
  checklist to run after every merge to confirm things actually work
  (not just that they compile).
- **ARCHITECTURE_NOTES.md** — a running log of real bugs found and fixed
  through that verification process, plus open architecture questions
  that need team input rather than one person's unilateral fix.

## Introduction

- This document lists the coding standards and conventions for the Rootless project, built with React, Node.js/Express, and Firebase. Following these keeps the code consistent and saves us from figuring out the pattern from old files every sprint.
- Languages: JavaScript (including JSX) for the frontend, the backend, and the scraper. Python is only used for the visa data seed scripts. Don't introduce another language without checking with the team first.
- If a rule here doesn't match what's in the repo, or you think a rule should change, update this file in a PR so everyone sees it.

## General Principles

- Readability and Clarity: Code should be easy to understand. Pick clear over clever.
- Consistency: Follow the pattern that's already in the repo. If you want to change a pattern, change it for everyone in its own PR.
- Simplicity: Keep things simple and flat. Don't add a new folder or abstraction without a real reason.
- Documentation: Comment where it helps, and write down any new structure decision in this file.

## Project Structure

### Main Folders

- `frontend/` holds the React app.
- `backend/` holds the Express API.
- New folders go inside `frontend/` or `backend/`, not at the repo root.
- Keep nesting shallow. If a folder only has one or two files, it probably doesn't need to exist yet.

### Where Code Lives

- `components/`: reusable pieces that get dropped into screens.
  - Example: ChecklistItem.jsx
- `pages/`: full screens that have their own route.
  - Example: VisaExplorerPage.jsx
- `auth/`: login, signup, auth context, and protected route logic.
- `firebase/`: Firebase config and helper functions that talk to Firebase.
- `backend/src/`: routes, services, middleware, and their tests.
- `backend/scraper/`: the scraper pipeline. Each country's scraper goes in `sources/`.
- Components should get their data through props. Fetching data happens in pages or hooks.

## Naming Conventions

### Files and Folders

- Pages: PascalCase ending in `Page.jsx`.
  - Example: ChecklistPage.jsx
- Reusable components: PascalCase with no suffix.
  - Example: FilterBar.jsx
- One component per file, and the file name matches the component name.
- Component stylesheets use the same name as the component.
  - Example: FilterBar.css
- Hooks and helpers: camelCase. Hooks start with `use`.
  - Example: useChecklist.js
- Backend files: camelCase with a suffix for what they are.
  - Example: eligibilityService.js, eligibilityRoutes.js
- Tests: named after the feature, with `.test.js`.
  - Example: eligibility.test.js
- Folders are lowercase with no spaces.

### Code

- Variables and functions: camelCase.
  - Example: visaResults, getChecklist
- Components and classes: PascalCase.
- Constants: all uppercase with underscores.
  - Example: MAX_DOCUMENT_SIZE
- Booleans: start with `is`, `has`, `can`, or `should`.
  - Example: isLoading, hasDeadline
- Event handler props: start with `on`.
  - Example: onSubmit, onUpload
- Handler functions inside a component: start with `handle`.
  - Example: handleSubmit, which gets passed down as onSubmit
- Firebase fields: match what is already in the database (like `countryVisaPrograms`). Don't rename fields in code without changing the data.
- Avoid one-letter names except for short loop indexes or tiny callbacks.

## Formatting and Style

- Use 2 spaces for indentation, not tabs.
- Use semicolons and single quotes.
- Always use braces for `if`, `else`, and loops, even when the body is one statement.
- Use `const` by default, `let` only when reassigning, and never `var`.
- Keep lines under about 100 characters. Break lines sensibly if needed.
- Don't leave `console.log` or commented-out code in a PR.

### CSS

- Use the shared CSS variables for colors, spacing, and fonts instead of hard-coding values.
- If a variable you need doesn't exist, add it to the shared tokens instead of hard-coding a one-off.
- Class names use kebab-case.

### Python (seed scripts)

- Follow PEP 8: 4 spaces for indentation, snake_case for variables and functions, PascalCase for classes, and UPPER_SNAKE_CASE for constants.
- Keep Python scripts in their own folder inside `backend/` so they stay separate from the Express code.
- Seed scripts only load manually researched data into Firebase. They don't scrape live sources.

## Comments and Documentation

- Put a comment above each component that lists its props and what they're for, including which ones are optional.
  - Example: `onToggle(id)`: called when the checkbox is clicked
- Inline comments should explain why something is done, not what the code already says.
- Leave a comment for workarounds, placeholders, and known limitations.
- Mark temporary code with `// TEMP:` so it's easy to find later.

## Error Handling

- Backend routes should return proper HTTP status codes and a short error message.
- Don't swallow errors silently.
- Handle errors where you can actually do something about them instead of at every level.
- On the frontend, show the user something when a request fails instead of a blank screen.

## Version Control

### Branches

- `frontend/` and `backend/` are folders, not branches. Every ticket branch is created off `main`.
- Create the branch from the Jira ticket using the auto-branch button so the ticket key is in the name.
  - Example: TM08-34-build-eligibility-filter
- One branch per ticket. If a ticket touches both frontend and backend, say so in the PR.

### Commits

- Commit related changes together with a meaningful message that says what changed.
  - Example: Add destination and purpose filter to eligibility service
- Avoid messages like "fix" or "update".
- Don't commit secrets, API keys, or `.env` files.

### Pull Requests

- Open a PR (draft is fine) early so the work is visible during the sprint.
- The title starts with the Jira key.
  - Example: TM08-34: Build eligibility filter
- The description should cover what changed, how to test it, and anything the reviewer should know.
- Call out anything temporary in the description, like a temporary route, placeholder logic, mock data, or a route that isn't registered in `server.js` yet.
- If you worked around a limitation, say so in the PR and open a follow-up Jira ticket.
- If this PR is the first use of a new Firebase product in a service (Realtime Database, Storage — Firestore and Auth are already wired), confirm `firebaseAdmin.js`'s `initializeApp()` call actually has the config that product needs (`databaseURL` for `.database()`, `storageBucket` for `.storage()`), and that the matching env var is in `.env.example`. This kind of gap doesn't fail at boot or in tests that mock Firebase — it only fails the first time that specific feature is actually called, which makes it easy to merge without noticing. Run the actual server (`npm start` or `npm run dev`) and exercise the new feature, not just the test suite, before opening the PR.

## Code Reviews

- Every PR should be looked at by at least one other team member.
- Reviewers check for logic errors, whether the code follows these standards, and anything that could be simpler.

## Testing

- Write Jest tests for backend changes where practical.
- Mock the database so tests don't depend on live Firebase.
- Run the tests locally before pushing.
- Meaningful tests matter more than a high number of tests.

## Conclusion

- This document is the shared reference for how we write and organize code on Rootless. Everyone on the team should read it and confirm they agree, and any changes to it go through a normal PR.
