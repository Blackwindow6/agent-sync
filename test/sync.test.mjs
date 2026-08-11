import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.mjs";
import { applySync, checkSync, planSync } from "../src/sync.mjs";
import { scaffoldAgentsMd } from "../src/template.mjs";
import { MANAGED_START, MANAGED_END, mergeManagedContent } from "../src/targets.mjs";
import { writeText, readText } from "../src/fsutil.mjs";

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-sync-"));
}

test("apply creates default targets from AGENTS.md", () => {
  const dir = tmpDir();
  writeText(path.join(dir, "AGENTS.md"), scaffoldAgentsMd({ projectName: "demo" }));
  const config = defaultConfig();
  const result = applySync(dir, config);
  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(dir, "CLAUDE.md")));
  assert.ok(fs.existsSync(path.join(dir, ".github/copilot-instructions.md")));
  assert.ok(fs.existsSync(path.join(dir, ".cursor/rules/agents.mdc")));
  assert.ok(fs.existsSync(path.join(dir, ".codex/config.toml")), "codex config");
  const claude = readText(path.join(dir, "CLAUDE.md"));
  assert.match(claude, /@AGENTS\.md/);
  assert.match(claude, new RegExp(MANAGED_START));
  const codexCfg = readText(path.join(dir, ".codex/config.toml"));
  assert.match(codexCfg, /project_doc_fallback_filenames/);
  assert.match(codexCfg, /CLAUDE\.md/);
  assert.match(codexCfg, /# agent-sync:start/);
  // source is already AGENTS.md → codex-agents should not rewrite it as a separate action
  assert.ok(!result.results.some((r) => r.id === "codex-agents"));
});

test("codex-agents mirrors non-root source into AGENTS.md", () => {
  const dir = tmpDir();
  writeText(path.join(dir, "docs/AGENT_GUIDE.md"), "# guide\n\nuse pnpm\n");
  const config = defaultConfig();
  config.source = "docs/AGENT_GUIDE.md";
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.codex = true;
  config.targets["codex-agents"] = true;

  const result = applySync(dir, config);
  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
  assert.equal(readText(path.join(dir, "AGENTS.md")).trim(), "# guide\n\nuse pnpm");
  assert.ok(fs.existsSync(path.join(dir, ".codex/config.toml")));
  assert.match(readText(path.join(dir, ".codex/config.toml")), /docs\/AGENT_GUIDE\.md/);
  assert.equal(checkSync(dir, config).ok, true);
});

test("codex config merge preserves user toml outside markers", () => {
  const dir = tmpDir();
  writeText(path.join(dir, "AGENTS.md"), "# hello\n");
  writeText(
    path.join(dir, ".codex/config.toml"),
    ['model = "gpt-5"', "approval_policy = \"on-request\"", ""].join("\n"),
  );
  const config = defaultConfig();
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.codex = true;

  // First apply with --force overwrites unmanaged; then user adds notes outside... 
  // Actually protectUnmanaged blocks. Use force once, then simulate user prefix.
  applySync(dir, config, { force: true });
  const managed = readText(path.join(dir, ".codex/config.toml"));
  writeText(
    path.join(dir, ".codex/config.toml"),
    ['model = "gpt-5"', "approval_policy = \"on-request\"", "", managed].join("\n"),
  );
  applySync(dir, config);
  const after = readText(path.join(dir, ".codex/config.toml"));
  assert.match(after, /model = "gpt-5"/);
  assert.match(after, /project_doc_max_bytes/);
  assert.equal(checkSync(dir, config).ok, true);
});

test("check passes after apply and fails after source edit", () => {
  const dir = tmpDir();
  writeText(path.join(dir, "AGENTS.md"), "# hello\n\nrule one\n");
  const config = defaultConfig();
  // use copy mode so content drift is detectable on copilot
  config.mode = "copy";
  applySync(dir, config);
  assert.equal(checkSync(dir, config).ok, true);

  writeText(path.join(dir, "AGENTS.md"), "# hello\n\nrule two changed\n");
  const after = checkSync(dir, config);
  assert.equal(after.ok, false);
  assert.ok(after.issues.some((i) => i.level === "error"));
});

test("protectUnmanaged blocks overwrite without --force", () => {
  const dir = tmpDir();
  writeText(path.join(dir, "AGENTS.md"), "# agents\n");
  writeText(path.join(dir, "CLAUDE.md"), "# hand written rules\nDo not touch\n");
  const config = defaultConfig();
  config.targets = { claude: true, copilot: false, "cursor-rules": false };
  const plan = planSync(dir, config, { force: false });
  const claude = plan.actions.find((a) => a.id === "claude");
  assert.equal(claude.blocked, true);

  const forced = applySync(dir, config, { force: true });
  assert.equal(forced.results.find((r) => r.id === "claude").written, true);
  assert.match(readText(path.join(dir, "CLAUDE.md")), /agent-sync/);
});

test("mergeManagedContent preserves outside user notes", () => {
  const existing = [
    `# My notes`,
    ``,
    `Keep this personal section.`,
    ``,
    MANAGED_START,
    `old body`,
    MANAGED_END,
    ``,
    `Footer stays.`,
    ``,
  ].join("\n");
  const managed = [
    `<!-- banner -->`,
    MANAGED_START,
    ``,
    `new body`,
    ``,
    MANAGED_END,
    ``,
  ].join("\n");
  const merged = mergeManagedContent(existing, managed);
  assert.match(merged, /Keep this personal section/);
  assert.match(merged, /Footer stays/);
  assert.match(merged, /new body/);
  assert.doesNotMatch(merged, /old body/);
});

test("--only limits targets", () => {
  const dir = tmpDir();
  writeText(path.join(dir, "AGENTS.md"), "# x\n");
  const config = defaultConfig();
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.claude = true;
  const result = applySync(dir, config);
  assert.ok(fs.existsSync(path.join(dir, "CLAUDE.md")));
  assert.ok(!fs.existsSync(path.join(dir, ".github/copilot-instructions.md")));
  assert.equal(result.results.length, 1);
});
