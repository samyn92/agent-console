import { createSignal, createMemo, Show, For, type Component } from "solid-js";
import {
  FiTerminal, FiCheck, FiX, FiChevronRight,
  FiMessageSquare, FiAlertTriangle, FiClock,
  FiChevronDown, FiCpu,
} from "solid-icons/fi";
import type { StepEvent } from "../../lib/api";

// =============================================================================
// HELPERS
// =============================================================================

const formatDuration = (ms?: number) => {
  if (!ms) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatTimestamp = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

/** Try to pretty-print a JSON string, falling back to raw text */
const formatJsonString = (s?: string) => {
  if (!s) return "";
  try {
    const parsed = JSON.parse(s);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return s;
  }
};

/** Truncate long strings for the collapsed preview */
const truncate = (s: string, max: number) =>
  s.length > max ? s.slice(0, max) + "..." : s;

// =============================================================================
// TOOL CALL EVENT CARD
// =============================================================================

const ToolCallEvent: Component<{ event: StepEvent }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);

  const argsSummary = createMemo(() => {
    if (!props.event.toolArgs) return "";
    try {
      const parsed = JSON.parse(props.event.toolArgs);
      // Show a one-line summary of the args: pick the most informative keys
      const keys = Object.keys(parsed);
      if (keys.length === 0) return "";
      // For bash: show command; for edit: show filePath; otherwise first key
      const priorityKeys = ["command", "filePath", "pattern", "url", "prompt"];
      const bestKey = priorityKeys.find(k => k in parsed) || keys[0];
      const val = parsed[bestKey];
      const valStr = typeof val === "string" ? val : JSON.stringify(val);
      return truncate(valStr, 80);
    } catch {
      return truncate(props.event.toolArgs, 80);
    }
  });

  return (
    <div class="rounded-md border border-border bg-surface overflow-hidden">
      {/* Header — clickable */}
      <button
        onClick={() => setExpanded(!expanded())}
        class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-hover/40 transition-colors"
      >
        <span class={`shrink-0 transition-transform text-text-muted ${expanded() ? "rotate-90" : ""}`}>
          <FiChevronRight class="w-3 h-3" />
        </span>
        <FiTerminal class="w-3.5 h-3.5 text-accent shrink-0" />
        <span class="text-xs font-semibold text-text shrink-0">{props.event.toolName || "tool"}</span>
        <Show when={argsSummary()}>
          <span class="text-[11px] text-text-muted font-mono truncate min-w-0">
            {argsSummary()}
          </span>
        </Show>
        <span class="flex items-center gap-2 ml-auto shrink-0">
          <Show when={props.event.duration}>
            <span class="text-[10px] text-text-muted tabular-nums flex items-center gap-0.5">
              <FiClock class="w-2.5 h-2.5" />
              {formatDuration(props.event.duration)}
            </span>
          </Show>
          <FiCheck class="w-3 h-3 text-success" />
        </span>
      </button>

      {/* Expanded body */}
      <Show when={expanded()}>
        <div class="border-t border-border/60 px-2.5 py-2 space-y-2">
          {/* Timestamp */}
          <div class="text-[10px] text-text-muted">
            {formatTimestamp(props.event.ts)}
          </div>

          {/* Args */}
          <Show when={props.event.toolArgs}>
            <div>
              <p class="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Arguments</p>
              <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded px-2 py-1.5 max-h-40 overflow-auto border border-border">
                {formatJsonString(props.event.toolArgs)}
              </pre>
            </div>
          </Show>

          {/* Result */}
          <Show when={props.event.toolResult}>
            <div>
              <p class="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1">Result</p>
              <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap bg-surface-2 rounded px-2 py-1.5 max-h-40 overflow-auto border border-border">
                {formatJsonString(props.event.toolResult)}
              </pre>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// =============================================================================
// MESSAGE EVENT CARD
// =============================================================================

const MessageEvent: Component<{ event: StepEvent }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const preview = createMemo(() => truncate(props.event.content || "", 120));

  return (
    <div class="rounded-md border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded())}
        class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-hover/40 transition-colors"
      >
        <span class={`shrink-0 transition-transform text-text-muted ${expanded() ? "rotate-90" : ""}`}>
          <FiChevronRight class="w-3 h-3" />
        </span>
        <FiMessageSquare class="w-3.5 h-3.5 text-text-muted shrink-0" />
        <span class="text-xs font-medium text-text shrink-0">Message</span>
        <span class="text-[11px] text-text-muted truncate min-w-0">{preview()}</span>
        <span class="text-[10px] text-text-muted ml-auto shrink-0 tabular-nums">
          {formatTimestamp(props.event.ts)}
        </span>
      </button>

      <Show when={expanded()}>
        <div class="border-t border-border/60 px-2.5 py-2">
          <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed max-h-60 overflow-auto">
            {props.event.content}
          </pre>
        </div>
      </Show>
    </div>
  );
};

