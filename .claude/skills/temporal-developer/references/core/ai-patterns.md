# AI/LLM Integration Patterns with Temporal

## Pattern 1: Activities Wrap LLM Calls

A single activity handles model routing, prompts, tools, and chat history. This enables:
- Consistent retry handling across all LLM calls
- Centralized configuration (model, temperature, max tokens)
- Heartbeat monitoring for long-running sessions

```typescript
// Activity: wraps a Claude Code session
export async function runClaudeSession(input: ClaudeSessionInput): Promise<ClaudeSessionResult> {
  const ctx = Context.current();

  for await (const message of query({ prompt: input.prompt, options })) {
    ctx.heartbeat({ messagesProcessed: ++count });
    // Process message...
  }

  return { success: true, output };
}
```

## Pattern 2: Non-Deterministic Tools in Activities

Heavy or non-deterministic operations (API calls, file system, shell commands) execute in activities:

```typescript
// Activity: file operations
export async function readSpecFile(path: string): Promise<string> {
  return readFileSync(path, 'utf-8');
}

// Activity: build project
export async function runBuild(projectPath: string): Promise<BuildResult> {
  const result = execSync('npm run build', { cwd: projectPath });
  return { success: true, output: result.toString() };
}
```

## Pattern 3: Deterministic State Mutations in Workflows

State tracking belongs in workflow code since agent state is in bijection with workflow state:

```typescript
export async function pipeline(steps: Step[]) {
  const status: Record<string, string> = {};  // Deterministic state

  for (const step of steps) {
    status[step.id] = 'running';
    const result = await runClaudeSession(step);  // Activity call
    status[step.id] = result.success ? 'complete' : 'failed';
  }
}
```

## Pattern 4: Centralized Retry Management

Disable client-level retries. Let Temporal handle all retry logic:

```typescript
// Configure retry at the proxy level, not in the activity
const { runClaudeSession } = proxyActivities({
  startToCloseTimeout: '10m',
  retry: {
    maximumAttempts: 3,
    initialInterval: '5s',
    backoffCoefficient: 2,
  },
});
```

## Pattern 5: Multi-Agent Orchestration

Use `Promise.allSettled()` for parallel agents to continue with partial results:

```typescript
const results = await Promise.allSettled([
  runClaudeSession({ prompt: 'Design graphics...', model: 'sonnet' }),
  runClaudeSession({ prompt: 'Design audio...', model: 'haiku' }),
]);

// Process results, handling individual failures
for (const result of results) {
  if (result.status === 'rejected') {
    log(`Agent failed: ${result.reason}`);
  }
}
```

## Timeout Recommendations

| Operation | Timeout |
|-----------|---------|
| Simple LLM call (Haiku) | 30-60s |
| Balanced LLM call (Sonnet) | 120-300s |
| Complex reasoning (Opus) | 300-600s |
| Full Claude Code session | 600-900s |
| Web search / tool use | 300s |
| Image/asset generation | 120s |
| Document processing | 60-120s |

## Error Classification

**Retryable:**
- Rate limits (429, RESOURCE_EXHAUSTED)
- Timeouts (deadline exceeded, socket timeout)
- Temporary server errors (500, 502, 503)
- Overloaded errors (529)

**Non-retryable:**
- Invalid API key / auth failure (401, 403)
- Policy violations (content filter)
- Invalid input (bad prompt, unsupported model)
- Billing / quota exceeded (402)

## Best Practices

1. Use structured outputs (JSON mode) for agent-to-agent communication
2. Parse rate-limit headers to inform retry timing
3. Mock LLM calls in tests using `@temporalio/testing`
4. Track token usage via activity-level logging
5. Set `heartbeatTimeout` shorter than `startToCloseTimeout` to detect stuck sessions
