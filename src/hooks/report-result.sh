#!/bin/bash
# PostToolUse Hook: Log Agent tool results for observability
#
# Appends structured events to a log file whenever an Agent tool call completes.
# This provides a local audit trail alongside Temporal's execution history.
#
# Registered in .claude/settings.json:
# {
#   "hooks": {
#     "PostToolUse": [{
#       "matcher": "Agent",
#       "command": "bash /home/user/base67/temporal/src/hooks/report-result.sh"
#     }]
#   }
# }

set -euo pipefail

INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')

# Only log Agent tool results
if [ "$TOOL_NAME" != "Agent" ]; then
  echo '{}'
  exit 0
fi

LOG_DIR="/home/user/base67/temporal/.logs"
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
