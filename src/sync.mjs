import path from "node:path";
import {
  MANAGED_START,
  MANAGED_END,
  mergeManagedContent,
  markersFor,
  TARGETS,
} from "./targets.mjs";
import { enabledTargets, resolveMode } from "./config.mjs";
import {
  readText,
  writeText,
  trySymlink,
  rel,
  diffSummary,
  normalizeNewlines,
  isManagedFile,
} from "./fsutil.mjs";
import {
  validateCodexSource,
  CODEX_DEFAULT_MAX_BYTES,
  isRootAgentsPath,
} from "./codex.mjs";

function buildCtx(config, sourceRel, sourceContent) {
  return {
    sourceRel: sourceRel.split(path.sep).join("/"),
    sourceContent: normalizeNewlines(sourceContent),
    config,
    allTargets: TARGETS,
  };
}

function renderTarget(target, mode, ctx) {
  if (mode === "import") return target.renderImport(ctx);
  return target.renderCopy(ctx);
}

/**
 * Build planned actions without writing.
 */
export function planSync(cwd, config, { force = false } = {}) {
  const sourceRel = config.source || "AGENTS.md";
  const sourcePath = path.join(cwd, sourceRel);
  const sourceContent = readText(sourcePath);

  if (!sourceContent) {
    return {
      ok: false,
      error: `Source not found: ${sourceRel}. Run \`agent-sync init\` first.`,
      actions: [],
    };
  }

  const ctx = buildCtx(config, sourceRel, sourceContent);
  const actions = [];

  for (const target of enabledTargets(config)) {
    if (typeof target.shouldEmit === "function" && !target.shouldEmit(ctx)) {
      continue;
    }

    const mode = resolveMode(config, target);
    const destPath = path.join(cwd, target.path);
    const existing = readText(destPath);
    const existingNorm = existing == null ? null : normalizeNewlines(existing);
    const markers = markersFor(target);

    // codex-agents: root AGENTS.md is a plain mirror of source (no managed markers)
    const isPlainMirror = target.id === "codex-agents";

    if (mode === "link") {
      const linkTarget = rel(path.dirname(destPath), sourcePath);
      actions.push({
        id: target.id,
        name: target.name,
        path: target.path,
        mode: "link",
        destPath,
        linkTarget,
        status: existingNorm == null ? "create" : "update",
        content: null,
        blocked: false,
      });
      continue;
    }

    let next = normalizeNewlines(renderTarget(target, mode, ctx));

    if (isPlainMirror) {
      // Exact content mirror — no markers. Protect hand-written root AGENTS.md
      // only when it differs and protectUnmanaged is on.
      const nextCmp = next.replace(/\s+$/, "\n");
      const existingCmp =
        existingNorm == null ? null : existingNorm.replace(/\s+$/, "\n");
      next = nextCmp;

      if (
        existingCmp != null &&
        existingCmp !== nextCmp &&
        config.protectUnmanaged &&
        !force &&
        // If existing looks like our source already or is empty-ish, allow
        existingCmp.trim() !== ctx.sourceContent.trim()
      ) {
        // If source path IS being mirrored and existing equals something else
        actions.push({
          id: target.id,
          name: target.name,
          path: target.path,
          mode,
          destPath,
          status: "blocked",
          content: next,
          blocked: true,
          reason:
            "Root AGENTS.md exists and differs from source. Re-run with --force to overwrite.",
        });
        continue;
      }

      let status = "create";
      if (existingCmp != null) {
        status = existingCmp === nextCmp ? "unchanged" : "update";
      }
      actions.push({
        id: target.id,
        name: target.name,
        path: target.path,
        mode,
        destPath,
        status,
        content: next,
        blocked: false,
        diff: existingCmp != null ? diffSummary(existingCmp, nextCmp) : null,
      });
      continue;
    }

    if (existingNorm && isManagedFile(existingNorm, markers)) {
      next = normalizeNewlines(markers.merge(existingNorm, next, markers));
    } else if (existingNorm && config.protectUnmanaged && !force) {
      const same = existingNorm.trim() === next.trim();
      actions.push({
        id: target.id,
        name: target.name,
        path: target.path,
        mode,
        destPath,
        status: same ? "unchanged" : "blocked",
        content: next,
        blocked: !same,
        reason: same
          ? null
          : "File exists without agent-sync markers. Re-run with --force to overwrite, or delete it.",
      });
      continue;
    } else if (existingNorm && force && target.format === "toml") {
      // Preserve pre-existing Codex user settings; append managed block once.
      next = normalizeNewlines(
        existingNorm.replace(/\s+$/, "") + "\n\n" + next.replace(/^\s+/, ""),
      );
    }

    const existingCmp =
      existingNorm == null ? null : existingNorm.replace(/\s+$/, "\n");
    const nextCmp = next.replace(/\s+$/, "\n");
    next = nextCmp;

    let status = "create";
    if (existingCmp != null) {
      status = existingCmp === nextCmp ? "unchanged" : "update";
    }

    actions.push({
      id: target.id,
      name: target.name,
      path: target.path,
      mode,
      destPath,
      status,
      content: next,
      blocked: false,
      diff: existingCmp != null ? diffSummary(existingCmp, nextCmp) : null,
    });
  }

  return { ok: true, sourceRel, sourcePath, actions, ctx };
}

