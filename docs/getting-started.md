# Getting Started

This guide walks you through installing and using the Temporal plugin for Claude Code in under 5 minutes.

## Prerequisites

- **Node.js >= 20** — [nodejs.org](https://nodejs.org)
- **Temporal CLI** — [docs.temporal.io/cli](https://docs.temporal.io/cli)
- **Claude Code** — `claude` CLI in your PATH

## Option 1: Marketplace Install (Recommended)

```
/plugin marketplace add Base67-AI/temporal-plugin
```

That's it. The plugin auto-registers hooks and skills.

## Option 2: Local Install

```bash
git clone https://github.com/Base67-AI/temporal-plugin.git
cd temporal-plugin
npm install && npm run build
claude --plugin-dir .
```

## First Run

### Fully Automatic (Zero Setup)

Start Claude Code with auto-launch enabled — the plugin starts the Temporal server and worker for you:

```bash
TEMPORAL_AUTO_LAUNCH=true claude --plugin-dir /path/to/temporal-plugin
```

You should see in the session output:

```
[temporal-plugin] Auto-launch enabled
[temporal-plugin] Starting local Temporal dev server...
[temporal-plugin] Dev server ready after ~2s
[temporal-plugin] Starting worker...
[temporal-plugin] Session workflow started: session-1711234567-a1b2c3d4
```

### Manual Setup

If you prefer to manage infrastructure yourself:

```bash
# Terminal 1: Start Temporal
temporal server start-dev

# Terminal 2: Start the worker
cd /path/to/temporal-plugin && npm run worker

# Terminal 3: Start Claude Code
claude --plugin-dir /path/to/temporal-plugin
```

## Verify It Works

Once inside Claude Code, any Agent tool call is automatically routed through Temporal. You can verify by:

1. **Ask Claude to spawn a sub-agent** — it will be intercepted and run as a Temporal activity
2. **Check the Temporal UI** — open http://localhost:8233 and look for a `session-*` workflow
3. **Run the status skill** — type `/temporal-status` to see active workflows

## What Happens Behind the Scenes

When you start a Claude Code session with the plugin loaded:

1. The **SessionStart hook** starts a Temporal workflow that lives for the entire session
2. Every time Claude uses the **Agent tool**, the PreToolUse hook intercepts it
3. The agent task is sent to the session workflow as an **activity** (with retries and heartbeating)
4. The result comes back to Claude exactly as if the Agent tool ran natively
5. When the session ends, the **Stop hook** shuts everything down cleanly

If Temporal is unavailable at any point, everything falls back to native execution — no errors, no disruption.

## Next Steps

- [Configuration](configuration.md) — environment variables and tuning
- [Pipelines](pipelines.md) — build multi-step agent workflows
- [Architecture](architecture.md) — understand how the plugin works internally
- [Troubleshooting](troubleshooting.md) — common issues and fixes
