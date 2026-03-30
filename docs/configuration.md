# Configuration

All configuration is done through environment variables. No config files to manage.

## Environment Variables

### Core

| Variable | Default | Description |
|----------|---------|-------------|
| `TEMPORAL_ADDRESS` | `127.0.0.1:7233` | Temporal server gRPC address |
| `TEMPORAL_AUTO_LAUNCH` | `false` | Auto-start infrastructure on session start |
| `TEMPORAL_AUTO_LAUNCH_UI_PORT` | `8233` | Temporal Web UI port (local dev server only) |

### Plugin System (Set by Claude Code)

| Variable | Description |
|----------|-------------|
| `CLAUDE_PLUGIN_ROOT` | Plugin installation directory |
| `CLAUDE_PLUGIN_DATA` | Plugin data directory (logs, PIDs, state) |

## Deployment Modes

### Local Development (Default)

No configuration needed. Start Temporal and the worker manually, or use auto-launch:

```bash
TEMPORAL_AUTO_LAUNCH=true claude
```

### Temporal Cloud

Point `TEMPORAL_ADDRESS` at your Cloud namespace. Auto-launch will only start the worker (skips dev server since the server is already reachable):

```bash
export TEMPORAL_ADDRESS=my-namespace.a1b2c.tmprl.cloud:7233
export TEMPORAL_AUTO_LAUNCH=true
claude
```

> Note: Temporal Cloud may require additional TLS/auth configuration in the worker. See the [Temporal Cloud docs](https://docs.temporal.io/cloud) for mTLS setup.

### Remote / Self-Hosted Server

Same as Cloud — set the address to your server:

```bash
export TEMPORAL_ADDRESS=temporal.mycompany.com:7233
export TEMPORAL_AUTO_LAUNCH=true
claude
```

## Retry Policy Tuning

Retry policies are defined in `src/config/retry-policies.ts` and keyed by model tier:

| Model | Start-to-Close Timeout | Heartbeat Timeout | Max Attempts | Backoff |
|-------|----------------------|-------------------|-------------|---------|
| **Opus** | 30 min | 10 min | 2 | Exponential (max 2 min) |
| **Sonnet** | 20 min | 10 min | 3 | Exponential (max 1 min) |
| **Haiku** | 10 min | 5 min | 3 | Exponential (max 30s) |

To customize, edit `src/config/retry-policies.ts` and rebuild (`npm run build`).

## Task Queue

All workflows and activities use a single task queue: `agent-orchestration` (defined in `src/config/task-queues.ts`). The worker polls this queue.

## Log Files

When auto-launch is enabled, logs are written to `$CLAUDE_PLUGIN_DATA/`:

| File | Content |
|------|---------|
| `temporal-server.log` | Temporal dev server output |
| `temporal-worker.log` | Worker process output |
| `agent-executions.jsonl` | Audit log of all Agent tool calls (always written) |

## Disabling the Plugin

The plugin is fully transparent. To disable Temporal routing without uninstalling:

- **Stop the worker** — Agent calls fall back to native execution automatically
- **Remove the plugin** — `/plugin remove temporal-orchestrator`
- **Don't set auto-launch** — without `TEMPORAL_AUTO_LAUNCH=true`, no infrastructure starts
