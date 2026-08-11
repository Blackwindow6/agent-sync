# agent-sync

[![CI](https://github.com/Blackwindow6/agent-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/Blackwindow6/agent-sync/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

[English](./README.md) | **简体中文**

> **一份 `AGENTS.md` → 同步到所有主流 Coding Agent。**

把项目的唯一说明源同步到 **OpenAI Codex**、Claude Code、Cursor、GitHub Copilot、Gemini CLI、Windsurf、Aider、Cline/Roo、Continue 等工具。

灵感来自开放格式 [AGENTS.md](https://agents.md/)，以及跨工具兼容的强烈需求（例如 [Claude Code #6235](https://github.com/anthropics/claude-code/issues/6235) 上对原生支持 `AGENTS.md` 的呼声）。

---

## 为什么需要 agent-sync？

| 工具 | 原生指令文件 |
|------|----------------|
| **OpenAI Codex** | `AGENTS.md`（可选 `AGENTS.override.md`、`.codex/config.toml`） |
| Cursor / Copilot coding agent / Aider | `AGENTS.md`（和/或各工具专属文件） |
| Claude Code | 仅 `CLAUDE.md` |
| Cursor（旧版） | `.cursorrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| Gemini CLI | `GEMINI.md` |
| Windsurf | `.windsurfrules` |

团队往往要维护 N 份说明，很容易漂移。**agent-sync** 只维护 **一份**，其余自动生成。

### 设计原则

1. **`AGENTS.md` 是唯一权威源** — 反向同步仅允许一次性的 `import`
2. **非破坏性** — 没有 `--force` 不会覆盖手写文件
3. **零运行时依赖** — 单个可移植 CLI
4. **Windows 友好** — 不强制要求符号链接

---

## 环境要求

- **Node.js ≥ 18**
- 支持 **Windows / macOS / Linux**

---

## 安装

### 方式 A — 克隆并 link（当前推荐）

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm link          # 把本目录的 agent-sync 挂到全局命令
```

### 方式 B — 不安装，直接运行

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
node agent-sync/bin/agent-sync.mjs --help
```

### 方式 C — 在其他项目里调用（不装全局）

```bash
node /path/to/agent-sync/bin/agent-sync.mjs -C /path/to/your-project apply
```

Windows PowerShell 示例：

```powershell
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm link
# 然后在任意项目：
cd D:\my-app
agent-sync init
agent-sync apply
```

---

## 三分钟上手

```bash
cd your-project

# 1) 生成 AGENTS.md + agent-sync.config.json
agent-sync init

# 2) 编辑 AGENTS.md（项目约定、命令、架构说明）

# 3) 写出各工具所需文件
agent-sync apply
```

**日常流程：** 只改 `AGENTS.md` → 执行 `agent-sync apply`。

### 项目里已经有 `CLAUDE.md` / `.cursorrules` / Copilot 说明？

```bash
agent-sync import --force
# 人工整理 AGENTS.md 后：
agent-sync apply
```

### 跑仓库自带 demo

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
node bin/agent-sync.mjs -C examples/demo-project apply
node bin/agent-sync.mjs -C examples/demo-project status
```

---

## 命令一览

| 命令 | 说明 |
|------|------|
| `init` | 创建 `AGENTS.md` + `agent-sync.config.json` |
| `apply` / `sync` | 写入/更新所有已启用目标 |
| `check` | 有漂移则 exit `1`（适合 CI） |
| `diff` | 预览哪些目标会变化 |
| `status` | 源文件与各 target 状态总览 |
| `import` | 把已有工具文件合并进 `AGENTS.md` |
| `targets` | 列出内置适配器 |
| `help` | 帮助 |
| `version` | 版本号 |

### 全局参数

```text
-C, --cwd <dir>     工作目录（默认当前目录）
--force             覆盖未托管目标 / 强制重新生成
--dry-run           只规划不写盘（apply / import）
--mode <mode>       覆盖模式：auto | import | copy | link
--source <file>     覆盖源文件路径（默认 AGENTS.md）
--only <ids>        只启用这些 target（逗号分隔）
--enable <ids>      启用指定 target
--disable <ids>     禁用指定 target
-y, --yes           跳过确认；init/import 时允许覆盖
-h, --help          帮助
```

### 常用示例

```bash
# 只同步 Claude + Codex
agent-sync apply --only codex,codex-agents,claude

# 预览，不写文件
agent-sync apply --dry-run

# 操作另一个项目
agent-sync -C ../my-app apply

# 额外打开 Gemini / Aider / Windsurf
agent-sync apply --enable gemini,aider,windsurf

# CI 漂移检查
agent-sync check
```

---

## 配置文件

文件名：**`agent-sync.config.json`**（由 `init` 创建）

```json
{
  "source": "AGENTS.md",
  "mode": "auto",
  "protectUnmanaged": true,
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

| 字段 | 含义 |
|------|------|
| `source` | 权威说明文件（通常是 `AGENTS.md`） |
| `mode` | 默认同步模式：`auto` / `import` / `copy` / `link` |
| `protectUnmanaged` | 为 `true` 时，无 `--force` 不覆盖手写目标文件 |
| `targets.<id>` | 开关各个适配器 |

源文件也可以放在别处（例如 `docs/AGENT_GUIDE.md`）。开启 `codex-agents` 时，会镜像到根目录 `AGENTS.md`，方便 Codex 发现。

---

## 内置目标（targets）

| id | 路径 | 默认 | 说明 |
|----|------|------|------|
| `codex` | `.codex/config.toml` | 开 | fallback 文件名 + 文档大小预算 |
| `codex-agents` | `AGENTS.md` | 开 | 非根目录源 → 镜像到根 `AGENTS.md`（源已是根目录则跳过） |
| `claude` | `CLAUDE.md` | 开 | Claude Code 原生不读 `AGENTS.md` |
| `copilot` | `.github/copilot-instructions.md` | 开 | 带托管标记的全文复制 |
| `cursor-rules` | `.cursor/rules/agents.mdc` | 开 | Cursor 项目规则 |
| `cursor-legacy` | `.cursorrules` | 关 | 旧版 Cursor |
| `gemini` | `GEMINI.md` | 关 | Gemini CLI |
| `windsurf` | `.windsurfrules` | 关 | Windsurf |
| `aider` | `CONVENTIONS.md` | 关 | Aider |
| `cline` | `.clinerules` | 关 | Cline / Roo |
| `continue` | `.continue/rules/agents.md` | 关 | Continue.dev |

随时查看：

```bash
agent-sync targets
```

---

## 同步模式

| 模式 | 行为 | 适合 |
|------|------|------|
| **auto**（默认） | 按目标选最优；Windows 上避免脆弱软链 | 大多数人 |
| **import** | 薄包装，指向 `AGENTS.md`（如 Claude 的 `@AGENTS.md`） | Claude 等 |
| **copy** | 完整内容 + 托管标记 | Copilot、Cursor MDC 等只读自己文件的工具 |
| **link** | 符号链接到 `AGENTS.md` | Unix；失败会回退 |

### 托管区域

生成文件会用标记包住内容：

```html
<!-- agent-sync:start -->
…
<!-- agent-sync:end -->
```

**标记外你手写的内容，下次 `apply` 会保留。**

TOML 目标（Codex）使用：

```toml
# agent-sync:start
…
# agent-sync:end
```

---

## Codex 支持说明

Codex 原生会读根目录 [`AGENTS.md`](https://developers.openai.com/codex/guides/agents-md)。agent-sync 额外提供：

| 目标 | 路径 | 作用 |
|------|------|------|
| `codex` | `.codex/config.toml` | 设置 `project_doc_fallback_filenames`（如 `CLAUDE.md`），并在说明文件较大时提高 `project_doc_max_bytes`（Codex 默认预算约 **32 KiB**） |
| `codex-agents` | `AGENTS.md` | 源文件不在根目录时，镜像到根 `AGENTS.md` |

`init` 时还会：

- 把 `AGENTS.override.md` 写入 `.gitignore`（Codex 本地覆盖，个人备注不进 git）
- `check` / `status` 会报告源文件大小与 Codex 预算对比

```bash
agent-sync apply --only codex,codex-agents,claude
```

---

## 完整工作流

### A. 全新项目

```bash
cd my-app
agent-sync init
# 编辑 AGENTS.md
agent-sync apply
agent-sync status
```

### B. 已有一堆分散规则的老项目

```bash
cd my-app
agent-sync import --force
# 整理 AGENTS.md（去重、解决冲突）
agent-sync apply --force   # 仅在需要彻底替换旧工具文件时使用
agent-sync check
```

### C. CI 防漂移

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
          cd /tmp/agent-sync && npm link
      - name: Check instruction files in sync
        run: agent-sync check
```

如果有人只改了 `CLAUDE.md` 却忘了改 `AGENTS.md`，`check` 会失败。

### D. 说明文件很大（> 32 KiB）

Codex 默认会截断项目文档。`apply` 之后可查看：

```bash
agent-sync status
# size 一行会显示字节数 vs Codex 预算
```

需要时，`codex` 目标会在 `.codex/config.toml` 中提高 `project_doc_max_bytes`。

---

## 如何写好 `AGENTS.md`

`init` 会生成模板。建议包含：

1. **项目概述** — 做什么、领域约束
2. **工具链** — install / dev / test / lint 命令
3. **判断边界** — ASK / ALWAYS / NEVER
4. **代码风格** — 只写工具强制不到的规则
5. **架构说明** — 关键目录、入口、黑话
6. **验收标准** — agent 怎样算完成任务

建议：

- 规则要短、可执行，少写长文
- 密钥与个人偏好放进 `AGENTS.override.md`（已被 gitignore）
- 每次改完：`agent-sync apply`

---

## 安全与非破坏行为

| 情况 | 行为 |
|------|------|
| 目标文件不存在 | 创建 |
| 目标由 agent-sync 托管 | 只更新标记内内容 |
| 手写目标 + `protectUnmanaged: true` | **拦截**，除非 `--force` |
| 标记外的用户备注 | **保留** |
| `apply --dry-run` | 不写磁盘 |

被拦截时进程 exit code 为 `2`，方便脚本判断。

---

## 本仓库目录结构

```text
agent-sync/
├── bin/agent-sync.mjs      # CLI 入口
├── src/
│   ├── cli.mjs             # 命令与参数
│   ├── sync.mjs            # apply / check / plan
│   ├── targets.mjs         # 各工具适配器
│   ├── codex.mjs           # Codex TOML 辅助
│   ├── config.mjs          # 配置读写
│   ├── template.mjs        # AGENTS.md 脚手架与 import 合并
│   └── fsutil.mjs          # 文件系统工具
├── templates/AGENTS.md     # 默认模板
├── examples/demo-project/  # 最小示例
├── test/                   # node:test 测试
├── README.md               # English docs
├── README.zh-CN.md         # 本文档
└── package.json
```

---

## 开发

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm test                  # node --test
node bin/agent-sync.mjs help
```

无构建步骤、无依赖。改 `src/*.mjs` 后直接再跑即可。

---

## 常见问题 FAQ

**Q：Cursor 已经能读 `AGENTS.md`，还要不要 `.cursor/rules`？**  
A：很多环境只放根目录 `AGENTS.md` 就够。开启 `cursor-rules` 可兼容更严格/旧版 Cursor 配置。

**Q：`apply` 会删掉我在 `CLAUDE.md` 里的自定义备注吗？**  
A：写在 `<!-- agent-sync:start/end -->` **外面**的内容会保留；标记内会被重新生成。

**Q：源文件可以不叫 `AGENTS.md` 吗？**  
A：可以。配置 `"source": "docs/guide.md"`，并保持 `codex-agents: true`，以便镜像到根目录给 Codex 用。

**Q：Windows 上符号链接怎么办？**  
A：默认 `auto` 模式尽量不依赖开发者模式/管理员权限，优先用 `import` 或 `copy`。

**Q：怎么关掉 Copilot 生成？**  
A：配置里设 `"copilot": false`，或 `agent-sync apply --disable copilot`。

**Q：和 monorepo 怎么配合？**  
A：在每个包目录分别 `init`/`apply`，或用 `-C packages/foo` 指定目录；源文件路径按包维护即可。

---

## 许可证

[MIT](./LICENSE)

---

## 相关链接

- [AGENTS.md 格式](https://agents.md/)
- [OpenAI Codex — AGENTS.md 指南](https://developers.openai.com/codex/guides/agents-md)
- [English documentation](./README.md)
- [贡献指南](./CONTRIBUTING.md)
