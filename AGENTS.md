# Temporal Agent Orchestration

> Durable workflow orchestration for Claude Code sub-agents via Temporal.io — packaged as a Claude Code plugin.

## At a Glance

| | |
|-|-|
| **Type** | Claude Code Plugin + Infrastructure Layer |
| **Owns** | Workflow definitions, activity wrappers, hook-based Agent interception, Temporal worker/client |
| **Does NOT own** | Agent definitions (→ each layer), skill logic (→ each layer), game generation pipeline (→ gamebuilder/phasertemplate/playground) |
| **Users** | All layers (transparently via hook interception) |

## Navigation

↑ Parent: [`../AGENTS.md`](../AGENTS.md)

## Plugin Installation

```bash
# Option 1: Load for a single session
claude --plugin-dir ./temporal

# Option 2: Install at project scope (persists across sessions)
# Register this directory as a plugin source in .claude/settings.json

# Option 3: Standalone (without plugin system)
cd temporal && npm install && npm run build
```

Once loaded as a plugin, the hooks, skills, and agents auto-register — no manual settings.json changes needed.

## Architecture

Temporal sits **beneath** all other layers as a transparent orchestration backbone. Existing skills and agents are unaware of it — a PreToolUse hook intercepts Agent tool calls and routes them through Temporal workflows.

```
Skill calls Agent tool (unchanged)
  → PreToolUse hook intercepts
    → Temporal workflow starts
      → Activity spawns Claude Code CLI session
        → Session runs with full tools/skills/file access
      ← Result returned
    ← Hook returns result to skill
  → Skill continues normally
```

### Graceful Fallback

If the Temporal server or worker isn't running, the hook passes through silently and the Agent tool executes natively. Zero disruption.

## Plugin Structure

```
temporal/
├── .claude-plugin/
│   └── plugin.json          # Plugin manifest (name, version, description)
├── hooks/
│   └── hooks.json           # SessionStart, PreToolUse, PostToolUse hooks
├── skills/
│   ├── temporal-orchestrate/ # /temporal-orchestrate skill
│   ├── temporal-pipeline/    # /temporal-pipeline skill
│   ├── temporal-status/      # /temporal-status skill
│   ├── temporal-developer/   # /temporal-developer expert knowledge
│   └── temporal-cloud/       # /temporal-cloud troubleshooting
├── scripts/
│   ├── intercept-agent.sh   # PreToolUse: route Agent → Temporal
│   ├── report-result.sh     # PostToolUse: audit logging
│   └── setup.sh             # SessionStart: connectivity check
├── src/                     # TypeScript source
├── lib/                     # Compiled output (gitignored)
└── package.json             # Dependencies
```

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
| Plugin Manifest | `.claude-plugin/plugin.json` | Plugin metadata for Claude Code |
| Hook Config | `hooks/hooks.json` | Registers lifecycle hooks with Claude Code |
| Intercept Script | `scripts/intercept-agent.sh` | PreToolUse: routes Agent → Temporal |
| Report Script | `scripts/report-result.sh` | PostToolUse: audit logging |
| Setup Script | `scripts/setup.sh` | SessionStart: connectivity check |
| Claude Session Activity | `src/activities/claude-session.ts` | Spawns Claude Code CLI sessions as Temporal Activities |
| File Ops Activity | `src/activities/file-ops.ts` | File system operations as Activities |
| Agent Session Workflow | `src/workflows/agent-session.ts` | Wraps single Agent calls durably |
| Pipeline Workflow | `src/workflows/orchestrate.ts` | Multi-step with dependency ordering |
| Parallel Workflow | `src/workflows/parallel-agents.ts` | Fan-out/fan-in for concurrent agents |

## Invariants

**MUST:** Gracefully fall back to native Agent tool when Temporal is unavailable.
**MUST:** Heartbeat during Claude Code sessions so Temporal detects stuck activities.
**MUST:** Use model-appropriate retry policies (Opus: 2 retries, Sonnet/Haiku: 3).
**MUST:** Use `${CLAUDE_PLUGIN_ROOT}` for all paths in hook scripts (portability).
**MUST NEVER:** Modify existing skill or agent definitions in other layers.
**MUST NEVER:** Block the pipeline if Temporal infrastructure is down.

## Patterns

**Do:** Use `agentSessionWorkflow` for individual agent calls (hook default).
**Do:** Use `orchestratePipeline` for multi-step pipelines with dependencies.
**Do:** Use `parallelAgents` for concurrent independent agent work.
**Don't:** Call Claude API directly — always go through the Claude Code CLI session activity.

## Local Development

```bash
# 1. Start Temporal server (local dev)
temporal server start-dev

# 2. Install dependencies and build
cd temporal && npm install && npm run build

# 3. Start worker
npm run worker

# 4. Load plugin in Claude Code
claude --plugin-dir ./temporal
# The hooks auto-activate when Temporal is available
```

## Observability

- **Temporal UI:** `http://localhost:8233` — full workflow execution history
- **Queries:** Real-time `currentStage` and `pipelineStatus` via Temporal queries
- **Audit log:** `$CLAUDE_PLUGIN_DATA/agent-executions.jsonl` — local execution trail

## Dependencies

**Requires:** Temporal server (local: `temporal server start-dev`, prod: Temporal Cloud)
**Requires:** `claude` CLI in PATH for spawning Claude Code sessions
**Breaks if changed:** `hooks/hooks.json` hook registration structure
