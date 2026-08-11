import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultConfig,
  loadConfig,
  writeConfig,
  enabledTargets,
  resolveMode,
} from "./config.mjs";
import { TARGETS, MANAGED_START, MANAGED_END } from "./targets.mjs";
import { applySync, checkSync, planSync } from "./sync.mjs";
import {
  scaffoldAgentsMd,
  mergeSources,
  detectPackageManager,
  detectProjectName,
} from "./template.mjs";
import { readText, writeText, rel, normalizeNewlines } from "./fsutil.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"),
);

const HELP = `
agent-sync v${pkg.version}
One AGENTS.md → Codex, Claude Code, Cursor, Copilot, Gemini, Windsurf, Aider, …

Usage:
  agent-sync <command> [options]

Commands:
  init              Create AGENTS.md + agent-sync.config.json
  apply             Write/update all enabled target files
  check             Exit 1 if targets drift from AGENTS.md
  diff              Show which targets would change
  status            List source + targets and sync state
  import            Merge existing CLAUDE.md / .cursorrules / etc. into AGENTS.md
  targets           List built-in target adapters
  help              Show this help

Options:
  -C, --cwd <dir>   Working directory (default: .)
  --force           Overwrite unmanaged target files
  --dry-run         Plan only (apply/import)
  --mode <mode>     Override mode: auto | import | copy | link
  --source <file>   Override source path (default: AGENTS.md)
  --only <ids>      Comma-separated target ids
  --enable <ids>    Enable targets in config (init/apply)
  --disable <ids>   Disable targets
  -y, --yes         Skip prompts; overwrite AGENTS.md on init/import

Examples:
  agent-sync init
  agent-sync apply
  agent-sync check
  agent-sync diff
  agent-sync import --force
  agent-sync apply --only codex,claude,copilot
`.trim();

