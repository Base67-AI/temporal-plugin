#!/bin/bash
# PostToolUse Hook: Log Agent tool results for observability
#
# Appends structured events to a log file whenever an Agent tool call completes.
# This provides a local audit trail alongside Temporal's execution history.

set -euo pipefail

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$PLUGIN_ROOT/.logs}"

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only log Agent tool results
if [ "$TOOL_NAME" != "Agent" ]; then
  echo '{}'
  exit 0
fi

DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "unknown"')
echo "[temporal-plugin] PostToolUse logging Agent result: $DESCRIPTION" >&2

LOG_DIR="$PLUGIN_DATA"
LOG_FILE="$LOG_DIR/agent-executions.jsonl"

mkdir -p "$LOG_DIR"

# Extract relevant info
DESCRIPTION=$(echo "$INPUT" | jq -r '.tool_input.description // "unknown"')
MODEL=$(echo "$INPUT" | jq -r '.tool_input.model // "default"')
SUBAGENT_TYPE=$(echo "$INPUT" | jq -r '.tool_input.subagent_type // "general"')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Append log entry
echo "{\"ts\":\"$TIMESTAMP\",\"description\":\"$DESCRIPTION\",\"model\":\"$MODEL\",\"subagentType\":\"$SUBAGENT_TYPE\"}" >> "$LOG_FILE"

echo '{}'
