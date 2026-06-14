#!/usr/bin/env bash
# Quick kill + restart of the local app on port 3000.
#
# The API (packages/api) serves both the JSON API and the built dashboard SPA
# on PORT (default 3000). The dashboard is served from packages/dashboard/build,
# so a fresh build is needed to see dashboard changes.
#
# Usage:
#   ./dev.sh            # rebuild dashboard, then (re)start API on :3000
#   ./dev.sh -q         # quick: skip dashboard build, just restart API
#   ./dev.sh --api-only # alias for -q
#   PORT=8080 ./dev.sh  # use a different port
set -euo pipefail

cd "$(dirname "$0")"

PORT="${PORT:-3000}"
BUILD_DASHBOARD=1
for arg in "$@"; do
  case "$arg" in
    -q|--quick|--api-only) BUILD_DASHBOARD=0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# 1. Kill anything currently listening on the port.
pids="$(lsof -ti "tcp:$PORT" || true)"
if [ -n "$pids" ]; then
  echo "→ killing process(es) on :$PORT ($pids)"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 0.5
  # Force-kill any survivors.
  pids="$(lsof -ti "tcp:$PORT" || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
else
  echo "→ nothing listening on :$PORT"
fi

# 2. Build the dashboard so the API serves the latest UI (skip with -q).
if [ "$BUILD_DASHBOARD" -eq 1 ]; then
  echo "→ building dashboard…"
  (cd packages/dashboard && bun run build)
else
  echo "→ skipping dashboard build (quick mode)"
fi

# 3. Start the API on :$PORT (with file-watch reload).
echo "→ starting API on http://localhost:$PORT"
cd packages/api
exec env PORT="$PORT" bun run --watch src/index.ts
