# Building Pipelines

Pipelines let you chain multiple agent steps with dependencies, parallel execution, and per-step model selection.

## Quick Example

```bash
npm run client start-pipeline -- --definition '{
  "name": "code-review",
  "workingDirectory": "/path/to/project",
  "steps": [
    {
      "id": "analyze",
      "prompt": "Analyze the codebase structure and identify the main components",
      "description": "analyze codebase",
      "model": "sonnet"
    },
    {
      "id": "review",
      "prompt": "Review the code for bugs, security issues, and performance problems",
      "description": "code review",
      "model": "opus",
      "dependsOn": ["analyze"]
    },
    {
      "id": "report",
      "prompt": "Write a summary report of the analysis and review findings",
      "description": "write report",
      "model": "sonnet",
      "dependsOn": ["review"]
    }
  ]
}' --wait true
```

## Pipeline Definition Schema

```typescript
interface PipelineDefinition {
  name: string;                    // Human-readable name
  workingDirectory: string;        // Default cwd for all steps
  steps: PipelineStep[];           // Ordered list of steps
}

interface PipelineStep {
  id: string;                      // Unique step ID (e.g., "design", "code", "test")
  prompt: string;                  // Task prompt for the agent
  description: string;             // Short description (3-5 words)
  model?: string;                  // "opus", "sonnet", or "haiku"
  maxTurns?: number;               // Max conversation turns (default: 10)
  dependsOn?: string[];            // Step IDs that must complete first
  cwd?: string;                    // Override working directory
  systemPrompt?: string;           // System prompt override
  allowedTools?: string[];         // Tool permission allowlist
}
```

## Execution Patterns

### Sequential

Steps run one after another:

```json
{
  "steps": [
    { "id": "A", "prompt": "..." },
    { "id": "B", "prompt": "...", "dependsOn": ["A"] },
    { "id": "C", "prompt": "...", "dependsOn": ["B"] }
  ]
}
```

```
A → B → C
```

### Parallel (Fan-Out / Fan-In)

Independent steps run simultaneously:

```json
{
  "steps": [
    { "id": "A", "prompt": "..." },
    { "id": "B", "prompt": "..." },
    { "id": "C", "prompt": "...", "dependsOn": ["A", "B"] }
  ]
}
```

```
A ──┐
    ├──→ C
B ──┘
```

### Diamond

Combine sequential and parallel:

```json
{
  "steps": [
    { "id": "plan", "prompt": "..." },
    { "id": "frontend", "prompt": "...", "dependsOn": ["plan"] },
    { "id": "backend",  "prompt": "...", "dependsOn": ["plan"] },
    { "id": "integrate", "prompt": "...", "dependsOn": ["frontend", "backend"] }
  ]
}
```

```
         ┌─→ frontend ─┐
plan ───┤               ├──→ integrate
         └─→ backend  ─┘
```

## Model Selection Guide

Choose the right model for each step:

| Task Type | Recommended Model | Why |
|-----------|------------------|-----|
| Architecture, complex reasoning | `opus` | Most capable, handles nuance |
| Code generation, standard tasks | `sonnet` | Good balance of speed and quality |
| Simple lookups, formatting | `haiku` | Fast and cheap |
| Code review, security analysis | `opus` | Needs deep understanding |
| Testing, validation | `sonnet` | Reliable for structured tasks |

## Controlling Pipelines

### Check Status

```bash
npm run client status <workflow-id>
```

Or use the skill: `/temporal-status`

### Pause / Resume

```bash
# Pause (running steps finish, no new steps start)
npm run client -- signal <workflow-id> pause

# Resume
npm run client -- signal <workflow-id> resume
```

### Cancel

```bash
npm run client cancel <workflow-id>
```

## Pipeline Result

A completed pipeline returns:

```typescript
interface PipelineResult {
  success: boolean;                              // true if all steps succeeded
  stepResults: Record<string, ClaudeSessionResult>;  // Per-step output
  stageStatus: Record<string, StageStatus>;      // Per-step status
  events: PipelineEvent[];                       // Structured event log
}
```

Step statuses: `pending` → `running` → `complete` | `failed` | `skipped`

A step is `skipped` if a dependency failed.

## Using from a Skill

You can also build pipelines using the `/temporal-pipeline` skill, which provides an interactive pipeline builder with validation.

## Tips

- Keep steps focused — one clear task per step
- Use `maxTurns` to prevent runaway agents (default: 10)
- Set `systemPrompt` to provide step-specific context
- Use `allowedTools` to restrict what tools a step can use
- Monitor via Temporal UI at http://localhost:8233
