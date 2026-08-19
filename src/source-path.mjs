import path from "node:path";
import { CODEX_CONFIG_PATH, CODEX_OVERRIDE } from "./codex.mjs";
import { CONFIG_NAMES } from "./config.mjs";
import {
  assertRealPath,
  inspectPath,
  readText,
  resolveProjectPath,
  samePath,
} from "./fsutil.mjs";

const RESERVED_SOURCE_PATHS = Object.freeze([
  ...CONFIG_NAMES,
  ".gitignore",
  "package.json",
  CODEX_CONFIG_PATH,
  CODEX_OVERRIDE,
]);

export function resolveSourcePath(cwd, source) {
  const sourcePath = resolveProjectPath(cwd, source, {
    label: "Source path",
    denyGitMetadata: true,
  });
  const reserved = RESERVED_SOURCE_PATHS.find((candidate) =>
    samePath(sourcePath, path.join(cwd, candidate)),
  );
  if (reserved) throw new Error(`Source path is reserved by agent-sync: ${source}`);
  return sourcePath;
}

function sourceTypeError(pathInfo, sourceRel) {
  if (pathInfo.kind === "missing") {
    return `Source not found: ${sourceRel}. Run \`agent-sync init\` first.`;
  }
  if (pathInfo.kind === "directory" || pathInfo.kind === "other") {
    return `Source path is not a regular file: ${sourceRel}.`;
  }
  return null;
}

export function loadSourceForSync(cwd, config) {
  const sourceRel = config.source || "AGENTS.md";
  const sourcePath = resolveSourcePath(cwd, sourceRel);
  const typeError = sourceTypeError(inspectPath(sourcePath), sourceRel);
  if (typeError) return { error: typeError, sourcePath, sourceRel };
  assertRealPath(cwd, sourcePath, {
    label: "Source path",
    allowExternalSymlinks: config.allowExternalSymlinks,
    denyGitMetadata: true,
  });
  const sourceContent = readText(sourcePath);
  if (sourceContent === null) {
    return { error: `Source not found: ${sourceRel}.`, sourcePath, sourceRel };
  }
  if (!sourceContent.trim()) {
    return { error: `Source is empty: ${sourceRel}.`, sourcePath, sourceRel };
  }
  return { sourceContent, sourcePath, sourceRel };
}