// =============================================================================
// ERROR EVENT CARD
// =============================================================================

const ErrorEvent: Component<{ event: StepEvent }> = (props) => (
  <div class="rounded-md border border-red-400/30 bg-red-400/[0.05] px-2.5 py-1.5 flex items-start gap-2">
    <FiAlertTriangle class="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
    <div class="min-w-0">
      <p class="text-[11px] font-mono text-red-400 leading-relaxed break-words">{props.event.content}</p>
      <p class="text-[10px] text-text-muted mt-0.5 tabular-nums">{formatTimestamp(props.event.ts)}</p>
    </div>
  </div>
);

// =============================================================================
// THINKING EVENT CARD
// =============================================================================

const ThinkingEvent: Component<{ event: StepEvent }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const preview = createMemo(() => truncate(props.event.content || "", 100));

  return (
    <div class="rounded-md border border-border/60 bg-surface-2/30 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded())}
        class="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-surface-hover/40 transition-colors"
      >
        <span class={`shrink-0 transition-transform text-text-muted ${expanded() ? "rotate-90" : ""}`}>
          <FiChevronRight class="w-3 h-3" />
        </span>
        <FiCpu class="w-3.5 h-3.5 text-text-muted shrink-0" />
        <span class="text-xs font-medium text-text-muted shrink-0 italic">Thinking</span>
        <span class="text-[11px] text-text-muted truncate min-w-0 italic">{preview()}</span>
      </button>

      <Show when={expanded()}>
        <div class="border-t border-border/40 px-2.5 py-2">
          <pre class="text-[11px] text-text-muted font-mono whitespace-pre-wrap leading-relaxed max-h-40 overflow-auto italic">
            {props.event.content}
          </pre>
        </div>
      </Show>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface StepEventTraceProps {
  events: StepEvent[];
}

const StepEventTrace: Component<StepEventTraceProps> = (props) => {
  const [collapsed, setCollapsed] = createSignal(false);

  const toolCallCount = createMemo(() =>
    props.events.filter(e => e.type === "tool_call").length
  );
  const errorCount = createMemo(() =>
    props.events.filter(e => e.type === "error").length
  );
  const totalDuration = createMemo(() =>
    props.events.reduce((acc, e) => acc + (e.duration || 0), 0)
  );

  return (
    <div class="space-y-1.5">
      {/* Section header */}
      <button
        onClick={() => setCollapsed(!collapsed())}
        class="flex items-center gap-2 w-full text-left"
      >
        <FiChevronDown
          class={`w-3 h-3 text-text-muted transition-transform duration-200 ${collapsed() ? "-rotate-90" : ""}`}
        />
        <p class="text-[10px] text-text-muted uppercase tracking-wider font-semibold">
          Trace Events
        </p>
        <div class="flex items-center gap-2 text-[10px] text-text-muted">
          <Show when={toolCallCount() > 0}>
            <span class="flex items-center gap-0.5">
              <FiTerminal class="w-2.5 h-2.5" />
              {toolCallCount()}
            </span>
          </Show>
          <Show when={errorCount() > 0}>
            <span class="flex items-center gap-0.5 text-red-400">
              <FiX class="w-2.5 h-2.5" />
              {errorCount()}
            </span>
          </Show>
          <Show when={totalDuration() > 0}>
            <span class="tabular-nums">{formatDuration(totalDuration())}</span>
          </Show>
        </div>
      </button>

      {/* Event list */}
      <Show when={!collapsed()}>
        <div class="space-y-1">
          <For each={props.events}>
            {(event) => {
              switch (event.type) {
                case "tool_call":
                  return <ToolCallEvent event={event} />;
                case "message":
                  return <MessageEvent event={event} />;
                case "error":
                  return <ErrorEvent event={event} />;
                case "thinking":
                  return <ThinkingEvent event={event} />;
                default:
                  return null;
              }
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default StepEventTrace;
