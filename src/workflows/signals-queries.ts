import { defineQuery, defineSignal, defineUpdate } from '@temporalio/workflow';
import type { ClaudeSessionInput, ClaudeSessionResult } from '../activities/claude-session';

/**
 * Shared signal, query, and update definitions used across all orchestration workflows.
 *
 * Queries provide real-time observability into running workflows.
 * Signals enable external control (cancellation, pause/resume).
 * Updates provide request-response semantics for dispatching activities.
 */

/** Query: get the current pipeline stage (e.g., "design", "code", "validate") */
export const currentStageQuery = defineQuery<string>('currentStage');

/** Query: get the full status map of all stages */
export const pipelineStatusQuery = defineQuery<Record<string, StageStatus>>('pipelineStatus');

/** Query: get the pipeline log (structured events) */
export const pipelineLogQuery = defineQuery<PipelineEvent[]>('pipelineLog');

/** Signal: request graceful cancellation of the pipeline */
export const cancelSignal = defineSignal('cancel');

/** Signal: pause the pipeline (won't start new stages, running stages finish) */
export const pauseSignal = defineSignal('pause');

/** Signal: resume a paused pipeline */
export const resumeSignal = defineSignal('resume');

/** Signal: shut down the session workflow gracefully */
export const shutdownSignal = defineSignal('shutdown');

/** Update: execute an agent task as an activity within the session workflow (request-response) */
export const executeAgentTaskUpdate = defineUpdate<ClaudeSessionResult, [ClaudeSessionInput]>('executeAgentTask');

export type StageStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';

export interface PipelineEvent {
  timestamp: number;
  stage: string;
  status: StageStatus;
  message?: string;
  durationMs?: number;
}
