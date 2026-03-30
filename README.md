# Temporal Plugin for Claude Code

Durable workflow orchestration for Claude Code sub-agents via [Temporal.io](https://temporal.io). Transparently intercepts Agent tool calls and routes them through Temporal workflows with retry, heartbeating, and full observability.

## Install from Marketplace

```
/plugin marketplace add Base67-AI/temporal-plugin
```

Or load locally:

```bash
claude --plugin-dir /path/to/temporal-plugin
```

## Quick Start

```bash
# 1. Clone this repo
git clone https://github.com/Base67-AI/temporal-plugin.git
cd temporal-plugin

# 2. Install and build
npm install && npm run build

# 3. Start with auto-launch (starts Temporal server + worker automatically)
TEMPORAL_AUTO_LAUNCH=true claude --plugin-dir .
```

Or manage infrastructure manually:

```bash
# 3. Start Temporal server (local dev)
temporal server start-dev

# 4. Start the worker (in another terminal)
npm run worker

# 5. Load in Claude Code
claude --plugin-dir .
```

Once loaded, all Agent tool calls are automatically routed through Temporal workflows. If Temporal is unavailable, calls fall back to native execution with zero disruption.

## How It Works

```
SessionStart hook
  -> Starts a session workflow (lives for entire Claude session)
  -> Optionally auto-launches Temporal server + worker

Agent tool call (unchanged from skill perspective)
  -> PreToolUse hook intercepts
    -> Sends task to session workflow via Temporal Update
      -> Activity spawns Claude Code CLI session
        -> Session runs with full tools/skills/file access
      <- Result returned
    <- Hook returns result to skill
  -> Skill continues normally

Stop hook
  -> Shuts down session workflow
  -> Kills auto-launched processes (if any)
```

## Auto-Launch

Set `TEMPORAL_AUTO_LAUNCH=true` to have the plugin automatically manage infrastructure when the Claude session begins, and clean it up when it ends.

**Works with any Temporal backend:**

```bash
# Local dev server (auto-starts temporal server + worker)
TEMPORAL_AUTO_LAUNCH=true claude --plugin-dir .

# Temporal Cloud (only auto-starts worker, connects to your cloud namespace)
TEMPORAL_ADDRESS=my-namespace.tmprl.cloud:7233 TEMPORAL_AUTO_LAUNCH=true claude --plugin-dir .

# Any remote Temporal server (only auto-starts worker)
TEMPORAL_ADDRESS=temporal.mycompany.com:7233 TEMPORAL_AUTO_LAUNCH=true claude --plugin-dir .
```

| Env Var | Default | Purpose |
|---------|---------|---------|
| `TEMPORAL_AUTO_LAUNCH` | `true` | Auto-start worker and local dev server (set `false` to disable) |
| `TEMPORAL_ADDRESS` | `127.0.0.1:7233` | Temporal server address |
| `TEMPORAL_AUTO_LAUNCH_UI_PORT` | `8233` | Temporal UI port (local dev server only) |

When auto-launch is enabled:
- If `TEMPORAL_ADDRESS` is already reachable (Cloud, remote, or local), **only the worker** is started
- If nothing is listening, a **local dev server** is started automatically
- Logs are written to `$CLAUDE_PLUGIN_DATA/temporal-server.log` and `temporal-worker.log`
- All auto-launched processes are cleaned up when the session ends

## Observability

- **Temporal UI:** http://localhost:8233 -- full workflow execution history
- **Queries:** Real-time `currentStage` and `pipelineStatus` via Temporal queries
- **Audit log:** `$CLAUDE_PLUGIN_DATA/agent-executions.jsonl` -- local execution trail

## Commands

| Command | Purpose |
|---------|---------|
| `npm run worker` | Start the Temporal worker |
| `npm run client start-session` | Start a session workflow |
| `npm run client send-task -- --workflow-id ... --prompt "..."` | Send a task to a session |
| `npm run client shutdown-session -- --workflow-id ...` | Shut down a session workflow |
| `npm run client start-agent -- --prompt "..."` | Start a single agent session (legacy) |
| `npm run client start-pipeline -- --definition @pipeline.json` | Start a multi-step pipeline |
| `npm run client status <workflow-id>` | Query workflow status |
| `npm run client cancel <workflow-id>` | Cancel a running workflow |
| `npm run client list` | List recent workflows |

## Skills

| Skill | Description |
|-------|-------------|
| `/temporal-orchestrate` | Run single agents or multi-step pipelines |
| `/temporal-pipeline` | Interactive pipeline builder with validation |
| `/temporal-status` | Check workflow status and history |
| `/temporal-cloud` | Troubleshoot Temporal Cloud connections |
| `/temporal-developer` | Temporal development patterns and reference |

## Documentation

| Guide | Audience | Description |
|-------|----------|-------------|
| [Getting Started](docs/getting-started.md) | New users | 5-minute setup walkthrough |
| [Architecture](docs/architecture.md) | Developers | How the plugin works internally |
| [Configuration](docs/configuration.md) | All users | Environment variables and tuning |
| [Pipelines](docs/pipelines.md) | All users | Build multi-step agent workflows |
| [Troubleshooting](docs/troubleshooting.md) | All users | Common issues and fixes |

## Requirements

- Node.js >= 20
- [Temporal CLI](https://docs.temporal.io/cli) (for `temporal server start-dev`, or use auto-launch)
- `claude` CLI in PATH

## License

MIT
