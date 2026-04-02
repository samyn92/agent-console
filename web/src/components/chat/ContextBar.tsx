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

// Helper to format context for agent message
export const formatContextForAgent = (contexts: SelectedContext[]): string => {
  if (contexts.length === 0) return "";
  
  const lines: string[] = ["## Context"];
  
  const k8s = contexts.filter(c => c.type === "k8s-resource");
  const github = contexts.filter(c => c.type === "github-path");
  const gitlab = contexts.filter(c => c.type === "gitlab-path");
  const helm = contexts.filter(c => c.type === "helm-release");
  
  if (k8s.length > 0) {
    lines.push("### Kubernetes Resources:");
    for (const ctx of k8s) {
      if (ctx.type === "k8s-resource") {
        if (ctx.kind === "Namespace") {
          lines.push(`- Namespace: ${ctx.name}`);
        } else {
          lines.push(`- ${ctx.kind}: ${ctx.namespace}/${ctx.name}`);
        }
      }
    }
  }
  
  if (helm.length > 0) {
    lines.push("### Helm Releases:");
    for (const ctx of helm) {
      if (ctx.type === "helm-release") {
        lines.push(`- Release: ${ctx.namespace}/${ctx.name} (chart: ${ctx.chart}-${ctx.chartVersion})`);
      }
    }
  }
  
  if (github.length > 0) {
    lines.push("### Repository Paths:");
    for (const ctx of github) {
      if (ctx.type === "github-path") {
        const path = ctx.path === "/" || ctx.path === "" ? "(root)" : ctx.path;
        lines.push(`- ${ctx.owner}/${ctx.repo}: ${path}`);
      }
    }
  }

  if (gitlab.length > 0) {
    lines.push("### GitLab Project Paths:");
    for (const ctx of gitlab) {
      if (ctx.type === "gitlab-path") {
        const path = ctx.path === "/" || ctx.path === "" ? "(root)" : ctx.path;
        lines.push(`- ${ctx.project}: ${path}`);
      }
    }
  }
  
  lines.push("");
  return lines.join("\n");
};
