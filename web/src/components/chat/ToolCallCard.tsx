import type { Component, JSX } from "solid-js";
import { Show, For, Switch, Match, createMemo } from "solid-js";
import { 
  FiTerminal, 
  FiCheck, 
  FiX, 
  FiClock, 
  FiExternalLink, 
  FiEdit, 
  FiSearch, 
  FiFolder, 
  FiGlobe,
  FiGitBranch,
  FiCheckSquare,
  FiList,
  FiHelpCircle,
  FiBookOpen,
  FiLoader,
  FiAlertTriangle,
  FiFileText,
  FiFilePlus,
  FiChevronRight,
  FiChevronDown,
  FiDatabase,
  FiMessageSquare,
  FiPackage,
  FiServer
} from "solid-icons/fi";
import type { 
  ToolPart, 
  Todo,
  BashInput,
  EditInput,
  ReadInput,
  GlobInput,
  GrepInput,
  WriteInput,
  QuestionInput
} from "../../types/acp";
import { 
  getToolDisplayName, 
  parseTodoOutput
} from "../../types/acp";
import DiffPreview from "./DiffPreview";

interface ToolCallCardProps {
  /** ACP ToolPart format */
  toolPart: ToolPart;
}

// ============================================================================
// CAPABILITY SVG ICONS
// ============================================================================

const KubernetesIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="9.70 9.20 210.86 204.86" class={props.class} fill="currentColor">
    <path d="M134.358 126.46551a3.59023 3.59023 0 0 0-.855-.065 3.68515 3.68515 0 0 0-1.425.37 3.725 3.725 0 0 0-1.803 4.825l-.026.037 8.528 20.603a43.53012 43.53012 0 0 0 17.595-22.102l-21.976-3.714zm-34.194 2.92a3.72 3.72 0 0 0-3.568-2.894 3.6556 3.6556 0 0 0-.733.065l-.037-.045-21.785 3.698a43.69506 43.69506 0 0 0 17.54 21.946l8.442-20.399-.066-.08a3.68318 3.68318 0 0 0 .207-2.291zm18.245 8a3.718 3.718 0 0 0-6.557.008h-.018l-10.713 19.372a43.637 43.637 0 0 0 23.815 1.225q2.197-.5 4.292-1.199l-10.738-19.407zm33.914-45l-16.483 14.753.009.047a3.725 3.725 0 0 0 1.46 6.395l.02.089 21.35 6.15a44.278 44.278 0 0 0-6.356-27.432zM121.7 94.0385a3.725 3.725 0 0 0 5.913 2.84l.065.028 18.036-12.789a43.85 43.85 0 0 0-25.287-12.19l1.253 22.105zm-19.1 2.922a3.72 3.72 0 0 0 5.904-2.85l.092-.044 1.253-22.139a44.68209 44.68209 0 0 0-4.501.775 43.4669 43.4669 0 0 0-20.937 11.409l18.154 12.869zm-9.678 16.728a3.72 3.72 0 0 0 1.462-6.396l.018-.087-16.574-14.825a43.454 43.454 0 0 0-6.168 27.511l21.245-6.13zm16.098 6.512l6.114 2.94 6.096-2.933 1.514-6.582-4.219-5.276h-6.79l-4.231 5.268z"/>
    <path d="M216.208 133.16651l-17.422-75.675a13.60207 13.60207 0 0 0-7.293-9.073l-70.521-33.67a13.589 13.589 0 0 0-11.705 0l-70.507 33.688a13.598 13.598 0 0 0-7.295 9.072l-17.394 75.673a13.315 13.315 0 0 0-.004 5.81 13.50607 13.50607 0 0 0 .491 1.718 13.0998 13.0998 0 0 0 1.343 2.726c.239.365.491.72.765 1.064l48.804 60.678c.213.264.448.505.681.75a13.42334 13.42334 0 0 0 2.574 2.133 13.9237 13.9237 0 0 0 3.857 1.677 13.29785 13.29785 0 0 0 3.43.473h.759l77.504-.018a12.99345 12.99345 0 0 0 1.41-.083 13.46921 13.46921 0 0 0 1.989-.378 13.872 13.872 0 0 0 1.381-.442c.353-.135.705-.27 1.045-.433a13.94127 13.94127 0 0 0 1.479-.822 13.30347 13.30347 0 0 0 3.237-2.865l1.488-1.85 47.299-58.84a13.185 13.185 0 0 0 2.108-3.785 13.67036 13.67036 0 0 0 .5-1.724 13.28215 13.28215 0 0 0-.004-5.809z"/>
  </svg>
);

const HelmIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 32 32" class={props.class} fill="currentColor">
    <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 2c7.732 0 14 6.268 14 14s-6.268 14-14 14S2 23.732 2 16 8.268 2 16 2zm-1 5v3h2V7h-2zm-5.5 2.134l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm13 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM16 12a4 4 0 100 8 4 4 0 000-8zm-8.5 4.268l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zm17 0l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zM9.768 20.232l-1.5 2.598 1.732 1 1.5-2.598-1.732-1zm12.464 0l-1.732 1 1.5 2.598 1.732-1-1.5-2.598zM15 23v3h2v-3h-2z"/>
  </svg>
);

const GitHubIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);

const GitLabIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z"/>
  </svg>
);

const TerraformIcon: Component<{ class?: string }> = (props) => (
  <svg viewBox="0 0 24 24" class={props.class} fill="currentColor">
    <path d="M1.5 0v8.35l7.24 4.18V4.18L1.5 0zm8.74 4.18v8.35l7.24-4.18V0L10.24 4.18zM10.24 13.7v8.35l7.24-4.18V9.52L10.24 13.7zM18.98 4.18v8.35L22.5 10.5V2.15L18.98 4.18z"/>
  </svg>
);

// ============================================================================
// TOOL CATEGORY DETECTION
// ============================================================================

type ToolCategory = "kubernetes" | "helm" | "github" | "gitlab" | "terraform" | "database" | "slack" | "mcp" | "builtin" | "generic";

function detectToolCategory(toolName: string): ToolCategory {
  const name = toolName.toLowerCase();

  // Built-in OpenCode tools
  const builtins = ["bash", "read", "write", "edit", "glob", "grep", "webfetch", "task", "todowrite", "todoread", "question", "skill"];
  if (builtins.includes(name)) return "builtin";

  // Capability-based tools (substring match)
  if (name.includes("kubectl") || name.includes("kubernetes") || name.includes("k8s")) return "kubernetes";
  if (name.includes("helm")) return "helm";
  if (name.includes("github")) return "github";
  if (name.includes("gitlab")) return "gitlab";
  if (name.includes("terraform") || name.includes("tf-")) return "terraform";
  if (name.includes("postgres") || name.includes("mysql") || name.includes("database") || name.includes("redis") || name.includes("mongo")) return "database";
  if (name.includes("slack")) return "slack";
  if (name.includes("mcp-") || name.includes("mcp_")) return "mcp";

  return "generic";
}

// ============================================================================
// THEMED ACCENT MAPS
// ============================================================================

interface ToolTheme {
  border: string;
  bg: string;
  headerBg: string;
  iconColor: string;
  badge: string;
  watermark: string;
}

