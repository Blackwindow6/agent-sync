import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadAgentsTemplate() {
  const p = path.join(__dirname, "..", "templates", "AGENTS.md");
  return fs.readFileSync(p, "utf8");
}

export function scaffoldAgentsMd({ projectName = "this project", packageManager = "npm" } = {}) {
  return loadAgentsTemplate()
    .replaceAll("{{PROJECT_NAME}}", projectName)
    .replaceAll("{{PKG}}", packageManager);
}

/**
 * Best-effort: merge multiple existing instruction files into one AGENTS.md body.
 */
export function mergeSources(files) {
  const parts = [];
  for (const { name, content } of files) {
    if (!content || !content.trim()) continue;
    parts.push(`## Imported from ${name}\n\n${content.trim()}`);
  }
  if (parts.length === 0) return null;
  return (
    [
      `# AGENTS.md`,
      ``,
      `> Merged by \`agent-sync import\`. Review and clean up duplicate sections.`,
      ``,
      parts.join("\n\n"),
      ``,
    ].join("\n") + "\n"
  );
}

/** Detect package manager from lockfiles */
export function detectPackageManager(cwd) {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock")))
    return "bun";
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm";
  return "npm";
}

export function detectProjectName(cwd) {
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.name) return pkg.name;
    } catch {
      /* ignore */
    }
  }
  return path.basename(cwd);
}
