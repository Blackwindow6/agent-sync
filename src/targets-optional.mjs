import { wrapManaged } from "./managed.mjs";

function copyBody(title, sourceContent, sourceRel) {
  return wrapManaged(
    [title, "", `> Synced from \`${sourceRel}\` by agent-sync.`, "", sourceContent.trim()].join(
      "\n",
    ),
  );
}

export const OPTIONAL_TARGETS = Object.freeze([
  {
    id: "gemini",
    name: "Gemini CLI",
    path: "GEMINI.md",
    defaultEnabled: false,
    preferredMode: "import",
    supportedModes: ["import", "copy", "link"],
    description: "Google Gemini CLI project context",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        [
          "# Gemini CLI",
          "",
          `Project instructions live in \`${sourceRel}\`. Read and follow that file for all coding tasks.`,
        ].join("\n"),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      copyBody("# Gemini CLI", sourceContent, sourceRel),
  },
  {
    id: "windsurf",
    name: "Windsurf",
    path: ".windsurfrules",
    defaultEnabled: false,
    preferredMode: "copy",
    supportedModes: ["import", "copy", "link"],
    description: "Windsurf / Codeium rules",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        ["# Windsurf rules", "", `Follow \`${sourceRel}\` for project conventions and commands.`].join(
          "\n",
        ),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      copyBody("# Windsurf rules", sourceContent, sourceRel),
  },
  {
    id: "aider",
    name: "Aider",
    path: "CONVENTIONS.md",
    defaultEnabled: false,
    preferredMode: "copy",
    supportedModes: ["import", "copy", "link"],
    description: "Aider project conventions file",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        ["# Aider conventions", "", `See \`${sourceRel}\` for the full project agent guide.`].join(
          "\n",
        ),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      copyBody("# Aider conventions", sourceContent, sourceRel),
  },
  {
    id: "cline",
    name: "Cline / Roo",
    path: ".clinerules",
    defaultEnabled: false,
    preferredMode: "copy",
    supportedModes: ["import", "copy", "link"],
    description: "Cline / Roo-style project rules",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        ["# Cline rules", "", `Primary instructions: \`${sourceRel}\`. Follow that file completely.`].join(
          "\n",
        ),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      copyBody("# Cline rules", sourceContent, sourceRel),
  },
  {
    id: "continue",
    name: "Continue",
    path: ".continue/rules/agents.md",
    defaultEnabled: false,
    preferredMode: "copy",
    supportedModes: ["import", "copy"],
    description: "Continue.dev project rules",
    renderImport: ({ sourceRel }) =>
      wrapManaged(
        ["# Continue rules", "", `Use \`${sourceRel}\` as the project instruction source.`].join(
          "\n",
        ),
      ),
    renderCopy: ({ sourceContent, sourceRel }) =>
      copyBody("# Continue rules", sourceContent, sourceRel),
  },
]);