function parseArgs(argv) {
  const args = {
    command: null,
    cwd: process.cwd(),
    force: false,
    dryRun: false,
    yes: false,
    mode: null,
    source: null,
    only: null,
    enable: null,
    disable: null,
    _: [],
  };

  const raw = argv.slice(2);
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a === "-h" || a === "--help") {
      args.command = "help";
    } else if (a === "-C" || a === "--cwd") {
      args.cwd = path.resolve(raw[++i]);
    } else if (a === "--force") {
      args.force = true;
    } else if (a === "--dry-run") {
      args.dryRun = true;
    } else if (a === "-y" || a === "--yes") {
      args.yes = true;
    } else if (a === "--mode") {
      args.mode = raw[++i];
    } else if (a === "--source") {
      args.source = raw[++i];
    } else if (a === "--only") {
      args.only = raw[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--enable") {
      args.enable = raw[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a === "--disable") {
      args.disable = raw[++i].split(",").map((s) => s.trim()).filter(Boolean);
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (!args.command) {
      args.command = a;
    } else {
      args._.push(a);
    }
  }

  if (!args.command) args.command = "help";
  return args;
}

function color(enabled) {
  if (!enabled || process.env.NO_COLOR) {
    return { green: (s) => s, red: (s) => s, yellow: (s) => s, dim: (s) => s, bold: (s) => s, cyan: (s) => s };
  }
  return {
    green: (s) => `\x1b[32m${s}\x1b[0m`,
    red: (s) => `\x1b[31m${s}\x1b[0m`,
    yellow: (s) => `\x1b[33m${s}\x1b[0m`,
    dim: (s) => `\x1b[2m${s}\x1b[0m`,
    bold: (s) => `\x1b[1m${s}\x1b[0m`,
    cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  };
}

function prepareConfig(args) {
  const { config, configPath } = loadConfig(args.cwd);
  if (args.source) config.source = args.source;
  if (args.mode) config.mode = args.mode;

  if (args.enable) {
    for (const id of args.enable) {
      if (!TARGETS.find((t) => t.id === id)) throw new Error(`Unknown target: ${id}`);
      config.targets[id] = true;
    }
  }
  if (args.disable) {
    for (const id of args.disable) {
      if (!TARGETS.find((t) => t.id === id)) throw new Error(`Unknown target: ${id}`);
      config.targets[id] = false;
    }
  }
  if (args.only) {
    for (const id of Object.keys(config.targets)) {
      config.targets[id] = args.only.includes(id);
    }
    for (const id of args.only) {
      if (!TARGETS.find((t) => t.id === id)) throw new Error(`Unknown target: ${id}`);
      config.targets[id] = true;
    }
  }
  return { config, configPath };
}

function statusIcon(c, status) {
  switch (status) {
    case "create":
      return c.green("++");
    case "update":
      return c.yellow("~~");
    case "unchanged":
      return c.dim("==");
    case "blocked":
      return c.red("xx");
    default:
      return "??";
  }
}

async function cmdInit(args, c) {
  const cwd = args.cwd;
  const config = defaultConfig();
  if (args.mode) config.mode = args.mode;
  if (args.source) config.source = args.source;
  if (args.enable) for (const id of args.enable) config.targets[id] = true;
  if (args.disable) for (const id of args.disable) config.targets[id] = false;

  const sourcePath = path.join(cwd, config.source);
  const name = detectProjectName(cwd);
  const pkgManager = detectPackageManager(cwd);

  if (fs.existsSync(sourcePath) && !args.force && !args.yes) {
    console.log(c.yellow(`${config.source} already exists — keeping it (use --force to regenerate)`));
  } else if (!fs.existsSync(sourcePath) || args.force) {
    if (!args.dryRun) {
      writeText(sourcePath, scaffoldAgentsMd({ projectName: name, packageManager: pkgManager }));
    }
    console.log(c.green(`created ${config.source}`));
  }

  // Offer to import existing files if AGENTS was just created empty-ish and others exist
  const importCandidates = [
    "CLAUDE.md",
    ".cursorrules",
    ".github/copilot-instructions.md",
    "GEMINI.md",
    "CONVENTIONS.md",
    ".windsurfrules",
  ];
  const found = importCandidates.filter((p) => fs.existsSync(path.join(cwd, p)));
  if (found.length && !fs.existsSync(sourcePath)) {
    console.log(c.dim(`hint: found ${found.join(", ")} — run agent-sync import to merge`));
  }

  if (!args.dryRun) {
    const configFile = writeConfig(cwd, config);
    console.log(c.green(`created ${path.basename(configFile)}`));

    // Ensure AGENTS.override.md is gitignored (Codex local overrides)
    const gi = path.join(cwd, ".gitignore");
    const overrideLine = "AGENTS.override.md";
    if (fs.existsSync(gi)) {
      const cur = fs.readFileSync(gi, "utf8");
      if (!cur.split(/\r?\n/).includes(overrideLine)) {
        fs.appendFileSync(
          gi,
          (cur.endsWith("\n") || cur.length === 0 ? "" : "\n") +
            `\n# Codex local instruction overrides (agent-sync)\n${overrideLine}\n`,
          "utf8",
        );
        console.log(c.green(`updated .gitignore (+ ${overrideLine})`));
      }
    } else {
      writeText(
        gi,
        `# Codex local instruction overrides (agent-sync)\n${overrideLine}\n`,
      );
      console.log(c.green(`created .gitignore (+ ${overrideLine})`));
    }
  }

  console.log();
  console.log(c.bold("Enabled targets:"));
  for (const t of enabledTargets(config)) {
    const mode = resolveMode(config, t);
    console.log(`  ${c.cyan(t.id.padEnd(16))} ${t.path}  ${c.dim(`(${mode})`)}`);
  }
  console.log();
  console.log(c.dim("Codex reads root AGENTS.md natively; .codex/config.toml adds fallbacks + size budget."));
  console.log(`Next: edit ${config.source}, then run ${c.cyan("agent-sync apply")}`);
}

async function cmdApply(args, c) {
  const { config } = prepareConfig(args);
  if (args.dryRun) {
    const plan = planSync(args.cwd, config, { force: args.force });
    if (!plan.ok) {
      console.error(c.red(plan.error));
      process.exitCode = 1;
      return;
    }
    console.log(c.bold(`dry-run from ${plan.sourceRel}:`));
    for (const a of plan.actions) {
      console.log(
        `  ${statusIcon(c, a.status)} ${a.path.padEnd(36)} ${c.dim(a.mode)}${a.blocked ? "  " + c.red(a.reason) : ""}`,
      );
    }
    return;
  }

  const result = applySync(args.cwd, config, { force: args.force });
  if (!result.ok) {
    console.error(c.red(result.error));
    process.exitCode = 1;
    return;
  }

  let wrote = 0;
  let blocked = 0;
  for (const r of result.results) {
    if (r.blocked) {
      blocked++;
      console.log(`  ${statusIcon(c, "blocked")} ${r.path}  ${c.red(r.reason)}`);
    } else if (r.written) {
      wrote++;
      console.log(
        `  ${statusIcon(c, r.status)} ${r.path.padEnd(36)} ${c.dim(r.mode)}${r.note ? "  " + c.yellow(r.note) : ""}`,
      );
    } else {
      console.log(`  ${statusIcon(c, "unchanged")} ${r.path.padEnd(36)} ${c.dim("unchanged")}`);
    }
  }
  console.log();
  console.log(
    c.green(`done`) +
      c.dim(` — ${wrote} written, ${result.results.length - wrote - blocked} unchanged, ${blocked} blocked`),
  );
  if (blocked) process.exitCode = 2;
}

async function cmdCheck(args, c) {
  const { config } = prepareConfig(args);
  const result = checkSync(args.cwd, config);
  if (result.error) {
    console.error(c.red(result.error));
    process.exitCode = 1;
    return;
  }
  const errors = (result.issues || []).filter((i) => i.level === "error");
  const warns = (result.issues || []).filter((i) => i.level === "warn");
  for (const issue of result.issues || []) {
    const paint = issue.level === "error" ? c.red : c.yellow;
    console.log(`  ${paint(issue.level.padEnd(5))} ${issue.path}  ${issue.message}`);
  }
  if (result.ok) {
    if (warns.length === 0) {
      console.log(c.green(`✓ all targets in sync with ${result.sourceRel}`));
    } else {
      console.log(
        c.green(`✓ targets in sync with ${result.sourceRel}`) +
          c.yellow(` (${warns.length} warning(s))`),
      );
    }
    return;
  }
  process.exitCode = 1;
  if (errors.length) {
    console.log(c.dim(`\n${errors.length} error(s) — run agent-sync apply`));
  }
}

async function cmdDiff(args, c) {
  const { config } = prepareConfig(args);
  const plan = planSync(args.cwd, config, { force: true });
  if (!plan.ok) {
    console.error(c.red(plan.error));
    process.exitCode = 1;
    return;
  }
  let changes = 0;
  for (const a of plan.actions) {
    if (a.status === "unchanged") continue;
    changes++;
    console.log(c.bold(`\n${a.path}`) + c.dim(` (${a.mode}, ${a.status})`));
    if (a.diff) {
      console.log(
        c.dim(
          `  hash ${a.diff.aHash} → ${a.diff.bHash}  (~${a.diff.linesRemoved} line-keys removed, ~${a.diff.linesAdded} added)`,
        ),
      );
    } else if (a.status === "create") {
      console.log(c.green("  would create"));
    }
    if (a.content && process.env.AGENT_SYNC_FULL_DIFF === "1") {
      console.log(a.content);
    }
  }
  if (!changes) {
    console.log(c.green(`no changes — already in sync with ${plan.sourceRel}`));
  } else {
    console.log(c.dim(`\n${changes} target(s) would change. Run agent-sync apply`));
  }
}

async function cmdStatus(args, c) {
  const { config, configPath } = prepareConfig(args);
  const sourcePath = path.join(args.cwd, config.source);
  const hasSource = fs.existsSync(sourcePath);

  console.log(c.bold("agent-sync status"));
  console.log(`  cwd:     ${args.cwd}`);
  console.log(`  config:  ${configPath ? rel(args.cwd, configPath) : c.dim("(defaults)")}`);
  console.log(
    `  source:  ${config.source} ${hasSource ? c.green("✓") : c.red("missing")}`,
  );
  console.log(`  mode:    ${config.mode}`);
  if (hasSource) {
    const bytes = Buffer.byteLength(fs.readFileSync(sourcePath), "utf8");
    const codexBudget = 32 * 1024;
    const sizeNote =
      bytes > codexBudget
        ? c.yellow(`${bytes} B (over Codex default ${codexBudget} B)`)
        : c.dim(`${bytes} B / Codex budget ${codexBudget} B`);
    console.log(`  size:    ${sizeNote}`);
  }
  console.log();

  const plan = hasSource ? planSync(args.cwd, config, { force: true }) : null;

  console.log(c.bold("targets"));
  for (const t of TARGETS) {
    const on = config.targets[t.id];
    const mode = resolveMode(config, t);
    const exists = fs.existsSync(path.join(args.cwd, t.path));
    let state = c.dim("off");
    if (on) {
      const action = plan?.actions?.find((a) => a.id === t.id);
      if (t.id === "codex-agents" && !action) {
        state = c.green("n/a (source is AGENTS.md)");
      } else if (!action && t.shouldEmit) {
        state = c.dim("skipped");
      } else if (!exists && action) state = c.red("missing");
      else if (!exists && !action) state = c.green("n/a");
      else if (action?.status === "unchanged") state = c.green("synced");
      else if (action?.status === "update") state = c.yellow("drift");
      else if (action?.status === "create") state = c.red("missing");
      else state = c.yellow("on");
    }
    const mark = on ? c.green("•") : c.dim("·");
    console.log(
      `  ${mark} ${t.id.padEnd(16)} ${t.path.padEnd(36)} ${String(mode).padEnd(7)} ${state}`,
    );
  }
}

async function cmdImport(args, c) {
  const { config } = prepareConfig(args);
  const cwd = args.cwd;
  const candidates = [
    { name: "AGENTS.md", path: "AGENTS.md" },
    { name: "AGENTS.override.md", path: "AGENTS.override.md" },
    { name: "CLAUDE.md", path: "CLAUDE.md" },
    { name: ".cursorrules", path: ".cursorrules" },
    { name: "copilot-instructions.md", path: ".github/copilot-instructions.md" },
    { name: "GEMINI.md", path: "GEMINI.md" },
    { name: "CONVENTIONS.md", path: "CONVENTIONS.md" },
    { name: ".windsurfrules", path: ".windsurfrules" },
    { name: ".clinerules", path: ".clinerules" },
  ];

  const files = [];
  for (const cand of candidates) {
    // Don't import the destination source into itself
    if (
      cand.path.replace(/\\/g, "/") ===
      String(config.source || "AGENTS.md").replace(/\\/g, "/")
    ) {
      continue;
    }
    const content = readText(path.join(cwd, cand.path));
    if (!content) continue;
    // Skip pure agent-sync wrappers
    if (
      content.includes(MANAGED_START) &&
      content.includes("@AGENTS.md") &&
      content.length < 800
    ) {
      continue;
    }
    // Strip managed markers if present
    let body = content;
    if (content.includes(MANAGED_START) && content.includes(MANAGED_END)) {
      const s = content.indexOf(MANAGED_START);
      const e = content.indexOf(MANAGED_END);
      body = content.slice(s + MANAGED_START.length, e).trim();
    }
    files.push({ name: cand.name, content: body });
  }

  if (files.length === 0) {
    console.error(c.red("No existing instruction files found to import."));
    process.exitCode = 1;
    return;
  }

  console.log(c.bold("Importing from:"));
  for (const f of files) console.log(`  - ${f.name}`);

  const merged = mergeSources(files);
  const sourcePath = path.join(cwd, config.source);

  if (fs.existsSync(sourcePath) && !args.force && !args.yes) {
    console.error(
      c.red(`${config.source} already exists. Use --force to overwrite, or merge manually.`),
    );
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) {
    console.log(c.dim("\n--- dry-run preview ---\n"));
    console.log(merged.slice(0, 2000) + (merged.length > 2000 ? "\n…" : ""));
    return;
  }

  writeText(sourcePath, merged);
  console.log(c.green(`\nwrote ${config.source}`));
  console.log(c.dim("Review the file, then run: agent-sync apply"));
}

async function cmdTargets(args, c) {
  console.log(c.bold("Built-in targets\n"));
  for (const t of TARGETS) {
    console.log(
      `${c.cyan(t.id.padEnd(16))} ${t.path.padEnd(36)} default:${t.defaultEnabled ? "on " : "off"}  modes:${t.supportedModes.join("|")}`,
    );
    console.log(c.dim(`                 ${t.description}`));
  }
  console.log();
  console.log(
    c.dim(
      "Note: Codex loads root AGENTS.md natively. Target `codex` writes .codex/config.toml; `codex-agents` mirrors a non-root source into AGENTS.md.",
    ),
  );
}

export async function run(argv = process.argv) {
  const c = color(Boolean(process.stdout.isTTY));
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(String(err.message || err));
    process.exitCode = 1;
    return;
  }

  try {
    switch (args.command) {
      case "help":
      case "--help":
        console.log(HELP);
        break;
      case "version":
      case "--version":
      case "-V":
        console.log(pkg.version);
        break;
      case "init":
        await cmdInit(args, c);
        break;
      case "apply":
      case "sync":
        await cmdApply(args, c);
        break;
      case "check":
        await cmdCheck(args, c);
        break;
      case "diff":
        await cmdDiff(args, c);
        break;
      case "status":
        await cmdStatus(args, c);
        break;
      case "import":
        await cmdImport(args, c);
        break;
      case "targets":
        await cmdTargets(args, c);
        break;
      default:
        console.error(`Unknown command: ${args.command}\n`);
        console.log(HELP);
        process.exitCode = 1;
    }
  } catch (err) {
    console.error(c.red(err.stack || err.message || String(err)));
    process.exitCode = 1;
  }
}
