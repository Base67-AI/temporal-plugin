# Temporal Agent Orchestration

> Durable workflow orchestration for Claude Code sub-agents using Temporal.io.

## At a Glance

| | |
|-|-|
| **Type** | Infrastructure Layer |
| **Owns** | Workflow definitions, activity wrappers, hook-based Agent interception, Temporal worker/client |
| **Does NOT own** | Agent definitions (→ each layer), skill logic (→ each layer), game generation pipeline (→ gamebuilder/phasertemplate/playground) |
| **Users** | All layers (transparently via hook interception) |

## Navigation

↑ Parent: [`../AGENTS.md`](../AGENTS.md)

## Architecture

Temporal sits **beneath** all other layers as a transparent orchestration backbone. Existing skills and agents are unaware of it — a PreToolUse hook intercepts Agent tool calls and routes them through Temporal workflows.

```
Skill calls Agent tool (unchanged)
  → PreToolUse hook intercepts
    → Temporal workflow starts
      → Activity spawns Claude Code SDK session
        → Session runs with full tools/skills/file access
      ← Result returned
    ← Hook returns result to skill
  → Skill continues normally
```

### Graceful Fallback

If the Temporal server or worker isn't running, the hook passes through silently and the Agent tool executes natively. Zero disruption.

## Entry Points

| Command | Purpose |
|---------|---------|
| `npm run worker` | Start the Temporal worker (polls for tasks) |
| `npm run client start-agent -- --prompt "..."` | Start a single agent session workflow |
| `npm run client start-pipeline -- --definition @pipeline.json` | Start a multi-step pipeline |
| `npm run client status <workflow-id>` | Query workflow status |
| `npm run client cancel <workflow-id>` | Cancel a running workflow |
| `npm run client list` | List recent workflows |

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| Claude Session Activity | `src/activities/claude-session.ts` | Spawns Claude Code SDK sessions as Temporal Activities |
| File Ops Activity | `src/activities/file-ops.ts` | File system operations as Activities |
| Agent Session Workflow | `src/workflows/agent-session.ts` | Wraps single Agent calls durably |
| Pipeline Workflow | `src/workflows/orchestrate.ts` | Multi-step with dependency ordering |
| Parallel Workflow | `src/workflows/parallel-agents.ts` | Fan-out/fan-in for concurrent agents |
| Interceptor Hook | `src/hooks/intercept-agent.sh` | PreToolUse hook routing Agent → Temporal |
| Result Logger | `src/hooks/report-result.sh` | PostToolUse hook for audit logging |

## Invariants

**MUST:** Gracefully fall back to native Agent tool when Temporal is unavailable.
**MUST:** Heartbeat during Claude Code sessions so Temporal detects stuck activities.
**MUST:** Use model-appropriate retry policies (Opus: 2 retries, Sonnet/Haiku: 3).
**MUST NEVER:** Modify existing skill or agent definitions in other layers.
**MUST NEVER:** Block the pipeline if Temporal infrastructure is down.

## Patterns

**Do:** Use `agentSessionWorkflow` for individual agent calls (hook default).
**Do:** Use `orchestratePipeline` for multi-step pipelines with dependencies.
**Do:** Use `parallelAgents` for concurrent independent agent work.
**Don't:** Call Claude API directly — always go through the Claude Code SDK session activity.

## Local Development

```bash
# 1. Start Temporal server (local dev)
temporal server start-dev

# 2. Install dependencies
cd temporal && npm install

# 3. Build
npm run build

# 4. Start worker
npm run worker

# 5. The hooks auto-activate when Temporal is available
```

## Observability

- **Temporal UI:** `http://localhost:8233` — full workflow execution history
- **Queries:** Real-time `currentStage` and `pipelineStatus` via Temporal queries
- **Audit log:** `temporal/.logs/agent-executions.jsonl` — local execution trail

## Dependencies

**Requires:** Temporal server (local: `temporal server start-dev`, prod: Temporal Cloud)
**Requires:** `claude-agent-sdk` for spawning Claude Code sessions
**Breaks if changed:** Hook registration in `.claude/settings.json`
