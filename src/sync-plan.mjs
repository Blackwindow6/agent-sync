import path from "node:path";
import { enabledTargets, resolveMode } from "./config.mjs";
import {
  assertRealParentPath,
  diffSummary,
  inspectPath,
  managedRegion,
  normalizeNewlines,
  readText,
  rel,
  resolveProjectPath,
  samePath,
  symlinkPointsTo,
} from "./fsutil.mjs";
import { loadSourceForSync } from "./source-path.mjs";
import { markersFor, TARGETS } from "./targets.mjs";

const PLAIN_MIRROR_TARGET = "codex-agents";

function comparable(content) {
  return normalizeNewlines(content).replace(/\s+$/, "\n");
}

function buildContext({ config, sourceRel, sourceContent, platform }) {
  return {
    sourceRel: sourceRel.replace(/\\/g, "/"),
    sourceContent: normalizeNewlines(sourceContent),
    config,
    allTargets: TARGETS,
    platform,
  };
}

function baseAction(target, mode, destPath) {
  return { id: target.id, name: target.name, path: target.path, mode, destPath };
}

function blockedAction(base, reason, content = null) {
  return { ...base, status: "blocked", content, blocked: true, reason };
}

function changedAction(base, { status, content, existing = null }) {
  return {
    ...base,
    status,
    content,
    blocked: false,
    diff: existing === null ? null : diffSummary(existing, content),
  };
}

function pathTypeBlock(base, pathInfo) {
  if (pathInfo.kind === "directory") {
    return blockedAction(base, "Target path is a directory; remove or rename it manually.");
  }
  if (pathInfo.kind === "other") {
    return blockedAction(base, "Target path is not a regular file or symbolic link.");
  }
  return null;
}

function blocksUnmanagedSymlink({ pathInfo, correctLink, config, force }) {
  if (pathInfo.kind !== "symlink" || correctLink) return false;
  return Boolean(config.protectUnmanaged && !force);
}

function managedState(content, markers) {
  try {
    return { valid: managedRegion(content, markers) !== null, malformed: false };
  } catch {
    return { valid: false, malformed: true };
  }
}

function managedShell(content, markers) {
  try {
    const region = managedRegion(content, markers);
    if (!region) return null;
    return {
      before: content.slice(0, region.start).trim(),
      after: content.slice(region.end + markers.end.length).trim(),
    };
  } catch {
    return null;
  }
}

function sameShell(left, right) {
  return Boolean(left && right && left.before === right.before && left.after === right.after);
}

function canReplaceWithLink(target, destPath, ctx) {
  const existing = normalizeNewlines(readText(destPath));
  if (target.id === PLAIN_MIRROR_TARGET) {
    return comparable(existing) === comparable(ctx.sourceContent);
  }
  const markers = markersFor(target);
  const existingShell = managedShell(existing, markers);
  const renderings = [target.renderImport(ctx), target.renderCopy(ctx)];
  return renderings.some((rendered) =>
    sameShell(existingShell, managedShell(normalizeNewlines(rendered), markers)),
  );
}

function planLink({ base, target, sourcePath, pathInfo, config, force, ctx }) {
  const linkTarget = rel(path.dirname(base.destPath), sourcePath);
  const action = { ...base, linkTarget, content: null };
  if (pathInfo.kind === "missing") {
    return changedAction(action, { status: "create", content: null });
  }
  if (symlinkPointsTo(base.destPath, sourcePath, pathInfo)) {
    return { ...action, status: "unchanged", blocked: false };
  }
  const typeBlock = pathTypeBlock(action, pathInfo);
  if (typeBlock) return typeBlock;

  const managedFile =
    pathInfo.kind === "file" && canReplaceWithLink(target, base.destPath, ctx);
  if (config.protectUnmanaged && !force && !managedFile) {
    return blockedAction(
      action,
      "Target exists and is not managed by agent-sync. Re-run with --force to replace it.",
    );
  }
  return changedAction(action, { status: "update", content: null });
}

function planPlainMirror({ base, ctx, pathInfo, config, force, sourcePath }) {
  const next = comparable(ctx.sourceContent);
  if (pathInfo.kind === "missing") {
    return changedAction(base, { status: "create", content: next });
  }
  const typeBlock = pathTypeBlock(base, pathInfo);
  if (typeBlock) return typeBlock;

  const correctLink = symlinkPointsTo(base.destPath, sourcePath, pathInfo);
  if (blocksUnmanagedSymlink({ pathInfo, correctLink, config, force })) {
    return blockedAction(base, "Target is an unmanaged symbolic link. Re-run with --force.", next);
  }
  const existing = plainMirrorContent({ correctLink, pathInfo, ctx, destPath: base.destPath });
  if (blocksPlainMirror({ existing, next, config, force })) {
    return blockedAction(
      base,
      "Root AGENTS.md exists and differs from source. Re-run with --force to overwrite.",
      next,
    );
  }
  const status = contentStatus(pathInfo, existing, next);
  return changedAction(base, { status, content: next, existing });
}

