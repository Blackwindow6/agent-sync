import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.mjs";
import { readText, writeTextAtomic } from "../src/fsutil.mjs";
import { applySync } from "../src/sync.mjs";

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-sync-link-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function claudeOnlyConfig(mode) {
  const config = defaultConfig();
  const targets = Object.fromEntries(
    Object.keys(config.targets).map((id) => [id, id === "claude"]),
  );
  return { ...config, mode, targets };
}

test("link conversion preserves notes outside managed regions unless forced", (t) => {
  const dir = tmpDir(t);
  const sourcePath = path.join(dir, "AGENTS.md");
  const targetPath = path.join(dir, "CLAUDE.md");
  writeTextAtomic(sourcePath, "# source\n");
  applySync(dir, claudeOnlyConfig("copy"));
  writeTextAtomic(targetPath, `${readText(targetPath)}\nUser-owned footer.\n`);

  const blocked = applySync(dir, claudeOnlyConfig("link"));
  assert.equal(blocked.results[0].blocked, true);
  assert.match(readText(targetPath), /User-owned footer/);
  assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), false);

  const forced = applySync(dir, claudeOnlyConfig("link"), { force: true });
  assert.equal(forced.results[0].written, true);
  assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), true);
});

test("a source symlink to a target is treated as a source-target collision", (t) => {
  const dir = tmpDir(t);
  const targetPath = path.join(dir, "CLAUDE.md");
  const sourcePath = path.join(dir, "docs", "source.md");
  writeTextAtomic(targetPath, "# canonical through symlink\n");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.symlinkSync(path.relative(path.dirname(sourcePath), targetPath), sourcePath);
  const config = { ...claudeOnlyConfig("copy"), source: "docs/source.md" };

  const result = applySync(dir, config);
  assert.equal(result.results.length, 0);
  assert.equal(readText(targetPath), "# canonical through symlink\n");
});
