import type { Component, JSX } from "solid-js";
import { Show, For, Switch, Match, createMemo, createSignal } from "solid-js";
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
import {
  detectToolCategory,
  toolThemes,
  getCategoryIcon,
  getCategoryLabel,
} from "../../lib/capability-themes";
import { settingsStore } from "../../stores/settings";

interface ToolCallCardProps {
  /** ACP ToolPart format */
  toolPart: ToolPart;
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
      <div class="bg-surface-2/50 rounded px-2 py-1.5 font-mono text-xs break-all">
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
      <div class="flex items-center gap-2 text-sm min-w-0">
        <FiEdit class="w-4 h-4 text-warning shrink-0" />
        <span class="font-semibold text-text shrink-0">{filename()}</span>
        <span class="text-xs text-text-muted truncate min-w-0">{props.input.filePath}</span>
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
const GenericContent: Component<{ input: Record<string, unknown>; output?: string; title?: string; metadata?: Record<string, unknown> }> = (props) => {
  // Parse the output to handle gateway format
  const parsedOutput = createMemo(() => parseToolOutput(props.output || ""));

  // Get the command from input if available (for display)
  const command = createMemo(() => {
    const cmd = props.input.command;
    if (typeof cmd === "string") return cmd;
    return null;
  });

  // Description from input (like BashContent's description field)
  const description = createMemo(() => {
    const desc = props.input.description;
    if (typeof desc === "string" && desc.trim()) return desc;
    // Also check metadata for a description
    if (props.metadata) {
      const md = props.metadata.description;
      if (typeof md === "string" && md.trim()) return md;
    }
    return null;
  });

  // Working directory from input
  const workdir = createMemo(() => {
    const wd = props.input.workdir;
    if (typeof wd === "string" && wd.trim()) return wd;
    return null;
  });

  // Input fields to show — exclude command, description, workdir, timeout (noise)
  const displayInputs = createMemo(() =>
    Object.entries(props.input)
      .filter(([k]) => !["command", "description", "workdir", "timeout"].includes(k))
      .slice(0, 3)
  );

  // If we have a title (which is already shown in the header), the raw command
  // and input details are implementation noise — collapse them behind a toggle.
  const hasTitle = () => !!props.title;

  return (
    <div class="space-y-1.5">
      {/* Description from input or metadata (like BashContent) */}
      <Show when={description()}>
        <div class="text-xs text-text-muted">{description()}</div>
      </Show>

      {/* Working directory */}
      <Show when={workdir()}>
        <div class="text-xs text-text-muted flex items-center gap-1">
          <FiFolder class="w-3 h-3" />
          {workdir()}
        </div>
      </Show>

      {/* Command + input details: collapsed when title exists, expanded otherwise */}
      <Show when={command() || displayInputs().length > 0}>
        <Show when={hasTitle()} fallback={
          <>
            <Show when={command()}>
              <div class="bg-surface-2/50 rounded px-2 py-1.5 font-mono text-xs break-all">
                <span class="text-primary select-none">$ </span>
                <span class="text-text-secondary">{command()}</span>
              </div>
            </Show>
            <Show when={displayInputs().length > 0}>
              <div class="text-xs text-text-muted">
                <For each={displayInputs()}>
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
          </>
        }>
          {/* When title is present, collapse raw details */}
          <details class="group">
            <summary class="text-xs text-text-muted cursor-pointer hover:text-text-secondary flex items-center gap-1">
              <FiChevronRight class="w-3 h-3 group-open:rotate-90 transition-transform" />
              Details
            </summary>
            <div class="mt-1.5 space-y-1.5">
              <Show when={command()}>
                <div class="bg-surface-2/50 rounded px-2 py-1.5 font-mono text-xs break-all">
                  <span class="text-primary select-none">$ </span>
                  <span class="text-text-secondary">{command()}</span>
                </div>
              </Show>
              <Show when={displayInputs().length > 0}>
                <div class="text-xs text-text-muted">
                  <For each={displayInputs()}>
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
            </div>
          </details>
        </Show>
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
    let metadata: Record<string, unknown> | undefined;

    if (state?.status === "completed") {
      status = "success";
      output = state.output;
      title = state.title;
      input = state.input;
      metadata = state.metadata;
      duration = state.time.end - state.time.start;
    } else if (state?.status === "error") {
      status = "error";
      error = state.error;
      input = state.input;
      metadata = state.metadata;
      duration = state.time.end - state.time.start;
    } else if (state?.status === "running") {
      status = "running";
      title = state.title;
      input = state.input;
      metadata = state.metadata;
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
      metadata,
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

  // Compact mode: only errors stay expanded; everything else collapsed.
  // Normal mode: everything expanded by default.
  const defaultExpanded = () => {
    if (!settingsStore.compactMode()) return true;
    // In compact mode, only errors are expanded
    return toolInfo().status === "error";
  };
  const [expanded, setExpanded] = createSignal(defaultExpanded());

  return (
    <div class={`rounded-lg border relative overflow-hidden ${isThemed() ? `${theme().border} ${theme().bg}` : statusConfig().color}`}>
      {/* Watermark - large faded icon for themed capability cards */}
      <Show when={WatermarkIcon()}>
        {(Icon) => (
          <div class="absolute top-1 right-1 pointer-events-none">
            {(() => {
              const IconComp = Icon();
              return <IconComp class={`w-16 h-16 max-md:w-10 max-md:h-10 ${theme().watermark}`} />;
            })()}
          </div>
        )}
      </Show>

      {/* Header — clickable to toggle expand/collapse for successful tools */}
      <div
        onClick={() => setExpanded((v) => !v)}
        class={`px-3 py-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 relative cursor-pointer select-none ${expanded() ? 'border-b border-inherit' : ''} ${isThemed() ? theme().headerBg : ''}`}
      >
        <span class={`shrink-0 transition-transform ${expanded() ? 'rotate-90' : ''} text-text-muted`}>
          <FiChevronRight class="w-3 h-3" />
        </span>
        <span class={`shrink-0 ${isThemed() ? theme().iconColor : 'text-text-muted'}`}>{toolIcon()}</span>
        <span class="text-sm font-semibold text-text shrink-0">{getToolDisplayName(toolInfo().toolName)}</span>
        {/* Category badge for themed tools */}
        <Show when={isThemed() && categoryLabel()}>
          <span class={`text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0 ${theme().badge}`}>
            {categoryLabel()}
          </span>
        </Show>
        {/* Title — inline on desktop, own line on mobile */}
        <Show when={toolInfo().title && toolInfo().toolName !== "todowrite"}>
          <span class="text-xs text-text-muted truncate min-w-0 max-md:w-full max-md:order-last">· {toolInfo().title}</span>
        </Show>
        {/* Push duration + status to the right */}
        <span class="flex items-center gap-2 ml-auto shrink-0">
          <Show when={toolInfo().duration !== null}>
            <span class="flex items-center gap-1 text-xs text-text-muted">
              <FiClock class="w-3 h-3" />
              {formatDuration(toolInfo().duration)}
            </span>
          </Show>
          <span class={`flex items-center gap-1 ${statusConfig().labelColor}`}>
            {statusConfig().icon}
            <span class="text-xs font-semibold">{statusConfig().label}</span>
          </span>
        </span>
      </div>

      {/* Tool-specific content — collapsed for successful tools */}
      <Show when={expanded()}>
        <div class="px-3 py-2 relative">
          <Switch fallback={
          <GenericContent 
            input={toolInfo().input} 
            output={toolInfo().output} 
            title={toolInfo().title} 
            metadata={toolInfo().metadata}
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
      </Show>{/* end expanded */}
    </div>
  );
};

export default ToolCallCard;
