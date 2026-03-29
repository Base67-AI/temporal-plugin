#!/bin/bash
# SessionStart Hook: Ensure the Temporal plugin is built and ready
#
# On session start, checks if the plugin needs building and if the
# Temporal server is reachable. Reports status without blocking.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Check if built
if [ ! -f "$PLUGIN_ROOT/lib/client.js" ]; then
  echo "[temporal-plugin] Not built. Run: cd $PLUGIN_ROOT && npm install && npm run build"
  echo '{}'
  exit 0
fi

# Check if Temporal server is reachable
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
if perl -e 'alarm 2; exec @ARGV' node -e "
  const { Connection } = require('$PLUGIN_ROOT/node_modules/@temporalio/client');
  Connection.connect({ address: '$TEMPORAL_ADDR' })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
" 2>/dev/null; then
  echo "[temporal-plugin] Connected to Temporal at $TEMPORAL_ADDR"
else
  echo "[temporal-plugin] Temporal server not reachable at $TEMPORAL_ADDR — Agent calls will use native execution"
fi

echo "[temporal-plugin] Hooks registered: PreToolUse(Agent), PostToolUse(Agent)" >&2
echo '{}'
