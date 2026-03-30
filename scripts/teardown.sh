#!/bin/bash
# Stop Hook: Shut down the session workflow and auto-launched processes
#
# Sends a shutdown signal to the long-running session workflow,
# then kills any processes we auto-launched (worker, local dev server).

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.logs}"
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"

# --- Shut down session workflow ---
SESSION_WF_FILE="$PLUGIN_DATA/session-workflow-id"
if [ -f "$SESSION_WF_FILE" ]; then
  SESSION_WF_ID=$(cat "$SESSION_WF_FILE")
  echo "[temporal-plugin] Shutting down session workflow: $SESSION_WF_ID" >&2
  cd "$PLUGIN_ROOT" && TEMPORAL_ADDRESS="$TEMPORAL_ADDR" node lib/client.js shutdown-session \
    --workflow-id "$SESSION_WF_ID" 2>/dev/null || true
  rm -f "$SESSION_WF_FILE"
fi

# --- Kill auto-launched worker ---
WORKER_PID_FILE="$PLUGIN_DATA/temporal-worker.pid"
if [ -f "$WORKER_PID_FILE" ]; then
  WORKER_PID=$(cat "$WORKER_PID_FILE")
  if kill -0 "$WORKER_PID" 2>/dev/null; then
    echo "[temporal-plugin] Stopping worker (PID $WORKER_PID)..." >&2
    kill "$WORKER_PID" 2>/dev/null || true
    # Wait briefly for graceful shutdown
    for i in $(seq 1 10); do
      kill -0 "$WORKER_PID" 2>/dev/null || break
      sleep 0.5
    done
    # Force kill if still running
    kill -0 "$WORKER_PID" 2>/dev/null && kill -9 "$WORKER_PID" 2>/dev/null || true
  fi
  rm -f "$WORKER_PID_FILE"
fi

# --- Kill auto-launched local dev server ---
SERVER_PID_FILE="$PLUGIN_DATA/temporal-server.pid"
if [ -f "$SERVER_PID_FILE" ]; then
  SERVER_PID=$(cat "$SERVER_PID_FILE")
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[temporal-plugin] Stopping local Temporal dev server (PID $SERVER_PID)..." >&2
    kill "$SERVER_PID" 2>/dev/null || true
    for i in $(seq 1 10); do
      kill -0 "$SERVER_PID" 2>/dev/null || break
      sleep 0.5
    done
    kill -0 "$SERVER_PID" 2>/dev/null && kill -9 "$SERVER_PID" 2>/dev/null || true
  fi
  rm -f "$SERVER_PID_FILE"
fi

echo '{}'
