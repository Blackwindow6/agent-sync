# agent-sync 详细使用手册

> 更细的逐步说明。总览请看 [README.zh-CN.md](../README.zh-CN.md)。

## 1. 安装到本机

```bash
git clone https://github.com/Blackwindow6/agent-sync.git
cd agent-sync
npm link
agent-sync version
```

若 `npm link` 因权限失败，可始终用绝对路径：

```bash
node /绝对路径/agent-sync/bin/agent-sync.mjs <命令>
```

## 2. 在业务项目里初始化

```bash
cd /你的/项目根目录
agent-sync init
```

会生成：

- `AGENTS.md` — 唯一权威说明（可编辑）
- `agent-sync.config.json` — 开关各工具目标
- `.gitignore` 中的 `AGENTS.override.md` — 本地个人覆盖（不进 git）

重复执行 `init` 会保留已有源文件与配置。只有明确想重新生成源文件时才使用 `--yes`
或 `--force`；可先用 `--dry-run` 预览初始化结果。

## 3. 编辑 AGENTS.md

至少写清楚：

1. 项目是干什么的
2. 怎么安装 / 开发 / 测试
3. 什么事必须先问人、什么事绝对不能做
4. 目录结构与黑话

## 4. 第一次同步

```bash
agent-sync apply
```

默认会生成（可在 config 里关）：

- `CLAUDE.md`
- `.github/copilot-instructions.md`
- `.cursor/rules/agents.mdc`
- `.codex/config.toml`

## 5. 日常改规则

```bash
# 1. 只改 AGENTS.md
# 2. 再同步
agent-sync apply
# 3. 可选：确认无漂移
agent-sync check
```

## 6. 从旧文件迁过来

```bash
agent-sync import --force
# 打开 AGENTS.md 去重、改冲突
agent-sync apply
```

`import` 会尝试收集：

- `CLAUDE.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `GEMINI.md`
- `CONVENTIONS.md`
- `.windsurfrules`
- `.clinerules`
- 等

`AGENTS.override.md` 是本机私有规则，因此会被明确排除，不参与导入。

## 7. 只给部分工具生成

```bash
agent-sync apply --only claude,copilot
agent-sync apply --enable gemini --disable cursor-legacy
```

## 8. 在 monorepo 中使用

```bash
agent-sync -C packages/api init
agent-sync -C packages/api apply
agent-sync -C packages/web init
agent-sync -C packages/web apply
```

每个包可以有自己的 `AGENTS.md` 与 config。

## 9. CI 集成

在流水线中：

```bash
git clone --depth 1 https://github.com/Blackwindow6/agent-sync.git /tmp/agent-sync
cd /tmp/agent-sync && npm link
cd $GITHUB_WORKSPACE
agent-sync check
```

`check` 发现漂移返回 exit code 1。

## 10. 故障排查

| 现象 | 处理 |
|------|------|
| `xx path blocked` | 目标是手写文件；确认后加 `--force`，或删掉旧文件再 apply |
| `AGENTS.md missing` | 先 `init` 或指定 `--source` |
| Codex 读不全长文档 | 看 `status` 的 size；apply 后检查 `.codex/config.toml` 的 `project_doc_max_bytes` |
| Codex 托管键冲突 | 删除 TOML 根级的 `project_doc_max_bytes` / `project_doc_fallback_filenames`；自定义预算请改用 agent-sync 配置的 `codexMaxBytes` |
| Windows 软链失败 | 使用默认 `auto`/`import`/`copy`；显式 `link` 会明确报错，绝不回退成副本 |
| 模式无效 / target 未知 | 按错误信息修正配置或 CLI 参数；无效值不会静默降级 |
| 只想预览 | `agent-sync apply --dry-run` 或 `agent-sync diff` |
