#!/usr/bin/env bash
# Polls the production /health endpoint until it reports the expected commit.
#
# Usage: wait-for-health.sh <base-url> <expected-commit-sha> [timeout-seconds]
#
# Succeeds only when /health returns status "ok" AND its "commit" field starts
# with the expected SHA, so an old instance that is still serving traffic while
# the new build finishes does not count as a successful deploy.
#
# Pass "none" as the expected SHA when deploying a commit from before /health
# reported its commit (used by rollbacks). It then succeeds when /health returns
# status "ok" with no commit field, which only the older version does.
set -euo pipefail

BASE_URL="${1:?base url required}"
EXPECTED_SHA="${2:?expected commit sha required}"
TIMEOUT="${3:-600}"
INTERVAL=15

BASE_URL="${BASE_URL%/}"
deadline=$((SECONDS + TIMEOUT))
attempt=0

echo "Waiting up to ${TIMEOUT}s for ${BASE_URL}/health to report commit ${EXPECTED_SHA:0:7}..."

while [ "$SECONDS" -lt "$deadline" ]; do
  attempt=$((attempt + 1))
  body="$(curl -sS --max-time 10 "${BASE_URL}/health" 2>/dev/null || true)"
  status="$(printf '%s' "$body" | jq -r '.status // empty' 2>/dev/null || true)"
  commit="$(printf '%s' "$body" | jq -r '.commit // empty' 2>/dev/null || true)"

  if [ "$EXPECTED_SHA" = "none" ]; then
    if [ "$status" = "ok" ] && [ -z "$commit" ]; then
      echo "Healthy on attempt ${attempt}: a version without commit reporting is live."
      exit 0
    fi
  elif [ "$status" = "ok" ] && [ -n "$commit" ] && [[ "$commit" == "$EXPECTED_SHA"* ]]; then
    echo "Healthy on attempt ${attempt}: commit ${commit:0:7} is live."
    exit 0
  fi

  echo "Attempt ${attempt}: status='${status:-none}' commit='${commit:0:7}' (waiting for ${EXPECTED_SHA:0:7})"
  sleep "$INTERVAL"
done

echo "::error::Timed out after ${TIMEOUT}s. The new version never reported healthy at ${BASE_URL}/health."
echo "Check the deploy logs in the Render dashboard. If production is unhealthy, run the 'Backend rollback' workflow."
exit 1
