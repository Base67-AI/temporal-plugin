#!/bin/bash
# SessionStart Hook: Start a session workflow and verify Temporal connectivity
#
# On session start, checks if the plugin is built, tests connectivity,
# and starts a long-running session workflow that persists for the session.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.logs}"

# Check if built
if [ ! -f "$PLUGIN_ROOT/lib/client.js" ]; then
  echo "[temporal-plugin] Not built. Run: cd $PLUGIN_ROOT && npm install && npm run build"
  echo '{}'
  exit 0
fi

# Check if Temporal server is reachable
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
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

# Start a session workflow that lives for the duration of this Claude session
mkdir -p "$PLUGIN_DATA"
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
