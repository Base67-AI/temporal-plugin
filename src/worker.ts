import { Worker, NativeConnection } from '@temporalio/worker';
import * as claudeActivities from './activities/claude-session';
import * as fileActivities from './activities/file-ops';
import { AGENT_ORCHESTRATION_QUEUE, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE } from './config/task-queues';

/**
 * Temporal Worker Process
 *
 * Polls the Temporal server for tasks and executes workflows + activities.
 * This is the long-running process that handles all agent orchestration work.
 *
 * Usage:
 *   npm run worker
 *   # or with custom address:
 *   TEMPORAL_ADDRESS=temporal.example.com:7233 npm run worker
 */
async function run(): Promise<void> {
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  console.log(`[temporal-worker] Connected to ${TEMPORAL_ADDRESS}`);
  console.log(`[temporal-worker] Namespace: ${TEMPORAL_NAMESPACE}`);
  console.log(`[temporal-worker] Task queue: ${AGENT_ORCHESTRATION_QUEUE}`);

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: AGENT_ORCHESTRATION_QUEUE,
    workflowsPath: require.resolve('./workflows/index'),
    activities: {
      ...claudeActivities,
      ...fileActivities,
    },
  });

  console.log('[temporal-worker] Worker started, polling for tasks...');

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[temporal-worker] Shutting down...');
    worker.shutdown();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await worker.run();
  console.log('[temporal-worker] Worker stopped.');
}

run().catch((err) => {
  console.error('[temporal-worker] Fatal error:', err);
  process.exit(1);
});
