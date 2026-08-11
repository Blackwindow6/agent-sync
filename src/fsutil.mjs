import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function ensureDirFor(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function readText(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath, content) {
  ensureDirFor(filePath);
  fs.writeFileSync(filePath, content, "utf8");
}

export function hashText(text) {
  return crypto.createHash("sha256").update(text || "").digest("hex").slice(0, 12);
}

export function rel(from, to) {
  return path.relative(from, to).split(path.sep).join("/");
}

/**
 * Create symlink; on Windows try file symlink then fall back.
 * @returns {{ ok: boolean, method: string, error?: string }}
 */
export function trySymlink(targetRel, linkPath) {
  ensureDirFor(linkPath);
  if (fs.existsSync(linkPath)) {
    const st = fs.lstatSync(linkPath);
    if (st.isSymbolicLink()) {
      fs.unlinkSync(linkPath);
    } else {
      return { ok: false, method: "link", error: "path exists and is not a symlink" };
    }
  }
  try {
    // target is relative to the link's directory
    const linkDir = path.dirname(linkPath);
    const absTarget = path.resolve(linkDir, targetRel);
    const relTarget = path.relative(linkDir, absTarget);
    fs.symlinkSync(relTarget, linkPath);
    return { ok: true, method: "link" };
  } catch (err) {
    return { ok: false, method: "link", error: err.message };
  }
}

export function isManagedFile(content, { start, end }) {
  if (!content) return false;
  return content.includes(start) && content.includes(end);
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
