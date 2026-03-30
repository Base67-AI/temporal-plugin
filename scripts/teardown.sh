#!/bin/bash
# Stop Hook: Shut down the session workflow gracefully
#
# Sends a shutdown signal to the long-running session workflow
# so it completes cleanly in Temporal's history.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.logs}"
SESSION_WF_FILE="$PLUGIN_DATA/session-workflow-id"

if [ -f "$SESSION_WF_FILE" ]; then
  SESSION_WF_ID=$(cat "$SESSION_WF_FILE")
  TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"

  echo "[temporal-plugin] Shutting down session workflow: $SESSION_WF_ID" >&2
  cd "$PLUGIN_ROOT" && TEMPORAL_ADDRESS="$TEMPORAL_ADDR" node lib/client.js shutdown-session \
    --workflow-id "$SESSION_WF_ID" 2>/dev/null || true

  rm -f "$SESSION_WF_FILE"
fi

echo '{}'
