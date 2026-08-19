# agent-sync

[![CI](https://github.com/Blackwindow6/agent-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/Blackwindow6/agent-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

**English** | [简体中文](./README.zh-CN.md)

> **One `AGENTS.md` → every coding agent.**

Sync a single source of truth to **OpenAI Codex**, Claude Code, Cursor, GitHub Copilot, Gemini CLI, Windsurf, Aider, Cline/Roo, Continue, and more.

Inspired by the [AGENTS.md](https://agents.md/) open format and the demand for cross-tool compatibility ([Claude Code #6235](https://github.com/anthropics/claude-code/issues/6235)).

---

## Why agent-sync?

| Tool | Native instruction file |
|------|-------------------------|
| **OpenAI Codex** | `AGENTS.md` (+ optional `AGENTS.override.md`, `.codex/config.toml`) |
| Cursor / Copilot coding agent / Aider | `AGENTS.md` (and/or tool-specific files) |
| Claude Code | `CLAUDE.md` only |
| Cursor (legacy) | `.cursorrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Gemini CLI | `GEMINI.md` |
| Windsurf | `.windsurfrules` |

Teams usually maintain N copies that drift. **agent-sync** keeps **one** file and generates the rest.

### Design principles

1. **`AGENTS.md` is canonical** — never the reverse (except one-shot `import`)
2. **Non-destructive** — won't clobber hand-written files without `--force`
3. **Zero runtime dependencies** — single portable CLI
4. **Windows-friendly** — no mandatory symlinks

---

## Requirements

- **Node.js ≥ 18**
- Works on **Windows / macOS / Linux**

---

## Install

### Option A — clone & link (recommended for now)

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm link          # installs `agent-sync` globally from this folder
```

### Option B — run without installing

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
node agent-sync/bin/agent-sync.mjs --help
```

### Option C — use from another project without global install

```bash
node /path/to/agent-sync/bin/agent-sync.mjs -C /path/to/your-project apply
```

---

## Quick start (3 steps)

```bash
cd your-project

# 1) Scaffold AGENTS.md + agent-sync.config.json
agent-sync init

# 2) Edit AGENTS.md (project rules, commands, architecture notes)

# 3) Write tool-specific files
agent-sync apply
```

**Daily workflow:** edit only `AGENTS.md` → run `agent-sync apply`.

### Already have `CLAUDE.md` / `.cursorrules` / Copilot instructions?

```bash
agent-sync import --force
# Review & clean up AGENTS.md, then:
agent-sync apply
```

### Try the built-in demo

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
node bin/agent-sync.mjs -C examples/demo-project apply
node bin/agent-sync.mjs -C examples/demo-project status
```

---

## Commands

| Command | Description |
|---------|-------------|
| `init` | Create `AGENTS.md` + `agent-sync.config.json` |
| `apply` / `sync` | Write/update all enabled target files |
| `check` | Exit `1` if any target drifted (CI-friendly) |
| `diff` | Show which targets would change |
| `status` | Overview of source + targets |
| `import` | Merge existing tool files into `AGENTS.md` |
| `targets` | List built-in adapters |
| `help` | Show help |
| `version` | Print version |

### Global options

```text
-C, --cwd <dir>     Working directory (default: .)
--force             Overwrite unmanaged target files / force regenerate
--dry-run           Plan only (apply / import)
--mode <mode>       Override mode: auto | import | copy | link
--source <file>     Override source path (default: AGENTS.md)
--only <ids>        Comma-separated target ids (enable only these)
--enable <ids>      Enable targets
--disable <ids>     Disable targets
-y, --yes           Overwrite the source during init/import
-h, --help          Help
```

Invalid modes, unknown targets, missing option values, and mode/target combinations that are
not supported fail with a non-zero exit code instead of being silently downgraded.

### Examples

```bash
# Only Claude + Codex
agent-sync apply --only codex,codex-agents,claude

# Preview without writing
agent-sync apply --dry-run

# Work on another project
agent-sync -C ../my-app apply

# Enable extra tools
agent-sync apply --enable gemini,aider,windsurf

# CI drift check
agent-sync check
```

---

## Configuration

File: **`agent-sync.config.json`** (created by `init`)

```json
{
  "source": "AGENTS.md",
  "mode": "auto",
  "protectUnmanaged": true,
  "allowExternalSymlinks": false,
  "targets": {
    "codex": true,
    "codex-agents": true,
    "claude": true,
    "copilot": true,
    "cursor-rules": true,
    "cursor-legacy": false,
    "gemini": false,
    "windsurf": false,
    "aider": false,
    "cline": false,
    "continue": false
  }
}
```

| Field | Meaning |
|-------|---------|
| `source` | Project-relative canonical instruction file (usually `AGENTS.md`) |
| `mode` | Default sync mode: `auto` / `import` / `copy` / `link` |
| `protectUnmanaged` | If `true`, refuse to overwrite hand-written targets without `--force` |
| `allowExternalSymlinks` | Explicit opt-out for repos that intentionally resolve agent-sync input files outside the project |
| `codexMaxBytes` | Optional positive integer for the Codex document budget (default: `32768`) |
| `targets.<id>` | Enable/disable each adapter |

You can put the source elsewhere (e.g. `docs/AGENT_GUIDE.md`). With `codex-agents` enabled, agent-sync will mirror it to root `AGENTS.md` for Codex discovery.

---

## Built-in targets

| id | Path | Default | Notes |
|----|------|---------|-------|
| `codex` | `.codex/config.toml` | on | Fallback filenames + doc size budget |
| `codex-agents` | `AGENTS.md` | on | Mirrors non-root source → root `AGENTS.md` (no-op if source is already root) |
| `claude` | `CLAUDE.md` | on | Claude Code does not natively read `AGENTS.md` |
| `copilot` | `.github/copilot-instructions.md` | on | Full copy with managed markers |
| `cursor-rules` | `.cursor/rules/agents.mdc` | on | Cursor project rules |
| `cursor-legacy` | `.cursorrules` | off | Legacy Cursor |
| `gemini` | `GEMINI.md` | off | Gemini CLI |
| `windsurf` | `.windsurfrules` | off | Windsurf |
| `aider` | `CONVENTIONS.md` | off | Aider |
| `cline` | `.clinerules` | off | Cline / Roo |
| `continue` | `.continue/rules/agents.md` | off | Continue.dev |

List them anytime:

```bash
agent-sync targets
```

---

## Sync modes

| Mode | Behavior | Best for |
|------|----------|----------|
| **auto** (default) | Per-target preferred mode; on Windows, avoids fragile symlinks | Most users |
| **import** | Thin wrapper pointing at `AGENTS.md` (e.g. Claude `@AGENTS.md`) | Claude, small pointers |
| **copy** | Full content with managed markers | Copilot, Cursor MDC, tools that only read their own file |
| **link** | Symlink to `AGENTS.md`; failures are reported explicitly | Environments with symlink support |

### Managed regions

Generated files wrap content in markers:

```html
<!-- agent-sync:start -->
…
<!-- agent-sync:end -->
```

**Anything you write outside these markers is preserved** on the next `apply`.

TOML targets (Codex) use:

```toml
# agent-sync:start
…
# agent-sync:end
```

---

## Codex support

Codex already reads root [`AGENTS.md`](https://developers.openai.com/codex/guides/agents-md). agent-sync adds:

| Target | Path | What it does |
|--------|------|----------------|
| `codex` | `.codex/config.toml` | Sets `project_doc_fallback_filenames` (e.g. `CLAUDE.md`) and raises `project_doc_max_bytes` when your guide is large (Codex default budget is **32 KiB**) |
| `codex-agents` | `AGENTS.md` | If source lives elsewhere, mirrors it to root `AGENTS.md` |

On `init`:

- Adds `AGENTS.override.md` to `.gitignore` (Codex local overrides — keep personal notes out of git)
- `check` / `status` report source size vs Codex budget

```bash
agent-sync apply --only codex,codex-agents,claude
```

---

## End-to-end workflows

### A. Brand-new project

```bash
cd my-app
agent-sync init
# edit AGENTS.md
agent-sync apply
agent-sync status
```

### B. Existing monorepo with scattered rules

```bash
cd my-app
agent-sync import --force
# clean up AGENTS.md (remove duplicates, fix conflicts)
agent-sync apply --force   # only if old tool files should be fully replaced
agent-sync check
```

### C. CI guard (prevent drift)

```yaml
# .github/workflows/agent-sync.yml
name: agent-sync
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install agent-sync
        run: |
          git clone --depth 1 https://github.com/Blackwindow6/agent-sync.git /tmp/agent-sync
          npm link --prefix /tmp/agent-sync
          # or: npm i -g /tmp/agent-sync
      - name: Check instruction files in sync
        run: agent-sync check
        working-directory: ${{ github.workspace }}
```

If someone edits only `CLAUDE.md` and forgets `AGENTS.md`, `check` fails.

### D. Large instruction file (> 32 KiB)

Codex truncates project docs by default. After `apply`, inspect:

```bash
agent-sync status
# size line shows bytes vs Codex budget
```

The `codex` target raises `project_doc_max_bytes` in `.codex/config.toml` when needed.

---

## Writing a good `AGENTS.md`

`init` scaffolds a template. Recommended sections:

1. **Project overview** — what it is, domain constraints
2. **Toolchain** — install / dev / test / lint commands
3. **Judgment boundaries** — ASK / ALWAYS / NEVER
4. **Code style** — only what tools don't already enforce
5. **Architecture notes** — key dirs, entry points, jargon
6. **Verification** — how agents know a task is done

Tips:

- Prefer short, actionable rules over essays
- Put secrets and personal prefs in `AGENTS.override.md` (gitignored)
- After every edit: `agent-sync apply`

---

## Safety & non-destructive behavior

| Situation | Behavior |
|-----------|----------|
| Target missing | Created |
| Target managed by agent-sync | Updated inside markers |
| Target hand-written, `protectUnmanaged: true` | **Blocked** unless `--force` |
| Target is an unmanaged symlink | **Blocked** unless `--force` |
| Managed markers are malformed | Fails explicitly without rewriting the file |
| Source path equals a target path | Target is skipped; the source is never rewritten |
| User notes outside markers | **Preserved** |
| `apply --dry-run` | No disk writes |

Blocked files exit with code `2` so scripts can detect them.
Source paths must be project-relative and, by default, may not resolve outside the selected project
directory through symlinks. Repositories that intentionally use those links can set
`allowExternalSymlinks: true`. Paths that resolve into the current project's `.git` metadata are
always rejected. Generated targets never follow parent-directory symlinks outside the project.
`AGENTS.override.md` is local-only and is never merged by `import`.

---

## Project layout (this repo)

```text
agent-sync/
├── bin/agent-sync.mjs      # CLI entry
├── src/
│   ├── cli.mjs             # command dispatcher
│   ├── cli-*.mjs           # argument parsing and command handlers
│   ├── sync.mjs            # apply / check execution
│   ├── sync-plan.mjs       # read-only planning and safety checks
│   ├── targets.mjs         # target registry
│   ├── targets-*.mjs       # adapters per tool
│   ├── managed.mjs         # managed-region merge helpers
│   ├── codex.mjs           # Codex TOML helpers
│   ├── config.mjs          # config load/save
│   ├── template.mjs        # AGENTS.md scaffold + import merge
│   └── fsutil.mjs          # filesystem helpers
├── templates/AGENTS.md     # default scaffold
├── examples/demo-project/  # minimal example
├── test/                   # node:test suite
├── README.md               # English docs (this file)
├── README.zh-CN.md         # 简体中文文档
└── package.json
```

---

## Development

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm test                  # node --test
node bin/agent-sync.mjs help
```

No build step. No dependencies. Edit `src/*.mjs` and re-run.

---

## FAQ

**Q: Does Cursor still need `.cursor/rules` if it reads `AGENTS.md`?**  
A: Many setups work with root `AGENTS.md` alone. Enabling `cursor-rules` keeps a managed MDC rule for older/ stricter Cursor configs.

**Q: Will `apply` delete my custom notes in `CLAUDE.md`?**  
A: Notes **outside** `<!-- agent-sync:start/end -->` are kept. Content inside the markers is regenerated.

**Q: Can the source file not be named `AGENTS.md`?**  
A: Yes — set `"source": "docs/guide.md"` and keep `codex-agents: true` so Codex still finds root `AGENTS.md`.

**Q: Symlinks on Windows?**  
A: Default `auto` mode avoids requiring Developer Mode / admin privileges. Prefer `import` or
`copy`. An explicit `link` mode performs a real symlink operation and reports permission or
filesystem errors; it does not silently write a copy instead.

**Q: How do I turn off Copilot generation?**  
A: `"copilot": false` in config, or `agent-sync apply --disable copilot`.

---

## License

[MIT](./LICENSE)

---

## Links

- [AGENTS.md format](https://agents.md/)
- [OpenAI Codex — AGENTS.md guide](https://developers.openai.com/codex/guides/agents-md)
- [中文完整文档](./README.zh-CN.md)
- [Contributing](./CONTRIBUTING.md)
