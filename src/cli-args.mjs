import path from "node:path";
import { loadConfig, VALID_MODES } from "./config.mjs";
import { TARGETS } from "./targets.mjs";

const TARGET_IDS = new Set(TARGETS.map((target) => target.id));
const ARGV_START_INDEX = 2;
const NEXT_TOKEN_OFFSET = 1;
const LONG_OPTION_PREFIX_LENGTH = 2;
const VALUE_OPTIONS = new Set([
  "-C",
  "--cwd",
  "--mode",
  "--source",
  "--only",
  "--enable",
  "--disable",
]);

function initialArgs() {
  return {
    command: null,
    cwd: process.cwd(),
    force: false,
    dryRun: false,
    yes: false,
    mode: null,
    source: null,
    only: null,
    enable: null,
    disable: null,
  };
}

function optionValue(raw, index, option) {
  const value = raw[index + NEXT_TOKEN_OFFSET];
  if (value === undefined || value.startsWith("-")) {
    throw new Error(`Option ${option} requires a value.`);
  }
  return value;
}

function targetList(value, option) {
  const ids = [...new Set(value.split(",").map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error(`Option ${option} requires at least one target.`);
  for (const id of ids) {
    if (!TARGET_IDS.has(id)) throw new Error(`Unknown target: ${id}`);
  }
  return ids;
}

function assignValue(args, option, value) {
  if (option === "-C" || option === "--cwd") return { ...args, cwd: path.resolve(value) };
  if (option === "--source") return { ...args, source: value };
  if (option === "--mode") {
    if (!VALID_MODES.includes(value)) throw new Error(`Invalid sync mode: ${value}`);
    return { ...args, mode: value };
  }
  const field = option.slice(LONG_OPTION_PREFIX_LENGTH);
  return { ...args, [field]: targetList(value, option) };
}

function assignFlag(args, option) {
  if (option === "-h" || option === "--help") return { ...args, command: "help" };
  if (option === "-V" || option === "--version") return { ...args, command: "version" };
  if (option === "--force") return { ...args, force: true };
  if (option === "--dry-run") return { ...args, dryRun: true };
  if (option === "-y" || option === "--yes") return { ...args, yes: true };
  throw new Error(`Unknown option: ${option}`);
}

export function parseArgs(argv = process.argv) {
  const raw = argv.slice(ARGV_START_INDEX);
  let args = initialArgs();
  for (let index = 0; index < raw.length; index++) {
    const token = raw[index];
    if (VALUE_OPTIONS.has(token)) {
      args = assignValue(args, token, optionValue(raw, index, token));
      index += NEXT_TOKEN_OFFSET;
    } else if (token.startsWith("-")) {
      args = assignFlag(args, token);
    } else if (!args.command) {
      args = { ...args, command: token };
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }
  return { ...args, command: args.command || "help" };
}

export function applyConfigOverrides(config, args) {
  let targets = { ...config.targets };
  if (args.enable) {
    for (const id of args.enable) targets[id] = true;
  }
  if (args.disable) {
    for (const id of args.disable) targets[id] = false;
  }
  if (args.only) {
    targets = Object.fromEntries(Object.keys(targets).map((id) => [id, args.only.includes(id)]));
  }
  return {
    ...config,
    source: args.source || config.source,
    mode: args.mode || config.mode,
    targets,
  };
}

export function prepareConfig(args) {
  const loaded = loadConfig(args.cwd);
  return { ...loaded, config: applyConfigOverrides(loaded.config, args) };
}

export function hasConfigOverrides(args) {
  return Boolean(args.source || args.mode || args.only || args.enable || args.disable);
}
