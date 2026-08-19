import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TEMP_FILE_PREFIX = ".agent-sync-tmp-";
const SHORT_HASH_LENGTH = 12;
const GITDIR_PREFIX = "gitdir:";

export function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function readText(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function hashText(text) {
  return crypto
    .createHash("sha256")
    .update(text || "")
    .digest("hex")
    .slice(0, SHORT_HASH_LENGTH);
}

export function rel(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

function escapesDirectory(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return !relative || relative === ".." || relative.startsWith(`..${path.sep}`);
}

function isInsideOrEqual(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function isInvalidProjectCandidate(candidate) {
  const windowsDriveRelative = process.platform === "win32" && /^[A-Za-z]:/.test(candidate);
  return candidate.includes("\0") || path.isAbsolute(candidate) || windowsDriveRelative;
}

function resolveGitMetadataRoot(rootPath) {
  const dotGitPath = path.join(rootPath, ".git");
  try {
    const stats = fs.lstatSync(dotGitPath);
    if (stats.isDirectory() || stats.isSymbolicLink()) {
      return fs.realpathSync(dotGitPath);
    }
    if (!stats.isFile()) return null;
    const gitFile = fs.readFileSync(dotGitPath, "utf8").trim();
    if (!gitFile.toLowerCase().startsWith(GITDIR_PREFIX)) return null;
    const gitDir = gitFile.slice(GITDIR_PREFIX.length).trim();
    if (!gitDir) return null;
    return fs.realpathSync(path.resolve(rootPath, gitDir));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function nearestExistingRealPath(candidatePath) {
  let currentPath = path.resolve(candidatePath);
  while (true) {
    try {
      return fs.realpathSync(currentPath);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) throw error;
      currentPath = parentPath;
    }
  }
}

function enforceRealPathPolicy(rootPath, realPath, options) {
  if (!options.allowExternalSymlinks && !isInsideOrEqual(rootPath, realPath)) {
    throw new Error(`${options.label} resolves outside the project.`);
  }
  const gitMetadataRoot = options.denyGitMetadata
    ? resolveGitMetadataRoot(rootPath)
    : null;
  if (gitMetadataRoot && isInsideOrEqual(gitMetadataRoot, realPath)) {
    throw new Error(`${options.label} resolves inside .git metadata.`);
  }
  return realPath;
}

export function resolveProjectPath(
  root,
  candidate,
  { label = "Path", denyGitMetadata = false } = {},
) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    throw new Error(`${label} must be a non-empty relative path.`);
  }
  if (isInvalidProjectCandidate(candidate)) {
    throw new Error(`${label} must be a relative path inside the project.`);
  }
  const rootPath = path.resolve(root);
  const resolved = path.resolve(rootPath, candidate);
  if (escapesDirectory(rootPath, resolved)) {
    throw new Error(`${label} must identify a file inside the project.`);
  }
  if (denyGitMetadata && isInsideOrEqual(path.join(rootPath, ".git"), resolved)) {
    throw new Error(`${label} cannot point inside .git metadata.`);
  }
  return resolved;
}

export function assertRealPath(
  root,
  filePath,
  {
    label = "Path",
    allowExternalSymlinks = false,
    denyGitMetadata = false,
  } = {},
) {
  const rootPath = fs.realpathSync(root);
  const realPath = fs.realpathSync(filePath);
  return enforceRealPathPolicy(rootPath, realPath, {
    label,
    allowExternalSymlinks,
    denyGitMetadata,
  });
}

export function assertRealParentPath(
  root,
  filePath,
  {
    label = "Parent path",
    allowExternalSymlinks = false,
    denyGitMetadata = false,
  } = {},
) {
  const rootPath = fs.realpathSync(root);
  const realParent = nearestExistingRealPath(path.dirname(filePath));
  return enforceRealPathPolicy(rootPath, realParent, {
    label,
    allowExternalSymlinks,
    denyGitMetadata,
  });
}

function existingRealPathsMatch(left, right, treatRightSymlinkAsDistinct) {
  try {
    const rightIsDistinctSymlink =
      treatRightSymlinkAsDistinct && fs.lstatSync(right).isSymbolicLink();
    if (rightIsDistinctSymlink) return false;
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export function samePath(
  left,
  right,
  { platform = process.platform, treatRightSymlinkAsDistinct = false } = {},
) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  const canCompareRealPaths = platform === process.platform;
  if (canCompareRealPaths && existingRealPathsMatch(a, b, treatRightSymlinkAsDistinct)) {
    return true;
  }
  if (platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

export function inspectPath(filePath) {
  let stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "missing" };
    throw error;
  }
  if (stats.isSymbolicLink()) {
    return { kind: "symlink", target: fs.readlinkSync(filePath) };
  }
  if (stats.isFile()) return { kind: "file" };
  if (stats.isDirectory()) return { kind: "directory" };
  return { kind: "other" };
}

export function symlinkPointsTo(linkPath, targetPath, pathInfo = inspectPath(linkPath)) {
  if (pathInfo.kind !== "symlink") return false;
  const actual = path.resolve(path.dirname(linkPath), pathInfo.target);
  return samePath(actual, targetPath);
}

function temporarySibling(filePath) {
  return path.join(
    path.dirname(filePath),
    `${TEMP_FILE_PREFIX}${process.pid}-${crypto.randomUUID()}`,
  );
}

function replaceAtomically(filePath, writeTemporary) {
  ensureDirFor(filePath);
  const temporaryPath = temporarySibling(filePath);
  try {
    writeTemporary(temporaryPath);
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    let cleanupFailure = null;
    try {
      fs.unlinkSync(temporaryPath);
    } catch (cleanupError) {
      if (cleanupError.code !== "ENOENT") cleanupFailure = cleanupError;
    }
    if (cleanupFailure) {
      throw new AggregateError([error, cleanupFailure], "Atomic replacement and cleanup failed.");
    }
    throw error;
  }
}

export function writeTextAtomic(filePath, content) {
  replaceAtomically(filePath, (temporaryPath) => {
    fs.writeFileSync(temporaryPath, content, "utf8");
  });
}

export function writeSymlink(targetRel, linkPath) {
  replaceAtomically(linkPath, (temporaryPath) => {
    fs.symlinkSync(targetRel, temporaryPath);
  });
}

function countOccurrences(content, token) {
  let count = 0;
  let offset = 0;
  while (offset < content.length) {
    const index = content.indexOf(token, offset);
    if (index === -1) break;
    count++;
    offset = index + token.length;
  }
  return count;
}

export function managedRegion(content, { start, end }) {
  if (!content) return null;
  const startCount = countOccurrences(content, start);
  const endCount = countOccurrences(content, end);
  if (startCount === 0 && endCount === 0) return null;
  const startIndex = content.indexOf(start);
  const endIndex = content.indexOf(end);
  if (startCount !== 1 || endCount !== 1 || endIndex < startIndex) {
    throw new Error("Malformed agent-sync managed markers.");
  }
  return { start: startIndex, end: endIndex };
}

/** Simple line diff summary */
export function diffSummary(a, b) {
  const aLines = (a || "").split(/\r?\n/);
  const bLines = (b || "").split(/\r?\n/);
  const aSet = new Set(aLines);
  const bSet = new Set(bLines);
  let onlyA = 0;
  let onlyB = 0;
  for (const line of aLines) if (!bSet.has(line)) onlyA++;
  for (const line of bLines) if (!aSet.has(line)) onlyB++;
  return {
    equal: a === b,
    linesRemoved: onlyA,
    linesAdded: onlyB,
    aHash: hashText(a),
    bHash: hashText(b),
  };
}

export function normalizeNewlines(s) {
  return (s || "").replace(/\r\n/g, "\n");
}
