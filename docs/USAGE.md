# agent-sync detailed usage guide

> Step-by-step companion to the [README](../README.md).  
> 中文版：[USAGE.zh-CN.md](./USAGE.zh-CN.md)

## 1. Install locally

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm link
agent-sync version
```

If `npm link` fails due to permissions, always use the absolute path:

```bash
node /absolute/path/agent-sync/bin/agent-sync.mjs <command>
```

## 2. Initialize inside your product repo

```bash
cd /your/project/root
agent-sync init
```

Creates:

- `AGENTS.md` — canonical instructions (edit this)
- `agent-sync.config.json` — enable/disable targets
- `AGENTS.override.md` entry in `.gitignore` — local Codex overrides (not committed)

Running `init` again preserves the existing source and config. Use `--yes` or `--force` only
when you intentionally want to regenerate the source; use `--dry-run` to preview initialization.

## 3. Edit AGENTS.md

At minimum document:

1. What the project does
2. How to install / develop / test
3. What must be asked / what must never be done
4. Directory layout and domain jargon

## 4. First sync

```bash
agent-sync apply
```

By default this generates (toggle in config):

- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/agents.mdc`
- `.codex/config.toml`

## 5. Day-to-day rule changes

```bash
# 1. Edit only AGENTS.md
# 2. Sync
agent-sync apply
# 3. Optional: assert no drift
agent-sync check
```

## 6. Migrate from existing tool files

```bash
agent-sync import --force
# Deduplicate / fix conflicts in AGENTS.md
agent-sync apply
```

`import` tries to collect:

- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `GEMINI.md`
- `CONVENTIONS.md`
- `.windsurfrules`
- `.clinerules`
- and related files

`AGENTS.override.md` is deliberately excluded because it is private, machine-local guidance.

## 7. Generate for a subset of tools

```bash
agent-sync apply --only claude,copilot
agent-sync apply --enable gemini --disable cursor-legacy
```

## 8. Monorepos

```bash
agent-sync -C packages/api init
agent-sync -C packages/api apply
agent-sync -C packages/web init
agent-sync -C packages/web apply
```

Each package can keep its own `AGENTS.md` and config.

## 9. CI integration

```bash
git clone --depth 1 https://github.com/Blackwindow6/agent-sync.git /tmp/agent-sync
cd /tmp/agent-sync && npm link
cd $GITHUB_WORKSPACE
agent-sync check
```

`check` returns exit code 1 on drift.

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `xx path blocked` | Target is hand-written; use `--force` after review, or delete the old file then apply |
| `AGENTS.md missing` | Run `init` first, or pass `--source` |
| Codex truncates long docs | Check `status` size; after apply inspect `project_doc_max_bytes` in `.codex/config.toml` |
| Codex managed-key conflict | Remove root `project_doc_max_bytes` / `project_doc_fallback_filenames`; set `codexMaxBytes` in agent-sync config for a custom budget |
| Symlink failures on Windows | Use default `auto` / `import` / `copy`; explicit `link` errors are reported and never fall back to a copy |
| Invalid mode / unknown target | Fix the config or CLI value shown in the error; invalid values are never silently downgraded |
| Preview only | `agent-sync apply --dry-run` or `agent-sync diff` |
