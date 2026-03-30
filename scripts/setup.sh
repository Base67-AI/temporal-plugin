#!/bin/bash
# SessionStart Hook: Start a session workflow and verify Temporal connectivity
#
# On session start, checks if the plugin is built, optionally auto-launches
# Temporal infrastructure, tests connectivity, and starts a long-running
# session workflow that persists for the session.
#
# Configuration:
#   TEMPORAL_AUTO_LAUNCH=false    — Set to 'false' to disable auto-start (default: true)
#   TEMPORAL_ADDRESS=host:port    — Temporal server address (default: 127.0.0.1:7233)
#                                   Set this to your Temporal Cloud or remote address
#                                   to skip local dev server and only auto-start the worker.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.logs}"
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
TEMPORAL_HOST="${TEMPORAL_ADDR%%:*}"
TEMPORAL_PORT="${TEMPORAL_ADDR##*:}"
UI_PORT="${TEMPORAL_AUTO_LAUNCH_UI_PORT:-8233}"

mkdir -p "$PLUGIN_DATA"

# Auto-install and build if needed (e.g., first run after marketplace install)
if [ ! -f "$PLUGIN_ROOT/lib/client.js" ]; then
  echo "[temporal-plugin] First run — installing dependencies and building..." >&2
  if command -v npm &>/dev/null; then
    (cd "$PLUGIN_ROOT" && npm install --no-fund --no-audit >&2 2>&1 && npm run build >&2 2>&1) || {
      echo "[temporal-plugin] Build failed — Agent calls will use native execution" >&2
      echo '{}'
      exit 0
    }
    echo "[temporal-plugin] Build complete" >&2
  else
    echo "[temporal-plugin] npm not found — cannot build. Run: cd $PLUGIN_ROOT && npm install && npm run build" >&2
    echo '{}'
    exit 0
  fi
fi

# --- Auto-launch (optional) ---
if [ "${TEMPORAL_AUTO_LAUNCH:-true}" = "true" ]; then
  echo "[temporal-plugin] Auto-launch enabled" >&2

  # Check if Temporal server is already reachable (Temporal Cloud, remote, or already running locally)
  if nc -z "$TEMPORAL_HOST" "$TEMPORAL_PORT" 2>/dev/null; then
    echo "[temporal-plugin] Temporal server already reachable at $TEMPORAL_ADDR — skipping server launch" >&2
  else
    # No server reachable — start local dev server
    echo "[temporal-plugin] Starting local Temporal dev server..." >&2

    if ! command -v temporal &>/dev/null; then
      echo "[temporal-plugin] 'temporal' CLI not found — install from https://docs.temporal.io/cli" >&2
      echo "[temporal-plugin] Or set TEMPORAL_ADDRESS to point to an existing Temporal server" >&2
      echo '{}'
      exit 0
    fi

    temporal server start-dev \
      --port "$TEMPORAL_PORT" \
      --ui-port "$UI_PORT" \
      --log-format json \
      > "$PLUGIN_DATA/temporal-server.log" 2>&1 &

    TEMPORAL_SERVER_PID=$!
    echo "$TEMPORAL_SERVER_PID" > "$PLUGIN_DATA/temporal-server.pid"
    echo "[temporal-plugin] Local dev server started (PID $TEMPORAL_SERVER_PID)" >&2

    # Wait for server to be ready (max 15s)
    for i in $(seq 1 30); do
      if nc -z "$TEMPORAL_HOST" "$TEMPORAL_PORT" 2>/dev/null; then
        echo "[temporal-plugin] Dev server ready after ~$((i / 2))s" >&2
        break
      fi
      if [ "$i" -eq 30 ]; then
        echo "[temporal-plugin] Dev server failed to start within 15s — falling back to native execution" >&2
        kill "$TEMPORAL_SERVER_PID" 2>/dev/null || true
        rm -f "$PLUGIN_DATA/temporal-server.pid"
        echo '{}'
        exit 0
      fi
      sleep 0.5
    done
  fi

  # Start worker if not already running (works with any Temporal server: local, Cloud, remote)
  WORKER_PID_FILE="$PLUGIN_DATA/temporal-worker.pid"
  WORKER_RUNNING=false
  if [ -f "$WORKER_PID_FILE" ]; then
    OLD_PID=$(cat "$WORKER_PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
      WORKER_RUNNING=true
      echo "[temporal-plugin] Worker already running (PID $OLD_PID)" >&2
    fi
  fi

  if [ "$WORKER_RUNNING" = "false" ]; then
    echo "[temporal-plugin] Starting worker..." >&2
    TEMPORAL_ADDRESS="$TEMPORAL_ADDR" node "$PLUGIN_ROOT/lib/worker.js" \
      > "$PLUGIN_DATA/temporal-worker.log" 2>&1 &

    WORKER_PID=$!
    echo "$WORKER_PID" > "$WORKER_PID_FILE"
    echo "[temporal-plugin] Worker started (PID $WORKER_PID)" >&2

    # Brief pause to let worker connect
    sleep 1
  fi
fi

# --- Connectivity check ---
if ! perl -e 'alarm 2; exec @ARGV' node -e "
  const { Connection } = require('$PLUGIN_ROOT/node_modules/@temporalio/client');
  Connection.connect({ address: '$TEMPORAL_ADDR' })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
" 2>/dev/null; then
  echo "[temporal-plugin] Temporal server not reachable at $TEMPORAL_ADDR — Agent calls will use native execution"
  echo '{}'
  exit 0
fi

echo "[temporal-plugin] Connected to Temporal at $TEMPORAL_ADDR" >&2

# --- Start session workflow ---
SESSION_WF_FILE="$PLUGIN_DATA/session-workflow-id"
SESSION_WF_ID="session-$(date +%s)-$(head -c 4 /dev/urandom | xxd -p)"

RESULT=$(cd "$PLUGIN_ROOT" && TEMPORAL_ADDRESS="$TEMPORAL_ADDR" node lib/client.js start-session \
  --workflow-id "$SESSION_WF_ID" \
  --cwd "$(pwd)" 2>&1) || {
  echo "[temporal-plugin] Failed to start session workflow — Agent calls will use native execution" >&2
  echo '{}'
  exit 0
}

# Persist workflow ID for PreToolUse and Stop hooks
echo "$SESSION_WF_ID" > "$SESSION_WF_FILE"
echo "[temporal-plugin] Session workflow started: $SESSION_WF_ID" >&2
echo "[temporal-plugin] Hooks registered: PreToolUse(Agent), PostToolUse(Agent), Stop" >&2
echo '{}'
