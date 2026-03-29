import { Context } from '@temporalio/activity';
import { spawn } from 'child_process';
import path from 'path';

/**
 * Input parameters for a Claude Code SDK session, mapping directly to
 * the Agent tool's parameters so the hook can forward them transparently.
 */
export interface ClaudeSessionInput {
  /** The task prompt for the Claude Code session */
  prompt: string;
  /** Short description (3-5 words) — maps to Agent tool's `description` */
  description: string;
  /** Working directory for the session */
  cwd?: string;
  /** Optional system prompt override */
  systemPrompt?: string;
  /** Tool permission allowlist */
  allowedTools?: string[];
  /** Maximum conversation turns */
  maxTurns?: number;
  /** Model override: 'opus', 'sonnet', 'haiku' */
  model?: string;
  /** Permission mode: 'acceptEdits', etc. */
  permissionMode?: string;
  /** Maps to Agent tool's subagent_type */
  subagentType?: string;
}

/**
 * Result from a Claude Code SDK session.
 */
export interface ClaudeSessionResult {
  success: boolean;
  /** Aggregated text output from the session */
  output: string;
  /** Error message if the session failed */
  error?: string;
  /** Workflow ID for tracking (set by the workflow, not the activity) */
  workflowId?: string;
}

/**
 * Core Temporal Activity: spawn a Claude Code session.
 *
 * Uses the @anthropic-ai/claude-code CLI to spawn a full Claude Code session
 * with file access, tool use, skills, and agents.
 *
 * Heartbeats are sent periodically so Temporal can detect stuck sessions
 * and trigger timeouts appropriately.
 */
export async function runClaudeSession(input: ClaudeSessionInput): Promise<ClaudeSessionResult> {
  const ctx = Context.current();
  const cwd = input.cwd || process.cwd();

  // Build claude CLI args
  // Use --output-format json for single-result mode (avoids --verbose requirement of stream-json)
  // Use --permission-mode to control tool permissions for sub-agents
  const permissionMode = input.permissionMode || 'acceptEdits';
  const args: string[] = [
    '-p', input.prompt,
    '--output-format', 'json',
    '--permission-mode', permissionMode,
  ];

  if (input.maxTurns) {
    args.push('--max-turns', String(input.maxTurns));
  }

  if (input.model) {
    args.push('--model', input.model);
  }

  if (input.systemPrompt) {
    args.push('--append-system-prompt', input.systemPrompt);
  }

  if (input.allowedTools && input.allowedTools.length > 0) {
    args.push('--allowed-tools', input.allowedTools.join(','));
  }

  return new Promise<ClaudeSessionResult>((resolve) => {
    let output = '';
    let messageCount = 0;

    // Find claude binary
    const claudeBin = findClaudeBinary(cwd);
    const isAbsolutePath = claudeBin.startsWith('/');

    // If it's a .js file, spawn with node; if it's a binary/symlink, spawn directly
    const spawnCmd = isAbsolutePath && claudeBin.endsWith('.js')
      ? process.execPath
      : claudeBin;
    const spawnArgs = isAbsolutePath && claudeBin.endsWith('.js')
      ? [claudeBin, ...args]
      : args;

    const proc = spawn(spawnCmd, spawnArgs, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Periodic heartbeat timer — ensures Temporal knows we're alive even when
    // --output-format json produces no intermediate output during long sessions
    const heartbeatInterval = setInterval(() => {
      ctx.heartbeat({
        messagesProcessed: messageCount,
        description: input.description,
        alive: true,
      });
    }, 30_000);

    // Send initial heartbeat immediately
    ctx.heartbeat({ messagesProcessed: 0, description: input.description, started: true });

    // Collect stdout (--output-format json returns a single JSON object)
    let rawStdout = '';
    proc.stdout?.on('data', (chunk: Buffer) => {
      rawStdout += chunk.toString();
      messageCount++;
    });

    let stderr = '';
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      clearInterval(heartbeatInterval);
      // Parse JSON output from claude CLI
      try {
        const result = JSON.parse(rawStdout);
        output = typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result);
      } catch {
        output = rawStdout.trim();
      }

      resolve({
        success: code === 0,
        output: output.trim(),
        error: code !== 0 ? `Exit code ${code}: ${stderr.slice(0, 500)}` : undefined,
      });
    });

    proc.on('error', (err) => {
      clearInterval(heartbeatInterval);
      resolve({
        success: false,
        output: output.trim(),
        error: err.message,
      });
    });
  });
}

/**
 * Find the claude CLI binary, checking common locations.
 */
function findClaudeBinary(cwd: string): string {
  const candidates = [
    path.resolve(cwd, 'node_modules/@anthropic-ai/claude-code/cli.js'),
    path.resolve(cwd, '../node_modules/@anthropic-ai/claude-code/cli.js'),
    path.resolve(cwd, '../../node_modules/@anthropic-ai/claude-code/cli.js'),
  ];

  // Also check if claude is available globally
  for (const candidate of candidates) {
    try {
      require.resolve(candidate);
      return candidate;
    } catch {
      // Not found, try next
    }
  }

  // Fallback: assume it's in PATH
  return 'claude';
}
