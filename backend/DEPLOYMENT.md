# Rootless Backend: Deployment Guide

This guide explains how the Express API is tested, built and deployed to
production, and how any teammate can release or roll back.

## How the pipeline works

| Event | What happens |
| --- | --- |
| Push to any branch, or a pull request | GitHub Actions installs dependencies and runs the Jest suite. Firebase Admin is mocked inside the tests, so no credentials are used. A PR from a branch in this repo is tested once, by its push; PRs from forks are tested on the pull request. |
| Pull request merged into `main` | The same tests run on `main`. If they pass, the `deploy` job triggers a Render deploy of that exact commit, then polls `/health` until the new commit reports healthy. |
| Manual: "Backend rollback" workflow | Redeploys a commit you choose (see Rolling back). |

Files involved:

- `.github/workflows/backend.yml`: tests on every push and PR, deploys on `main`
- `.github/workflows/backend-rollback.yml`: manual rollback
- `.github/scripts/wait-for-health.sh`: post-deploy health check
- `backend/src/app.js`: exposes `GET /health`

The health endpoint is public and returns `status`, the deployed `commit`
(Render sets `RENDER_GIT_COMMIT`), and `uptimeSeconds`. The pipeline only
treats a deploy as successful when the live `commit` matches the commit it
just deployed.

Render keeps the old version serving traffic until the new one passes its own
health check, so a failed build or a crashing start does not take production
down.

## One-time setup

### 1. Firebase (production project `daab-fcc5c`)

The deployed API talks to the production Firebase project, so all of these
must already exist in the Firebase Console:

- Authentication (Email/Password enabled)
- Cloud Firestore database (create it once; a missing database shows up as
  `user_sync_failed` on sign-in)
- Storage bucket (needs the Blaze plan)
- Realtime Database (used by the eligibility, deadline and cost-of-living routes)

Generate a service account key: Project Settings > Service Accounts >
Generate new private key. Treat the file like a password and never commit it.
To get it onto one line (optional, both GitHub and Render also accept the
pretty-printed file):

```bash
jq -c . path/to/serviceAccountKey.json | pbcopy
```

### 2. Render web service

Create a new Web Service from this GitHub repo with these settings:

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/health` |
| Auto-Deploy | **Off** (GitHub Actions deploys after the tests pass) |
| Instance type | A paid, always-on instance. The reminder scheduler runs inside the server process, and free instances spin down when idle. |

Environment variables (Render > Environment). Render injects `PORT` itself, so
do not set it.

| Name | Value |
| --- | --- |
| `NODE_VERSION` | `20` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON |
| `FIREBASE_DATABASE_URL` | Realtime Database URL from the Firebase Console |
| `FIREBASE_STORAGE_BUCKET` | `daab-fcc5c.firebasestorage.app` |
| `INTERNAL_API_KEY` | A long random string (`openssl rand -hex 32`) |

Then copy the **Deploy Hook** URL from the service's Settings page. It contains
a secret key, so treat it like a password.

### 3. GitHub

In the repo: Settings > Environments > New environment, named exactly
`production`. Do not add required reviewers if you want deploys to stay fully
automatic.

Add this as an **environment secret** on `production`:

| Secret | Value |
| --- | --- |
| `RENDER_DEPLOY_HOOK_URL` | The Deploy Hook URL from Render |

Add this as an **environment variable** (not a secret) on `production`:

| Variable | Value |
| --- | --- |
| `PRODUCTION_URL` | The service URL, for example `https://rootless-api.onrender.com` |

Firebase credentials go only in Render, never in GitHub. The deploy job checks
that both values above are set before it triggers anything, so a missing value
fails fast with a clear message.

Recommended: Settings > Branches > add a rule for `main` that requires a pull
request and requires the **Test** check to pass. That way nothing reaches
production without passing Jest.

## Releasing

1. Open a pull request. The **Test** check runs automatically.
2. Merge when it is green.
3. Open the Actions tab and watch "Backend CI/CD". The deploy job finishes
   when `/health` reports the new commit.
4. Confirm: `curl https://<your-service>/health` should show `"status":"ok"`
   and the commit you just merged.

No manual steps are needed after the merge.

## Rolling back

Find the last good commit first: `git log origin/main --oneline`, or look at
the last green run of "Backend CI/CD" in the Actions tab.

**Fastest: Render dashboard.** Open the service, go to Deploys, click
**Rollback** on the last good deploy, and confirm. Render reuses the earlier
build, so there is no rebuild.

**From GitHub:** Actions > "Backend rollback" > Run workflow, paste the commit
SHA, and run. This rebuilds that commit, so it takes about as long as a normal
deploy, and it waits for `/health` to report that commit. Only commits on
`main` are accepted. Commits from before this pipeline existed do not report a
commit in `/health`; for those, the workflow shows a warning and instead waits
for a healthy response without a commit field.

After a rollback, `main` still contains the bad change, and the next merge
will deploy it again. Fix it forward with a revert pull request:

```bash
git revert <bad-commit-sha>
git push origin my-revert-branch   # then open a PR and merge
```

## Rotating secrets

1. Create the new value (new service account key, new `INTERNAL_API_KEY`, or
   Regenerate Hook in Render).
2. Update it in Render. For a regenerated deploy hook, also update
   `RENDER_DEPLOY_HOOK_URL` in the GitHub `production` environment.
3. Redeploy: re-run the latest "Backend CI/CD" run, or use Manual Deploy in
   Render. Render only picks up new environment variables on a deploy.
4. For a leaked service account key, also delete the old key in the Google
   Cloud Console (IAM > Service Accounts > Keys).

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Deploy job fails with "X is not set" | `RENDER_DEPLOY_HOOK_URL` or `PRODUCTION_URL` is missing from the `production` environment |
| Render deploy hook returns 401 or 404 | The hook URL is wrong or was regenerated. Copy the current one into `RENDER_DEPLOY_HOOK_URL` |
| Health check times out | Check the Render deploy logs. Common causes: invalid `FIREBASE_SERVICE_ACCOUNT_JSON`, or a missing `FIREBASE_DATABASE_URL` (the server needs it at startup) |
| `/health` is ok but shows an old commit | The new deploy has not gone live yet or failed its health check; Render keeps serving the old version until it passes |
| `user_sync_failed` on sign-in | The Firestore database was never created in the production Firebase project |

## Not covered by this pipeline

- The React frontend is not deployed here.
- CORS is currently open to all origins (`cors()` in `app.js`). Restrict it to
  the production frontend URL once that exists.
