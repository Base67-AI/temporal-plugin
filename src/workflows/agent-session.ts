import { proxyActivities, setHandler } from '@temporalio/workflow';
import type { ClaudeSessionInput, ClaudeSessionResult } from '../activities/claude-session';
import { getPolicyForModel } from '../config/retry-policies';
import { currentStageQuery } from './signals-queries';

/**
 * Single Agent Session Workflow
 *
 * Wraps one Agent tool call as a durable Temporal workflow.
 * This is the primary workflow invoked by the hook interceptor —
 * each time a skill calls the Agent tool, this workflow runs.
 *
 * Provides:
 * - Durable execution (survives worker crashes)
 * - Automatic retries based on model tier
 * - Heartbeat monitoring for stuck sessions
 * - Query-able status for observability
 */
export async function agentSessionWorkflow(input: ClaudeSessionInput): Promise<ClaudeSessionResult> {
  let status = 'running';
  setHandler(currentStageQuery, () => status);

  // Get model-appropriate retry policy
  const policy = getPolicyForModel(input.model);

  // Create a proxy with the correct policy for this model
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
