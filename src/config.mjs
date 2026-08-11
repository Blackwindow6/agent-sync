import fs from "node:fs";
import path from "node:path";
import { TARGETS } from "./targets.mjs";

export const CONFIG_NAMES = [
  "agent-sync.config.json",
  ".agent-sync.json",
  "agent-sync.json",
];

export function defaultConfig() {
  /** @type {Record<string, boolean>} */
  const targets = {};
  for (const t of TARGETS) {
    targets[t.id] = t.defaultEnabled;
  }
  return {
    $schema: undefined,
    source: "AGENTS.md",
    /** @type {'import' | 'copy' | 'link' | 'auto'} */
    mode: "auto",
    targets,
    /** When true, never overwrite unmanaged files without --force */
    protectUnmanaged: true,
  };
}

export function findConfigPath(cwd) {
  for (const name of CONFIG_NAMES) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function loadConfig(cwd) {
  const configPath = findConfigPath(cwd);
  const base = defaultConfig();
  if (!configPath) {
    return { config: base, configPath: null, created: false };
  }
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const config = {
    ...base,
    ...raw,
    targets: { ...base.targets, ...(raw.targets || {}) },
  };
  return { config, configPath, created: false };
}

export function writeConfig(cwd, config, filename = "agent-sync.config.json") {
  const p = path.join(cwd, filename);
  const out = { ...config };
  delete out.$schema;
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + "\n", "utf8");
  return p;
}

export function enabledTargets(config) {
  return TARGETS.filter((t) => config.targets[t.id]);
}

/**
 * Resolve effective mode for a target.
 * auto: use target.preferredMode, but fall back from link on Windows if needed.
 */
export function resolveMode(config, target, { platform = process.platform } = {}) {
  let mode = config.mode === "auto" ? target.preferredMode : config.mode;
  if (!target.supportedModes.includes(mode)) {
    mode = target.preferredMode;
  }
  if (mode === "link" && platform === "win32") {
    // Symlinks often need Developer Mode / admin on Windows; prefer import/copy.
    mode = target.supportedModes.includes("import")
      ? "import"
      : target.supportedModes.includes("copy")
        ? "copy"
        : "link";
  }
  return mode;
}
