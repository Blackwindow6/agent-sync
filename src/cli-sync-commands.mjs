import { prepareConfig } from "./cli-args.mjs";
import {
  EXIT_BLOCKED,
  EXIT_FAILURE,
  FULL_DIFF_ENABLED,
  ISSUE_LEVEL_WIDTH,
  TARGET_PATH_WIDTH,
} from "./cli-constants.mjs";
import { statusIcon } from "./cli-output.mjs";
import { applySync, checkSync, planSync } from "./sync.mjs";

function printDryRun(plan, c) {
  console.log(c.bold(`dry-run from ${plan.sourceRel}:`));
  for (const action of plan.actions) {
    const reason = action.blocked ? `  ${c.red(action.reason)}` : "";
    console.log(
      `  ${statusIcon(c, action.status)} ${action.path.padEnd(TARGET_PATH_WIDTH)} ${c.dim(action.mode)}${reason}`,
    );
  }
}

function printApplyResults(result, c) {
  let written = 0;
  let blocked = 0;
  for (const action of result.results) {
    if (action.blocked) {
      blocked++;
      console.log(`  ${statusIcon(c, "blocked")} ${action.path}  ${c.red(action.reason)}`);
    } else if (action.written) {
      written++;
      console.log(
        `  ${statusIcon(c, action.status)} ${action.path.padEnd(TARGET_PATH_WIDTH)} ${c.dim(action.mode)}`,
      );
    } else {
      console.log(
        `  ${statusIcon(c, "unchanged")} ${action.path.padEnd(TARGET_PATH_WIDTH)} ${c.dim("unchanged")}`,
      );
    }
  }
  const unchanged = result.results.length - written - blocked;
  console.log();
  console.log(c.green("done") + c.dim(` — ${written} written, ${unchanged} unchanged, ${blocked} blocked`));
  if (blocked > 0) process.exitCode = EXIT_BLOCKED;
}

export async function cmdApply(args, c) {
  const { config } = prepareConfig(args);
  if (args.dryRun) {
    const plan = planSync(args.cwd, config, { force: args.force });
    if (!plan.ok) {
      console.error(c.red(plan.error));
      process.exitCode = EXIT_FAILURE;
      return;
    }
    printDryRun(plan, c);
    return;
  }
  const result = applySync(args.cwd, config, { force: args.force });
  if (!result.ok) {
    console.error(c.red(result.error));
    process.exitCode = EXIT_FAILURE;
    return;
  }
  printApplyResults(result, c);
}

export async function cmdCheck(args, c) {
  const { config } = prepareConfig(args);
  const result = checkSync(args.cwd, config);
  if (!result.ok && result.error) {
    console.error(c.red(result.error));
    process.exitCode = EXIT_FAILURE;
    return;
  }
  const warnings = result.issues.filter((issue) => issue.level === "warn");
  for (const issue of result.issues) {
    const paint = issue.level === "error" ? c.red : c.yellow;
    console.log(
      `  ${paint(issue.level.padEnd(ISSUE_LEVEL_WIDTH))} ${issue.path}  ${issue.message}`,
    );
  }
  if (!result.ok) {
    process.exitCode = EXIT_FAILURE;
    const errors = result.issues.filter((issue) => issue.level === "error").length;
    console.log(c.dim(`\n${errors} error(s) — run agent-sync apply`));
  } else if (warnings.length > 0) {
    console.log(c.green(`✓ targets in sync with ${result.sourceRel}`) + c.yellow(` (${warnings.length} warning(s))`));
  } else {
    console.log(c.green(`✓ all targets in sync with ${result.sourceRel}`));
  }
}

export async function cmdDiff(args, c) {
  const { config } = prepareConfig(args);
  const plan = planSync(args.cwd, config, { force: true });
  if (!plan.ok) {
    console.error(c.red(plan.error));
    process.exitCode = EXIT_FAILURE;
    return;
  }
  const changes = plan.actions.filter((action) => action.status !== "unchanged");
  for (const action of changes) {
    console.log(c.bold(`\n${action.path}`) + c.dim(` (${action.mode}, ${action.status})`));
    if (action.diff) {
      console.log(
        c.dim(
          `  hash ${action.diff.aHash} → ${action.diff.bHash}  (~${action.diff.linesRemoved} line-keys removed, ~${action.diff.linesAdded} added)`,
        ),
      );
    } else if (action.status === "create") {
      console.log(c.green("  would create"));
    }
    if (action.content && process.env.AGENT_SYNC_FULL_DIFF === FULL_DIFF_ENABLED) {
      console.log(action.content);
    }
  }
  const summary = changes.length === 0
    ? c.green(`no changes — already in sync with ${plan.sourceRel}`)
    : c.dim(`\n${changes.length} target(s) would change. Run agent-sync apply`);
  console.log(summary);
}
