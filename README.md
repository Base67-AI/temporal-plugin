# Temporal Plugin for Claude Code

Durable workflow orchestration for Claude Code sub-agents via [Temporal.io](https://temporal.io). Transparently intercepts Agent tool calls and routes them through Temporal workflows with retry, heartbeating, and full observability.

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/Base67-AI/temporal-plugin.git
cd temporal-plugin

# 2. Install and build
npm install && npm run build

# 3. Start Temporal server (local dev)
temporal server start-dev

# 4. Start the worker (in another terminal)
npm run worker

# 5. Load in Claude Code
claude --plugin-dir /path/to/temporal-plugin
```

Once loaded, all Agent tool calls are automatically routed through Temporal workflows. If Temporal is unavailable, calls fall back to native execution with zero disruption.

## How It Works

```
Skill calls Agent tool (unchanged)
  -> PreToolUse hook intercepts
    -> Temporal workflow starts
      -> Activity spawns Claude Code CLI session
        -> Session runs with full tools/skills/file access
      <- Result returned
    <- Hook returns result to skill
  -> Skill continues normally
```

## Observability

- **Temporal UI:** http://localhost:8233 -- full workflow execution history
- **Queries:** Real-time `currentStage` and `pipelineStatus` via Temporal queries
- **Audit log:** `$CLAUDE_PLUGIN_DATA/agent-executions.jsonl` -- local execution trail

## Commands

| Command | Purpose |
|---------|---------|
| `npm run worker` | Start the Temporal worker |
| `npm run client start-agent -- --prompt "..."` | Start a single agent session |
| `npm run client start-pipeline -- --definition @pipeline.json` | Start a multi-step pipeline |
| `npm run client status <workflow-id>` | Query workflow status |
| `npm run client cancel <workflow-id>` | Cancel a running workflow |
| `npm run client list` | List recent workflows |

## Requirements

- Node.js >= 20
- [Temporal CLI](https://docs.temporal.io/cli) (`temporal server start-dev` for local dev)
- `claude` CLI in PATH

## License

MIT
