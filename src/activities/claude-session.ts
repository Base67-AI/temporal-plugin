import { Context } from '@temporalio/activity';
import { query, ClaudeAgentOptions, AssistantMessage, TextBlock } from 'claude-agent-sdk';

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
 * Core Temporal Activity: spawn a Claude Code SDK session.
 *
 * Each call to this activity creates a full Claude Code session with file access,
 * tool use, skills, and agents — the complete Claude Code environment.
 *
 * Heartbeats are sent on each streamed message so Temporal can detect stuck sessions
 * and trigger timeouts appropriately.
 */
export async function runClaudeSession(input: ClaudeSessionInput): Promise<ClaudeSessionResult> {
  const ctx = Context.current();

  const options: ClaudeAgentOptions = {
    cwd: input.cwd || process.cwd(),
    permission_mode: (input.permissionMode as 'acceptEdits' | undefined) || 'acceptEdits',
  };

  if (input.systemPrompt) {
    options.system_prompt = input.systemPrompt;
  }

  if (input.allowedTools) {
    options.allowed_tools = input.allowedTools;
  }

  if (input.maxTurns) {
    options.max_turns = input.maxTurns;
  }

  let output = '';
  let messageCount = 0;

  try {
    for await (const message of query({ prompt: input.prompt, options })) {
      messageCount++;

      // Heartbeat on every message so Temporal knows we're alive
      ctx.heartbeat({
        messagesProcessed: messageCount,
        description: input.description,
      });

      // Extract text content from assistant messages
      if (isAssistantMessage(message)) {
        for (const block of (message as AssistantMessage).content) {
          if (isTextBlock(block)) {
            output += (block as TextBlock).text + '\n';
          }
        }
      }
    }

    return {
      success: true,
      output: output.trim(),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      output: output.trim(),
      error: errorMessage,
    };
  }
}

function isAssistantMessage(msg: unknown): msg is AssistantMessage {
  return typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>).role === 'assistant';
}

function isTextBlock(block: unknown): block is TextBlock {
  return typeof block === 'object' && block !== null && (block as Record<string, unknown>).type === 'text';
}
