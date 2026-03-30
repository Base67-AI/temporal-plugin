import { proxyActivities, setHandler, condition } from '@temporalio/workflow';
import type { ClaudeSessionInput, ClaudeSessionResult } from '../activities/claude-session';
import { getPolicyForModel } from '../config/retry-policies';
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
 * Lifecycle:
 *   SessionStart hook → starts this workflow
 *   PreToolUse hook  → sends executeAgentTask update → activity runs → result returned
 *   Stop hook        → sends shutdown signal → workflow completes
 *
 * Safety: 24h timeout ensures zombie workflows are cleaned up.
 */
export async function sessionWorkflow(input: SessionWorkflowInput): Promise<void> {
  let status = 'waiting';
  let shuttingDown = false;
  let taskCount = 0;

  setHandler(currentStageQuery, () => status);

  setHandler(shutdownSignal, () => {
    shuttingDown = true;
  });

  // Update handler: receives an agent task, runs it as an activity, returns the result.
  // The client's executeUpdate() call blocks until this handler resolves.
  setHandler(executeAgentTaskUpdate, async (taskInput: ClaudeSessionInput): Promise<ClaudeSessionResult> => {
    taskCount++;
    const taskId = taskCount;
    status = `running-task-${taskId}: ${taskInput.description}`;

    const policy = getPolicyForModel(taskInput.model);
    const { runClaudeSession } = proxyActivities<{
      runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
    }>(policy);

    try {
      const result = await runClaudeSession({
        ...taskInput,
        cwd: taskInput.cwd || input.cwd,
      });
      status = 'waiting';
      return result;
    } catch (err) {
      status = 'waiting';
      throw err;
    }
  });

  // Keep workflow alive until shutdown signal or 24h safety timeout
  await condition(() => shuttingDown, '24h');

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
