/**
 * Shared capability/tool theming module.
 *
 * Provides branded SVG icons, category detection, color themes, and labels
 * used by both ToolCallCard (chat interface) and AgentDetailPanel (sidebar).
 */
import type { Component } from "solid-js";
import {
  FiDatabase,
  FiMessageSquare,
  FiPackage,
  FiServer,
} from "solid-icons/fi";

// =============================================================================
// SVG ICONS
// =============================================================================

export const KubernetesIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="9.70 9.20 210.86 204.86" class={props.class} fill="currentColor">
    <path d="M134.358 126.46551a3.59023 3.59023 0 0 0-.855-.065 3.68515 3.68515 0 0 0-1.425.37 3.725 3.725 0 0 0-1.803 4.825l-.026.037 8.528 20.603a43.53012 43.53012 0 0 0 17.595-22.102l-21.976-3.714zm-34.194 2.92a3.72 3.72 0 0 0-3.568-2.894 3.6556 3.6556 0 0 0-.733.065l-.037-.045-21.785 3.698a43.69506 43.69506 0 0 0 17.54 21.946l8.442-20.399-.066-.08a3.68318 3.68318 0 0 0 .207-2.291zm18.245 8a3.718 3.718 0 0 0-6.557.008h-.018l-10.713 19.372a43.637 43.637 0 0 0 23.815 1.225q2.197-.5 4.292-1.199l-10.738-19.407zm33.914-45l-16.483 14.753.009.047a3.725 3.725 0 0 0 1.46 6.395l.02.089 21.35 6.15a44.278 44.278 0 0 0-6.356-27.432zM121.7 94.0385a3.725 3.725 0 0 0 5.913 2.84l.065.028 18.036-12.789a43.85 43.85 0 0 0-25.287-12.19l1.253 22.105zm-19.1 2.922a3.72 3.72 0 0 0 5.904-2.85l.092-.044 1.253-22.139a44.68209 44.68209 0 0 0-4.501.775 43.4669 43.4669 0 0 0-20.937 11.409l18.154 12.869zm-9.678 16.728a3.72 3.72 0 0 0 1.462-6.396l.018-.087-16.574-14.825a43.454 43.454 0 0 0-6.168 27.511l21.245-6.13zm16.098 6.512l6.114 2.94 6.096-2.933 1.514-6.582-4.219-5.276h-6.79l-4.231 5.268z"/>
    <path d="M216.208 133.16651l-17.422-75.675a13.60207 13.60207 0 0 0-7.293-9.073l-70.521-33.67a13.589 13.589 0 0 0-11.705 0l-70.507 33.688a13.598 13.598 0 0 0-7.295 9.072l-17.394 75.673a13.315 13.315 0 0 0-.004 5.81 13.50607 13.50607 0 0 0 .491 1.718 13.0998 13.0998 0 0 0 1.343 2.726c.239.365.491.72.765 1.064l48.804 60.678c.213.264.448.505.681.75a13.42334 13.42334 0 0 0 2.574 2.133 13.9237 13.9237 0 0 0 3.857 1.677 13.29785 13.29785 0 0 0 3.43.473h.759l77.504-.018a12.99345 12.99345 0 0 0 1.41-.083 13.46921 13.46921 0 0 0 1.989-.378 13.872 13.872 0 0 0 1.381-.442c.353-.135.705-.27 1.045-.433a13.94127 13.94127 0 0 0 1.479-.822 13.30347 13.30347 0 0 0 3.237-2.865l1.488-1.85 47.299-58.84a13.185 13.185 0 0 0 2.108-3.785 13.67036 13.67036 0 0 0 .5-1.724 13.28215 13.28215 0 0 0-.004-5.809z"/>
  </svg>
);

export const HelmIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 32 32" class={props.class} fill="currentColor">
    <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 2c7.732 0 14 6.268 14 14s-6.268 14-14 14S2 23.732 2 16 8.268 2 16 2zm-1 5v3h2V7h-2zm-5.5 2.134l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm13 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM16 12a4 4 0 100 8 4 4 0 000-8zm-8.5 4.268l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm17 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM9.768 20.232l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zm12.464 0l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zM15 23v3h2v-3h-2z"/>
  </svg>
);

export const GitHubIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

export const GitLabIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
  </svg>
);

export const TerraformIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M1.5 0v8.35l7.24 4.18V4.18L1.5 0zm8.74 4.18v8.35l7.24-4.18V0L10.24 4.18zM10.24 13.7v8.35l7.24-4.18V9.52L10.24 13.7zM18.98 4.18v8.35L22.5 10.5V2.15L18.98 4.18z"/>
  </svg>
);

