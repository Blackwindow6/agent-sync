import {
  CODEX_DEFAULT_MAX_BYTES,
  isRootAgentsPath,
  validateCodexSource,
} from "./codex.mjs";
import { writeSymlink, writeTextAtomic } from "./fsutil.mjs";
import { planSync } from "./sync-plan.mjs";

function applyAction(action) {
  if (action.blocked || action.status === "unchanged") {
    return { ...action, written: false };
  }
  if (action.mode === "link") {
    writeSymlink(action.linkTarget, action.destPath);
  } else {
    writeTextAtomic(action.destPath, action.content);
  }
  return { ...action, written: true };
}

export function applySync(cwd, config, options = {}) {
  const plan = planSync(cwd, config, options);
  if (!plan.ok) return plan;
  return {
    ok: true,
    sourceRel: plan.sourceRel,
    results: plan.actions.map(applyAction),
  };
}

function actionIssue(action, sourceRel) {
  if (action.status === "create") {
    return { id: action.id, path: action.path, level: "error", message: "missing — run agent-sync apply" };
  }
  if (action.status === "update") {
    return { id: action.id, path: action.path, level: "error", message: `out of sync with ${sourceRel}` };
  }
  if (action.status === "blocked") {
    return { id: action.id, path: action.path, level: "error", message: action.reason };
  }
  return null;
}

function codexValidationIssues(plan, config) {
  const validation = validateCodexSource(plan.ctx.sourceContent, {
    maxBytes: config.codexMaxBytes ?? CODEX_DEFAULT_MAX_BYTES,
  });
  const errors = validation.errors.map((message) => ({
    id: "codex",
    path: plan.sourceRel,
    level: "error",
    message,
  }));
  const warnings = validation.warnings.map((message) => ({
    id: "codex",
    path: plan.sourceRel,
    level: "warn",
    message,
  }));
  const needsRootMirror =
    config.targets?.codex &&
    !isRootAgentsPath(plan.sourceRel, { platform: plan.ctx.platform }) &&
    !config.targets?.["codex-agents"];
  const rootMirror = needsRootMirror
    ? [{
      id: "codex-agents",
      path: "AGENTS.md",
      level: "warn",
      message:
        "source is not root AGENTS.md and codex-agents target is disabled — Codex may not load your instructions",
    }]
    : [];
  return [...errors, ...warnings, ...rootMirror];
}

export function checkSync(cwd, config, options = {}) {
  const plan = planSync(cwd, config, { ...options, force: true });
  if (!plan.ok) return plan;

  const actionIssues = plan.actions
    .map((action) => actionIssue(action, plan.sourceRel))
    .filter(Boolean);
  const codexOn = config.targets?.codex || config.targets?.["codex-agents"];
  const validationIssues = codexOn ? codexValidationIssues(plan, config) : [];
  const issues = [...actionIssues, ...validationIssues];
  return {
    ok: !issues.some((issue) => issue.level === "error"),
    sourceRel: plan.sourceRel,
    issues,
    actions: plan.actions,
  };
}

export { planSync };
