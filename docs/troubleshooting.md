# Troubleshooting

## Quick Diagnostics

Run these checks to identify the issue:

```bash
# 1. Is Temporal server running?
nc -z 127.0.0.1 7233 && echo "Server OK" || echo "Server NOT reachable"

# 2. Is the plugin built?
ls lib/client.js && echo "Built OK" || echo "Not built — run: npm run build"

# 3. Is a session workflow running?
cat "${CLAUDE_PLUGIN_DATA:-$PWD/.logs}/session-workflow-id" 2>/dev/null || echo "No active session"

# 4. List recent workflows
npm run client list
```

## Common Issues

### Agent calls not going through Temporal

**Symptom**: Agent calls work but don't appear in the Temporal UI.

**Causes**:
1. **Temporal server not running** — start it with `temporal server start-dev` or set `TEMPORAL_AUTO_LAUNCH=true`
2. **Worker not running** — start with `npm run worker` or use auto-launch
3. **Plugin not built** — run `npm install && npm run build`
4. **Plugin not loaded** — check with `/plugin list`; reload with `claude --plugin-dir /path/to/plugin`
5. **Session workflow not started** — check `$PLUGIN_DATA/session-workflow-id` exists

**Verify**: Check hook output in Claude Code — look for `[temporal-plugin]` messages.

### "Temporal server not reachable" on session start

**Causes**:
- Temporal server isn't running
- Wrong address — check `TEMPORAL_ADDRESS` matches your server
- Firewall blocking port 7233

**Fix**:
```bash
# Local: start the dev server
temporal server start-dev

# Or use auto-launch
TEMPORAL_AUTO_LAUNCH=true claude
```

### Activity timeout / heartbeat failure

**Symptom**: Workflow shows activity as timed out.

**Causes**:
- `claude` CLI not found in PATH
- Agent task is taking longer than the model's timeout (Opus: 30m, Sonnet: 20m, Haiku: 10m)
- Worker crashed during execution

**Fix**:
- Verify `claude` is in PATH: `which claude`
- For long tasks, consider breaking into pipeline steps
- Check worker logs: `cat $PLUGIN_DATA/temporal-worker.log`

### Auto-launch fails: "temporal CLI not found"

**Fix**: Install the Temporal CLI:
```bash
# macOS
brew install temporal

# Or download from: https://docs.temporal.io/cli
```

### Worker starts but no tasks execute

**Causes**:
- Worker connected to wrong server address
- Worker polling wrong task queue (should be `agent-orchestration`)
- Workflow started on different namespace

**Verify**:
```bash
# Check worker logs
cat $PLUGIN_DATA/temporal-worker.log

# Should show:
# [temporal-worker] Connected to 127.0.0.1:7233
# [temporal-worker] Task queue: agent-orchestration
```

### Pipeline step failed — downstream steps skipped

This is expected behavior. When a step fails, all steps that depend on it are automatically skipped with status `skipped`.

**Check**: Use `/temporal-status` or the Temporal UI to see which step failed and why.

### Stale session workflow ID

**Symptom**: intercept-agent.sh fails with "workflow not found".

**Cause**: Previous session didn't shut down cleanly (crash, force quit).

**Fix**:
```bash
# Remove stale ID file
rm "${CLAUDE_PLUGIN_DATA:-$PWD/.logs}/session-workflow-id"

# Restart Claude Code — a new session workflow will be created
```

### Zombie processes after session crash

If Claude Code crashes without running the Stop hook:

```bash
# Check for orphaned processes
cat $PLUGIN_DATA/temporal-worker.pid 2>/dev/null && echo "Worker PID found"
cat $PLUGIN_DATA/temporal-server.pid 2>/dev/null && echo "Server PID found"

# Kill them manually
kill $(cat $PLUGIN_DATA/temporal-worker.pid) 2>/dev/null
kill $(cat $PLUGIN_DATA/temporal-server.pid) 2>/dev/null
rm -f $PLUGIN_DATA/temporal-*.pid
```

## Temporal Cloud Issues

### Connection refused

- Verify your Cloud namespace address: `<namespace>.<account>.tmprl.cloud:7233`
- Check that mTLS certificates are configured if required
- See `/temporal-cloud` skill for detailed Cloud troubleshooting

### Authentication errors

Temporal Cloud uses mTLS. You may need to configure certificates in the worker connection. See the [Temporal Cloud docs](https://docs.temporal.io/cloud/tcld) for details.

## Logs

| Log File | Location | Content |
|----------|----------|---------|
| Server log | `$PLUGIN_DATA/temporal-server.log` | Temporal dev server output |
| Worker log | `$PLUGIN_DATA/temporal-worker.log` | Worker activity execution |
| Audit log | `$PLUGIN_DATA/agent-executions.jsonl` | All Agent call records |

## Getting Help

- **Temporal UI**: http://localhost:8233 — inspect workflow history, activity inputs/outputs
- **Skills**: `/temporal-status`, `/temporal-cloud`
- **Issues**: https://github.com/Base67-AI/temporal-plugin/issues
