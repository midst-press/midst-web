#!/usr/bin/env bash
# The e2e suite as CI runs it: one server, built once, then the parallel-safe specs on several workers and the timing
# specs on one, with nothing else of this job running beside them (playwright.config.ts, PARALLEL_SAFE).
#
#   MIDST_E2E_PORT=<free port> tools/e2e-split.sh [playwright test options, e.g. --grep-invert "@frame-budget|@gui"]
#
# Both runs always happen; the exit status is 1 if either failed. The server's own log is printed at the end.
set -euo pipefail
port=${MIDST_E2E_PORT:?set MIDST_E2E_PORT to a free port}
workers=${MIDST_E2E_WORKERS:-4}
log=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/e2e-serve.XXXXXX")

set -m  # the server runs in its own process group, so stopping it stops the build or node child it started
npm run e2e:serve > "$log" 2>&1 &
server=$!
set +m
# shellcheck disable=SC2329  # invoked by the EXIT trap
stop() {
  kill -TERM -- "-$server" 2>/dev/null || true
  wait "$server" 2>/dev/null || true
  echo "--- e2e server log ($log)"
  cat "$log"
}
trap stop EXIT

# It answers 503 while it builds, then 200.
deadline=$((SECONDS + 300))
until curl -fsS -o /dev/null "http://127.0.0.1:$port/"; do
  kill -0 "$server" 2>/dev/null || { echo "e2e-split: the server exited before it was ready"; exit 1; }
  [ "$SECONDS" -lt "$deadline" ] || { echo "e2e-split: the server was not ready after 300 s"; exit 1; }
  sleep 1
done
echo "e2e-split: server ready on port $port after ${SECONDS} s"

export MIDST_E2E_REUSE_SERVER=1
status=0
echo "e2e-split: parallel-safe specs, $workers workers"
npx playwright test "$@" --project=parallel-safe --workers="$workers" || status=1
echo "e2e-split: timing specs, 1 worker"
npx playwright test "$@" --project=timing --workers=1 || status=1
exit "$status"
