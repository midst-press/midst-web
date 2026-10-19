#!/usr/bin/env bash
# The e2e suite as CI runs it: one server, built once, then the parallel-safe specs on several workers and the timing
# specs on one, with nothing else of this job running beside them (playwright.config.ts, PARALLEL_SAFE).
#
#   [MIDST_E2E_PORT=<free port>] tools/e2e-split.sh [playwright test options, e.g. --grep-invert "@frame-budget|@gui"]
#
# Both runs always happen; the exit status is 1 if either failed. The server's own log is printed at the end. Each run
# keeps its own results and HTML report (test-results/<project>, playwright-report/<project>), so a failure's trace
# from the first run survives the second. Options that leave either project with no tests fail that run ("No tests
# found"), so pass whole-suite filters, not a single spec file.
set -euo pipefail
# Unset, a free port is picked, as CI does: the 8099 default in e2e:serve and playwright.config.ts can be taken.
port=${MIDST_E2E_PORT:-$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')}
export MIDST_E2E_PORT="$port"
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
until curl -fs -o /dev/null "http://127.0.0.1:$port/"; do  # quiet: it refuses or answers 503 until built
  kill -0 "$server" 2>/dev/null || { echo "e2e-split: the server exited before it was ready"; exit 1; }
  [ "$SECONDS" -lt "$deadline" ] || { echo "e2e-split: the server was not ready after 300 s"; exit 1; }
  sleep 1
done
# The 200 must be OUR server's. With reuse on, Playwright no longer refuses a port someone else holds, and serve-local
# binds before it builds and exits at once if the port is taken, so a foreign server answering means ours is gone
# (silas-397300f6, review of #221).
kill -0 "$server" 2>/dev/null || { echo "e2e-split: the port answered, but our server had exited (port taken?)"; exit 1; }
grep -q "bound to 127.0.0.1:$port " "$log" || { echo "e2e-split: the server never said it bound 127.0.0.1:$port"; exit 1; }
echo "e2e-split: server ready on port $port after ${SECONDS} s"

export MIDST_E2E_REUSE_SERVER=1
status=0
echo "e2e-split: parallel-safe specs, $workers workers"
PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/parallel-safe \
  npx playwright test "$@" --project=parallel-safe --workers="$workers" --output=test-results/parallel-safe || status=1
echo "e2e-split: timing specs, 1 worker"
PLAYWRIGHT_HTML_OUTPUT_DIR=playwright-report/timing \
  npx playwright test "$@" --project=timing --workers=1 --output=test-results/timing || status=1
exit "$status"
