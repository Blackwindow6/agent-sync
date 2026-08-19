import fs from "node:fs";
import path from "node:path";
import {
  assertRealParentPath,
  assertRealPath,
  inspectPath,
  resolveProjectPath,
  writeTextAtomic,
} from "./fsutil.mjs";
import { TARGETS } from "./targets.mjs";

export const CONFIG_NAMES = Object.freeze([
  "agent-sync.config.json",
  ".agent-sync.json",
  "agent-sync.json",
]);
export const VALID_MODES = Object.freeze(["auto", "import", "copy", "link"]);

const TARGET_IDS = new Set(TARGETS.map((target) => target.id));
const JSON_INDENT_SPACES = 2;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateTargets(targets) {
  if (!isRecord(targets)) {
    throw new Error("Config field `targets` must be an object.");
  }
  for (const [id, enabled] of Object.entries(targets)) {
    if (!TARGET_IDS.has(id)) throw new Error(`Unknown target in config: ${id}`);
    if (typeof enabled !== "boolean") {
      throw new Error(`Config target \`${id}\` must be true or false.`);
    }
  }
}

function validateSchema(raw) {
  if (raw.$schema !== undefined && typeof raw.$schema !== "string") {
    throw new Error("Config field `$schema` must be a string.");
  }
}

function validateSource(raw) {
  if (raw.source !== undefined && (typeof raw.source !== "string" || !raw.source.trim())) {
    throw new Error("Config field `source` must be a non-empty string.");
  }
}

function validateMode(raw) {
  if (raw.mode !== undefined && !VALID_MODES.includes(raw.mode)) {
    throw new Error(`Invalid sync mode: ${String(raw.mode)}`);
  }
}

function validateOptionalBoolean(raw, field) {
  if (raw[field] !== undefined && typeof raw[field] !== "boolean") {
    throw new Error(`Config field \`${field}\` must be true or false.`);
  }
}

function validateCodexBudget(raw) {
  const value = raw.codexMaxBytes;
  if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) {
    throw new Error("Config field `codexMaxBytes` must be a positive integer.");
  }
}

function validateRawConfig(raw) {
  if (!isRecord(raw)) throw new Error("Config root must be a JSON object.");
  validateSchema(raw);
  validateSource(raw);
  validateMode(raw);
  validateOptionalBoolean(raw, "protectUnmanaged");
  validateOptionalBoolean(raw, "allowExternalSymlinks");
  if (raw.targets !== undefined) validateTargets(raw.targets);
  validateCodexBudget(raw);
}

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
    /** Explicit opt-out for repositories that intentionally use external symlinks */
    allowExternalSymlinks: false,
  };
}

export function findConfigPath(cwd) {
  const matches = CONFIG_NAMES
    .map((name) => path.join(cwd, name))
    .filter((candidate) => inspectPath(candidate).kind !== "missing");
  if (matches.length > 1) {
    const names = matches.map((match) => path.basename(match)).join(", ");
    throw new Error(`Multiple agent-sync config files found: ${names}`);
  }
  return matches[0] || null;
}

export function loadConfig(cwd) {
  const configPath = findConfigPath(cwd);
  const base = defaultConfig();
  if (!configPath) {
    return { config: base, configPath: null };
  }
  assertRealPath(cwd, configPath, {
    label: "Config path",
    allowExternalSymlinks: true,
    denyGitMetadata: true,
  });
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  validateRawConfig(raw);
  assertRealPath(cwd, configPath, {
    label: "Config path",
    allowExternalSymlinks: raw.allowExternalSymlinks,
    denyGitMetadata: true,
  });
  const config = {
    ...base,
    ...raw,
    targets: { ...base.targets, ...(raw.targets || {}) },
  };
  return { config, configPath };
}

export function writeConfig(cwd, config, filename = "agent-sync.config.json") {
  const p = resolveProjectPath(cwd, filename, {
    label: "Config path",
    denyGitMetadata: true,
  });
  assertRealParentPath(cwd, p, {
    label: "Config parent path",
    denyGitMetadata: true,
  });
  const out = { ...config };
  writeTextAtomic(p, JSON.stringify(out, null, JSON_INDENT_SPACES) + "\n");
  return p;
}

export function enabledTargets(config) {
  return TARGETS.filter((t) => config.targets[t.id]);
}

/**
 * Resolve effective mode for a target.
 * auto uses the target's declared preferred mode.
 */
export function resolveMode(config, target) {
  if (!VALID_MODES.includes(config.mode)) {
    throw new Error(`Invalid sync mode: ${String(config.mode)}`);
  }
  const mode = config.mode === "auto" ? target.preferredMode : config.mode;
  if (!target.supportedModes.includes(mode)) {
    throw new Error(`Target \`${target.id}\` does not support \`${mode}\` mode.`);
  }
  return mode;
}
