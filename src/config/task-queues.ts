/**
 * Temporal task queue constants.
 *
 * All agent orchestration work routes through a single queue by default.
 * Layer-specific queues can be added later for isolation/scaling.
 */

/** Primary task queue for all agent orchestration workflows */
export const AGENT_ORCHESTRATION_QUEUE = 'agent-orchestration';

/** Namespace used for all workflows */
export const TEMPORAL_NAMESPACE = 'default';

/** Default Temporal server address for local development */
export const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || '127.0.0.1:7233';