const toolThemes: Record<ToolCategory, ToolTheme> = {
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

// Category icon (large themed SVG or feather fallback)
function getCategoryIcon(category: ToolCategory): Component<{ class?: string }> {
  switch (category) {
    case "kubernetes": return KubernetesIcon;
    case "helm": return HelmIcon;
    case "github": return GitHubIcon;
    case "gitlab": return GitLabIcon;
    case "terraform": return TerraformIcon;
    case "database": return (p) => <FiDatabase class={p.class} />;
    case "slack": return (p) => <FiMessageSquare class={p.class} />;
    case "mcp": return (p) => <FiPackage class={p.class} />;
    default: return (p) => <FiServer class={p.class} />;
  }
}

// Friendly display name for categories
function getCategoryLabel(category: ToolCategory): string | null {
  switch (category) {
    case "kubernetes": return "Kubernetes";
    case "helm": return "Helm";
    case "github": return "GitHub";
    case "gitlab": return "GitLab";
    case "terraform": return "Terraform";
    case "database": return "Database";
    case "slack": return "Slack";
    case "mcp": return "MCP";
    default: return null;
  }
}

// ============================================================================
// TOOL-SPECIFIC RENDERERS
// ============================================================================

/** Todo List Renderer */
const TodoListContent: Component<{ todos: Todo[] }> = (props) => {
  const statusColors: Record<string, string> = {
    pending: "text-text-muted",
    in_progress: "text-info",
    completed: "text-success",
    cancelled: "text-text-muted line-through"
  };

  const priorityIndicator: Record<string, JSX.Element> = {
    high: <span class="w-2 h-2 rounded-full bg-error inline-block mr-2" />,
    medium: <span class="w-2 h-2 rounded-full bg-warning inline-block mr-2" />,
    low: <span class="w-2 h-2 rounded-full bg-text-muted inline-block mr-2" />
  };

  const statusIcon = (status: string): JSX.Element => {
    switch (status) {
      case "completed":
        return <FiCheck class="w-4 h-4 text-success" />;
      case "in_progress":
        return <FiLoader class="w-4 h-4 text-info animate-spin" />;
      case "cancelled":
        return <FiX class="w-4 h-4 text-text-muted" />;
      default:
        return <div class="w-4 h-4 rounded border-2 border-text-muted" />;
    }
  };

  return (
    <div class="space-y-1.5">
      <For each={props.todos}>
        {(todo) => (
          <div class={`flex items-start gap-2 text-sm ${statusColors[todo.status] || ""}`}>
            <div class="mt-0.5 flex-shrink-0">{statusIcon(todo.status)}</div>
            <div class="flex-1">
              {priorityIndicator[todo.priority]}
              <span class={todo.status === "cancelled" ? "line-through" : ""}>
                {todo.content}
              </span>
            </div>
          </div>
        )}
      </For>
    </div>
  );
};

/** Bash Command Renderer */
const BashContent: Component<{ input: BashInput; output?: string; error?: string }> = (props) => {
  return (
    <div class="space-y-1.5">
      {/* Command description if present */}
      <Show when={props.input.description}>
        <div class="text-xs text-text-muted">{props.input.description}</div>
      </Show>
      
      {/* Working directory if not default */}
      <Show when={props.input.workdir}>
        <div class="text-xs text-text-muted flex items-center gap-1">
          <FiFolder class="w-3 h-3" />
          {props.input.workdir}
        </div>
      </Show>

      {/* Command */}
      <div class="bg-surface-2/50 rounded px-2 py-1.5 font-mono text-xs">
        <span class="text-primary select-none">$ </span>
        <span class="text-text-secondary">{props.input.command}</span>
      </div>

      {/* Output preview */}
      <Show when={props.output}>
        <details class="group">
          <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
            <FiChevronRight class="w-3 h-3 group-open:rotate-90 transition-transform" />
            Output
          </summary>
          <pre class="mt-1.5 text-xs text-text-secondary font-mono whitespace-pre-wrap bg-surface-2/50 rounded px-2 py-1.5 max-h-48 overflow-auto">
            {props.output}
          </pre>
        </details>
      </Show>

      {/* Error */}
      <Show when={props.error}>
        <div class="text-xs text-error bg-error/10 rounded px-2 py-1.5">
          <span class="font-semibold">Error: </span>
          {props.error}
        </div>
      </Show>
    </div>
  );
};

/** Edit File Renderer */
const EditContent: Component<{ input: EditInput; success?: boolean }> = (props) => {
  const filename = () => {
    const path = props.input.filePath;
    return path.split("/").pop() || path;
  };

  return (
    <div class="space-y-1.5">
      {/* File path */}
      <div class="flex items-center gap-2 text-sm">
        <FiEdit class="w-4 h-4 text-warning" />
        <span class="font-semibold text-text">{filename()}</span>
        <span class="text-xs text-text-muted truncate">{props.input.filePath}</span>
      </div>

      {/* Inline diff preview */}
      <DiffPreview
        before={props.input.oldString}
        after={props.input.newString}
        contextLines={2}
        maxLines={24}
      />

      <Show when={props.input.replaceAll}>
        <div class="text-xs text-info flex items-center gap-1">
          <FiAlertTriangle class="w-3 h-3" />
          Replace all occurrences
        </div>
      </Show>
    </div>
  );
};

/** Read File Renderer */
const ReadContent: Component<{ input: ReadInput; output?: string }> = (props) => {
  const filename = () => {
    const path = props.input.filePath;
    return path.split("/").pop() || path;
  };

  const lineInfo = () => {
    if (props.input.offset || props.input.limit) {
      const start = (props.input.offset || 0) + 1;
      const end = props.input.limit ? start + props.input.limit - 1 : "end";
      return `Lines ${start}-${end}`;
    }
    return null;
  };

  return (
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 text-sm">
        <FiFileText class="w-4 h-4 text-info" />
        <span class="font-semibold text-text">{filename()}</span>
        <Show when={lineInfo()}>
          <span class="text-xs text-text-muted">({lineInfo()})</span>
        </Show>
      </div>
      
      <Show when={props.output}>
        <details class="group">
          <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
            <FiChevronRight class="w-3 h-3 group-open:rotate-90 transition-transform" />
            File contents
          </summary>
          <pre class="mt-1.5 text-xs text-text-secondary font-mono whitespace-pre-wrap bg-surface-2/50 rounded px-2 py-1.5 max-h-48 overflow-auto">
            {props.output}
          </pre>
        </details>
      </Show>
    </div>
  );
};

/** Write File Renderer */
const WriteContent: Component<{ input: WriteInput }> = (props) => {
  const filename = () => {
    const path = props.input.filePath;
    return path.split("/").pop() || path;
  };

  // Truncate very large file writes for the diff preview to keep UI responsive
  const truncatedContent = () => {
    const content = props.input.content;
    if (content.length > 5000) {
      return content.slice(0, 5000) + `\n... (${content.length - 5000} more chars)`;
    }
    return content;
  };

  return (
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 text-sm">
        <FiFilePlus class="w-4 h-4 text-success" />
        <span class="font-semibold text-text">{filename()}</span>
        <span class="text-xs text-text-muted truncate">{props.input.filePath}</span>
      </div>

      {/* Show as new-file diff (all additions) */}
      <DiffPreview
        before=""
        after={truncatedContent()}
        contextLines={0}
        maxLines={24}
        label={`New file (${props.input.content.length} chars)`}
      />
    </div>
  );
};

/** Glob (Find Files) Renderer */
const GlobContent: Component<{ input: GlobInput; output?: string }> = (props) => {
  const files = createMemo(() => {
    if (!props.output) return [];
    try {
      return JSON.parse(props.output) as string[];
    } catch {
      return props.output.split("\n").filter(Boolean);
    }
  });

  return (
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 text-sm">
        <FiFolder class="w-4 h-4 text-warning" />
        <code class="text-text-secondary font-mono">{props.input.pattern}</code>
        <Show when={props.input.path}>
          <span class="text-xs text-text-muted">in {props.input.path}</span>
        </Show>
      </div>

      <Show when={files().length > 0}>
        <div class="text-xs text-text-muted">
          Found {files().length} file{files().length !== 1 ? "s" : ""}
        </div>
        <details class="group">
          <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
            <FiChevronRight class="w-3 h-3 group-open:rotate-90 transition-transform" />
            View files
          </summary>
          <div class="mt-1.5 text-xs font-mono space-y-0.5 max-h-32 overflow-auto">
            <For each={files().slice(0, 50)}>
              {(file) => (
                <div class="text-text-secondary truncate">{file}</div>
              )}
            </For>
            <Show when={files().length > 50}>
              <div class="text-text-muted">... and {files().length - 50} more</div>
            </Show>
          </div>
        </details>
      </Show>
    </div>
  );
};

/** Grep (Search) Renderer */
const GrepContent: Component<{ input: GrepInput; output?: string }> = (props) => {
  const matches = createMemo(() => {
    if (!props.output) return [];
    return props.output.split("\n").filter(Boolean).slice(0, 20);
  });

  return (
    <div class="space-y-1.5">
      <div class="flex items-center gap-2 text-sm">
        <FiSearch class="w-4 h-4 text-info" />
        <code class="text-text-secondary font-mono bg-surface-2 px-1 rounded">{props.input.pattern}</code>
        <Show when={props.input.include}>
          <span class="text-xs text-text-muted">in {props.input.include}</span>
        </Show>
      </div>

      <Show when={matches().length > 0}>
        <div class="text-xs text-text-muted">
          {matches().length}+ match{matches().length !== 1 ? "es" : ""}
        </div>
        <details class="group" open>
          <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
            <FiChevronDown class="w-3 h-3 group-open:rotate-0 -rotate-90 transition-transform" />
            Results
          </summary>
          <div class="mt-1.5 text-xs font-mono space-y-0.5 max-h-32 overflow-auto">
            <For each={matches()}>
              {(match) => (
                <div class="text-text-secondary truncate">{match}</div>
              )}
            </For>
          </div>
        </details>
      </Show>
    </div>
  );
};

/** Question Renderer - Shows summary of questions being asked */
const QuestionContent: Component<{ input: QuestionInput; status: string; output?: string }> = (props) => {
  const questions = () => props.input.questions || [];
  const isComplete = () => props.status === "success";

  // Parse answers from output if completed
  const answers = (): string[][] => {
    if (!props.output) return [];
    try {
      const parsed = JSON.parse(props.output);
      return parsed.answers || [];
    } catch {
      return [];
    }
  };

  return (
    <div class="space-y-1.5">
      <For each={questions()}>
        {(q, idx) => (
          <div class="space-y-1">
            <div class="text-sm text-text font-semibold">{q.header}</div>
            <div class="text-xs text-text-muted">{q.question}</div>
            
            {/* Show options or selected answer */}
            <Show when={isComplete() && answers()[idx()]?.length > 0}>
              <div class="text-xs text-success flex items-center gap-1">
                <FiCheck class="w-3 h-3" />
                {answers()[idx()].join(", ")}
              </div>
            </Show>
            
            <Show when={!isComplete()}>
              <div class="text-xs text-text-muted italic">
                {q.options.length} option{q.options.length !== 1 ? "s" : ""} available
                {q.multiple ? " (multi-select)" : ""}
              </div>
            </Show>
          </div>
        )}
      </For>
      
      <Show when={!isComplete()}>
        <div class="text-xs text-warning flex items-center gap-1 pt-0.5">
          <FiHelpCircle class="w-3 h-3" />
          Waiting for answer below...
        </div>
      </Show>
    </div>
  );
};

/** 
 * Parse capability-gateway output format.
 * The gateway returns JSON like: {"success":true,"exit_code":0,"stdout":"...","stderr":""}
 * We want to extract just the stdout content for display.
 */
interface GatewayOutput {
  success: boolean;
  exit_code: number;
  stdout: string;
  stderr: string;
}

const parseToolOutput = (output: string): { content: string; error?: string; isWrapped: boolean } => {
  if (!output) return { content: "", isWrapped: false };
  
  try {
    const parsed = JSON.parse(output) as GatewayOutput;
    // Check if this looks like gateway output
    if (typeof parsed === "object" && "stdout" in parsed && "exit_code" in parsed) {
      const content = parsed.stdout || "";
      const error = parsed.stderr || (parsed.exit_code !== 0 ? `Exit code: ${parsed.exit_code}` : undefined);
      return { content, error, isWrapped: true };
    }
  } catch {
    // Not JSON, return as-is
  }
  
  return { content: output, isWrapped: false };
};

/** Generic/Default Renderer */
const GenericContent: Component<{ input: Record<string, unknown>; output?: string; title?: string }> = (props) => {
  // Parse the output to handle gateway format
  const parsedOutput = createMemo(() => parseToolOutput(props.output || ""));

  // Get the command from input if available (for display)
  const command = createMemo(() => {
    const cmd = props.input.command;
    if (typeof cmd === "string") return cmd;
    return null;
  });

  return (
    <div class="space-y-1.5">
      <Show when={props.title}>
        <div class="text-sm text-text">{props.title}</div>
      </Show>
      
      {/* Show command if available */}
      <Show when={command()}>
        <div class="bg-surface-2/50 rounded px-2 py-1.5 font-mono text-xs">
          <span class="text-primary select-none">$ </span>
          <span class="text-text-secondary">{command()}</span>
        </div>
      </Show>

      {/* Show other input values (excluding command) */}
      <Show when={Object.keys(props.input).filter(k => k !== "command").length > 0}>
        <div class="text-xs text-text-muted">
          <For each={Object.entries(props.input).filter(([k]) => k !== "command").slice(0, 3)}>
            {([key, value]) => (
              <div class="truncate">
                <span class="font-semibold">{key}:</span>{" "}
                <span class="text-text-secondary">
                  {typeof value === "string" ? value.slice(0, 100) : JSON.stringify(value).slice(0, 100)}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Output - use parsed content for gateway format */}
      <Show when={parsedOutput().content}>
        <details class="group">
          <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
            <FiChevronRight class="w-3 h-3 group-open:rotate-90 transition-transform" />
            Output
          </summary>
          <pre class="mt-1.5 text-xs text-text-secondary font-mono whitespace-pre-wrap bg-surface-2/50 rounded px-2 py-1.5 max-h-48 overflow-auto">
            {parsedOutput().content}
          </pre>
        </details>
      </Show>

      {/* Show stderr/error if present */}
      <Show when={parsedOutput().error}>
        <div class="text-xs text-error bg-error/10 rounded px-2 py-1.5">
           <span class="font-semibold">Error: </span>
          {parsedOutput().error}
        </div>
      </Show>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ToolCallCard: Component<ToolCallCardProps> = (props) => {
  // Normalize to a common format
  const toolInfo = createMemo(() => {
    const part = props.toolPart;
    const state = part.state;
    
    let status: "running" | "success" | "error" | "pending" = "pending";
    let output: string | undefined;
    let error: string | undefined;
    let duration: number | null = null;
    let title: string | undefined;
    let input: Record<string, unknown> = {};

    if (state?.status === "completed") {
      status = "success";
      output = state.output;
      title = state.title;
      input = state.input;
      duration = state.time.end - state.time.start;
    } else if (state?.status === "error") {
      status = "error";
      error = state.error;
      input = state.input;
      duration = state.time.end - state.time.start;
    } else if (state?.status === "running") {
      status = "running";
      title = state.title;
      input = state.input;
      duration = Date.now() - state.time.start;
    } else if (state?.status === "pending") {
      status = "pending";
      input = state.input;
    }

    return {
      id: part.callID,
      toolName: part.tool,
      status,
      output,
      error,
      duration,
      title,
      input,
      traceId: undefined as string | undefined
    };
  });

  const statusConfig = createMemo(() => {
    const info = toolInfo();
    switch (info.status) {
      case "running":
        return {
          icon: <FiLoader class="w-4 h-4 animate-spin" />,
          color: "border-info/50 bg-info/5",
          label: "Running",
          labelColor: "text-info",
        };
      case "success":
        return {
          icon: <FiCheck class="w-4 h-4" />,
          color: "border-success/50 bg-success/5",
          label: "Success",
          labelColor: "text-success",
        };
      case "pending":
        return {
          icon: <FiClock class="w-4 h-4" />,
          color: "border-border bg-surface-2",
          label: "Pending",
          labelColor: "text-text-muted",
        };
      case "error":
      default:
        return {
          icon: <FiX class="w-4 h-4" />,
          color: "border-error/50 bg-error/5",
          label: "Error",
          labelColor: "text-error",
        };
    }
  });

  // Detect tool category and theme for capability-based theming
  const category = createMemo(() => detectToolCategory(toolInfo().toolName));
  const theme = createMemo(() => toolThemes[category()]);
  const isThemed = createMemo(() => category() !== "builtin");

  const toolIcon = createMemo((): JSX.Element => {
    const name = toolInfo().toolName;
    const cat = category();

    // For non-builtin tools, use the branded category icon
    if (cat !== "builtin") {
      const IconComponent = getCategoryIcon(cat);
      return <IconComponent class={`w-4 h-4 ${theme().iconColor}`} />;
    }

    // Built-in tool icons
    switch (name) {
      case "bash": return <FiTerminal class="w-4 h-4" />;
      case "read": return <FiFileText class="w-4 h-4" />;
      case "write": return <FiFilePlus class="w-4 h-4" />;
      case "edit": return <FiEdit class="w-4 h-4" />;
      case "glob": return <FiFolder class="w-4 h-4" />;
      case "grep": return <FiSearch class="w-4 h-4" />;
      case "webfetch": return <FiGlobe class="w-4 h-4" />;
      case "task": return <FiGitBranch class="w-4 h-4" />;
      case "todowrite": return <FiCheckSquare class="w-4 h-4" />;
      case "todoread": return <FiList class="w-4 h-4" />;
      case "question": return <FiHelpCircle class="w-4 h-4" />;
      case "skill": return <FiBookOpen class="w-4 h-4" />;
      default: return <FiTerminal class="w-4 h-4" />;
    }
  });

  const formatDuration = (ms: number | null): string => {
    if (ms === null) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Watermark icon for themed cards (large faded background SVG)
  const WatermarkIcon = createMemo(() => {
    if (!isThemed()) return null;
    const cat = category();
    if (cat === "generic") return null;
    return getCategoryIcon(cat);
  });

  const categoryLabel = createMemo(() => getCategoryLabel(category()));

  return (
    <div class={`rounded-lg border relative overflow-hidden ${isThemed() ? `${theme().border} ${theme().bg}` : statusConfig().color}`}>
      {/* Watermark - large faded icon for themed capability cards */}
      <Show when={WatermarkIcon()}>
        {(Icon) => (
          <div class="absolute top-1 right-1 pointer-events-none">
            {(() => {
              const IconComp = Icon();
              return <IconComp class={`w-16 h-16 ${theme().watermark}`} />;
            })()}
          </div>
        )}
      </Show>

      {/* Header */}
      <div class={`px-3 py-2 flex items-center gap-2 border-b border-inherit min-w-0 relative ${isThemed() ? theme().headerBg : ''}`}>
        <span class={`shrink-0 ${isThemed() ? theme().iconColor : 'text-text-muted'}`}>{toolIcon()}</span>
        <span class="text-sm font-semibold text-text shrink-0">{getToolDisplayName(toolInfo().toolName)}</span>
        {/* Category badge for themed tools */}
        <Show when={isThemed() && categoryLabel()}>
          <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${theme().badge}`}>
            {categoryLabel()}
          </span>
        </Show>
        <Show when={toolInfo().title && toolInfo().toolName !== "todowrite"}>
          <span class="text-xs text-text-muted truncate min-w-0">- {toolInfo().title}</span>
        </Show>
        <Show when={toolInfo().duration !== null}>
          <span class="flex items-center gap-1 text-xs text-text-muted shrink-0 ml-auto">
            <FiClock class="w-3 h-3" />
            {formatDuration(toolInfo().duration)}
          </span>
        </Show>
        <div class={`flex items-center gap-1 shrink-0 ${statusConfig().labelColor} ${toolInfo().duration === null ? 'ml-auto' : ''}`}>
          {statusConfig().icon}
          <span class="text-xs font-semibold">{statusConfig().label}</span>
        </div>
      </div>

      {/* Tool-specific content */}
      <div class="px-3 py-2 relative">
        <Switch fallback={
          <GenericContent 
            input={toolInfo().input} 
            output={toolInfo().output} 
            title={toolInfo().title} 
          />
        }>
          {/* Todo List */}
          <Match when={toolInfo().toolName === "todowrite" && toolInfo().output}>
            <TodoListContent todos={parseTodoOutput(toolInfo().output!)} />
          </Match>

          {/* Bash Command */}
          <Match when={toolInfo().toolName === "bash" && "command" in toolInfo().input}>
            <BashContent 
              input={toolInfo().input as unknown as BashInput} 
              output={toolInfo().output} 
              error={toolInfo().error}
            />
          </Match>

          {/* Edit File */}
          <Match when={toolInfo().toolName === "edit" && "filePath" in toolInfo().input && "oldString" in toolInfo().input}>
            <EditContent 
              input={toolInfo().input as unknown as EditInput} 
              success={toolInfo().status === "success"}
            />
          </Match>

          {/* Read File */}
          <Match when={toolInfo().toolName === "read" && "filePath" in toolInfo().input}>
            <ReadContent 
              input={toolInfo().input as unknown as ReadInput} 
              output={toolInfo().output}
            />
          </Match>

          {/* Write File */}
          <Match when={toolInfo().toolName === "write" && "filePath" in toolInfo().input && "content" in toolInfo().input}>
            <WriteContent input={toolInfo().input as unknown as WriteInput} />
          </Match>

          {/* Glob */}
          <Match when={toolInfo().toolName === "glob" && "pattern" in toolInfo().input}>
            <GlobContent 
              input={toolInfo().input as unknown as GlobInput} 
              output={toolInfo().output}
            />
          </Match>

          {/* Grep */}
          <Match when={toolInfo().toolName === "grep" && "pattern" in toolInfo().input}>
            <GrepContent 
              input={toolInfo().input as unknown as GrepInput} 
              output={toolInfo().output}
            />
          </Match>

          {/* Question */}
          <Match when={toolInfo().toolName === "question" && "questions" in toolInfo().input}>
            <QuestionContent 
              input={toolInfo().input as unknown as QuestionInput}
              status={toolInfo().status}
              output={toolInfo().output}
            />
          </Match>
        </Switch>
      </div>

      {/* Error display for non-bash tools */}
      <Show when={toolInfo().error && toolInfo().toolName !== "bash"}>
        <div class="px-3 py-2 border-t border-inherit">
          <div class="text-xs text-error bg-error/10 rounded px-2 py-1.5">
            <span class="font-semibold">Error: </span>
            {toolInfo().error}
          </div>
        </div>
      </Show>

      {/* Trace link */}
      <Show when={toolInfo().traceId}>
        <div class="px-3 py-1.5 border-t border-inherit flex items-center justify-end">
          <a
            href={`/traces/${toolInfo().traceId}`}
            class="flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
          >
            <FiExternalLink class="w-3 h-3" />
            View Trace
          </a>
        </div>
      </Show>
    </div>
  );
};

export default ToolCallCard;
