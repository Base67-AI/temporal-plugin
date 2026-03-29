# Temporal TypeScript SDK Guide

## Installation

```bash
npm install @temporalio/client @temporalio/worker @temporalio/workflow @temporalio/activity
```

**Critical:** All `@temporalio/*` packages must have the same version number.

## File Structure

```
src/
├── activities/     # Regular async functions (I/O allowed)
├── workflows/      # Deterministic orchestration (no I/O)
│   └── index.ts    # Re-exports all workflows
├── worker.ts       # Worker process
└── client.ts       # Start/query workflows
```

**Key rule:** Keep workflow and activity definitions in separate files.

## Activities

Regular async functions. No restrictions — full I/O, API calls, file access:

```typescript
import { Context } from '@temporalio/activity';

export async function myActivity(input: string): Promise<string> {
  // Heartbeat for long-running activities
  Context.current().heartbeat('processing');

  // Do actual work (API calls, file I/O, etc.)
  const result = await doSomething(input);
  return result;
}
```

## Workflows

Deterministic orchestrators. Use `proxyActivities()` to call activities:

```typescript
import { proxyActivities, defineQuery, defineSignal, setHandler } from '@temporalio/workflow';
import type * as activities from '../activities/my-activities';

const { myActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '5m',
  retry: { maximumAttempts: 3 },
});

export async function myWorkflow(input: string): Promise<string> {
  return await myActivity(input);
}
```

**Type-only imports:** Use `import type` for activity types in workflow files.

## Workers

```typescript
import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities';

const worker = await Worker.create({
  connection: await NativeConnection.connect({ address: 'localhost:7233' }),
  namespace: 'default',
  taskQueue: 'my-queue',
  workflowsPath: require.resolve('./workflows'),
  activities,
});

await worker.run();
```

## Clients

```typescript
import { Client, Connection } from '@temporalio/client';
import { myWorkflow } from './workflows';

const client = new Client({
  connection: await Connection.connect(),
});

// Start workflow
const handle = await client.workflow.start(myWorkflow, {
  taskQueue: 'my-queue',
  workflowId: 'my-workflow-id',
  args: ['input'],
});

// Get result
const result = await handle.result();

// Query
const status = await handle.query('myQuery');

// Signal
await handle.signal('mySignal', data);
```

## Signals & Queries

```typescript
// Define (at module level)
export const mySignal = defineSignal<[string]>('mySignal');
export const myQuery = defineQuery<string>('myQuery');

// Handle (inside workflow function)
export async function myWorkflow() {
  let state = 'initial';

  setHandler(mySignal, (newState) => { state = newState; });
  setHandler(myQuery, () => state);

  // Wait for signal
  await condition(() => state === 'done', '1h');
}
```

## Testing

```typescript
import { TestWorkflowEnvironment } from '@temporalio/testing';

const env = await TestWorkflowEnvironment.createLocal();
const worker = await Worker.create({
  connection: env.nativeConnection,
  taskQueue: 'test',
  workflowsPath: require.resolve('./workflows'),
  activities: mockActivities,
});

const result = await env.client.workflow.execute(myWorkflow, {
  taskQueue: 'test',
  args: ['test-input'],
});
```

## Common Mistakes

1. **Importing activities in workflow files** — Use `import type` only
2. **I/O in workflow code** — Move to activities
3. **Version mismatch** — All `@temporalio/*` must match
4. **Missing heartbeats** — Long activities need `ctx.heartbeat()`
5. **Production with `workflowsPath`** — Use `workflowBundle` instead
