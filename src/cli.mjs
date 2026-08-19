import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./cli-args.mjs";
import { EXIT_FAILURE } from "./cli-constants.mjs";
import { cmdImport } from "./cli-import.mjs";
import { cmdStatus, cmdTargets } from "./cli-info-commands.mjs";
import { cmdInit } from "./cli-init.mjs";
import { color, helpText } from "./cli-output.mjs";
import { cmdApply, cmdCheck, cmdDiff } from "./cli-sync-commands.mjs";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  fs.readFileSync(path.join(currentDir, "..", "package.json"), "utf8"),
);
const HELP = helpText(packageJson.version);

const COMMANDS = Object.freeze({
  init: cmdInit,
  apply: cmdApply,
  sync: cmdApply,
  check: cmdCheck,
  diff: cmdDiff,
  status: cmdStatus,
  import: cmdImport,
  targets: (_args, c) => cmdTargets(c),
  help: (_args, _c) => console.log(HELP),
  version: (_args, _c) => console.log(packageJson.version),
});

function printError(error, c) {
  const message = error?.stack || error?.message || String(error);
  console.error(c.red(message));
  process.exitCode = EXIT_FAILURE;
}

export async function run(argv = process.argv) {
  const c = color(Boolean(process.stdout.isTTY));
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    printError(error, c);
    return;
  }

  const command = COMMANDS[args.command];
  if (!command) {
    console.error(`Unknown command: ${args.command}\n`);
    console.log(HELP);
    process.exitCode = EXIT_FAILURE;
    return;
  }
  try {
    await command(args, c);
  } catch (error) {
    printError(error, c);
  }
}
