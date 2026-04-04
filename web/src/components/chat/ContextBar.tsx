import type { SelectedContext } from "../../types/context";

// Get unique ID for a context item
export const getContextId = (ctx: SelectedContext): string => {
  if (ctx.type === "k8s-resource") {
    return `k8s:${ctx.namespace}/${ctx.kind}/${ctx.name}`;
  }
  if (ctx.type === "github-path") {
    return `gh:${ctx.owner}/${ctx.repo}:${ctx.path}`;
  }
  if (ctx.type === "gitlab-path") {
    return `gl:${ctx.project}:${ctx.path}`;
  }
  if (ctx.type === "helm-release") {
    return `helm:${ctx.namespace}/${ctx.name}`;
  }
  return "";
};

// Get display label for a context item
export const getContextLabel = (ctx: SelectedContext): string => {
  if (ctx.type === "k8s-resource") {
    if (ctx.kind === "Namespace") {
      return ctx.name;
    }
    return `${ctx.namespace}/${ctx.name}`;
  }
  if (ctx.type === "github-path") {
    if (ctx.path === "/" || ctx.path === "") {
      return `${ctx.owner}/${ctx.repo}`;
    }
    return `${ctx.repo}${ctx.path}`;
  }
  if (ctx.type === "gitlab-path") {
    if (ctx.path === "/" || ctx.path === "") {
      return ctx.project;
    }
    const projectName = ctx.project.split("/").pop() || ctx.project;
    return `${projectName}${ctx.path}`;
  }
  if (ctx.type === "helm-release") {
    return `${ctx.namespace}/${ctx.name}`;
  }
  return "";
};

/**
 * Parse context tags from stored user message text.
 * Handles the backend's `## Resource Context` block and the legacy
 * frontend `## Context` block for previously stored messages.
 *
 * Returns { contexts, cleanContent } where cleanContent has the
 * context markdown stripped so it's not shown raw in the UI.
 */
