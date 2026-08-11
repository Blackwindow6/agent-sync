# Changelog

All notable changes to this project are documented in this file.

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
