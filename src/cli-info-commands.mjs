import { CODEX_DEFAULT_MAX_BYTES } from "./codex.mjs";
import { resolveMode } from "./config.mjs";
import {
  inspectPath,
  readText,
  rel,
  resolveProjectPath,
  samePath,
} from "./fsutil.mjs";
import { planSync } from "./sync.mjs";
import { resolveSourcePath } from "./source-path.mjs";
import { TARGETS } from "./targets.mjs";
import { prepareConfig } from "./cli-args.mjs";
import {
  MODE_WIDTH,
  TARGET_ID_WIDTH,
  TARGET_PATH_WIDTH,
} from "./cli-constants.mjs";

const ACTION_STYLES = Object.freeze({
  unchanged: Object.freeze({ tone: "green", label: "synced" }),
  update: Object.freeze({ tone: "yellow", label: "drift" }),
  blocked: Object.freeze({ tone: "red", label: "blocked" }),
  create: Object.freeze({ tone: "red", label: "missing" }),
});

function sourceSize(path, c) {
  const bytes = Buffer.byteLength(readText(path), "utf8");
  return bytes > CODEX_DEFAULT_MAX_BYTES
    ? c.yellow(`${bytes} B (over Codex default ${CODEX_DEFAULT_MAX_BYTES} B)`)
    : c.dim(`${bytes} B / Codex budget ${CODEX_DEFAULT_MAX_BYTES} B`);
}

function targetMode(target, config, enabled) {
  if (enabled) return resolveMode(config, target);
  return config.mode === "auto" ? target.preferredMode : config.mode;
}

function isSourceDestination(destPath, context) {
  if (!context.hasSource) return false;
  return samePath(context.sourcePath, destPath, { treatRightSymlinkAsDistinct: true });
}

function renderTargetState(action, exists, c) {
  if (!exists) return action ? c.red("missing") : c.green("n/a");
  if (!action) return c.yellow("on");
  const style = ACTION_STYLES[action.status];
  return style ? c[style.tone](style.label) : c.yellow("on");
}

function enabledTargetState(target, context) {
  const destPath = resolveProjectPath(context.cwd, target.path, {
    label: `Target \`${target.id}\` path`,
  });
  if (isSourceDestination(destPath, context)) {
    return context.c.green("n/a (source file)");
  }
  const actions = context.plan ? context.plan.actions : [];
  const action = actions.find((item) => item.id === target.id);
  if (!action && target.shouldEmit) return context.c.green("n/a");
  const exists = inspectPath(destPath).kind !== "missing";
  return renderTargetState(action, exists, context.c);
}

function printTarget(target, context) {
  const enabled = Boolean(context.config.targets[target.id]);
  const mode = targetMode(target, context.config, enabled);
  const state = enabled ? enabledTargetState(target, context) : context.c.dim("off");
  const mark = enabled ? context.c.green("•") : context.c.dim("·");
  console.log(
    `  ${mark} ${target.id.padEnd(TARGET_ID_WIDTH)} ${target.path.padEnd(TARGET_PATH_WIDTH)} ${mode.padEnd(MODE_WIDTH)} ${state}`,
  );
}

export async function cmdStatus(args, c) {
  const { config, configPath } = prepareConfig(args);
  const sourcePath = resolveSourcePath(args.cwd, config.source);
  const hasSource = inspectPath(sourcePath).kind !== "missing";
  const plan = hasSource ? planSync(args.cwd, config, { force: true }) : null;
  if (plan && !plan.ok) throw new Error(plan.error);

  console.log(c.bold("agent-sync status"));
  console.log(`  cwd:     ${args.cwd}`);
  console.log(`  config:  ${configPath ? rel(args.cwd, configPath) : c.dim("(defaults)")}`);
  console.log(`  source:  ${config.source} ${hasSource ? c.green("✓") : c.red("missing")}`);
  console.log(`  mode:    ${config.mode}`);
  if (hasSource) console.log(`  size:    ${sourceSize(sourcePath, c)}`);
  console.log();
  console.log(c.bold("targets"));

  const context = { c, config, cwd: args.cwd, hasSource, plan, sourcePath };
  for (const target of TARGETS) printTarget(target, context);
}

export async function cmdTargets(c) {
  console.log(c.bold("Built-in targets\n"));
  for (const target of TARGETS) {
    const modes = target.supportedModes.join("|");
    const defaultState = target.defaultEnabled ? "on " : "off";
    console.log(
      `${c.cyan(target.id.padEnd(TARGET_ID_WIDTH))} ${target.path.padEnd(TARGET_PATH_WIDTH)} default:${defaultState}  modes:${modes}`,
    );
    console.log(c.dim(`                 ${target.description}`));
  }
  console.log();
  console.log(
    c.dim(
      "Codex loads root AGENTS.md natively; `codex` writes .codex/config.toml and `codex-agents` mirrors a non-root source.",
    ),
  );
}
