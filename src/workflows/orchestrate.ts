import {
  proxyActivities,
  setHandler,
  condition,
} from '@temporalio/workflow';
import type { ClaudeSessionInput, ClaudeSessionResult } from '../activities/claude-session';
import { getPolicyForModel } from '../config/retry-policies';
import {
  currentStageQuery,
  pipelineStatusQuery,
  pipelineLogQuery,
  cancelSignal,
  pauseSignal,
  resumeSignal,
  type StageStatus,
  type PipelineEvent,
} from './signals-queries';

/**
 * A step in a pipeline. Each step becomes a Claude Code session.
 */
export interface PipelineStep {
  /** Unique identifier for this step (e.g., "design", "critique", "code") */
  id: string;
  /** The prompt to send to the Claude Code session */
  prompt: string;
  /** Short description (3-5 words) */
  description: string;
  /** Model tier: 'opus', 'sonnet', 'haiku' */
  model?: string;
  /** Maximum conversation turns for this session */
  maxTurns?: number;
  /** Step IDs this step depends on (must complete first) */
  dependsOn?: string[];
  /** Working directory override for this step */
  cwd?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Tool permission allowlist */
  allowedTools?: string[];
  /** If true, skip this step (evaluated by the workflow) */
  skipCondition?: string;
}

/**
 * Pipeline definition passed to the orchestration workflow.
 */
export interface PipelineDefinition {
  /** Human-readable pipeline name */
  name: string;
  /** Ordered list of steps (dependencies control actual execution order) */
  steps: PipelineStep[];
  /** Default working directory for all steps */
  workingDirectory: string;
}

/**
 * Result of a completed pipeline.
 */
export interface PipelineResult {
  /** Whether all steps completed successfully */
  success: boolean;
  /** Per-step results keyed by step ID */
  stepResults: Record<string, ClaudeSessionResult>;
  /** Per-step status keyed by step ID */
  stageStatus: Record<string, StageStatus>;
  /** Structured event log */
  events: PipelineEvent[];
}

/**
 * Multi-Step Pipeline Orchestration Workflow
 *
 * Takes a pipeline definition (ordered steps with dependencies) and executes
 * them as Claude Code sessions. Steps with no unmet dependencies run in parallel.
 *
 * Features:
 * - Topological execution respecting dependsOn ordering
 * - Automatic parallelization of independent steps
 * - Real-time status via Temporal queries
 * - Graceful cancellation and pause/resume via signals
 * - Per-step retry policies based on model tier
 */
export async function orchestratePipeline(definition: PipelineDefinition): Promise<PipelineResult> {
  // State
  let currentStage = 'initializing';
  let cancelled = false;
  let paused = false;
  const stageStatus: Record<string, StageStatus> = {};
  const stepResults: Record<string, ClaudeSessionResult> = {};
  const events: PipelineEvent[] = [];

  // Initialize all stages as pending
  for (const step of definition.steps) {
    stageStatus[step.id] = 'pending';
  }

  // Register query handlers
  setHandler(currentStageQuery, () => currentStage);
  setHandler(pipelineStatusQuery, () => ({ ...stageStatus }));
  setHandler(pipelineLogQuery, () => [...events]);

  // Register signal handlers
  setHandler(cancelSignal, () => {
    cancelled = true;
    logEvent('pipeline', 'failed', 'Cancelled by signal');
  });
  setHandler(pauseSignal, () => {
    paused = true;
    logEvent('pipeline', 'pending', 'Paused by signal');
  });
  setHandler(resumeSignal, () => {
    paused = false;
    logEvent('pipeline', 'running', 'Resumed by signal');
  });

  function logEvent(stage: string, status: StageStatus, message?: string, durationMs?: number) {
    events.push({ timestamp: Date.now(), stage, status, message, durationMs });
  }

  logEvent('pipeline', 'running', `Starting pipeline: ${definition.name}`);

  // Topological execution
  const completed = new Set<string>();
  const failed = new Set<string>();
  const steps = definition.steps;

  while (completed.size + failed.size < steps.length && !cancelled) {
    // Wait while paused
    if (paused) {
      await condition(() => !paused || cancelled, '30m');
      if (cancelled) break;
    }

    // Find all steps whose dependencies are satisfied
    const ready = steps.filter(
      (s) =>
        !completed.has(s.id) &&
        !failed.has(s.id) &&
        (s.dependsOn || []).every((dep) => completed.has(dep))
    );

    if (ready.length === 0) {
      // Check if we're stuck because a dependency failed
      const blocked = steps.filter(
        (s) =>
          !completed.has(s.id) &&
          !failed.has(s.id) &&
          (s.dependsOn || []).some((dep) => failed.has(dep))
      );
      for (const step of blocked) {
        stageStatus[step.id] = 'skipped';
        failed.add(step.id);
        logEvent(step.id, 'skipped', 'Dependency failed');
      }
      if (blocked.length === 0) break; // True deadlock (shouldn't happen with valid DAG)
      continue;
    }

    // Execute ready steps in parallel
    const results = await Promise.allSettled(
      ready.map(async (step) => {
        currentStage = step.id;
        stageStatus[step.id] = 'running';
        logEvent(step.id, 'running');

        const startTime = Date.now();

        // Get model-appropriate policy
        const policy = getPolicyForModel(step.model);

        const { runClaudeSession } = proxyActivities<{
          runClaudeSession: (input: ClaudeSessionInput) => Promise<ClaudeSessionResult>;
        }>(policy);

        const result = await runClaudeSession({
          prompt: step.prompt,
          description: step.description,
          cwd: step.cwd || definition.workingDirectory,
          model: step.model,
          maxTurns: step.maxTurns || 10,
          systemPrompt: step.systemPrompt,
          allowedTools: step.allowedTools,
        });

        const durationMs = Date.now() - startTime;
        return { stepId: step.id, result, durationMs };
      })
    );

    // Process results
    for (const settled of results) {
      if (settled.status === 'fulfilled') {
        const { stepId, result, durationMs } = settled.value;
        stepResults[stepId] = result;

        if (result.success) {
          stageStatus[stepId] = 'complete';
          completed.add(stepId);
          logEvent(stepId, 'complete', undefined, durationMs);
        } else {
          stageStatus[stepId] = 'failed';
          failed.add(stepId);
          logEvent(stepId, 'failed', result.error, durationMs);
        }
      } else {
        // Activity threw an exception
        const stepId = ready[results.indexOf(settled)]?.id;
        if (stepId) {
          stageStatus[stepId] = 'failed';
          failed.add(stepId);
          logEvent(stepId, 'failed', String(settled.reason));
        }
      }
    }
  }

  currentStage = cancelled ? 'cancelled' : failed.size > 0 ? 'completed_with_errors' : 'complete';
  logEvent('pipeline', cancelled ? 'failed' : failed.size > 0 ? 'failed' : 'complete',
    `Pipeline finished: ${completed.size}/${steps.length} steps succeeded`);

  return {
    success: failed.size === 0 && !cancelled,
    stepResults,
    stageStatus,
    events,
  };
}

