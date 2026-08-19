import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.mjs";
import { readText, writeTextAtomic } from "../src/fsutil.mjs";
import { applySync, checkSync, planSync } from "../src/sync.mjs";
import { MANAGED_END, MANAGED_START } from "../src/targets.mjs";

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-sync-safety-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function claudeOnlyConfig(source = "AGENTS.md") {
  const config = defaultConfig();
  const targets = Object.fromEntries(
    Object.keys(config.targets).map((id) => [id, id === "claude"]),
  );
  return { ...config, source, targets };
}

test("source and target path collision never overwrites the source", (t) => {
  const dir = tmpDir(t);
  const sourcePath = path.join(dir, "CLAUDE.md");
  writeTextAtomic(sourcePath, "# canonical claude instructions\n");
  const config = claudeOnlyConfig("CLAUDE.md");

  const result = applySync(dir, config);
  assert.equal(result.ok, true);
  assert.equal(result.results.length, 0);
  assert.equal(readText(sourcePath), "# canonical claude instructions\n");
  assert.equal(checkSync(dir, config).ok, true);
});

test("malformed managed markers fail without modifying the target", (t) => {
  const dir = tmpDir(t);
  writeTextAtomic(path.join(dir, "AGENTS.md"), "# source\n");
  const malformed = `${MANAGED_END}\nuser content\n${MANAGED_START}\n`;
  const targetPath = path.join(dir, "CLAUDE.md");
  writeTextAtomic(targetPath, malformed);

  assert.throws(() => applySync(dir, claudeOnlyConfig()), /Malformed managed markers/);
  assert.equal(readText(targetPath), malformed);
});

test("empty and escaping source paths fail explicitly", (t) => {
  const dir = tmpDir(t);
  writeTextAtomic(path.join(dir, "AGENTS.md"), "\n");
  const config = defaultConfig();
  assert.match(planSync(dir, config).error, /Source is empty/);

  const escaping = { ...config, source: "../outside.md", targets: { ...config.targets } };
  assert.throws(() => planSync(dir, escaping), /inside the project/);
});

test("sources cannot read Git metadata", (t) => {
  const dir = tmpDir(t);
  const gitSource = path.join(dir, ".git", "agent-guide.md");
  writeTextAtomic(gitSource, "# unsafe source\n");
  const config = { ...defaultConfig(), source: ".git/agent-guide.md" };
  assert.throws(() => planSync(dir, config), /cannot point inside \.git metadata/);

  fs.symlinkSync(gitSource, path.join(dir, "linked-source.md"));
  const linkedConfig = { ...defaultConfig(), source: "linked-source.md" };
  assert.throws(() => planSync(dir, linkedConfig), /resolves inside \.git metadata/);
});

test("external source symlinks are blocked by default with an explicit opt-out", (t) => {
  const dir = tmpDir(t);
  const outsideDir = tmpDir(t);
  const outsidePath = path.join(outsideDir, "outside.md");
  writeTextAtomic(outsidePath, "# outside\n");
  fs.symlinkSync(outsidePath, path.join(dir, "AGENTS.md"));

  assert.throws(
    () => planSync(dir, defaultConfig()),
    /Source path resolves outside the project/,
  );
  const allowed = { ...defaultConfig(), allowExternalSymlinks: true };
  assert.equal(planSync(dir, allowed).ok, true);
});

test("target parent symlinks cannot escape the project", (t) => {
  const dir = tmpDir(t);
  const outsideDir = tmpDir(t);
  writeTextAtomic(path.join(dir, "AGENTS.md"), "# source\n");
  fs.symlinkSync(outsideDir, path.join(dir, ".github"), "dir");
  const config = defaultConfig();
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.copilot = true;

  assert.throws(() => applySync(dir, config), /Target `copilot` parent path resolves outside/);
  assert.equal(fs.existsSync(path.join(outsideDir, "copilot-instructions.md")), false);
});
