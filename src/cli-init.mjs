import fs from "node:fs";
import path from "node:path";
import { CODEX_OVERRIDE } from "./codex.mjs";
import {
  enabledTargets,
  loadConfig,
  resolveMode,
  writeConfig,
} from "./config.mjs";
import {
  assertRealPath,
  assertRealParentPath,
  inspectPath,
  readText,
  writeTextAtomic,
} from "./fsutil.mjs";
import { resolveSourcePath } from "./source-path.mjs";
import {
  detectPackageManager,
  detectProjectName,
  scaffoldAgentsMd,
} from "./template.mjs";
import {
  applyConfigOverrides,
  hasConfigOverrides,
} from "./cli-args.mjs";
import { TARGET_ID_WIDTH } from "./cli-constants.mjs";

const OVERRIDE_FILE = CODEX_OVERRIDE;
const IMPORT_CANDIDATES = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".github/copilot-instructions.md",
  "GEMINI.md",
  "CONVENTIONS.md",
  ".windsurfrules",
  ".clinerules",
]);

function initializeSource(args, config, c) {
  const sourcePath = resolveSourcePath(args.cwd, config.source);
  const pathInfo = inspectPath(sourcePath);
  if (pathInfo.kind === "directory" || pathInfo.kind === "other") {
    throw new Error(`Source path is not a writable file: ${config.source}`);
  }
  if (pathInfo.kind !== "missing") {
    assertRealPath(args.cwd, sourcePath, {
      label: "Source path",
      allowExternalSymlinks: config.allowExternalSymlinks,
      denyGitMetadata: true,
    });
  }
  const overwrite = args.force || args.yes;
  if (pathInfo.kind !== "missing" && !overwrite) {
    console.log(c.yellow(`${config.source} already exists — keeping it (use --force to regenerate)`));
    return pathInfo;
  }
  assertRealParentPath(args.cwd, sourcePath, {
    label: "Source parent path",
    allowExternalSymlinks: config.allowExternalSymlinks,
    denyGitMetadata: true,
  });

  const content = scaffoldAgentsMd({
    projectName: detectProjectName(args.cwd, {
      allowExternalSymlinks: config.allowExternalSymlinks,
    }),
    packageManager: detectPackageManager(args.cwd),
  });
  const verb = pathInfo.kind === "missing" ? "create" : "regenerate";
  if (args.dryRun) console.log(c.green(`would ${verb} ${config.source}`));
  else {
    writeTextAtomic(sourcePath, content);
    console.log(c.green(`${verb === "create" ? "created" : "regenerated"} ${config.source}`));
  }
  return pathInfo;
}

function writeInitConfig({ args, loaded, config, c }) {
  const shouldWrite = !loaded.configPath || hasConfigOverrides(args);
  if (!shouldWrite) {
    console.log(c.dim(`keeping ${path.basename(loaded.configPath)}`));
    return;
  }
  const filename = loaded.configPath
    ? path.basename(loaded.configPath)
    : "agent-sync.config.json";
  const verb = loaded.configPath ? "updated" : "created";
  if (args.dryRun) {
    console.log(c.green(`would ${verb === "created" ? "create" : "update"} ${filename}`));
    return;
  }
  writeConfig(args.cwd, config, filename);
  console.log(c.green(`${verb} ${filename}`));
}

function ensureOverrideIgnored(args, config, c) {
  const gitignorePath = path.join(args.cwd, ".gitignore");
  const gitignoreInfo = inspectPath(gitignorePath);
  if (gitignoreInfo.kind !== "missing") {
    assertRealPath(args.cwd, gitignorePath, {
      label: ".gitignore",
      allowExternalSymlinks: config.allowExternalSymlinks,
      denyGitMetadata: true,
    });
  }
  const current = readText(gitignorePath) || "";
  if (current.split(/\r?\n/).includes(OVERRIDE_FILE)) return;
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : "";
  const addition = `\n# Codex local instruction overrides (agent-sync)\n${OVERRIDE_FILE}\n`;
  const action = current ? "update" : "create";
  if (args.dryRun) {
    console.log(c.green(`would ${action} .gitignore (+ ${OVERRIDE_FILE})`));
    return;
  }
  writeTextAtomic(gitignorePath, `${current}${separator}${addition}`);
  console.log(c.green(`${action === "create" ? "created" : "updated"} .gitignore (+ ${OVERRIDE_FILE})`));
}

function printTargets(targetRows, config, c) {
  console.log();
  console.log(c.bold("Enabled targets:"));
  for (const { target, mode } of targetRows) {
    console.log(
      `  ${c.cyan(target.id.padEnd(TARGET_ID_WIDTH))} ${target.path}  ${c.dim(`(${mode})`)}`,
    );
  }
  console.log();
  console.log(c.dim("Codex reads root AGENTS.md natively; .codex/config.toml adds fallbacks + size budget."));
  console.log(`Next: edit ${config.source}, then run ${c.cyan("agent-sync apply")}`);
}

function printImportHint(cwd, originalState, c) {
  if (originalState.kind !== "missing") return;
  const found = IMPORT_CANDIDATES.filter((candidate) =>
    fs.existsSync(path.join(cwd, candidate)),
  );
  if (found.length > 0) {
    console.log(c.dim(`hint: found ${found.join(", ")} — run agent-sync import --force to merge`));
  }
}

export async function cmdInit(args, c) {
  const loaded = loadConfig(args.cwd);
  const config = applyConfigOverrides(loaded.config, args);
  const targetRows = enabledTargets(config).map((target) => ({
    target,
    mode: resolveMode(config, target),
  }));
  const originalState = initializeSource(args, config, c);
  printImportHint(args.cwd, originalState, c);
  writeInitConfig({ args, loaded, config, c });
  ensureOverrideIgnored(args, config, c);
  printTargets(targetRows, config, c);
}
