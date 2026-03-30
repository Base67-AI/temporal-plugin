import { proxyActivities, setHandler, condition } from '@temporalio/workflow';
import type { ClaudeSessionInput, ClaudeSessionResult } from '../activities/claude-session';
import { opusPolicy, sonnetPolicy, haikuPolicy, getPolicyForModel } from '../config/retry-policies';
import { currentStageQuery, executeAgentTaskUpdate, shutdownSignal } from './signals-queries';

/**
 * Input for the long-running session workflow.
 */
export interface SessionWorkflowInput {
  /** Unique session identifier (used as workflow ID) */
  sessionId: string;
  /** Default working directory for agent tasks */
  cwd?: string;
}

/**
 * Session Workflow — one per Claude Code session.
 *
 * Stays alive for the duration of the Claude session. Each Agent tool call
 * is dispatched as an activity via a Temporal Update (request-response).
 *
 * Architecture: Queue-based decoupling
 *   - The update handler enqueues tasks and waits for results via condition()
 *   - The main workflow loop dequeues tasks and runs activities at workflow scope
 *   - proxyActivities() is called at workflow function scope (REQUIRED by Temporal SDK)
 *   - Handler and main loop cooperate as coroutines in the single-threaded runtime
 *
 * Lifecycle:
 *   SessionStart hook → starts this workflow
 *   PreToolUse hook  → sends executeAgentTask update → handler enqueues → loop runs activity → result returned
 *   Stop hook        → sends shutdown signal → loop exits → workflow completes
 *
 * Safety: 24h condition timeout ensures zombie workflows are cleaned up.
 */
export async function sessionWorkflow(input: SessionWorkflowInput): Promise<void> {
  // --- Activity stubs at workflow function scope (CRITICAL) ---
  // proxyActivities() MUST be called here, never inside handlers.
  // One stub per model tier with appropriate retry/timeout policies.
  const opusActivities = proxyActivities<{
    runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
  }>(opusPolicy);

  const sonnetActivities = proxyActivities<{
    runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
  }>(sonnetPolicy);

  const haikuActivities = proxyActivities<{
    runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
  }>(haikuPolicy);

  function getActivities(model?: string) {
    if (!model) return sonnetActivities;
    const normalized = model.toLowerCase();
    if (normalized.includes('opus')) return opusActivities;
    if (normalized.includes('haiku')) return haikuActivities;
    return sonnetActivities;
  }

  // --- Task queue for decoupling handler from activity execution ---
  interface PendingTask {
    id: number;
    input: ClaudeSessionInput;
  }

  const taskQueue: PendingTask[] = [];
  const taskResults = new Map<number, { result?: ClaudeSessionResult; error?: unknown }>();

  let status = 'waiting';
  let shuttingDown = false;
  let taskCount = 0;

  // --- Query handler ---
  setHandler(currentStageQuery, () => status);

  // --- Shutdown signal handler ---
  setHandler(shutdownSignal, () => {
    shuttingDown = true;
  });

  // --- Update handler: enqueue task and wait for result ---
  // The handler does NOT call proxyActivities or run activities directly.
  // It pushes to the queue and blocks via condition() until the main loop
  // processes the task and stores the result.
  setHandler(executeAgentTaskUpdate, async (taskInput: ClaudeSessionInput): Promise<ClaudeSessionResult> => {
    const taskId = ++taskCount;

    // Enqueue the task for the main loop to pick up
    taskQueue.push({ id: taskId, input: taskInput });

    // Block cooperatively until the main loop processes this task
    await condition(() => taskResults.has(taskId));

    // Retrieve and clean up the result
    const outcome = taskResults.get(taskId)!;
    taskResults.delete(taskId); // prevent unbounded growth

    if (outcome.error) {
      throw outcome.error;
    }
    return outcome.result!;
  });

  // --- Main workflow loop: process tasks at workflow scope ---
  // This loop runs activities using the pre-created stubs (correct scope).
  // It cooperates with the update handler via the taskQueue and taskResults.
  while (!shuttingDown) {
    // Wait for either a new task or shutdown signal
    await condition(() => taskQueue.length > 0 || shuttingDown);

    if (shuttingDown) break;

    // Dequeue the next task
    const task = taskQueue.shift()!;
    const taskId = task.id;
    status = `running-task-${taskId}: ${task.input.description}`;

    try {
      const activities = getActivities(task.input.model);
      const result = await activities.runClaudeSession({
        ...task.input,
        cwd: task.input.cwd || input.cwd,
      });
      taskResults.set(taskId, { result });
    } catch (err) {
      taskResults.set(taskId, { error: err });
    }

    status = 'waiting';
  }

  status = 'shutdown';
}

/**
 * Single Agent Session Workflow (legacy)
 *
 * Wraps one Agent tool call as a durable Temporal workflow.
 * Kept for backward compatibility with orchestrate and parallel-agents workflows.
 */
export async function agentSessionWorkflow(input: ClaudeSessionInput): Promise<ClaudeSessionResult> {
  let status = 'running';
  setHandler(currentStageQuery, () => status);

  const policy = getPolicyForModel(input.model);

  const { runClaudeSession } = proxyActivities<{
    runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
  }>(policy);

  try {
    const result = await runClaudeSession(input);
    status = result.success ? 'complete' : 'failed';
    return result;
  } catch (err) {
    status = 'failed';
    throw err;
  }
}
