#!/bin/bash
# PreToolUse Hook: Intercept Agent tool calls and route through the session workflow
#
# Instead of creating a new workflow per Agent call, this hook sends the task
# to the long-running session workflow via the `send-task` client command.
# If no session workflow is running, it falls back to native execution.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.logs}"

# Read hook input from stdin (JSON with tool_name, tool_input, etc.)
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only intercept Agent tool calls
if [ "$TOOL_NAME" != "Agent" ]; then
  echo '{}'
  exit 0
fi

DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "unknown"')
echo "[temporal-plugin] PreToolUse intercepted Agent call: $DESCRIPTION" >&2

# Check if Temporal client is built
TEMPORAL_CLIENT="$PLUGIN_ROOT/lib/client.js"
if [ ! -f "$TEMPORAL_CLIENT" ]; then
  echo "[temporal-plugin] Temporal not built — falling back to native execution" >&2
  echo '{}'
  exit 0
fi

# Read session workflow ID (persisted by setup.sh on SessionStart)
SESSION_WF_FILE="$PLUGIN_DATA/session-workflow-id"
if [ ! -f "$SESSION_WF_FILE" ]; then
  echo "[temporal-plugin] No session workflow found — falling back to native execution" >&2
  echo '{}'
  exit 0
fi

SESSION_WF_ID=$(cat "$SESSION_WF_FILE")

echo "[temporal-plugin] Routing Agent call through session workflow: $SESSION_WF_ID" >&2

# Extract Agent tool parameters
PROMPT=$(echo "$INPUT" | jq -r '.tool_input.prompt // empty')
DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "agent-session"')
MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // empty')
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // empty')

# Build client args for send-task
CLIENT_ARGS=(
  "send-task"
  "--workflow-id" "$SESSION_WF_ID"
  "--prompt" "$PROMPT"
  "--description" "$DESCRIPTION"
)

if [ -n "$MODEL" ]; then
  CLIENT_ARGS+=("--model" "$MODEL")
fi

if [ -n "$SUBAGENT_TYPE" ]; then
  CLIENT_ARGS+=("--subagent-type" "$SUBAGENT_TYPE")
fi

# Execute via Temporal client — blocks until the activity completes within the session workflow
TEMPORAL_ADDR="${TEMPORAL_ADDRESS:-127.0.0.1:7233}"
RESULT=$(cd "$PLUGIN_ROOT" && TEMPORAL_ADDRESS="$TEMPORAL_ADDR" node lib/client.js "${CLIENT_ARGS[@]}" 2>&1) || {
  echo "[temporal-plugin] send-task failed — falling back to native execution" >&2
  echo '{}'
  exit 0
}

# Return the result — replaces the Agent tool's normal execution
echo "$RESULT"