function plainMirrorContent({ correctLink, pathInfo, ctx, destPath }) {
  if (correctLink) return comparable(ctx.sourceContent);
  if (pathInfo.kind === "file") return comparable(readText(destPath));
  return "";
}

function blocksPlainMirror({ existing, next, config, force }) {
  return existing !== next && config.protectUnmanaged && !force;
}

function contentStatus(pathInfo, existing, next) {
  if (pathInfo.kind === "symlink") return "update";
  return existing === next ? "unchanged" : "update";
}

function mergeRenderedTarget({ target, existing, rendered, force }) {
  const markers = markersFor(target);
  const state = managedState(existing, markers);
  if (state.malformed) throw new Error(`Malformed managed markers in ${target.path}.`);
  if (state.valid) return normalizeNewlines(markers.merge(existing, rendered, markers));
  if (force && target.format === "toml" && existing) {
    return normalizeNewlines(markers.mergeUnmanaged(existing, rendered));
  }
  return rendered;
}

function blocksUnmanagedFile({ existing, next, target, config, force }) {
  if (existing === null || force || !config.protectUnmanaged) return false;
  if (managedState(existing, markersFor(target)).valid) return false;
  return comparable(existing) !== next;
}

function renderTarget(target, mode, ctx) {
  if (mode === "import") return target.renderImport(ctx);
  return target.renderCopy(ctx);
}

function existingFileContent(pathInfo, destPath) {
  if (pathInfo.kind !== "file") return null;
  return normalizeNewlines(readText(destPath));
}

function renderedBaseline({ correctLink, ctx, existing }) {
  if (correctLink) return comparable(ctx.sourceContent);
  return comparable(existing || "");
}

function planRendered({ base, target, mode, ctx, pathInfo, config, force, sourcePath }) {
  const rendered = normalizeNewlines(renderTarget(target, mode, ctx));
  if (pathInfo.kind === "missing") {
    return changedAction(base, { status: "create", content: comparable(rendered) });
  }
  const typeBlock = pathTypeBlock(base, pathInfo);
  if (typeBlock) return typeBlock;

  const correctLink = symlinkPointsTo(base.destPath, sourcePath, pathInfo);
  if (blocksUnmanagedSymlink({ pathInfo, correctLink, config, force })) {
    return blockedAction(base, "Target is an unmanaged symbolic link. Re-run with --force.");
  }
  const existing = existingFileContent(pathInfo, base.destPath);
  const next = comparable(
    mergeRenderedTarget({ target, existing: existing || "", rendered, force }),
  );
  if (blocksUnmanagedFile({ existing, next, target, config, force })) {
    return blockedAction(
      base,
      "File exists without valid agent-sync markers. Re-run with --force to overwrite.",
      next,
    );
  }
  const existingComparable = renderedBaseline({ correctLink, ctx, existing });
  const status = contentStatus(pathInfo, existingComparable, next);
  return changedAction(base, { status, content: next, existing: existingComparable });
}

function planTarget(target, state) {
  const destPath = resolveProjectPath(state.cwd, target.path, {
    label: `Target \`${target.id}\` path`,
  });
  if (
    samePath(state.sourcePath, destPath, {
      platform: state.platform,
      treatRightSymlinkAsDistinct: true,
    })
  ) {
    return null;
  }
  assertRealParentPath(state.cwd, destPath, {
    label: `Target \`${target.id}\` parent path`,
    denyGitMetadata: true,
  });

  const mode = resolveMode(state.config, target);
  const base = baseAction(target, mode, destPath);
  const pathInfo = inspectPath(destPath);
  const input = { ...state, base, target, mode, pathInfo };
  if (mode === "link") return planLink(input);
  if (target.id === PLAIN_MIRROR_TARGET) return planPlainMirror(input);
  return planRendered(input);
}

export function planSync(cwd, config, { force = false, platform = process.platform } = {}) {
  const source = loadSourceForSync(cwd, config);
  if (source.error) return { ok: false, error: source.error, actions: [] };
  const { sourceContent, sourcePath, sourceRel } = source;

  const ctx = buildContext({ config, sourceRel, sourceContent, platform });
  const state = { cwd, config, ctx, force, platform, sourcePath, sourceContent };
  const actions = planEnabledTargets(config, ctx, state);
  return { ok: true, sourceRel: ctx.sourceRel, sourcePath, actions, ctx };
}

function shouldPlanTarget(target, ctx) {
  return !target.shouldEmit || target.shouldEmit(ctx);
}

function planEnabledTargets(config, ctx, state) {
  const actions = [];
  for (const target of enabledTargets(config)) {
    if (!shouldPlanTarget(target, ctx)) continue;
    const action = planTarget(target, state);
    if (action) actions.push(action);
  }
  return actions;
}