// =============================================================================
// TOOL CATEGORY DETECTION
// =============================================================================

export type ToolCategory =
  | "kubernetes"
  | "helm"
  | "github"
  | "gitlab"
  | "terraform"
  | "database"
  | "slack"
  | "mcp"
  | "builtin"
  | "generic";

/** CRD capability type as returned by the API */
export type CRDCapabilityType = "Container" | "MCP" | "Skill" | "Tool" | "Plugin";

/** Short prefix labels for each CRD capability type */
const capabilityTypePrefix: Record<CRDCapabilityType, string> = {
  Container: "CLI",
  MCP: "MCP",
  Skill: "Skill",
  Tool: "Tool",
  Plugin: "Plugin",
};

/**
 * Detect the category of a tool or capability by name.
 * When a CapabilityResponse is provided, uses the CRD's authoritative
 * type and containerType fields instead of name-guessing.
 */
export function detectToolCategory(
  name: string,
  capability?: { spec: { type?: string; container?: { containerType?: string } } },
): ToolCategory {
  // If we have CRD data, use it authoritatively
  if (capability?.spec?.type) {
    const crdType = capability.spec.type;

    if (crdType === "Container" && capability.spec.container?.containerType) {
      const ct = capability.spec.container.containerType;
      if (ct === "kubernetes") return "kubernetes";
      if (ct === "helm") return "helm";
      if (ct === "github") return "github";
      if (ct === "gitlab") return "gitlab";
      // "git" and "custom" fall through to name-based detection
    }

    // For MCP/Skill/Tool/Plugin: try name-based domain detection first,
    // so "gitlab-mcp" resolves to "gitlab" (not "mcp")
    if (crdType === "MCP" || crdType === "Skill" || crdType === "Tool" || crdType === "Plugin") {
      const domain = detectDomainFromName(name);
      if (domain) return domain;
      // No domain detected — return the type-level fallback
      if (crdType === "MCP") return "mcp";
      return "generic";
    }
  }

  const lower = name.toLowerCase();

  // Built-in OpenCode tools
  const builtins = [
    "bash", "read", "write", "edit", "glob", "grep",
    "webfetch", "task", "todowrite", "todoread", "question", "skill",
  ];
  if (builtins.includes(lower)) return "builtin";

  // Capability-based tools (substring match — fallback when CRD data unavailable)
  return detectDomainFromName(name) || "generic";
}

/** Try to detect a domain category from a capability/tool name via substring matching. */
function detectDomainFromName(name: string): ToolCategory | null {
  const lower = name.toLowerCase();
  if (lower.includes("kubectl") || lower.includes("kubernetes") || lower.includes("k8s")) return "kubernetes";
  if (lower.includes("helm")) return "helm";
  if (lower.includes("github") || lower.includes("gh-")) return "github";
  if (lower.includes("gitlab") || lower.includes("glab")) return "gitlab";
  if (lower.includes("git") && !lower.includes("github") && !lower.includes("gitlab")) return "generic"; // plain git
  if (lower.includes("terraform") || lower.includes("tf-")) return "terraform";
  if (lower.includes("postgres") || lower.includes("mysql") || lower.includes("database") || lower.includes("redis") || lower.includes("mongo")) return "database";
  if (lower.includes("slack")) return "slack";
  if (lower.includes("mcp-") || lower.includes("mcp_")) return "mcp";
  return null;
}

/**
 * Get a display label that includes the capability type prefix.
 * Returns labels like "CLI - Kubernetes", "MCP - GitLab", "Skill", "Tool", etc.
 * Falls back to just the category label when no CRD type is available.
 */
export function getCapabilityDisplayLabel(
  category: ToolCategory,
  capability?: { spec: { type?: string } },
): string | null {
  const domainLabel = getCategoryLabel(category);
  if (!capability?.spec?.type) return domainLabel;

  const prefix = capabilityTypePrefix[capability.spec.type as CRDCapabilityType];
  if (!prefix) return domainLabel;

  // Avoid redundancy: "MCP - MCP" → just "MCP"
  if (prefix === domainLabel) return prefix;

  // For types without a domain (e.g. a generic Skill or Tool), just show the type
  if (!domainLabel) return prefix;

  return `${prefix} - ${domainLabel}`;
}

// =============================================================================
// THEMED ACCENT MAPS
// =============================================================================

export interface ToolTheme {
  border: string;
  bg: string;
  headerBg: string;
  iconColor: string;
  badge: string;
  watermark: string;
}