export function parseContextFromMessage(text: string): {
  contexts: SelectedContext[];
  cleanContent: string;
} {
  if (!text) return { contexts: [], cleanContent: text };

  const contexts: SelectedContext[] = [];
  const seen = new Set<string>();

  const addCtx = (ctx: SelectedContext) => {
    const id = getContextId(ctx);
    if (!seen.has(id)) {
      seen.add(id);
      contexts.push(ctx);
    }
  };

  // --- Detect and strip the "## Resource Context" block (backend) ---
  // The block starts with "## Resource Context\n" and ends at the next
  // line that is NOT part of it (i.e. the user's actual message).
  // The backend always ends the block with a trailing "\n\n".
  const rcHeader = "## Resource Context\n";
  let cleanContent = text;

  if (text.startsWith(rcHeader)) {
    // Find where the resource context block ends.
    // It ends right before the user's actual text, which is the first line
    // after the block that isn't a heading, bullet, bold line, code fence,
    // or blank line within the context sections.
    const blockEnd = findContextBlockEnd(text, rcHeader);
    const contextBlock = text.slice(0, blockEnd);
    cleanContent = text.slice(blockEnd).replace(/^\n+/, "");

    // Parse K8s resources: **Namespace: `name`**, **Deployment: `ns/name`**, etc.
    const k8sKinds = ["Namespace", "Deployment", "Pod", "Service", "StatefulSet"];
    for (const kind of k8sKinds) {
      const re = new RegExp(`\\*\\*${kind}: \`([^\`]+)\`\\*\\*`, "g");
      let m;
      while ((m = re.exec(contextBlock)) !== null) {
        if (kind === "Namespace") {
          addCtx({ type: "k8s-resource", source: "parsed", kind: "Namespace", name: m[1], namespace: m[1] });
        } else {
          const parts = m[1].split("/");
          if (parts.length === 2) {
            addCtx({ type: "k8s-resource", source: "parsed", kind, name: parts[1], namespace: parts[0] });
          }
        }
      }
    }

    // Parse GitHub: **GitHub: `owner/repo`**
    const ghRe = /\*\*GitHub: `([^`]+\/[^`]+)`\*\*/g;
    let ghM;
    while ((ghM = ghRe.exec(contextBlock)) !== null) {
      const parts = ghM[1].split("/");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts.slice(1).join("/");
        // Check for a path line: "- Path: `/some/path`" or "- File: `/some/path`"
        const pathRe = /- (?:Path|File): `([^`]+)`/;
        // Search in the lines after this match within the same section
        const afterMatch = contextBlock.slice(ghM.index);
        const pathM = pathRe.exec(afterMatch);
        const path = pathM ? pathM[1] : "/";
        const isFile = pathM ? afterMatch.slice(pathM.index).startsWith("- File:") : false;
        addCtx({ type: "github-path", source: "parsed", owner, repo, path, isFile });
      }
    }

    // Parse GitLab: **GitLab: `project`**
    const glRe = /\*\*GitLab: `([^`]+)`\*\*/g;
    let glM;
    while ((glM = glRe.exec(contextBlock)) !== null) {
      const project = glM[1];
      const pathRe = /- (?:Path|File): `([^`]+)`/;
      const afterMatch = contextBlock.slice(glM.index);
      const pathM = pathRe.exec(afterMatch);
      const path = pathM ? pathM[1] : "/";
      const isFile = pathM ? afterMatch.slice(pathM.index).startsWith("- File:") : false;
      addCtx({ type: "gitlab-path", source: "parsed", project, path, isFile });
    }
  }

  // --- Also handle legacy "## Context" block (old frontend prefix) ---
  const legacyHeader = "## Context\n";
  if (cleanContent.startsWith(legacyHeader)) {
    const blockEnd = findContextBlockEnd(cleanContent, legacyHeader);
    const contextBlock = cleanContent.slice(0, blockEnd);
    cleanContent = cleanContent.slice(blockEnd).replace(/^\n+/, "");

    // Legacy K8s: "- Namespace: name" or "- Kind: namespace/name"
    const k8sKinds = ["Namespace", "Deployment", "Pod", "Service", "StatefulSet"];
    for (const kind of k8sKinds) {
      const re = new RegExp(`^- ${kind}: (.+)$`, "gm");
      let m;
      while ((m = re.exec(contextBlock)) !== null) {
        if (kind === "Namespace") {
          addCtx({ type: "k8s-resource", source: "parsed", kind: "Namespace", name: m[1].trim(), namespace: m[1].trim() });
        } else {
          const parts = m[1].trim().split("/");
          if (parts.length === 2) {
            addCtx({ type: "k8s-resource", source: "parsed", kind, name: parts[1], namespace: parts[0] });
          }
        }
      }
    }

    // Legacy Helm: "- Release: namespace/name (chart: chart-version)"
    const helmRe = /^- Release: ([^/]+)\/(\S+) \(chart: ([^-]+)-(.+)\)$/gm;
    let hm;
    while ((hm = helmRe.exec(contextBlock)) !== null) {
      addCtx({ type: "helm-release", source: "parsed", namespace: hm[1], name: hm[2], chart: hm[3], chartVersion: hm[4], status: "" });
    }

    // Legacy GitHub: "- owner/repo: path"  (under ### Repository Paths:)
    if (contextBlock.includes("### Repository Paths:")) {
      const section = contextBlock.split("### Repository Paths:")[1]?.split("###")[0] || "";
      const re = /^- ([^/\n]+)\/([^:\n]+): (.+)$/gm;
      let m;
      while ((m = re.exec(section)) !== null) {
        const path = m[3].trim() === "(root)" ? "/" : m[3].trim();
        addCtx({ type: "github-path", source: "parsed", owner: m[1].trim(), repo: m[2].trim(), path });
      }
    }

    // Legacy GitLab: "- project: path"  (under ### GitLab Project Paths:)
    if (contextBlock.includes("### GitLab Project Paths:")) {
      const section = contextBlock.split("### GitLab Project Paths:")[1]?.split("###")[0] || "";
      const re = /^- ([^:\n]+): (.+)$/gm;
      let m;
      while ((m = re.exec(section)) !== null) {
        const path = m[2].trim() === "(root)" ? "/" : m[2].trim();
        addCtx({ type: "gitlab-path", source: "parsed", project: m[1].trim(), path });
      }
    }
  }

  return { contexts, cleanContent };
}

/**
 * Find the end index of a context block in the message text.
 * A context block consists of headings (##, ###), bold lines (**...**),
 * bullet points, code fences, and blank lines.
 * It ends when we hit a line that looks like normal user text.
 */
function findContextBlockEnd(text: string, _header?: string): number {
  const lines = text.split("\n");
  let i = 0;
  let inCodeFence = false;

  for (; i < lines.length; i++) {
    const line = lines[i];

    // Track code fences (``` blocks for file content)
    if (line.startsWith("```")) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    // These are all part of context blocks
    if (line.startsWith("## ") || line.startsWith("### ")) continue;
    if (line.startsWith("- ")) continue;
    if (line.startsWith("**")) continue;
    if (line.trim() === "") continue;

    // Anything else is the start of the user's actual message
    break;
  }

  // Calculate character offset
  let offset = 0;
  for (let j = 0; j < i; j++) {
    offset += lines[j].length + 1; // +1 for the \n
  }
  return offset;
}
