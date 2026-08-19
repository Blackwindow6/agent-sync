import {
  CODEX_CONFIG_PATH,
  CODEX_ROOT_AGENTS,
  buildCodexFallbacks,
  isRootAgentsPath,
  renderCodexConfigToml,
} from "./codex.mjs";
import { MANAGED_BANNER, MANAGED_END, MANAGED_START, wrapManaged } from "./managed.mjs";

function renderCodexTarget(ctx) {
  const fallbacks = buildCodexFallbacks(ctx.config, ctx.allTargets);
  return renderCodexConfigToml({
    sourceRel: ctx.sourceRel,
    fallbacks,
    maxBytes: ctx.config.codexMaxBytes,
    sourceBytes: Buffer.byteLength(ctx.sourceContent, "utf8"),
  });
}

export const CORE_TARGETS = Object.freeze([
  {
    id: "codex",
    name: "OpenAI Codex",
    path: CODEX_CONFIG_PATH,
    defaultEnabled: true,
    preferredMode: "copy",
    supportedModes: ["copy"],
    format: "toml",
    description:
      "Codex project config (.codex/config.toml): fallback filenames + doc size budget. Native instructions stay in AGENTS.md.",
    renderImport: renderCodexTarget,
    renderCopy: renderCodexTarget,
  },
  {
    id: "codex-agents",
    name: "OpenAI Codex (root AGENTS.md)",
    path: CODEX_ROOT_AGENTS,
    defaultEnabled: true,
    preferredMode: "copy",
    supportedModes: ["copy", "link"],
    description:
      "Ensures root AGENTS.md exists for Codex when your source file lives elsewhere. Skipped when source is already AGENTS.md.",
    renderImport: ({ sourceContent }) =>
      sourceContent.endsWith("\n") ? sourceContent : `${sourceContent}\n`,
    renderCopy: ({ sourceContent }) =>
      sourceContent.endsWith("\n") ? sourceContent : `${sourceContent}\n`,
    shouldEmit: (ctx) => !isRootAgentsPath(ctx.sourceRel, { platform: ctx.platform }),
  },
  {
    id: "claude",
    name: "Claude Code",
    path: "CLAUDE.md",
    defaultEnabled: true,
    preferredMode: "import",
    supportedModes: ["import", "copy", "link"],
    description: "Claude Code project memory (does not natively read AGENTS.md)",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        [
          "# Claude Code",
          "",
          `This project uses [\`AGENTS.md\`](${sourceRel}) as the single source of truth for coding-agent instructions.`,
          "",
          `Claude Code: follow @${sourceRel} for all project conventions, commands, and constraints.`,
          "",
          `Do not maintain separate rules here - update \`${sourceRel}\` instead, then run \`agent-sync apply\`.`,
        ].join("\n"),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      wrapManaged(
        [
          "# Claude Code",
          "",
          `> Synced from \`${sourceRel}\`. Prefer editing that file.`,
          "",
          sourceContent.trim(),
        ].join("\n"),
      ),
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    path: ".github/copilot-instructions.md",
    defaultEnabled: true,
    preferredMode: "copy",
    supportedModes: ["import", "copy", "link"],
    description: "GitHub Copilot custom instructions",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        [
          "# GitHub Copilot instructions",
          "",
          `Follow the repository file \`${sourceRel}\` as the primary source of coding-agent guidance.`,
          "Mirror its commands, conventions, and constraints for all suggestions and agent edits.",
        ].join("\n"),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      wrapManaged(
        [
          "# GitHub Copilot instructions",
          "",
          `> Synced from \`${sourceRel}\` by agent-sync.`,
          "",
          sourceContent.trim(),
        ].join("\n"),
      ),
  },
  {
    id: "cursor-legacy",
    name: "Cursor (.cursorrules)",
    path: ".cursorrules",
    defaultEnabled: false,
    preferredMode: "copy",
    supportedModes: ["import", "copy", "link"],
    description: "Legacy Cursor rules file (deprecated but still read)",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        [
          "# Cursor rules",
          "",
          `Use \`${sourceRel}\` as the project instruction source.`,
          "Follow every section in that file for builds, tests, style, and boundaries.",
        ].join("\n"),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      wrapManaged(
        [
          "# Cursor rules",
          "",
          `> Synced from \`${sourceRel}\` by agent-sync.`,
          "",
          sourceContent.trim(),
        ].join("\n"),
      ),
  },
  {
    id: "cursor-rules",
    name: "Cursor rules (MDC)",
    path: ".cursor/rules/agents.mdc",
    defaultEnabled: true,
    preferredMode: "copy",
    supportedModes: ["import", "copy"],
    description: "Modern Cursor project rule (.mdc with alwaysApply)",
    renderImport: ({ sourceRel }) =>
      [
        "---",
        "description: Project agent instructions (synced from AGENTS.md)",
        "alwaysApply: true",
        "---",
        "",
        MANAGED_BANNER,
        MANAGED_START,
        "",
        `Follow \`${sourceRel}\` as the single source of truth for this repository.`,
        "Apply its toolchain commands, conventions, and judgment boundaries to every task.",
        "",
        MANAGED_END,
        "",
      ].join("\n"),
    renderCopy: ({ sourceContent, sourceRel }) =>
      [
        "---",
        "description: Project agent instructions (synced from AGENTS.md)",
        "alwaysApply: true",
        "---",
        "",
        MANAGED_BANNER,
        MANAGED_START,
        "",
        `> Synced from \`${sourceRel}\`.`,
        "",
        sourceContent.trim(),
        "",
        MANAGED_END,
        "",
      ].join("\n"),
  },
]);