export function applySync(cwd, config, opts = {}) {
  const plan = planSync(cwd, config, opts);
  if (!plan.ok) return plan;

  const results = [];
  for (const action of plan.actions) {
    if (action.blocked) {
      results.push({ ...action, written: false });
      continue;
    }
    if (action.status === "unchanged") {
      results.push({ ...action, written: false });
      continue;
    }

    if (action.mode === "link") {
      const r = trySymlink(action.linkTarget, action.destPath);
      if (!r.ok) {
        const target = enabledTargets(config).find((t) => t.id === action.id);
        const fallback = target.supportedModes.includes("import")
          ? target.renderImport(plan.ctx)
          : target.renderCopy(plan.ctx);
        writeText(action.destPath, fallback);
        results.push({
          ...action,
          mode: "import",
          written: true,
          note: `symlink failed (${r.error}); wrote content instead`,
        });
      } else {
        results.push({ ...action, written: true });
      }
      continue;
    }

    writeText(action.destPath, action.content);
    results.push({ ...action, written: true });
  }

  return { ok: true, sourceRel: plan.sourceRel, results };
}

export function checkSync(cwd, config) {
  const plan = planSync(cwd, config, { force: true });
  if (!plan.ok) return plan;

  const issues = [];
  for (const action of plan.actions) {
    if (action.status === "create") {
      issues.push({
        id: action.id,
        path: action.path,
        level: "error",
        message: `missing — run agent-sync apply`,
      });
    } else if (action.status === "update") {
      issues.push({
        id: action.id,
        path: action.path,
        level: "error",
        message: `out of sync with ${plan.sourceRel}`,
      });
    } else if (action.status === "blocked") {
      issues.push({
        id: action.id,
        path: action.path,
        level: "warn",
        message: action.reason,
      });
    }
  }

  // Codex-specific source validation when codex targets are enabled
  const codexOn = config.targets?.codex || config.targets?.["codex-agents"];
  if (codexOn && plan.ctx?.sourceContent != null) {
    const v = validateCodexSource(plan.ctx.sourceContent, {
      maxBytes: config.codexMaxBytes || CODEX_DEFAULT_MAX_BYTES,
    });
    for (const err of v.errors) {
      issues.push({
        id: "codex",
        path: plan.sourceRel,
        level: "error",
        message: err,
      });
    }
    for (const warn of v.warnings) {
      issues.push({
        id: "codex",
        path: plan.sourceRel,
        level: "warn",
        message: warn,
      });
    }

    // Remind that root AGENTS.md is what Codex reads natively
    if (
      config.targets?.codex &&
      !isRootAgentsPath(plan.sourceRel) &&
      !config.targets?.["codex-agents"]
    ) {
      issues.push({
        id: "codex-agents",
        path: "AGENTS.md",
        level: "warn",
        message:
          "source is not root AGENTS.md and codex-agents target is disabled — Codex may not load your instructions",
      });
    }
  }

  return {
    ok: issues.filter((i) => i.level === "error").length === 0,
    sourceRel: plan.sourceRel,
    issues,
    actions: plan.actions,
  };
}
