---
name: temporal-status
description: Check the status of Temporal agent orchestration workflows. Use when the user asks about running workflows, pipeline progress, or wants to see what agents are executing. Trigger on "/temporal-status".
---

# Temporal Workflow Status

Check running and recent Temporal agent orchestration workflows.

## Steps

1. **List recent workflows:**

```bash
cd /home/user/base67/temporal && node lib/client.js list
```

2. **Query a specific workflow:**

```bash
cd /home/user/base67/temporal && node lib/client.js status <workflow-id>
```

3. **Check Temporal infrastructure health:**

```bash
# Is the server running?
temporal workflow list --namespace default --limit 1 2>/dev/null && echo "Server: UP" || echo "Server: DOWN"

# Is the worker running?
ps aux | grep "temporal.*worker" | grep -v grep && echo "Worker: RUNNING" || echo "Worker: NOT RUNNING"
```

## Interpreting Results

- **RUNNING** — Workflow is actively executing or waiting for an activity to complete
- **COMPLETED** — All steps finished successfully
- **FAILED** — One or more steps failed after exhausting retries
- **CANCELLED** — Workflow was cancelled via signal
- **TIMED_OUT** — Workflow exceeded its execution timeout

## Pipeline Stage Status

When querying a pipeline workflow, `pipelineStatus` returns a map of stage → status:
- `pending` — Not yet started
- `running` — Currently executing
- `complete` — Finished successfully
- `failed` — Failed after retries
- `skipped` — Skipped because a dependency failed
