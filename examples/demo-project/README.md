# demo-project

Minimal example for **agent-sync**.

## Try it

From the repository root:

```bash
node bin/agent-sync.mjs -C examples/demo-project apply
node bin/agent-sync.mjs -C examples/demo-project status
node bin/agent-sync.mjs -C examples/demo-project check
```

## Files

| File | Role |
|------|------|
| `AGENTS.md` | Source of truth (edit this) |
| `agent-sync.config.json` | Which targets are enabled |

Generated files (`CLAUDE.md`, `.codex/`, `.cursor/`, …) are produced by `apply` and are gitignored here on purpose.
