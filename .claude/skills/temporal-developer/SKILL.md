---
name: temporal-developer
description: Expert knowledge for Temporal workflow creation, activity writing, debugging, and SDK development. Auto-loaded when working on Temporal TypeScript files, workflow definitions, activity implementations, or worker configuration. Based on the official temporalio/skill-temporal-developer.
version: 0.1.0
---

# Temporal Developer Skill

Temporal enables durable execution where workflows survive failures automatically. This skill covers TypeScript implementations for the Base67 agent orchestration layer.

## Core Architecture

```
┌─────────────────────────────────────────┐
│           Temporal Cluster               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │  Event   │ │  Task    │ │Visibility││
│  │ History  │ │  Queues  │ │          ││
│  └──────────┘ └──────────┘ └──────────┘│
└────────────────────┬────────────────────┘
                     │ (poll & respond)
┌────────────────────┴────────────────────┐
│              Worker Process              │
│  ┌──────────────┐ ┌──────────────────┐  │
│  │  Workflow    │ │   Activity       │  │
│  │ Definitions  │ │ Implementations  │  │
│  └──────────────┘ └──────────────────┘  │
└─────────────────────────────────────────┘
```

## History Replay (How Durability Works)

Workflows are **deterministic orchestrators** — they decide WHAT to do. Activities are **non-deterministic workers** — they DO the actual work (API calls, file I/O, etc.).

When a worker crashes and restarts:
1. Temporal replays the workflow's event history
2. For completed activities, it returns the stored result (no re-execution)
3. For in-progress activities, it re-dispatches them to available workers
4. The workflow continues from where it left off

**Critical rule:** Workflow code must be deterministic. Same inputs → same decisions. No `Math.random()`, no `Date.now()`, no direct I/O.

## TypeScript Setup

```bash
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
```

**All `@temporalio/*` packages must have the same version number.**

## Key Rules

### Workflow Determinism
- **DO:** Use `sleep()` instead of `setTimeout()`
- **DO:** Use `condition()` for waiting on signals
- **DO:** Use `proxyActivities()` for all I/O
- **DO:** Keep workflow files separate from activity files
- **DO:** Use type-only imports: `import type { ... } from '../activities/...'`
- **DON'T:** Call APIs, read files, or do I/O directly in workflows
- **DON'T:** Use `Math.random()` (use Temporal's seeded version)
- **DON'T:** Import activity code into workflow bundle (only types)

### Activity Best Practices
- Activities are regular async functions — no restrictions
- Make activities idempotent (safe to retry)
- Use heartbeats for long-running activities: `Context.current().heartbeat(data)`
- Set appropriate timeouts per activity type

### Worker Configuration
- Use `workflowsPath: require.resolve('./workflows')` for dev
- Use `workflowBundle` for production (pre-bundled)
- Register activities directly as object

## AI/LLM Integration Patterns

### Pattern 1: Activities Wrap LLM Calls
Each Claude Code session is a single activity. Retry, timeout, and heartbeat are all managed at the activity level.

### Pattern 2: Non-Deterministic Tools in Activities
File I/O, Bash commands, API calls — all in activities. Never in workflow code.

### Pattern 3: Deterministic State in Workflows
Pipeline stage tracking, step ordering, dependency resolution — in workflow code.

### Pattern 4: Centralized Retry Management
Disable client-level retries. Temporal handles all retries via retry policies.

### Pattern 5: Multi-Agent Orchestration
Use `Promise.allSettled()` for parallel agents. Handle partial failures gracefully.

## Timeout Reference

| Operation | Recommended Timeout |
|-----------|-------------------|
| Simple LLM call | 30s |
| Complex reasoning (Opus) | 300s (5m) |
| Claude Code session (full agent) | 600-900s (10-15m) |
| File operation | 30s |
| Build/compile | 120s |

## Error Classification

| Type | Examples | Retryable? |
|------|----------|------------|
| Rate limit | 429, RESOURCE_EXHAUSTED | Yes (with backoff) |
| Timeout | Socket timeout, deadline exceeded | Yes |
| Server error | 500, 502, 503 | Yes |
| Auth failure | 401, 403, invalid API key | No |
| Invalid input | Bad prompt, missing params | No |

## References

See `references/` for detailed guides:
- `core/determinism.md` — Workflow determinism rules
- `core/patterns.md` — Common workflow patterns
- `core/ai-patterns.md` — AI/LLM integration patterns
- `core/gotchas.md` — Common mistakes
- `typescript/typescript.md` — TypeScript SDK specifics
- `typescript/testing.md` — Testing workflows
- `typescript/error-handling.md` — Error handling patterns

> Based on the official [temporalio/skill-temporal-developer](https://github.com/temporalio/skill-temporal-developer). Feedback: [#topic-ai on Temporal Slack](https://temporalio.slack.com/archives/C0818FQPYKY).
