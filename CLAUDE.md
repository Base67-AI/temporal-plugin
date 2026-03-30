# Temporal Orchestrator Plugin

This is a Claude Code plugin that provides durable workflow orchestration for sub-agents via Temporal.io.

## What This Plugin Does

Every Agent tool call is transparently intercepted and routed through a **single long-running Temporal workflow** that lives for the entire Claude session. Each sub-agent runs as a Temporal **activity** inside that workflow, gaining retry logic, heartbeat monitoring, and crash recovery — with zero changes to how skills call the Agent tool.

If Temporal is unavailable, all calls fall back to native Agent execution silently.

## How It Works

```
SessionStart → setup.sh starts sessionWorkflow (persists workflow ID)
Agent call   → intercept-agent.sh sends task via Temporal Update → activity runs → result returned
Session end  → teardown.sh signals workflow shutdown, kills auto-launched processes
```

## Key Files

- `src/workflows/agent-session.ts` — Session workflow (update handler dispatches activities)
- `src/activities/claude-session.ts` — Core activity (spawns `claude` CLI as child process)
- `src/client.ts` — CLI: `start-session`, `send-task`, `shutdown-session`, `start-agent`, `start-pipeline`
- `src/workflows/orchestrate.ts` — Multi-step pipeline with dependency DAG
- `src/workflows/parallel-agents.ts` — Fan-out/fan-in concurrent execution
- `src/config/retry-policies.ts` — Model-tier retry policies (opus: 30m/2 retries, sonnet: 20m/3, haiku: 10m/3)
- `scripts/setup.sh` — SessionStart hook (auto-launch + session workflow start)
- `scripts/intercept-agent.sh` — PreToolUse hook (routes Agent calls to session)
- `scripts/teardown.sh` — Stop hook (shutdown + cleanup)

## Tech Stack

- TypeScript, Temporal SDK v1.15, Node.js >= 20
- Hooks: bash scripts reading JSON from stdin, returning JSON
- Communication: Temporal Workflow Updates (defineUpdate/executeUpdate) for request-response

## Patterns and Rules

- **Workflow code must be deterministic** — no I/O, no Date.now(), no Math.random(). Use `import type` only.
- **`proxyActivities()` at workflow scope only** — NEVER call it inside signal/update/query handlers. Use the queue-based pattern: handler enqueues tasks, main loop runs activities.
- **Activities do the real work** — file I/O, spawning processes, API calls happen in activities only.
- **Graceful fallback** — every hook returns `{}` on failure, letting native Agent execution proceed.
- **Model-aware retries** — three pre-created activity stubs (opus/sonnet/haiku) with different policies.
- **Auto-launch is opt-in** — set `TEMPORAL_AUTO_LAUNCH=true` to auto-start server + worker.

## Available Skills

- `/temporal-orchestrate` — Run single agents or multi-step pipelines
- `/temporal-pipeline` — Build and execute pipeline definitions
- `/temporal-status` — Check workflow status and history
- `/temporal-cloud` — Troubleshoot Temporal Cloud connections
- `/temporal-developer` — Temporal development reference and patterns

## Build

```bash
npm install && npm run build   # compiles to lib/
npm run worker                 # start worker (polls for tasks)
```
