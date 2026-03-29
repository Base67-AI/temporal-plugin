---
name: temporal-orchestrate
description: Start a Temporal-backed agent orchestration workflow. Use when the user wants to run a durable, observable agent pipeline that survives crashes and supports pause/resume. Trigger on "/temporal-orchestrate" or when user asks to "orchestrate agents with temporal" or "run a durable pipeline".
---

# Temporal Agent Orchestration

Start a Temporal workflow to orchestrate Claude Code sub-agents durably.

## Prerequisites

Before running, verify Temporal is available:

```bash
# Check if Temporal server is reachable
temporal workflow list --namespace default --limit 1 2>/dev/null && echo "Temporal: OK" || echo "Temporal: NOT RUNNING — start with 'temporal server start-dev'"

# Check if worker is built
ls /home/user/base67/temporal/lib/client.js 2>/dev/null && echo "Worker: BUILT" || echo "Worker: NOT BUILT — run 'cd /home/user/base67/temporal && npm run build'"
```

## Usage Modes

### 1. Single Agent Session

For running one Claude Code session as a durable workflow:

```bash
cd /home/user/base67/temporal
node lib/client.js start-agent \
  --prompt "Your task prompt here" \
  --description "short-description" \
  --model sonnet
```

### 2. Multi-Step Pipeline

For running a sequence of agents with dependency ordering:

1. Create a pipeline definition JSON:

```json
{
  "name": "my-pipeline",
  "workingDirectory": "/home/user/base67",
  "steps": [
    {
      "id": "step-1",
      "prompt": "First task...",
      "description": "first-step",
      "model": "opus",
      "maxTurns": 5
    },
    {
      "id": "step-2",
      "prompt": "Second task using step-1 output...",
      "description": "second-step",
      "model": "sonnet",
      "dependsOn": ["step-1"]
    },
    {
      "id": "step-3a",
      "prompt": "Parallel task A...",
      "description": "parallel-a",
      "model": "haiku",
      "dependsOn": ["step-2"]
    },
    {
      "id": "step-3b",
      "prompt": "Parallel task B...",
      "description": "parallel-b",
      "model": "haiku",
      "dependsOn": ["step-2"]
    }
  ]
}
```

2. Start the pipeline:

```bash
cd /home/user/base67/temporal
node lib/client.js start-pipeline --definition @/path/to/pipeline.json --wait true
```

### 3. Check Status

```bash
cd /home/user/base67/temporal
node lib/client.js status <workflow-id>
```

### 4. Cancel

```bash
cd /home/user/base67/temporal
node lib/client.js cancel <workflow-id>
```

## When Orchestrating

1. **Determine the steps** — break the user's request into discrete agent tasks
2. **Identify dependencies** — which steps depend on outputs from others
3. **Assign models** — Opus for creative/complex, Sonnet for balanced, Haiku for fast/validation
4. **Set turn limits** — 3 for validation, 5 for design, 10+ for code generation
5. **Start the workflow** — use the appropriate client command
6. **Monitor progress** — query status or check Temporal UI at `localhost:8233`
