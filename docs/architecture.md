# Architecture

This document explains how the Temporal plugin works under the hood, from hook interception to activity execution.

## Overview

The plugin consists of three layers:

```
┌─────────────────────────────────────────────────────┐
│  Claude Code Session                                │
│  (skills, agents, tools — unchanged)                │
├─────────────────────────────────────────────────────┤
│  Hook Layer (bash scripts)                          │
│  SessionStart → setup.sh                            │
│  PreToolUse   → intercept-agent.sh                  │
│  PostToolUse  → report-result.sh                    │
│  Stop         → teardown.sh                         │
├─────────────────────────────────────────────────────┤
│  Temporal Layer (TypeScript)                        │
│  Workflows  │  Activities  │  Worker  │  Client     │
└─────────────────────────────────────────────────────┘
```

## Session Lifecycle

### 1. Session Start

When Claude Code starts, the `SessionStart` hook (`scripts/setup.sh`) runs:

1. Checks if the plugin is built (`lib/client.js` exists)
2. If `TEMPORAL_AUTO_LAUNCH=true`:
   - Checks if Temporal server is reachable
   - If not, starts `temporal server start-dev` in background
   - Starts the worker (`node lib/worker.js`) in background
   - Saves PIDs for cleanup
3. Tests connectivity to Temporal server
4. Starts a `sessionWorkflow` with a unique ID (`session-<timestamp>-<random>`)
5. Persists the workflow ID to `$PLUGIN_DATA/session-workflow-id`

### 2. Agent Interception

When any tool calls the Agent tool, the `PreToolUse` hook (`scripts/intercept-agent.sh`) runs:

1. Reads the hook input JSON from stdin
2. Checks that `tool_name === "Agent"`
3. Reads the session workflow ID from the persisted file
4. Extracts parameters: `prompt`, `description`, `model`, `subagent_type`
5. Calls `node lib/client.js send-task --workflow-id <id> --prompt ...`
6. The client calls `handle.executeUpdate(executeAgentTaskUpdate, { args: [input] })`
7. The workflow's update handler runs the `runClaudeSession` activity
8. The activity spawns `claude -p <prompt> --output-format json` as a child process
9. Result flows back: activity → workflow → client → hook → caller

### 3. Session End

When Claude Code exits, the `Stop` hook (`scripts/teardown.sh`) runs:

1. Reads the workflow ID and signals the session workflow to shut down
2. Kills the auto-launched worker process (SIGTERM, then SIGKILL after 5s)
3. Kills the auto-launched dev server (same graceful shutdown)
4. Cleans up PID files

## Workflow Architecture

### Session Workflow (`sessionWorkflow`)

The primary workflow. One instance per Claude session.

```typescript
// Simplified — see src/workflows/agent-session.ts for full code
async function sessionWorkflow(input: SessionWorkflowInput): Promise<void> {
  // Update handler: each Agent call triggers this
  setHandler(executeAgentTaskUpdate, async (taskInput) => {
    const { runClaudeSession } = proxyActivities(getPolicyForModel(taskInput.model));
    return await runClaudeSession(taskInput);  // runs as Temporal activity
  });

  // Shutdown handler
  setHandler(shutdownSignal, () => { shuttingDown = true; });

  // Stay alive until shutdown or 24h timeout
  await condition(() => shuttingDown, '24h');
}
```

Key properties:
- **Long-running**: lives for the entire Claude session
- **Update-driven**: each Agent call is a Temporal Update (request-response)
- **Stateful**: tracks task count and current status via queries
- **Self-cleaning**: 24h timeout prevents zombie workflows

### Pipeline Workflow (`orchestratePipeline`)

For multi-step agent workflows with dependencies.

```
Step A (no deps) ─────────┐
                          ├──→ Step C (depends on A, B)
Step B (no deps) ─────────┘
```

- Executes steps in topological order
- Independent steps run in parallel automatically
- Supports pause/resume and cancellation via signals
- Each step gets its own model-tier retry policy

### Parallel Workflow (`parallelAgents`)

Fan-out/fan-in for concurrent independent tasks.

- All tasks start simultaneously
- Uses `Promise.allSettled` — one failure doesn't block others
- Each task gets its own retry policy based on model

## Activity: Claude Session

The `runClaudeSession` activity (`src/activities/claude-session.ts`) is where actual work happens:

1. Builds CLI args from `ClaudeSessionInput` (prompt, model, max-turns, etc.)
2. Finds the `claude` binary (checks node_modules, then PATH)
3. Spawns the process with `--output-format json --permission-mode acceptEdits`
4. Sends heartbeats every 30 seconds so Temporal knows it's alive
5. Collects stdout (JSON result) and stderr
6. Returns `ClaudeSessionResult` with success flag, output text, and optional error

## Retry Policies

Each model tier has different timeout and retry settings:

| Model | Start-to-Close | Heartbeat | Max Retries | Rationale |
|-------|---------------|-----------|-------------|-----------|
| Opus | 30 min | 10 min | 2 | Most capable, expensive |
| Sonnet | 20 min | 10 min | 3 | Balanced |
| Haiku | 10 min | 5 min | 3 | Fast, cheap |
| File Ops | 30 sec | — | 3 | Deterministic |

All use exponential backoff (coefficient 2).

## Communication Pattern: Temporal Updates

The plugin uses **Workflow Updates** (`defineUpdate`/`executeUpdate`) for agent task dispatch. This provides synchronous request-response semantics:

```
Client                          Workflow
  │                                │
  │── executeUpdate(task) ────────→│
  │                                │── proxyActivities → runClaudeSession
  │                                │        (activity runs for minutes)
  │                                │←── result
  │←── result ─────────────────────│
  │                                │
```

The client blocks until the activity completes. No polling, no callbacks.

## Data Flow

```
$PLUGIN_DATA/
├── session-workflow-id          # Current session's workflow ID (shared between hooks)
├── agent-executions.jsonl       # Audit log (PostToolUse hook appends here)
├── temporal-server.pid          # Auto-launched server PID (if applicable)
├── temporal-worker.pid          # Auto-launched worker PID (if applicable)
├── temporal-server.log          # Server stdout/stderr (if auto-launched)
└── temporal-worker.log          # Worker stdout/stderr (if auto-launched)
```
