import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.mjs";
import { readText, writeTextAtomic } from "../src/fsutil.mjs";
import { applySync, checkSync } from "../src/sync.mjs";
import { TOML_MANAGED_START } from "../src/targets.mjs";

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-sync-codex-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function codexOnlyConfig() {
  const config = defaultConfig();
  const targets = Object.fromEntries(
    Object.keys(config.targets).map((id) => [id, id === "codex"]),
  );
  return { ...config, targets };
}

test("Codex managed keys stay above user TOML tables", (t) => {
  const dir = tmpDir(t);
  const configPath = path.join(dir, ".codex", "config.toml");
  writeTextAtomic(path.join(dir, "AGENTS.md"), "# source\n");
  writeTextAtomic(
    configPath,
    [
      'description = """',
      "project_doc_max_bytes = 999",
      '"""',
      "[mcp_servers.example]",
      "enabled = true",
      "project_doc_max_bytes = 123",
      "",
    ].join("\n"),
  );

  applySync(dir, codexOnlyConfig(), { force: true });
  const content = readText(configPath);
  assert.ok(content.indexOf(TOML_MANAGED_START) < content.indexOf("[mcp_servers.example]"));
  assert.match(content, /enabled = true/);
  assert.equal(checkSync(dir, codexOnlyConfig()).ok, true);
});

test("conflicting root Codex keys fail without changing user config", (t) => {
  const dir = tmpDir(t);
  const configPath = path.join(dir, ".codex", "config.toml");
  const existing = "project_doc_max_bytes = 123\n";
  writeTextAtomic(path.join(dir, "AGENTS.md"), "# source\n");
  writeTextAtomic(configPath, existing);

  assert.throws(
    () => applySync(dir, codexOnlyConfig(), { force: true }),
    /defines agent-sync managed key/,
  );
  assert.equal(readText(configPath), existing);
});
