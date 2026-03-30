# Temporal Agent Orchestration

> Durable workflow orchestration for Claude Code sub-agents via Temporal.io — packaged as a Claude Code plugin.

## At a Glance

| | |
|-|-|
| **Type** | Claude Code Plugin + Infrastructure Layer |
| **Owns** | Workflow definitions, activity wrappers, hook-based Agent interception, Temporal worker/client |
| **Does NOT own** | Agent definitions, skill logic, application pipelines |
| **Users** | All layers (transparently via hook interception) |

## Architecture

A single **session workflow** starts when Claude Code launches and stays alive for the entire session. Every Agent tool call is intercepted by a PreToolUse hook and dispatched as a Temporal **activity** inside that workflow via Workflow Updates (request-response).

```
SessionStart hook (setup.sh)
  ├─ [optional] Auto-launch Temporal dev server + worker
  └─ Start sessionWorkflow → persist workflow ID

Agent tool call (intercept-agent.sh)
  └─ Read workflow ID → executeUpdate(executeAgentTask, input)
      └─ sessionWorkflow runs runClaudeSession activity
          └─ Spawns `claude` CLI → collects result
      └─ Returns ClaudeSessionResult to hook → back to caller

Stop hook (teardown.sh)
  ├─ Signal sessionWorkflow to shut down
  └─ Kill auto-launched processes (worker, dev server)
```

### Graceful Fallback

If the Temporal server or worker isn't running, every hook returns `{}` and the Agent tool executes natively. Zero disruption.

## Plugin Structure

```
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── hooks/
│   └── hooks.json               # SessionStart, PreToolUse, PostToolUse, Stop
├── skills/
│   ├── temporal-orchestrate/    # /temporal-orchestrate — run agents and pipelines
│   ├── temporal-pipeline/       # /temporal-pipeline — build pipeline definitions
│   ├── temporal-status/         # /temporal-status — check workflow status
│   ├── temporal-developer/      # /temporal-developer — Temporal dev reference
│   └── temporal-cloud/          # /temporal-cloud — Cloud troubleshooting
├── scripts/
│   ├── setup.sh                 # SessionStart: auto-launch + session workflow
│   ├── intercept-agent.sh       # PreToolUse: route Agent → session workflow
│   ├── report-result.sh         # PostToolUse: audit logging
│   └── teardown.sh              # Stop: shutdown + cleanup
├── src/
│   ├── workflows/
│   │   ├── agent-session.ts     # sessionWorkflow + legacy agentSessionWorkflow
│   │   ├── orchestrate.ts       # Multi-step pipeline with DAG execution
│   │   ├── parallel-agents.ts   # Fan-out/fan-in concurrent execution
│   │   ├── signals-queries.ts   # Shared signals, queries, and updates
│   │   └── index.ts             # Workflow exports for worker
│   ├── activities/
│   │   ├── claude-session.ts    # Core: spawns Claude CLI with heartbeating
│   │   └── file-ops.ts          # File read/write utilities
│   ├── config/
│   │   ├── retry-policies.ts    # Model-tier retry policies
│   │   └── task-queues.ts       # Queue and address constants
│   ├── client.ts                # CLI tool for workflow management
│   └── worker.ts                # Worker process (polls task queue)
├── docs/                        # Guides and reference documentation
├── CLAUDE.md                    # Claude Code context (auto-loaded)
├── package.json                 # Dependencies and scripts
└── README.md                    # User-facing quick start
```

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Session Workflow | `src/workflows/agent-session.ts` | Long-running per-session, dispatches activities via Update handler |
| Pipeline Workflow | `src/workflows/orchestrate.ts` | Multi-step with topological dependency ordering |
| Parallel Workflow | `src/workflows/parallel-agents.ts` | Fan-out/fan-in for concurrent agents |
| Claude Session Activity | `src/activities/claude-session.ts` | Spawns `claude` CLI, heartbeats every 30s |
| Retry Policies | `src/config/retry-policies.ts` | Opus: 30m/2 retries, Sonnet: 20m/3, Haiku: 10m/3 |
| Client CLI | `src/client.ts` | start-session, send-task, shutdown-session, start-agent, start-pipeline |
| Setup Hook | `scripts/setup.sh` | Auto-launch + connectivity check + session start |
| Intercept Hook | `scripts/intercept-agent.sh` | Routes Agent calls through session workflow |
| Teardown Hook | `scripts/teardown.sh` | Shutdown workflow + kill auto-launched processes |

## Entry Points (CLI Commands)

| Command | Purpose |
|---------|---------|
| `npm run worker` | Start the Temporal worker |
| `npm run client start-session` | Start a session workflow |
| `npm run client send-task -- --workflow-id ... --prompt "..."` | Send task to session |
| `npm run client shutdown-session -- --workflow-id ...` | Shut down session |
| `npm run client start-agent -- --prompt "..."` | Single agent workflow (legacy) |
| `npm run client start-pipeline -- --definition @pipeline.json` | Multi-step pipeline |
| `npm run client status <workflow-id>` | Query workflow status |
| `npm run client list` | List recent workflows |

## Invariants

- **MUST** fall back gracefully to native Agent tool when Temporal is unavailable
- **MUST** heartbeat during Claude Code sessions so Temporal detects stuck activities
- **MUST** use model-appropriate retry policies via `getPolicyForModel()`
- **MUST** use `${CLAUDE_PLUGIN_ROOT}` for all paths in hook scripts
- **MUST NEVER** block the session if Temporal infrastructure is down
- **MUST NEVER** modify existing skill or agent definitions in other layers

## Patterns

- Use `sessionWorkflow` for per-session agent orchestration (hook default)
- Use `orchestratePipeline` for multi-step pipelines with dependencies
- Use `parallelAgents` for concurrent independent agent work
- Always go through the Claude Code CLI activity — never call Claude API directly
- Workflow code must be deterministic (no I/O, no random, no Date.now())
- **`proxyActivities()` at workflow scope only** — never inside handlers. The session workflow uses a queue-based pattern: update handler enqueues tasks and waits via `condition()`, main loop dequeues and runs activities at workflow scope

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `TEMPORAL_AUTO_LAUNCH` | `true` | Auto-start worker and local dev server (set `false` to disable) |
| `TEMPORAL_ADDRESS` | `127.0.0.1:7233` | Temporal server address |
| `TEMPORAL_AUTO_LAUNCH_UI_PORT` | `8233` | Dev server UI port |

## Observability

- **Temporal UI:** `http://localhost:8233` — workflow execution history
- **Queries:** `currentStage`, `pipelineStatus`, `pipelineLog`
- **Signals:** `shutdown`, `cancel`, `pause`, `resume`
- **Audit log:** `$CLAUDE_PLUGIN_DATA/agent-executions.jsonl`
