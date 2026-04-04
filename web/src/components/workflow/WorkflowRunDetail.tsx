import { createSignal, createMemo, Show, For, type Component } from "solid-js";
import {
  FiClock, FiCheck, FiX, FiChevronDown,
  FiZap, FiGitBranch, FiAlertTriangle, FiTerminal,
  FiLoader, FiActivity, FiCpu, FiExternalLink, FiHash,
  FiBox, FiTag
} from "solid-icons/fi";
import type { WorkflowRunResponse, WorkflowResponse } from "../../lib/api";
import StepEventTrace from "./StepEventTrace";

// =============================================================================
// STATUS CONFIG
// =============================================================================

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: any; label: string }> = {
  Succeeded: { color: "text-success", bg: "bg-success/10", border: "border-success/30", icon: FiCheck, label: "Succeeded" },
  Running:   { color: "text-accent", bg: "bg-accent/10", border: "border-accent/30", icon: FiLoader, label: "Running" },
  Pending:   { color: "text-text-muted", bg: "bg-surface-2", border: "border-border", icon: FiClock, label: "Pending" },
  Failed:    { color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/30", icon: FiX, label: "Failed" },
  Skipped:   { color: "text-text-muted", bg: "bg-surface-2", border: "border-border", icon: FiX, label: "Skipped" },
};

const getStatusConfig = (phase: string) => statusConfig[phase] || statusConfig["Pending"];

// =============================================================================
// HELPERS
// =============================================================================

const formatDuration = (start?: string, end?: string) => {
  if (!start) return "--";
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.max(0, e - s);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSec}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

const formatTimestamp = (ts?: string) => {
  if (!ts) return "--";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatRelativeTime = (ts?: string) => {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
};

// =============================================================================
// TRIGGER DATA PARSER
// =============================================================================

interface ParsedTrigger {
  type: "gitlab" | "github" | "webhook" | "schedule" | "unknown";
  event?: string;
  title?: string;
  description?: string;
  url?: string;
  project?: string;
  projectUrl?: string;
  author?: string;
  labels?: string[];
  action?: string;
  iid?: number;
}

function parseTriggerData(raw?: string): ParsedTrigger | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const triggerType = data.type || "unknown";
    const payload = data.payload || {};

    if (triggerType === "gitlab") {
      const attrs = payload.object_attributes || {};
      const project = payload.project || {};
      const labels = (attrs.labels || payload.labels || []).map((l: any) => l.title || l);
      return {
        type: "gitlab",
        event: payload.object_kind || data.event,
        title: attrs.title,
        description: attrs.description,
        url: attrs.url,
        project: project.path_with_namespace,
        projectUrl: project.web_url,
        author: payload.user?.name || payload.user?.username,
        labels,
        action: attrs.action,
        iid: attrs.iid,
      };
    }

    if (triggerType === "github") {
      const action = payload.action;
      const issue = payload.issue || payload.pull_request || {};
      const repo = payload.repository || {};
      return {
        type: "github",
        event: data.event,
        title: issue.title,
        description: issue.body,
        url: issue.html_url,
        project: repo.full_name,
        projectUrl: repo.html_url,
        author: payload.sender?.login,
        labels: (issue.labels || []).map((l: any) => l.name || l),
        action,
        iid: issue.number,
      };
    }

    return { type: triggerType };
  } catch {
    return null;
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Status badge with icon */
const StatusBadge: Component<{ phase: string; size?: "sm" | "md" }> = (props) => {
  const sc = () => getStatusConfig(props.phase);
  const isRunning = () => props.phase === "Running";
  const sizeClass = () => props.size === "md"
    ? "px-2.5 py-1 text-xs gap-1.5"
    : "px-1.5 py-0.5 text-[10px] gap-1";
  const iconSize = () => props.size === "md" ? "w-3.5 h-3.5" : "w-2.5 h-2.5";

  return (
    <span class={`inline-flex items-center font-medium rounded-md border ${sc().bg} ${sc().border} ${sc().color} ${sizeClass()}`}>
      {(() => {
        const Icon = sc().icon;
        return <Icon class={`${iconSize()} ${isRunning() ? "animate-spin" : ""}`} />;
      })()}
      {sc().label}
    </span>
  );
};

/** Metric pill (tool calls, tokens, duration, etc.) */
const MetricPill: Component<{ icon: any; label: string; value: string | number }> = (props) => (
  <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-2 border border-border text-[11px]">
    <props.icon class="w-3 h-3 text-text-muted" />
    <span class="text-text-muted">{props.label}</span>
    <span class="text-text font-medium tabular-nums">{props.value}</span>
  </div>
);

/** Trigger info card */
const TriggerCard: Component<{ trigger: ParsedTrigger }> = (props) => {
  const t = () => props.trigger;
  const providerIcon = () => t().type === "gitlab" ? FiGitBranch : FiGitBranch;

  return (
    <div class="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Trigger header */}
      <div class="flex items-center gap-2 px-3 py-2 bg-surface-2/50 border-b border-border">
        {(() => {
          const Icon = providerIcon();
          return <Icon class="w-3.5 h-3.5 text-text-muted" />;
        })()}
        <span class="text-[11px] font-medium text-text-secondary uppercase tracking-wider">
          {t().type === "gitlab" ? "GitLab" : t().type === "github" ? "GitHub" : "Webhook"} Trigger
        </span>
        <Show when={t().event}>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-accent/10 text-accent font-mono">
            {t().event}{t().action ? `:${t().action}` : ""}
          </span>
        </Show>
      </div>

      {/* Trigger body */}
      <div class="px-3 py-2.5 space-y-2">
        <Show when={t().title}>
          <div class="flex items-start gap-2">
            <Show when={t().iid}>
              <span class="text-xs font-mono text-text-muted shrink-0">#{t().iid}</span>
            </Show>
            <div class="min-w-0">
              <p class="text-sm font-medium text-text leading-snug">{t().title}</p>
              <Show when={t().description}>
                <p class="text-xs text-text-muted mt-1 line-clamp-2 leading-relaxed">{t().description}</p>
              </Show>
            </div>
          </div>
        </Show>

        <div class="flex flex-wrap items-center gap-2 text-[11px]">
          <Show when={t().project}>
            <a
              href={t().projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-text-secondary hover:text-accent transition-colors"
            >
              <FiBox class="w-3 h-3" />
              {t().project}
              <FiExternalLink class="w-2.5 h-2.5 opacity-50" />
            </a>
          </Show>
          <Show when={t().author}>
            <span class="inline-flex items-center gap-1 text-text-muted">
              <FiCpu class="w-3 h-3" />
              {t().author}
            </span>
          </Show>
          <Show when={t().url}>
            <a
              href={t().url}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-accent/80 hover:text-accent transition-colors"
            >
              View source
              <FiExternalLink class="w-2.5 h-2.5" />
            </a>
          </Show>
        </div>

        <Show when={t().labels && t().labels!.length > 0}>
          <div class="flex flex-wrap gap-1">
            <For each={t().labels}>
              {(label) => (
                <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent/8 text-accent border border-accent/15">
                  <FiTag class="w-2.5 h-2.5" />
                  {label}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

// =============================================================================
// STEP DETAIL CARD
// =============================================================================

const StepCard: Component<{
  step: NonNullable<WorkflowRunResponse["status"]["steps"]>[number];
  stepSpec?: WorkflowResponse["spec"]["steps"][number];
  index: number;
  isLast: boolean;
  isActive: boolean;
}> = (props) => {
  const [expanded, setExpanded] = createSignal(
    props.step.phase === "Failed" || props.isActive
  );

  const sc = () => getStatusConfig(props.step.phase);

  // Node circle color
  const nodeClasses = () => {
    switch (props.step.phase) {
      case "Running": return "bg-accent/20 border-accent shadow-[0_0_8px_rgba(59,130,246,0.3)]";
      case "Succeeded": return "bg-success/20 border-success";
      case "Failed": return "bg-red-400/20 border-red-400";
      default: return "bg-surface-2 border-border";
    }
  };

  return (
    <div class={`relative pl-10 ${props.isLast ? "" : "pb-5"}`}>
      {/* Vertical connector line */}
      <Show when={!props.isLast}>
        <div class={`absolute left-[15px] top-8 bottom-0 w-px ${
          props.step.phase === "Succeeded" ? "bg-success/30" :
          props.step.phase === "Failed" ? "bg-red-400/30" :
          props.step.phase === "Running" ? "bg-accent/30" :
          "bg-border"
        }`} />
      </Show>

      {/* Node dot */}
      <div class={`absolute left-1 top-1.5 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${nodeClasses()}`}>
        {(() => {
          const Icon = sc().icon;
          return <Icon class={`w-3 h-3 ${sc().color} ${props.step.phase === "Running" ? "animate-spin" : ""}`} />;
        })()}
      </div>

      {/* Step card */}
      <div class={`rounded-lg border overflow-hidden transition-colors ${
        props.step.phase === "Failed" ? "border-red-400/25 bg-red-400/[0.03]" :
        props.step.phase === "Running" ? "border-accent/25 bg-accent/[0.03]" :
        "border-border bg-surface"
      }`}>
        {/* Step header */}
        <button
          onClick={() => setExpanded(!expanded())}
          class="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-surface-hover/40 transition-colors"
        >
          {/* Step name + badge */}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-semibold text-text">{props.step.name}</span>
              <StatusBadge phase={props.step.phase} />
            </div>
            <div class="flex items-center gap-2 mt-0.5">
              <Show when={props.stepSpec?.agent}>
                <span class="text-[11px] text-text-muted">
                  Agent: <span class="text-text-secondary">{props.stepSpec!.agent}</span>
                </span>
              </Show>
              <Show when={props.stepSpec?.piAgent}>
                <span class="text-[11px] text-text-muted">
                  PiAgent: <span class="text-text-secondary">{props.stepSpec!.piAgent}</span>
                </span>
              </Show>
            </div>
          </div>

          {/* Metrics inline */}
          <div class="flex items-center gap-3 shrink-0">
            <Show when={props.step.toolCalls}>
              <span class="text-[10px] text-text-muted tabular-nums flex items-center gap-1">
                <FiTerminal class="w-2.5 h-2.5" />
                {props.step.toolCalls} calls
              </span>
            </Show>
            <Show when={props.step.startTime}>
              <span class="text-[11px] text-text-muted tabular-nums font-mono">
                {formatDuration(props.step.startTime, props.step.endTime)}
              </span>
            </Show>
            <FiChevronDown
              class={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 ${expanded() ? "" : "-rotate-90"}`}
            />
          </div>
        </button>

        {/* Expanded content */}
        <Show when={expanded()}>
          <div class="border-t border-border/60">
            {/* Error banner */}
            <Show when={props.step.error}>
              <div class="px-3.5 py-2 bg-red-400/[0.06] border-b border-red-400/15 flex items-start gap-2">
                <FiAlertTriangle class="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <p class="text-xs text-red-400 font-mono leading-relaxed">{props.step.error}</p>
              </div>
            </Show>

            {/* Metrics row */}
            <div class="px-3.5 py-2.5 flex flex-wrap gap-2 border-b border-border/40">
              <Show when={props.step.startTime}>
                <MetricPill icon={FiClock} label="Duration" value={formatDuration(props.step.startTime, props.step.endTime)} />
              </Show>
              <Show when={props.step.toolCalls}>
                <MetricPill icon={FiTerminal} label="Tool Calls" value={props.step.toolCalls!} />
              </Show>
              <Show when={props.step.tokensUsed}>
                <MetricPill icon={FiCpu} label="Tokens" value={props.step.tokensUsed!.toLocaleString()} />
              </Show>
              <Show when={props.step.jobName}>
                <MetricPill icon={FiBox} label="Job" value={props.step.jobName!} />
              </Show>
              <Show when={props.step.sessionID}>
                <MetricPill icon={FiHash} label="Session" value={props.step.sessionID!.slice(0, 12) + "..."} />
              </Show>
            </div>

            {/* Prompt */}
            <Show when={props.stepSpec?.prompt}>
              <div class="px-3.5 py-2.5 border-b border-border/40">
                <p class="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1.5">Prompt Template</p>
                <div class="bg-surface-2 rounded-md border border-border px-3 py-2 max-h-28 overflow-y-auto">
                  <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">{props.stepSpec!.prompt}</pre>
                </div>
              </div>
            </Show>

            {/* Trace Events */}
            <Show when={props.step.events && props.step.events!.length > 0}>
              <div class="px-3.5 py-2.5 border-b border-border/40">
                <StepEventTrace events={props.step.events!} />
              </div>
            </Show>

            {/* Output */}
            <Show when={props.step.output}>
              <div class="px-3.5 py-2.5">
                <p class="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-1.5">Output</p>
                <div class="bg-background rounded-md border border-border px-3 py-2 max-h-80 overflow-y-auto">
                  <pre class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">{props.step.output}</pre>
                </div>
              </div>
            </Show>

            {/* Timing */}
            <Show when={props.step.startTime}>
              <div class="px-3.5 py-2 bg-surface-2/30 flex items-center gap-4 text-[10px] text-text-muted border-t border-border/40">
                <span>
                  Started: <span class="text-text-secondary tabular-nums">{formatTimestamp(props.step.startTime)}</span>
                </span>
                <Show when={props.step.endTime}>
                  <span>
                    Finished: <span class="text-text-secondary tabular-nums">{formatTimestamp(props.step.endTime)}</span>
                  </span>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface WorkflowRunDetailProps {
  run: WorkflowRunResponse;
  workflow?: WorkflowResponse;
}

const WorkflowRunDetail: Component<WorkflowRunDetailProps> = (props) => {
  const steps = () => props.run.status.steps || [];
  const trigger = createMemo(() => parseTriggerData(props.run.spec.triggerData));
  const sc = () => getStatusConfig(props.run.status.phase);

  const totalToolCalls = createMemo(() =>
    steps().reduce((acc, s) => acc + (s.toolCalls || 0), 0)
  );
  const totalTokens = createMemo(() =>
    steps().reduce((acc, s) => acc + (s.tokensUsed || 0), 0)
  );

  const getStepSpec = (stepName: string) =>
    props.workflow?.spec.steps.find(s => s.name === stepName);

  // Step progress bar segments
  const progressSegments = createMemo(() =>
    steps().map(s => ({
      phase: s.phase,
      name: s.name,
    }))
  );

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* ===== HEADER ===== */}
      <div class="shrink-0 border-b border-border">
        {/* Top bar: name + status */}
        <div class="px-5 pt-4 pb-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <FiZap class={`w-4 h-4 ${sc().color}`} />
                </div>
                <div>
                  <h1 class="text-base font-semibold text-text truncate">{props.run.metadata.name}</h1>
                  <div class="flex items-center gap-1.5 text-[11px] text-text-muted">
                    <span>{props.run.spec.workflowRef}</span>
                    <span class="text-border-hover">·</span>
                    <span>{formatRelativeTime(props.run.status.startTime || props.run.metadata.creationTimestamp)}</span>
                  </div>
                </div>
              </div>
            </div>
            <StatusBadge phase={props.run.status.phase} size="md" />
          </div>

          {/* Progress bar */}
          <Show when={progressSegments().length > 0}>
            <div class="flex gap-1 mt-3">
              <For each={progressSegments()}>
                {(seg) => (
                  <div
                    class={`h-1 rounded-full flex-1 transition-colors ${
                      seg.phase === "Succeeded" ? "bg-success" :
                      seg.phase === "Failed" ? "bg-red-400" :
                      seg.phase === "Running" ? "bg-accent animate-pulse" :
                      "bg-border"
                    }`}
                    title={`${seg.name}: ${seg.phase}`}
                  />
                )}
              </For>
            </div>
          </Show>
        </div>

        {/* Summary metrics bar */}
        <div class="px-5 py-2 bg-surface-2/40 border-t border-border/50 flex flex-wrap items-center gap-4 text-[11px]">
          <Show when={props.run.status.startTime}>
            <div class="flex items-center gap-1.5 text-text-muted">
              <FiClock class="w-3 h-3" />
              <span class="font-medium text-text-secondary">{formatDuration(props.run.status.startTime, props.run.status.endTime)}</span>
            </div>
          </Show>
          <div class="flex items-center gap-1.5 text-text-muted">
            <FiActivity class="w-3 h-3" />
            <span>{steps().length} step{steps().length !== 1 ? "s" : ""}</span>
            <Show when={steps().filter(s => s.phase === "Succeeded").length > 0}>
              <span class="text-success">{steps().filter(s => s.phase === "Succeeded").length} passed</span>
            </Show>
            <Show when={steps().filter(s => s.phase === "Failed").length > 0}>
              <span class="text-red-400">{steps().filter(s => s.phase === "Failed").length} failed</span>
            </Show>
          </div>
          <Show when={totalToolCalls() > 0}>
            <div class="flex items-center gap-1.5 text-text-muted">
              <FiTerminal class="w-3 h-3" />
              <span>{totalToolCalls()} tool calls</span>
            </div>
          </Show>
          <Show when={totalTokens() > 0}>
            <div class="flex items-center gap-1.5 text-text-muted">
              <FiCpu class="w-3 h-3" />
              <span>{totalTokens().toLocaleString()} tokens</span>
            </div>
          </Show>
          <Show when={props.run.metadata.labels?.["agents.io/trigger"]}>
            <div class="flex items-center gap-1.5 text-text-muted">
              <FiTag class="w-3 h-3" />
              <span>{props.run.metadata.labels!["agents.io/trigger"]}</span>
            </div>
          </Show>
        </div>
      </div>

      {/* ===== SCROLLABLE CONTENT ===== */}
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-3xl mx-auto px-5 py-5 space-y-5">

          {/* Error banner */}
          <Show when={props.run.status.error}>
            <div class="rounded-lg border border-red-400/25 bg-red-400/[0.05] px-4 py-3 flex items-start gap-2.5">
              <FiAlertTriangle class="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p class="text-xs font-semibold text-red-400 mb-0.5">Run Failed</p>
                <p class="text-xs text-red-300/80 font-mono leading-relaxed">{props.run.status.error}</p>
              </div>
            </div>
          </Show>

          {/* Trigger info */}
          <Show when={trigger()}>
            <TriggerCard trigger={trigger()!} />
          </Show>

          {/* Step Pipeline */}
          <Show
            when={steps().length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-12 text-text-muted">
                <FiActivity class="w-8 h-8 mb-3 opacity-20" />
                <p class="text-sm">No step data available yet</p>
                <p class="text-xs mt-1 text-text-muted/60">Steps will appear here once the run progresses</p>
              </div>
            }
          >
            <div>
              <div class="flex items-center gap-2 mb-3">
                <FiActivity class="w-3.5 h-3.5 text-text-muted" />
                <h2 class="text-xs font-semibold text-text-muted uppercase tracking-wider">Pipeline Steps</h2>
              </div>

              <div class="relative">
                <For each={steps()}>
                  {(step, index) => (
                    <StepCard
                      step={step}
                      stepSpec={getStepSpec(step.name)}
                      index={index()}
                      isLast={index() === steps().length - 1}
                      isActive={index() === (props.run.status.currentStep || 0) && props.run.status.phase === "Running"}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Timing footer */}
          <Show when={props.run.status.startTime}>
            <div class="rounded-lg border border-border bg-surface-2/30 px-4 py-3">
              <div class="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span class="text-text-muted block mb-0.5">Started</span>
                  <span class="text-text-secondary font-mono tabular-nums">{formatTimestamp(props.run.status.startTime)}</span>
                </div>
                <Show when={props.run.status.endTime}>
                  <div>
                    <span class="text-text-muted block mb-0.5">Completed</span>
                    <span class="text-text-secondary font-mono tabular-nums">{formatTimestamp(props.run.status.endTime)}</span>
                  </div>
                </Show>
                <div>
                  <span class="text-text-muted block mb-0.5">Run Name</span>
                  <span class="text-text-secondary font-mono">{props.run.metadata.name}</span>
                </div>
                <div>
                  <span class="text-text-muted block mb-0.5">Namespace</span>
                  <span class="text-text-secondary font-mono">{props.run.metadata.namespace}</span>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
};

export default WorkflowRunDetail;