export const toolThemes: Record<ToolCategory, ToolTheme> = {
  kubernetes: {
    border: "border-blue-500/30",
    bg: "bg-gradient-to-br from-blue-500/5 to-blue-600/2",
    headerBg: "bg-gradient-to-r from-blue-500/10 to-transparent",
    iconColor: "text-blue-400",
    badge: "bg-blue-500/15 text-blue-400",
    watermark: "text-blue-400/[0.04]",
  },
  helm: {
    border: "border-cyan-500/30",
    bg: "bg-gradient-to-br from-cyan-500/5 to-cyan-600/2",
    headerBg: "bg-gradient-to-r from-cyan-500/10 to-transparent",
    iconColor: "text-cyan-400",
    badge: "bg-cyan-500/15 text-cyan-400",
    watermark: "text-cyan-400/[0.04]",
  },
  github: {
    border: "border-white/15",
    bg: "bg-gradient-to-br from-white/[0.03] to-white/[0.01]",
    headerBg: "bg-gradient-to-r from-white/[0.06] to-transparent",
    iconColor: "text-gray-300",
    badge: "bg-white/10 text-gray-300",
    watermark: "text-white/[0.03]",
  },
  gitlab: {
    border: "border-orange-500/30",
    bg: "bg-gradient-to-br from-orange-500/5 to-orange-600/2",
    headerBg: "bg-gradient-to-r from-orange-500/10 to-transparent",
    iconColor: "text-orange-400",
    badge: "bg-orange-500/15 text-orange-400",
    watermark: "text-orange-400/[0.04]",
  },
  terraform: {
    border: "border-purple-500/30",
    bg: "bg-gradient-to-br from-purple-500/5 to-purple-600/2",
    headerBg: "bg-gradient-to-r from-purple-500/10 to-transparent",
    iconColor: "text-purple-400",
    badge: "bg-purple-500/15 text-purple-400",
    watermark: "text-purple-400/[0.04]",
  },
  database: {
    border: "border-emerald-500/30",
    bg: "bg-gradient-to-br from-emerald-500/5 to-emerald-600/2",
    headerBg: "bg-gradient-to-r from-emerald-500/10 to-transparent",
    iconColor: "text-emerald-400",
    badge: "bg-emerald-500/15 text-emerald-400",
    watermark: "text-emerald-400/[0.04]",
  },
  slack: {
    border: "border-pink-500/30",
    bg: "bg-gradient-to-br from-pink-500/5 to-pink-600/2",
    headerBg: "bg-gradient-to-r from-pink-500/10 to-transparent",
    iconColor: "text-pink-400",
    badge: "bg-pink-500/15 text-pink-400",
    watermark: "text-pink-400/[0.04]",
  },
  mcp: {
    border: "border-indigo-500/30",
    bg: "bg-gradient-to-br from-indigo-500/5 to-indigo-600/2",
    headerBg: "bg-gradient-to-r from-indigo-500/10 to-transparent",
    iconColor: "text-indigo-400",
    badge: "bg-indigo-500/15 text-indigo-400",
    watermark: "text-indigo-400/[0.04]",
  },
  builtin: {
    border: "",
    bg: "",
    headerBg: "",
    iconColor: "text-text-muted",
    badge: "",
    watermark: "",
  },
  generic: {
    border: "border-text-muted/20",
    bg: "bg-gradient-to-br from-text-muted/[0.03] to-transparent",
    headerBg: "bg-gradient-to-r from-text-muted/[0.06] to-transparent",
    iconColor: "text-text-muted",
    badge: "bg-text-muted/10 text-text-muted",
    watermark: "text-text-muted/[0.03]",
  },
};

// =============================================================================
// CATEGORY HELPERS
// =============================================================================

/** Return the branded SVG icon component for a tool category. */
export function getCategoryIcon(category: ToolCategory): Component<{ class?: string }> {
  switch (category) {
    case "kubernetes": return KubernetesIcon;
    case "helm":       return HelmIcon;
    case "github":     return GitHubIcon;
    case "gitlab":     return GitLabIcon;
    case "terraform":  return TerraformIcon;
    case "database":   return (p) => <FiDatabase class={p.class} />;
    case "slack":      return (p) => <FiMessageSquare class={p.class} />;
    case "mcp":        return (p) => <FiPackage class={p.class} />;
    default:           return (p) => <FiServer class={p.class} />;
  }
}

/** Friendly display name for a tool category, or null for builtin/generic. */
export function getCategoryLabel(category: ToolCategory): string | null {
  switch (category) {
    case "kubernetes": return "Kubernetes";
    case "helm":       return "Helm";
    case "github":     return "GitHub";
    case "gitlab":     return "GitLab";
    case "terraform":  return "Terraform";
    case "database":   return "Database";
    case "slack":      return "Slack";
    case "mcp":        return "MCP";
    default:           return null;
  }
}
