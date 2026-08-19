import {
  assertRealPath,
  assertRealParentPath,
  inspectPath,
  readText,
  resolveProjectPath,
  samePath,
  writeTextAtomic,
} from "./fsutil.mjs";
import { mergeSources } from "./template.mjs";
import { resolveSourcePath } from "./source-path.mjs";
import {
  extractManagedBody,
  MANAGED_END,
  MANAGED_START,
} from "./targets.mjs";
import { prepareConfig } from "./cli-args.mjs";
import { EXIT_FAILURE } from "./cli-constants.mjs";

const PURE_WRAPPER_MAX_CHARS = 800;
const PREVIEW_MAX_CHARS = 2_000;
const IMPORTABLE_PATH_KINDS = new Set(["file", "symlink"]);
const IMPORT_CANDIDATES = Object.freeze([
  { name: "AGENTS.md", path: "AGENTS.md" },
  { name: "CLAUDE.md", path: "CLAUDE.md" },
  { name: ".cursorrules", path: ".cursorrules" },
  { name: "copilot-instructions.md", path: ".github/copilot-instructions.md" },
  { name: "GEMINI.md", path: "GEMINI.md" },
  { name: "CONVENTIONS.md", path: "CONVENTIONS.md" },
  { name: ".windsurfrules", path: ".windsurfrules" },
  { name: ".clinerules", path: ".clinerules" },
]);

function importBody(content) {
  const hasMarkers = content.includes(MANAGED_START) || content.includes(MANAGED_END);
  return hasMarkers ? extractManagedBody(content) : content;
}

function isPureWrapper(content) {
  return (
    content.includes(MANAGED_START) &&
    content.includes("@AGENTS.md") &&
    content.length < PURE_WRAPPER_MAX_CHARS
  );
}

function readImportCandidate({ cwd, sourcePath, candidate, allowExternalSymlinks }) {
  const candidatePath = resolveProjectPath(cwd, candidate.path, {
    label: `Import candidate \`${candidate.path}\``,
  });
  if (samePath(candidatePath, sourcePath)) return null;

  const pathInfo = inspectPath(candidatePath);
  if (pathInfo.kind === "missing") return null;
  if (!IMPORTABLE_PATH_KINDS.has(pathInfo.kind)) {
    throw new Error(`Import candidate is not a regular file: ${candidate.path}`);
  }
  assertRealPath(cwd, candidatePath, {
    label: `Import candidate \`${candidate.path}\``,
    allowExternalSymlinks,
    denyGitMetadata: true,
  });
  const content = readText(candidatePath);
  if (!content || isPureWrapper(content)) return null;
  return { name: candidate.name, content: importBody(content) };
}

function collectImportFiles(cwd, sourcePath, { allowExternalSymlinks }) {
  const files = [];
  for (const candidate of IMPORT_CANDIDATES) {
    const file = readImportCandidate({
      cwd,
      sourcePath,
      candidate,
      allowExternalSymlinks,
    });
    if (file) files.push(file);
  }
  return files;
}

function assertWritableDestination(sourcePath, sourceRel, overwrite) {
  const pathInfo = inspectPath(sourcePath);
  if (pathInfo.kind === "directory" || pathInfo.kind === "other") {
    throw new Error(`Source path is not a writable file: ${sourceRel}`);
  }
  if (pathInfo.kind !== "missing" && !overwrite) {
    throw new Error(`${sourceRel} already exists. Use --force to overwrite, or merge manually.`);
  }
}

export async function cmdImport(args, c) {
  const { config } = prepareConfig(args);
  const sourcePath = resolveSourcePath(args.cwd, config.source);
  const files = collectImportFiles(args.cwd, sourcePath, {
    allowExternalSymlinks: config.allowExternalSymlinks,
  });
  if (files.length === 0) {
    console.error(c.red("No existing instruction files found to import."));
    process.exitCode = EXIT_FAILURE;
    return;
  }
  assertWritableDestination(sourcePath, config.source, args.force || args.yes);
  assertRealParentPath(args.cwd, sourcePath, {
    label: "Source parent path",
    allowExternalSymlinks: config.allowExternalSymlinks,
    denyGitMetadata: true,
  });

  console.log(c.bold("Importing from:"));
  for (const file of files) console.log(`  - ${file.name}`);
  const merged = mergeSources(files);
  if (args.dryRun) {
    console.log(c.dim("\n--- dry-run preview ---\n"));
    const suffix = merged.length > PREVIEW_MAX_CHARS ? "\n…" : "";
    console.log(merged.slice(0, PREVIEW_MAX_CHARS) + suffix);
    return;
  }
  writeTextAtomic(sourcePath, merged);
  console.log(c.green(`\nwrote ${config.source}`));
  console.log(c.dim("Review the file, then run: agent-sync apply"));
}
