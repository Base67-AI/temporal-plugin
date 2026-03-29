import { Client, Connection } from '@temporalio/client';
import { agentSessionWorkflow } from './workflows/agent-session';
import { orchestratePipeline, type PipelineDefinition } from './workflows/orchestrate';
import { parallelAgents } from './workflows/parallel-agents';
import type { ClaudeSessionInput } from './activities/claude-session';
import { AGENT_ORCHESTRATION_QUEUE, TEMPORAL_ADDRESS, TEMPORAL_NAMESPACE } from './config/task-queues';

/**
 * Temporal Client CLI
 *
 * Used by the hook interceptor and for manual workflow management.
 *
 * Commands:
 *   start-agent     Start a single agent session workflow
 *   start-pipeline  Start a multi-step pipeline workflow
 *   status          Query workflow status
 *   cancel          Cancel a running workflow
 *   list            List recent workflows
 */

async function getClient(): Promise<Client> {
  const connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  return new Client({ connection, namespace: TEMPORAL_NAMESPACE });
}

function generateWorkflowId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Start a single agent session — the primary entry point used by the hook.
 */
async function startAgent(args: Record<string, string>): Promise<void> {
  const client = await getClient();

  const input: ClaudeSessionInput = {
    prompt: args.prompt || '',
    description: args.description || 'agent-session',
    cwd: args.cwd || process.cwd(),
    model: args.model || undefined,
    maxTurns: args['max-turns'] ? parseInt(args['max-turns'], 10) : undefined,
    subagentType: args['subagent-type'] || undefined,
  };

  const workflowId = args['workflow-id'] || generateWorkflowId('agent');
  const isBackground = args.background === 'true';

  const handle = await client.workflow.start(agentSessionWorkflow, {
    taskQueue: AGENT_ORCHESTRATION_QUEUE,
    workflowId,
    args: [input],
  });

  if (isBackground) {
    // Return immediately with workflow ID for background agents
    console.log(JSON.stringify({ workflowId: handle.workflowId, status: 'started' }));
  } else {
    // Wait for result
    const result = await handle.result();
    console.log(JSON.stringify({ workflowId: handle.workflowId, ...result }));
  }
}

/**
 * Start a multi-step pipeline workflow.
 */
async function startPipeline(args: Record<string, string>): Promise<void> {
  const client = await getClient();

  // Read pipeline definition from stdin or file
  const definitionJson = args.definition;
  if (!definitionJson) {
    console.error('Error: --definition is required (JSON string or @filepath)');
    process.exit(1);
  }

  let definition: PipelineDefinition;
  if (definitionJson.startsWith('@')) {
    const fs = await import('fs');
    definition = JSON.parse(fs.readFileSync(definitionJson.slice(1), 'utf-8'));
  } else {
    definition = JSON.parse(definitionJson);
  }

  const workflowId = args['workflow-id'] || generateWorkflowId('pipeline');

  const handle = await client.workflow.start(orchestratePipeline, {
    taskQueue: AGENT_ORCHESTRATION_QUEUE,
    workflowId,
    args: [definition],
  });

  console.log(JSON.stringify({ workflowId: handle.workflowId, status: 'started' }));

  if (args.wait === 'true') {
    const result = await handle.result();
    console.log(JSON.stringify(result, null, 2));
  }
}

/**
 * Query workflow status.
 */
async function queryStatus(workflowId: string): Promise<void> {
  const client = await getClient();
  const handle = client.workflow.getHandle(workflowId);

  try {
    const stage = await handle.query('currentStage');
    const status = await handle.query('pipelineStatus');
    console.log(JSON.stringify({ workflowId, currentStage: stage, stageStatus: status }, null, 2));
  } catch (err) {
    // Workflow may have completed — try to get result
    try {
      const desc = await handle.describe();
      console.log(JSON.stringify({
        workflowId,
        status: desc.status.name,
        startTime: desc.startTime,
        closeTime: desc.closeTime,
      }, null, 2));
    } catch (descErr) {
      console.error(`Error querying workflow ${workflowId}:`, err);
      process.exit(1);
    }
  }
}

/**
 * Cancel a running workflow.
 */
async function cancelWorkflow(workflowId: string): Promise<void> {
  const client = await getClient();
  const handle = client.workflow.getHandle(workflowId);

  try {
    await handle.signal('cancel');
    console.log(JSON.stringify({ workflowId, action: 'cancel-signalled' }));
  } catch (err) {
    console.error(`Error cancelling workflow ${workflowId}:`, err);
    process.exit(1);
  }
}

/**
 * List recent workflows.
 */
async function listWorkflows(): Promise<void> {
  const client = await getClient();
  const workflows = client.workflow.list({
    query: `TaskQueue = "${AGENT_ORCHESTRATION_QUEUE}"`,
  });

  const results: Array<{ workflowId: string; status: string; startTime?: Date }> = [];
  for await (const wf of workflows) {
    results.push({
      workflowId: wf.workflowId,
      status: wf.status.name,
      startTime: wf.startTime,
    });
    if (results.length >= 20) break; // Limit output
  }

  console.log(JSON.stringify(results, null, 2));
}

// --- CLI argument parsing ---

function parseArgs(argv: string[]): { command: string; args: Record<string, string> } {
  const command = argv[2] || 'help';
  const args: Record<string, string> = {};

  for (let i = 3; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
      args[key] = value;
    } else {
      // Positional argument
      if (!args._positional) args._positional = arg;
      else args._positional += ' ' + arg;
    }
  }

  return { command, args };
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv);

  switch (command) {
    case 'start-agent':
      await startAgent(args);
      break;
    case 'start-pipeline':
      await startPipeline(args);
      break;
    case 'status':
      await queryStatus(args._positional || args['workflow-id'] || '');
      break;
    case 'cancel':
      await cancelWorkflow(args._positional || args['workflow-id'] || '');
      break;
    case 'list':
      await listWorkflows();
      break;
    default:
      console.log(`
Temporal Agent Orchestration CLI

Commands:
  start-agent     --prompt "..." --description "..." [--model opus] [--workflow-id ...]
  start-pipeline  --definition '{"name":"...","steps":[...],"workingDirectory":"..."}'
  status          <workflow-id>
  cancel          <workflow-id>
  list            Show recent workflows
      `);
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
