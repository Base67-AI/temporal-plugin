import { proxyActivities, setHandler } from '@temporalio/workflow';
import type { ClaudeSessionInput, ClaudeSessionResult } from '../activities/claude-session';
import { getPolicyForModel } from '../config/retry-policies';
import { currentStageQuery, pipelineStatusQuery, type StageStatus } from './signals-queries';

/**
 * Parallel Agents Workflow (Fan-Out / Fan-In)
 *
 * Spawns multiple Claude Code sessions simultaneously and waits for all
 * to complete. Used for patterns like running graphic + audio designers
 * in parallel, or any batch of independent agent tasks.
 *
 * All tasks run concurrently as separate Temporal Activities with
 * individual retry policies based on their model tier.
 */
export async function parallelAgents(
  tasks: ClaudeSessionInput[]
): Promise<ClaudeSessionResult[]> {
  let currentStage = 'running';
  const stageStatus: Record<string, StageStatus> = {};

  // Initialize status for each task
  tasks.forEach((task, i) => {
    stageStatus[task.description || `task-${i}`] = 'pending';
  });

  setHandler(currentStageQuery, () => currentStage);
  setHandler(pipelineStatusQuery, () => ({ ...stageStatus }));

  const results = await Promise.allSettled(
    tasks.map(async (task, i) => {
      const key = task.description || `task-${i}`;
      stageStatus[key] = 'running';

      const policy = getPolicyForModel(task.model);
      const { runClaudeSession } = proxyActivities<{
        runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
      }>(policy);

      const result = await runClaudeSession(task);
      stageStatus[key] = result.success ? 'complete' : 'failed';
      return result;
    })
  );

  currentStage = 'complete';

  return results.map((settled, i) => {
    if (settled.status === 'fulfilled') {
      return settled.value;
    }
    return {
      success: false,
      output: '',
      error: `Task ${tasks[i]?.description || i} failed: ${String(settled.reason)}`,
    };
  });
}
