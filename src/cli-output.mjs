export function helpText(version) {
  return `
agent-sync v${version}
One AGENTS.md → Codex, Claude Code, Cursor, Copilot, Gemini, Windsurf, Aider, …

Usage:
  agent-sync <command> [options]

Commands:
  init              Create AGENTS.md + agent-sync.config.json
  apply             Write/update all enabled target files
  check             Exit 1 if targets drift from AGENTS.md
  diff              Show which targets would change
  status            List source + targets and sync state
  import            Merge existing tool instruction files into AGENTS.md
  targets           List built-in target adapters
  version           Print the installed version
  help              Show this help

Options:
  -C, --cwd <dir>   Working directory (default: .)
  --force           Overwrite unmanaged target files
  --dry-run         Plan only (init/apply/import)
  --mode <mode>     Override mode: auto | import | copy | link
  --source <file>   Override source path (default: AGENTS.md)
  --only <ids>      Comma-separated target ids
  --enable <ids>    Enable targets
  --disable <ids>   Disable targets
  -y, --yes         Overwrite the source during init/import
  -h, --help        Show help
  -V, --version     Print the installed version

Examples:
  agent-sync init
  agent-sync apply
  agent-sync check
  agent-sync diff
  agent-sync import --force
  agent-sync apply --only codex,claude,copilot
`.trim();
}

const identity = (value) => value;

export function color(enabled) {
  if (!enabled || Object.hasOwn(process.env, "NO_COLOR")) {
    return {
      green: identity,
      red: identity,
      yellow: identity,
      dim: identity,
      bold: identity,
      cyan: identity,
    };
  }
  return {
    green: (value) => `\x1b[32m${value}\x1b[0m`,
    red: (value) => `\x1b[31m${value}\x1b[0m`,
    yellow: (value) => `\x1b[33m${value}\x1b[0m`,
    dim: (value) => `\x1b[2m${value}\x1b[0m`,
    bold: (value) => `\x1b[1m${value}\x1b[0m`,
    cyan: (value) => `\x1b[36m${value}\x1b[0m`,
  };
}

export function statusIcon(c, status) {
  const icons = {
    create: c.green("++"),
    update: c.yellow("~~"),
    unchanged: c.dim("=="),
    blocked: c.red("xx"),
  };
  return icons[status] || "??";
}
