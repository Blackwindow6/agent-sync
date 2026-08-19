# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Changed

- Split CLI, planning, target adapters, and managed-region logic into focused modules
- Validate CLI options and config values instead of silently downgrading invalid modes
- Make repeated `init` idempotent and make `init --dry-run` accurately report planned writes
- Report symlink failures explicitly instead of falling back to generated content

### Fixed

- Protect unmanaged files and symlinks in `link` mode
- Prevent source files from being overwritten when a source path matches a target path
- Replace symlinks atomically when switching back to `copy` or `import` mode
- Reject malformed managed markers without losing user-owned content
- Preserve custom Codex document byte budgets in generated project config
- Keep managed Codex keys at TOML root and reject duplicate user-defined root keys
- Keep private `AGENTS.override.md` content out of imports
- Reject project-escaping symlinks by default, with `allowExternalSymlinks` as an explicit opt-out
- Reject source and imported instruction paths that resolve into `.git` metadata
- Prevent writes from escaping through symlinked source or target parent directories

## [0.2.0] - 2026-03-21

### Added

- Multi-target sync from a single `AGENTS.md`
- Built-in adapters: Codex, Claude Code, Copilot, Cursor (rules + legacy), Gemini, Windsurf, Aider, Cline, Continue
- Commands: `init`, `apply`/`sync`, `check`, `diff`, `status`, `import`, `targets`
- Sync modes: `auto`, `import`, `copy`, `link`
- Managed markers so user notes outside the region are preserved
- Codex `.codex/config.toml` generation (fallback filenames + doc size budget)
- `codex-agents` mirror when source is not root `AGENTS.md`
- Windows-friendly defaults (no mandatory symlinks)
- Zero runtime dependencies
- Bilingual documentation (English + 简体中文)
- CI workflow (Linux / Windows / macOS × Node 18/20/22)

### Notes

- Inspired by the [AGENTS.md](https://agents.md/) open format
