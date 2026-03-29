# Workflow Determinism Rules

## The Core Rule

Workflow code must be **deterministic**: given the same input and history, it must make the same decisions every time. This is how Temporal achieves durability — by replaying workflow history on recovery.

## What You CAN Do in Workflows

- Call activities via `proxyActivities()`
- Start child workflows
- Use `sleep()` for delays
- Use `condition()` to wait for signals
- Use signals and queries (`defineSignal`, `defineQuery`, `setHandler`)
- Pure computation (math, string manipulation, object construction)
- Branching on activity results
- `Promise.all()` / `Promise.allSettled()` for parallel activities

## What You CANNOT Do in Workflows

| Forbidden | Why | Alternative |
|-----------|-----|-------------|
| `fetch()` / HTTP calls | Non-deterministic | Move to activity |
| `fs.readFile()` / file I/O | Non-deterministic | Move to activity |
| `Date.now()` / `new Date()` | Different on replay | Use workflow time (automatic in sandbox) |
| `Math.random()` | Different on replay | Sandboxed (auto-seeded) |
| `setTimeout` / `setInterval` | Non-deterministic | Use `sleep()` |
| `console.log()` | Side effect | Use Temporal logger |
| `process.env` | May change between replays | Pass as workflow argument |
| Global mutable state | Shared across workflows | Use workflow-local variables |

## TypeScript Sandbox

The TypeScript SDK runs workflows in an isolated V8 sandbox that automatically:
- Seeds `Math.random()` for determinism
- Replaces `Date.now()` with workflow time
- Replaces `setTimeout` with deterministic timer
- Blocks `fs`, `net`, `http` modules

## Type-Only Imports

Activities and workflows must be in **separate files**. In workflow files, use type-only imports:

```typescript
// CORRECT — type-only import
import type { MyActivities } from '../activities/my-activities';
const { myActivity } = proxyActivities<MyActivities>({ ... });

// WRONG — runtime import pulls activity code into workflow bundle
import { myActivity } from '../activities/my-activities';
```

## Versioning

When changing workflow logic for running workflows, use `patched()`:

```typescript
import { patched } from '@temporalio/workflow';

if (patched('my-change-id')) {
  // New code path
} else {
  // Old code path (for replaying existing workflows)
}
```
