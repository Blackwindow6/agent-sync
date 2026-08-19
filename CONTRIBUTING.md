# Contributing to agent-sync

[English](#english) | [简体中文](#简体中文)

---

## English

Thanks for contributing!

### Setup

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
node --version   # >= 18
npm test
node bin/agent-sync.mjs help
```

No `npm install` needed — zero runtime dependencies.

### Project map

| Path | Role |
|------|------|
| `bin/agent-sync.mjs` | CLI entry |
| `src/cli.mjs`, `src/cli-*.mjs` | Command dispatch, flags, and handlers |
| `src/sync.mjs`, `src/sync-plan.mjs` | Execution and read-only planning |
| `src/targets.mjs`, `src/targets-*.mjs` | Target registry and adapters |
| `src/managed.mjs` | Managed-region validation and merging |
| `src/codex.mjs` | Codex TOML merge |
| `src/config.mjs` | Config defaults & I/O |
| `src/template.mjs` | Scaffold + import merge |
| `test/*.test.mjs` | `node:test` suite |

### Adding a new target

1. Define an adapter in `src/targets-core.mjs` or `src/targets-optional.mjs` (`id`, `path`, `defaultEnabled`, modes, `renderImport` / `renderCopy`).
2. Cover it in `test/sync.test.mjs`.
3. Document it in `README.md` and `README.zh-CN.md`.

### Pull requests

- Keep diffs focused
- Run `npm test` before opening a PR
- Update both English and Chinese docs when behavior changes
- Do not commit secrets or machine-local paths

### Code style

- ESM only (`"type": "module"`)
- No new runtime dependencies unless strongly justified
- Prefer clear names over clever abstractions
- Match existing formatting in touched files

---

## 简体中文

感谢参与贡献！

### 环境

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
node --version   # >= 18
npm test
node bin/agent-sync.mjs help
```

无需 `npm install` — 零运行时依赖。

### 目录职责

| 路径 | 作用 |
|------|------|
| `bin/agent-sync.mjs` | CLI 入口 |
| `src/cli.mjs`、`src/cli-*.mjs` | 命令分发、参数与处理器 |
| `src/sync.mjs`、`src/sync-plan.mjs` | 执行与只读规划 |
| `src/targets.mjs`、`src/targets-*.mjs` | target 注册表与适配器 |
| `src/managed.mjs` | 托管区校验与合并 |
| `src/codex.mjs` | Codex TOML 合并 |
| `src/config.mjs` | 配置默认值与读写 |
| `src/template.mjs` | 脚手架与 import 合并 |
| `test/*.test.mjs` | `node:test` 测试 |

### 新增 target

1. 在 `src/targets-core.mjs` 或 `src/targets-optional.mjs` 增加适配器（`id`、`path`、`defaultEnabled`、模式、`renderImport` / `renderCopy`）
2. 在 `test/sync.test.mjs` 补充测试
3. 同步更新 `README.md` 与 `README.zh-CN.md`

### 提交 PR

- 改动尽量聚焦
- 开 PR 前跑通 `npm test`
- 行为变更时中英文文档都要更新
- 不要提交密钥或本机绝对路径

### 代码风格

- 仅使用 ESM（`"type": "module"`）
- 除非有充分理由，不要引入新的运行时依赖
- 命名清晰，少炫技抽象
- 与周边文件格式保持一致
