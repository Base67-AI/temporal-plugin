# Common Temporal Workflow Patterns

## Sequential Pipeline

```typescript
export async function sequentialPipeline(input: string) {
  const step1Result = await activityA(input);
  const step2Result = await activityB(step1Result);
  const step3Result = await activityC(step2Result);
  return step3Result;
}
```

## Parallel Execution (Fan-Out / Fan-In)

```typescript
export async function parallelPipeline(tasks: string[]) {
  const results = await Promise.allSettled(
    tasks.map(task => processTask(task))
  );
  return results;
}
```

## Saga (Compensation)

```typescript
export async function sagaWorkflow(input: Input) {
  const compensations: Array<() => Promise<void>> = [];

  try {
    await stepA(input);
    compensations.push(() => undoStepA(input));

    await stepB(input);
    compensations.push(() => undoStepB(input));

    await stepC(input);
  } catch (err) {
    // Compensate in reverse order
    for (const compensate of compensations.reverse()) {
      await compensate();
    }
    throw err;
  }
}
```

## Child Workflows

```typescript
import { executeChild } from '@temporalio/workflow';

export async function parentWorkflow(input: string) {
  const childResult = await executeChild(childWorkflow, {
    args: [input],
    workflowId: `child-${input}`,
  });
  return childResult;
}
```

## Signal-Driven State Machine

```typescript
export async function stateMachineWorkflow() {
  let state = 'idle';

  setHandler(transitionSignal, (newState: string) => {
    state = newState;
  });

  setHandler(stateQuery, () => state);

  await condition(() => state === 'complete', '24h');
  return state;
}
```

## Polling Pattern

```typescript
export async function pollingWorkflow(jobId: string) {
  let status = 'pending';

  while (status === 'pending' || status === 'running') {
    status = await checkJobStatus(jobId);
    if (status === 'pending' || status === 'running') {
      await sleep('30s');
    }
  }

  return status;
}
```

## Continue-As-New (Long-Running Workflows)

```typescript
import { continueAsNew } from '@temporalio/workflow';

export async function longRunningWorkflow(iteration: number) {
  // Do work...
  await processIteration(iteration);

  // Prevent event history from growing too large
  if (iteration > 0 && iteration % 100 === 0) {
    await continueAsNew<typeof longRunningWorkflow>(iteration + 1);
  }

  return longRunningWorkflow(iteration + 1);
}
```
