#!/usr/bin/env bash
# still_head.sh — is the commit this run was started for still the pull request's head? (midst-infra #102)
#
# The heavy jobs (build, end-to-end, coverage) run only on a PR's turn. A run queued behind others can start
# after the PR has moved on; it would then spend its time on a commit nothing will merge. So each heavy job
# asks first, and its remaining steps run only if the answer is yes. This is a second guard beside
# cancel-in-progress, which does cancel a superseded run here (run 9848, cancelled by 9850 on #200): if a
# superseded run is ever not cancelled, it stops here instead of testing a commit nothing will merge.
#
# Env:
#   GITHUB_OUTPUT  where the answer goes, as current=true or current=false
#   EVENT_NAME     github.event_name; anything but pull_request answers true without asking
#   RUN_HEAD       the head this run was started for (github.event.pull_request.head.sha)
#   PR_URL         the PR in Gitea's API (…/api/v1/repos/<owner>/<repo>/pulls/<n>)
#   TOKEN          a token that can read it
#
# Never stops a job it cannot judge: if the PR cannot be read, the job runs in full and says why.
# Exit 0 with an answer; 2 if it was called wrongly.
set -uo pipefail

[ -n "${GITHUB_OUTPUT:-}" ] || { echo "still_head.sh: GITHUB_OUTPUT is not set" >&2; exit 2; }
answer() { echo "current=$1" >> "$GITHUB_OUTPUT"; }

if [ "${EVENT_NAME:-}" != pull_request ]; then
  answer true
  exit 0
fi
for name in RUN_HEAD PR_URL TOKEN; do
  [ -n "${!name:-}" ] || { echo "still_head.sh: $name is not set" >&2; exit 2; }
done

if ! body="$(curl -fsS --max-time 20 -H "Authorization: token $TOKEN" "$PR_URL")"; then
  echo "::warning::could not read the PR from $PR_URL; running this job in full"
  answer true
  exit 0
fi
if ! now="$(printf '%s' "$body" | python3 -c 'import json, sys; print(json.load(sys.stdin)["head"]["sha"])')"; then
  echo "::warning::the PR read from $PR_URL has no head sha; running this job in full"
  answer true
  exit 0
fi
if [ "$now" != "$RUN_HEAD" ]; then
  echo "::notice::this PR's head moved from $RUN_HEAD to $now; the run for the new head judges it, so this job stops here"
  answer false
  exit 0
fi
answer true
