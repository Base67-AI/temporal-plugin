#!/bin/bash
# PreToolUse Hook: Intercept Agent tool calls and route through Temporal
#
# This hook transparently redirects Agent tool invocations to Temporal workflows.
# If Temporal is not available, it passes through silently (graceful fallback).

set -euo pipefail

# Plugin root (set by Claude Code plugin system, or fallback to script dir)
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

# Read hook input from stdin (JSON with tool_name, tool_input, etc.)
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only intercept Agent tool calls
if [ "$TOOL_NAME" != "Agent" ]; then
  echo '{}'
  exit 0
fi

# Check if Temporal is built
TEMPORAL_CLIENT="$PLUGIN_ROOT/lib/client.js"
if [ ! -f "$TEMPORAL_CLIENT" ]; then
  # Temporal not built — pass through to native Agent tool
  echo '{}'
  exit 0
fi

# Quick health check: can we reach the Temporal server?
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
if ! timeout 2 node -e "
  const { Connection } = require('$PLUGIN_ROOT/node_modules/@temporalio/client');
  Connection.connect({ address: '$TEMPORAL_ADDR' })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
" 2>/dev/null; then
  # Temporal server not running — pass through
  echo '{}'
  exit 0
fi

# Extract Agent tool parameters
PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // empty')
DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "agent-session"')
MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // empty')
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')
RUN_BG=$(echo "$INPUT" | jq -r '.tool_input.run_in_background // "false"')

# Generate unique workflow ID
WORKFLOW_ID="agent-$(date +%s)-$(head -c 4 /dev/urandom | xxd -p)"

# Build client args
CLIENT_ARGS=(
  "start-agent"
  "--workflow-id" "$WORKFLOW_ID"
  "--prompt" "$PROMPT"
  "--description" "$DESCRIPTION"
)

if [ -n "$MODEL" ]; then
  CLIENT_ARGS+=("--model" "$MODEL")
fi

if [ -n "$SUBAGENT_TYPE" ]; then
  CLIENT_ARGS+=("--subagent-type" "$SUBAGENT_TYPE")
fi

if [ "$RUN_BG" = "true" ]; then
  CLIENT_ARGS+=("--background" "true")
fi

# Execute via Temporal client
RESULT=$(cd "$PLUGIN_ROOT" && TEMPORAL_ADDRESS="$TEMPORAL_ADDR" node lib/client.js "${CLIENT_ARGS[@]}" 2>&1) || {
  # If Temporal execution fails, pass through to native Agent tool
  echo '{}' >&2
  echo '{}'
  exit 0
}

# Return the result — replaces the Agent tool's normal execution
echo "$RESULT"
