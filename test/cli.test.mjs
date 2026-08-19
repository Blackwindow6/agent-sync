import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "../src/cli-args.mjs";
import {
  defaultConfig,
  loadConfig,
  resolveMode,
  writeConfig,
} from "../src/config.mjs";
import { readText, writeTextAtomic as writeText } from "../src/fsutil.mjs";
import { getTarget } from "../src/targets.mjs";

const CLI_TIMEOUT_MS = 10_000;
const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const cliPath = path.join(repoRoot, "bin", "agent-sync.mjs");

function tmpDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-sync-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function runCli(args) {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
    timeout: CLI_TIMEOUT_MS,
  });
}

test("argument parsing validates values, modes, targets, and version flags", () => {
  assert.equal(parseArgs(["node", "cli", "-V"]).command, "version");
  assert.deepEqual(parseArgs(["node", "cli", "apply", "--only", "claude,gemini"]).only, [
    "claude",
    "gemini",
  ]);
  assert.throws(() => parseArgs(["node", "cli", "--mode"]), /requires a value/);
  assert.throws(() => parseArgs(["node", "cli", "--mode", "copi"]), /Invalid sync mode/);
  assert.throws(() => parseArgs(["node", "cli", "--only", "missing"]), /Unknown target/);
  assert.throws(() => parseArgs(["node", "cli", "apply", "extra"]), /Unexpected argument/);
});

test("config loading rejects invalid modes and target names", (t) => {
  const dir = tmpDir(t);
  const configPath = path.join(dir, "agent-sync.config.json");
  writeText(configPath, '{"mode":"copi"}\n');
  assert.throws(() => loadConfig(dir), /Invalid sync mode/);

  writeText(configPath, '{"targets":{"claud":true}}\n');
  assert.throws(() => loadConfig(dir), /Unknown target/);

  writeText(configPath, "{}\n");
  writeText(path.join(dir, ".agent-sync.json"), "{}\n");
  assert.throws(() => loadConfig(dir), /Multiple agent-sync config files/);
});

test("config files cannot resolve into Git metadata", (t) => {
  const dir = tmpDir(t);
  const gitConfig = path.join(dir, ".git", "agent-sync.json");
  writeText(gitConfig, '{"allowExternalSymlinks":true}\n');
  fs.symlinkSync(gitConfig, path.join(dir, "agent-sync.config.json"));

  assert.throws(() => loadConfig(dir), /Config path resolves inside \.git metadata/);
});

test("unsupported target modes fail instead of silently degrading", () => {
  const config = { ...defaultConfig(), mode: "import" };
  assert.throws(() => resolveMode(config, getTarget("codex")), /does not support/);
});

test("config writes preserve an explicit schema", (t) => {
  const dir = tmpDir(t);
  const schema = "https://example.test/agent-sync.schema.json";
  writeConfig(dir, { ...defaultConfig(), $schema: schema });
  const written = JSON.parse(readText(path.join(dir, "agent-sync.config.json")));
  assert.equal(written.$schema, schema);
});

test("repeated init preserves the existing source and config", (t) => {
  const dir = tmpDir(t);
  const source = "# hand-written source\n";
  const config = {
    source: "AGENTS.md",
    mode: "auto",
    protectUnmanaged: false,
    targets: { claude: false, gemini: true },
  };
  const configText = `${JSON.stringify(config)}\n`;
  writeText(path.join(dir, "AGENTS.md"), source);
  writeText(path.join(dir, "agent-sync.config.json"), configText);

  const result = runCli(["init", "-C", dir]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readText(path.join(dir, "AGENTS.md")), source);
  assert.equal(readText(path.join(dir, "agent-sync.config.json")), configText);
  assert.match(readText(path.join(dir, ".gitignore")), /AGENTS\.override\.md/);
});

test("init dry-run reports changes without writing files", (t) => {
  const dir = tmpDir(t);
  const result = runCli(["init", "-C", dir, "--dry-run"]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /would create AGENTS\.md/);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test("init --yes regenerates an existing source", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "AGENTS.md"), "# old source\n");
  const result = runCli(["init", "-C", dir, "--yes"]);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(readText(path.join(dir, "AGENTS.md")), /old source/);
  assert.match(readText(path.join(dir, "AGENTS.md")), /Canonical instructions/);
});

test("import excludes private AGENTS.override.md content", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "AGENTS.override.md"), "private local guidance\n");
  const result = runCli(["import", "-C", dir, "--source", "docs/AGENTS.md", "--force"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No existing instruction files/);
  assert.equal(fs.existsSync(path.join(dir, "docs", "AGENTS.md")), false);
});

test("import rejects instruction symlinks into Git metadata", (t) => {
  const dir = tmpDir(t);
  const gitInstruction = path.join(dir, ".git", "private-instructions.md");
  writeText(gitInstruction, "private Git metadata\n");
  fs.symlinkSync(gitInstruction, path.join(dir, "CLAUDE.md"));

  const result = runCli(["import", "-C", dir, "--source", "docs/AGENTS.md", "--force"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /resolves inside \.git metadata/);
  assert.equal(fs.existsSync(path.join(dir, "docs", "AGENTS.md")), false);
});

test("init exposes malformed package.json without partial output", (t) => {
  const dir = tmpDir(t);
  writeText(path.join(dir, "package.json"), "{invalid json\n");
  const result = runCli(["init", "-C", dir]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SyntaxError/);
  assert.equal(fs.existsSync(path.join(dir, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(dir, "agent-sync.config.json")), false);
});

test("init rejects source paths reserved for project metadata", (t) => {
  const dir = tmpDir(t);
  const result = runCli(["init", "-C", dir, "--source", "agent-sync.config.json"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /reserved by agent-sync/);
  assert.equal(fs.readdirSync(dir).length, 0);
});

test("init does not write through an external parent symlink", (t) => {
  const dir = tmpDir(t);
  const outsideDir = tmpDir(t);
  fs.symlinkSync(outsideDir, path.join(dir, "docs"), "dir");

  const result = runCli(["init", "-C", dir, "--source", "docs/AGENTS.md"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Source parent path resolves outside/);
  assert.equal(fs.existsSync(path.join(outsideDir, "AGENTS.md")), false);
});

test("CLI completes init, apply, check, status, and diff end to end", (t) => {
  const dir = tmpDir(t);
  for (const command of ["init", "apply", "check", "status", "diff"]) {
    const result = runCli([command, "-C", dir]);
    assert.equal(result.status, 0, `${command}: ${result.stderr}`);
    if (command === "check") assert.match(result.stdout, /all targets in sync/);
    if (command === "status") assert.match(result.stdout, /agent-sync status/);
    if (command === "diff") assert.match(result.stdout, /no changes/);
  }
  assert.equal(fs.existsSync(path.join(dir, "CLAUDE.md")), true);
  assert.equal(
    fs.existsSync(path.join(dir, ".github", "copilot-instructions.md")),
    true,
  );
  assert.match(readText(path.join(dir, ".codex", "config.toml")), /project_doc_max_bytes/);
});
