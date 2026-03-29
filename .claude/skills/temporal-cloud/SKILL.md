---
name: temporal-cloud
description: Fix Temporal Cloud connection, auth, and config problems. Use when users hit login failures, connection errors, TLS/x509 errors, namespace mismatches, or see "no pollers" / RESOURCE_EXHAUSTED. Based on the official temporalio/skills-temporal-cloud.
---

# Temporal Cloud Troubleshooting

## Quick Diagnostics

```bash
# Check Temporal server reachability
temporal workflow list --namespace default --limit 1

# Check if worker is running
ps aux | grep "temporal.*worker" | grep -v grep

# For Temporal Cloud: verify account context
tcld account get
```

## Issue Classification

| Category | Key Symptoms | First Check |
|----------|--------------|-------------|
| Connection | "can't connect", timeout | Endpoint format, DNS, port 7233 |
| Auth | "access denied", handshake fail | API key or mTLS config |
| Namespace | "namespace not found" | Full namespace name format |
| Workers | "no pollers", tasks not picked up | `temporal task-queue describe` |
| Rate limits | RESOURCE_EXHAUSTED | APS limits |

## Endpoint Format

| Use Case | Endpoint |
|----------|----------|
| Workers & clients | `<namespace>.<account>.tmprl.cloud:7233` |
| Local dev | `localhost:7233` |

## Common Fixes

1. **Connection refused (local):** Run `temporal server start-dev`
2. **Worker not picking up tasks:** Verify task queue name matches between client and worker
3. **Namespace not found:** Use full format `<name>.<account-id>`
4. **Certificate errors:** Check `openssl x509 -enddate -noout -in cert.pem`

> Based on the official [temporalio/skills-temporal-cloud](https://github.com/temporalio/skills-temporal-cloud). Feedback: [#topic-ai on Temporal Slack](https://temporalio.slack.com/archives/C0818FQPYKY).
