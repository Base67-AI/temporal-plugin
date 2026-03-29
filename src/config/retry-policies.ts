import type { ActivityOptions } from '@temporalio/workflow';

/**
 * Retry and timeout policies per model tier.
 *
 * Each Claude Code session is a Temporal Activity. These policies control
 * how long sessions can run and how failures are retried.
 */

/** Opus: most capable, expensive — longer timeouts, fewer retries */
export const opusPolicy: ActivityOptions = {
  startToCloseTimeout: '30m',
  heartbeatTimeout: '10m',
  retry: {
    maximumAttempts: 2,
    initialInterval: '10s',
    backoffCoefficient: 2,
    maximumInterval: '2m',
  },
};

/** Sonnet: balanced capability and cost */
export const sonnetPolicy: ActivityOptions = {
  startToCloseTimeout: '20m',
  heartbeatTimeout: '10m',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5s',
    backoffCoefficient: 2,
    maximumInterval: '1m',
  },
};

/** Haiku: fast, cheap — short timeouts, more retries */
export const haikuPolicy: ActivityOptions = {
  startToCloseTimeout: '10m',
  heartbeatTimeout: '5m',
  retry: {
    maximumAttempts: 3,
    initialInterval: '3s',
    backoffCoefficient: 2,
    maximumInterval: '30s',
  },
};

/** File operations: deterministic, fast */
export const fileOpsPolicy: ActivityOptions = {
  startToCloseTimeout: '30s',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    backoffCoefficient: 2,
  },
};

/**
 * Get the appropriate retry policy for a given model.
 * Falls back to sonnet policy for unknown models.
 */
export function getPolicyForModel(model?: string): ActivityOptions {
  if (!model) return sonnetPolicy;

  const normalized = model.toLowerCase();
  if (normalized.includes('opus')) return opusPolicy;
  if (normalized.includes('haiku')) return haikuPolicy;
  return sonnetPolicy;
}
