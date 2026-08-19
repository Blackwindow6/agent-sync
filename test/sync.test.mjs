import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfig } from "../src/config.mjs";
import { applySync, checkSync, planSync } from "../src/sync.mjs";
import { scaffoldAgentsMd } from "../src/template.mjs";
import {
  MANAGED_BANNER,
  MANAGED_START,
  MANAGED_END,
  mergeManagedContent,
} from "../src/targets.mjs";
import { writeTextAtomic as writeText, readText } from "../src/fsutil.mjs";

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-sync-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("apply creates default targets from AGENTS.md", (t) => {
  const dir = tmpDir(t);
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

test("codex-agents mirrors non-root source into AGENTS.md", (t) => {
  const dir = tmpDir(t);
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

test("codex config merge preserves user toml outside markers", (t) => {
  const dir = tmpDir(t);
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

test("check passes after apply and fails after source edit", (t) => {
  const dir = tmpDir(t);
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

test("protectUnmanaged blocks overwrite without --force", (t) => {
  const dir = tmpDir(t);
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
    `Literal reference: ${MANAGED_BANNER}`,
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
  assert.match(merged, /Literal reference: <!-- Generated by agent-sync/);
  assert.match(merged, /Footer stays/);
  assert.match(merged, /new body/);
  assert.doesNotMatch(merged, /old body/);
});

test("--only limits targets", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "AGENTS.md"), "# x\n");
  const config = defaultConfig();
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.claude = true;
  const result = applySync(dir, config);
  assert.ok(fs.existsSync(path.join(dir, "CLAUDE.md")));
  assert.ok(!fs.existsSync(path.join(dir, ".github/copilot-instructions.md")));
  assert.equal(result.results.length, 1);
});

test("link mode protects unmanaged files and reports them as blocked", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "AGENTS.md"), "# source\n");
  const targetPath = path.join(dir, "CLAUDE.md");
  writeText(targetPath, "# hand-written\n");
  const config = defaultConfig();
  config.mode = "link";
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.claude = true;

  const result = applySync(dir, config);
  assert.equal(result.results[0].blocked, true);
  assert.equal(readText(targetPath), "# hand-written\n");
});

test("link targets are idempotent and can transition to copy safely", (t) => {
  const dir = tmpDir(t);
  const sourcePath = path.join(dir, "AGENTS.md");
  const targetPath = path.join(dir, "CLAUDE.md");
  writeText(sourcePath, "# source stays intact\n");
  const linkConfig = defaultConfig();
  linkConfig.mode = "link";
  for (const id of Object.keys(linkConfig.targets)) linkConfig.targets[id] = false;
  linkConfig.targets.claude = true;

  assert.equal(applySync(dir, linkConfig).results[0].written, true);
  assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), true);
  assert.equal(checkSync(dir, linkConfig).ok, true);
  assert.equal(applySync(dir, linkConfig).results[0].written, false);

  const copyConfig = { ...linkConfig, mode: "copy", targets: { ...linkConfig.targets } };
  assert.equal(applySync(dir, copyConfig).results[0].written, true);
  assert.equal(fs.lstatSync(targetPath).isSymbolicLink(), false);
  assert.equal(readText(sourcePath), "# source stays intact\n");
  assert.match(readText(targetPath), new RegExp(MANAGED_START));
  assert.equal(checkSync(dir, copyConfig).ok, true);
});

test("wrong symbolic links require force and remain untouched when blocked", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "AGENTS.md"), "# source\n");
  writeText(path.join(dir, "other.md"), "# unrelated\n");
  const targetPath = path.join(dir, "CLAUDE.md");
  fs.symlinkSync("other.md", targetPath);
  const config = defaultConfig();
  config.mode = "link";
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.claude = true;

  const result = applySync(dir, config);
  assert.equal(result.results[0].blocked, true);
  assert.equal(fs.readlinkSync(targetPath), "other.md");
  assert.equal(readText(path.join(dir, "other.md")), "# unrelated\n");
});

test("Codex root filename matching follows platform case sensitivity", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "agents.md"), "# lowercase source\n");
  const config = defaultConfig();
  config.source = "agents.md";
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets["codex-agents"] = true;

  const linuxPlan = planSync(dir, config, { platform: "linux" });
  assert.ok(linuxPlan.actions.some((action) => action.id === "codex-agents"));
  const windowsPlan = planSync(dir, config, { platform: "win32" });
  assert.equal(windowsPlan.actions.length, 0);
});

test("custom Codex byte budget is rendered into project config", (t) => {
  const dir = tmpDir(t);
  const customBudget = 65_536;
  writeText(path.join(dir, "AGENTS.md"), "# source\n");
  const config = { ...defaultConfig(), codexMaxBytes: customBudget };
  for (const id of Object.keys(config.targets)) config.targets[id] = false;
  config.targets.codex = true;

  applySync(dir, config);
  assert.match(
    readText(path.join(dir, ".codex", "config.toml")),
    new RegExp(`project_doc_max_bytes = ${customBudget}`),
  );
});
