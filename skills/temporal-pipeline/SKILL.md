---
name: temporal-pipeline
description: Define and run a multi-step Temporal pipeline for agent orchestration. Use when the user wants to create a durable multi-agent pipeline with step dependencies, parallel execution, and crash recovery. Trigger on "/temporal-pipeline".
---

# Temporal Pipeline Builder

Build and execute a multi-step agent pipeline as a durable Temporal workflow.

## Steps

### 1. Gather Requirements

Ask the user what the pipeline should accomplish. Identify:
- What are the discrete steps?
- Which steps depend on others?
- Which can run in parallel?
- What model tier does each step need?

### 2. Build Pipeline Definition

Create a JSON pipeline definition:

```json
{
  "name": "<pipeline-name>",
  "workingDirectory": "/home/user/base67",
  "steps": [
    {
      "id": "<unique-id>",
      "prompt": "<what the agent should do>",
      "description": "<3-5 word summary>",
      "model": "opus|sonnet|haiku",
      "maxTurns": 10,
      "dependsOn": ["<step-ids>"],
      "cwd": "<optional-override>"
    }
  ]
}
```

### 3. Validate

Before starting:
- Verify no circular dependencies in `dependsOn`
- Verify all `dependsOn` references point to existing step IDs
- Verify Temporal server and worker are running

### 4. Execute

```bash
cd /home/user/base67/temporal

# Write pipeline to temp file
cat > /tmp/pipeline.json << 'PIPELINE'
<pipeline JSON here>
PIPELINE

# Start with wait for result
node lib/client.js start-pipeline --definition @/tmp/pipeline.json --wait true
```

### 5. Monitor

```bash
# Query status
node lib/client.js status <workflow-id>

# Or open Temporal UI
echo "http://localhost:8233"
```

## Pipeline Patterns

### Sequential Chain
```
step-1 → step-2 → step-3
```
Each step has `dependsOn: ["previous-step"]`.

### Fan-Out / Fan-In
```
step-1 → step-2a ─┐
       → step-2b ─┤→ step-3
       → step-2c ─┘
```
Parallel steps share the same `dependsOn`. The merge step depends on all parallel steps.

### Diamond
```
       → step-B ─┐
step-A            ├→ step-D
       → step-C ─┘
```
B and C depend on A. D depends on both B and C.

## Model Selection Guide

| Task Type | Model | Typical Turns |
|-----------|-------|---------------|
| Creative design, complex reasoning | opus | 5-8 |
| Code generation, balanced tasks | sonnet | 8-15 |
| Validation, quick analysis | haiku | 3-5 |
