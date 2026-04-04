import { createSignal, createResource, Show, For, type Component } from "solid-js";
import {
  FiClock, FiCheck, FiX, FiChevronRight,
  FiZap, FiCalendar, FiGlobe, FiGithub, FiRefreshCw,
  FiLoader, FiActivity
} from "solid-icons/fi";
import { listWorkflows, listWorkflowRuns, type WorkflowResponse, type WorkflowRunResponse } from "../../lib/api";

// =============================================================================
// STATUS HELPERS
// =============================================================================

const statusConfig: Record<string, { color: string; bg: string; border: string; icon: any }> = {
  Succeeded: { color: "text-success", bg: "bg-success/10", border: "border-success/20", icon: FiCheck },
  Running: { color: "text-accent", bg: "bg-accent/10", border: "border-accent/20", icon: FiLoader },
  Pending: { color: "text-text-muted", bg: "bg-surface-2", border: "border-border", icon: FiClock },
  Failed: { color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/20", icon: FiX },
  Skipped: { color: "text-text-muted", bg: "bg-surface-2", border: "border-border", icon: FiX },
};

const getStatusConfig = (phase: string) =>
  statusConfig[phase] || statusConfig["Pending"];

const triggerIcon = (wf: WorkflowResponse) => {
  if (wf.spec.trigger.schedule) return FiCalendar;
  if (wf.spec.trigger.webhook) return FiGlobe;
  if (wf.spec.trigger.github) return FiGithub;
  return FiZap;
};

const triggerLabel = (wf: WorkflowResponse) => {
  if (wf.spec.trigger.schedule) return wf.spec.trigger.schedule.cron;
  if (wf.spec.trigger.webhook) return "Webhook";
  if (wf.spec.trigger.github) {
    const events = wf.spec.trigger.github.events || [];
    return events.length > 0 ? events.join(", ") : "GitHub";
  }
  return "Manual";
};

const formatDuration = (start?: string, end?: string) => {
  if (!start) return "";
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
// WORKFLOW LIST PANEL (sidebar browser — always visible, never switches to trace)
// =============================================================================

interface WorkflowPanelProps {
  namespace?: string;
  /** Called when a run row is clicked — MainApp renders the detail in center panel */
  onSelectRun?: (run: WorkflowRunResponse, workflow: WorkflowResponse) => void;
  /** Called when the selection is cleared */
  onDeselectRun?: () => void;
}

const WorkflowPanel: Component<WorkflowPanelProps> = (props) => {
  // Track which run is "active" (highlighted) in the sidebar
  const [selectedRunName, setSelectedRunName] = createSignal<string | null>(null);
  // Track collapsed workflows — all expanded by default
  const [collapsedWorkflows, setCollapsedWorkflows] = createSignal<Set<string>>(new Set());

  // Data
  const [workflows, { refetch: refetchWorkflows }] = createResource(
    () => props.namespace,
    (ns) => listWorkflows(ns)
  );
  const [runs, { refetch: refetchRuns }] = createResource(
    () => props.namespace,
    (ns) => listWorkflowRuns(ns)
  );

  // Get runs for a specific workflow, sorted newest first
  const runsForWorkflow = (workflowName: string) =>
    (runs() || []).filter(r => r.spec.workflowRef === workflowName)
      .sort((a, b) => {
        const aTime = a.status.startTime || a.metadata.creationTimestamp;
        const bTime = b.status.startTime || b.metadata.creationTimestamp;
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });

  const handleRefresh = () => {
    refetchWorkflows();
    refetchRuns();
  };

  const selectRun = (run: WorkflowRunResponse, workflow: WorkflowResponse) => {
    setSelectedRunName(run.metadata.name);
    props.onSelectRun?.(run, workflow);
  };

  return (
    <div class="flex flex-col h-full">
      {/* Header — matches chat header pattern */}
      <div class="flex items-center justify-between px-4 pt-3 pb-2">
        <span class="text-[11px] font-semibold uppercase tracking-widest text-text-muted/70">Workflows</span>
        <div class="flex items-center gap-0.5">
          <button
            onClick={handleRefresh}
            class="p-1.5 text-text-muted/60 hover:text-text hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
            title="Refresh workflows"
            aria-label="Refresh workflow list"
          >
            <FiRefreshCw class={`w-3.5 h-3.5 ${workflows.loading || runs.loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Loading */}
      <Show when={workflows.loading}>
        <div class="flex items-center justify-center py-4">
          <div class="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-text-muted rounded-full animate-spin" />
          <span class="ml-2 text-xs text-text-muted">Loading...</span>
        </div>
      </Show>

      {/* Workflow list */}
      <Show when={!workflows.loading}>
        <div class="px-2 pb-2" role="list" aria-label="Workflows">
          <Show
            when={workflows() && workflows()!.length > 0}
            fallback={
              <div class="flex flex-col items-center justify-center py-8 text-text-muted">
                <FiZap class="w-6 h-6 mb-2 opacity-30" />
                <p class="text-xs">No workflows found</p>
                <p class="text-[10px] mt-0.5 text-text-muted/60">Workflows will appear here when created</p>
              </div>
            }
          >
            <For each={workflows()}>
              {(workflow) => {
                const wfRuns = () => runsForWorkflow(workflow.metadata.name);
                const isExpanded = () => !collapsedWorkflows().has(workflow.metadata.name);
                const TriggerIcon = triggerIcon(workflow);
                const lastStatus = () => {
                  const last = wfRuns()[0];
                  return last ? last.status.phase : null;
                };

                return (
                  <>
                    {/* Workflow group header — matches chat time-group separator */}
                    <div class="px-2 pt-3 pb-1.5 first:pt-1" role="presentation">
                      <button
                        onClick={() => {
                          const next = new Set(collapsedWorkflows());
                          if (next.has(workflow.metadata.name)) {
                            next.delete(workflow.metadata.name);
                          } else {
                            next.add(workflow.metadata.name);
                          }
                          setCollapsedWorkflows(next);
                        }}
                        class="w-full flex items-center gap-2 cursor-pointer group"
                      >
                        <div class="flex items-center gap-1.5 shrink-0">
                          <FiZap class={`w-2.5 h-2.5 ${isExpanded() ? "text-accent" : "text-text-muted/50"}`} />
                          <span class="text-[10px] font-bold uppercase tracking-widest text-text-muted/50 group-hover:text-text-muted transition-colors">
                            {workflow.metadata.name}
                          </span>
                          <Show when={lastStatus()}>
                            <span class={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              lastStatus() === "Succeeded" ? "bg-success" :
                              lastStatus() === "Failed" ? "bg-red-400" :
                              lastStatus() === "Running" ? "bg-accent animate-pulse" :
                              "bg-text-muted/40"
                            }`} />
                          </Show>
                        </div>
                        <div class="flex-1 h-px bg-border/40" />
                        <div class="flex items-center gap-1 shrink-0">
                          <span class="text-[10px] text-text-muted/40 tabular-nums">
                            {wfRuns().length}
                          </span>
                          <FiChevronRight
                            class={`w-2.5 h-2.5 text-text-muted/40 transition-transform duration-150 ${isExpanded() ? "rotate-90" : ""}`}
                          />
                        </div>
                      </button>
                    </div>

                    {/* Expanded: trigger info + run rows */}
                    <Show when={isExpanded()}>
                      {/* Trigger info line */}
                      <div class="px-4 pb-1.5">
                        <div class="flex items-center gap-1.5 text-[10px] text-text-muted/60">
                          <TriggerIcon class="w-2.5 h-2.5" />
                          <span>{triggerLabel(workflow)}</span>
                          <span class="text-border-hover">·</span>
                          <span>{(workflow.spec.steps || []).length} steps: {(workflow.spec.steps || []).map(s => s.name).join(" \u2192 ")}</span>
                        </div>
                      </div>

                      {/* Run rows — matches chat session rows */}
                      <Show
                        when={wfRuns().length > 0}
                        fallback={
                          <div class="px-4 py-2">
                            <p class="text-[10px] text-text-muted/50">No runs yet</p>
                          </div>
                        }
                      >
                        <For each={wfRuns().slice(0, 8)}>
                          {(run) => {
                            const rsc = getStatusConfig(run.status.phase);
                            const RunIcon = rsc.icon;
                            const isActive = () => selectedRunName() === run.metadata.name;
                            const isRunning = () => run.status.phase === "Running";
                            const isFailed = () => run.status.phase === "Failed";

                            // Left accent color — matches chat pattern
                            const accentColor = () => {
                              if (isRunning()) return "bg-accent";
                              if (isFailed()) return "bg-red-400";
                              if (isActive()) return "bg-primary";
                              return "bg-transparent";
                            };

                            // Left indicator — matches chat left indicator pattern
                            const leftIndicator = () => {
                              if (isRunning()) {
                                return (
                                  <span class="relative flex h-2.5 w-2.5">
                                    <span class="status-dot-glow absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
                                  </span>
                                );
                              }
                              if (isFailed()) return <span class="w-2.5 h-2.5 rounded-full bg-red-400" />;
                              return <RunIcon class={`w-3.5 h-3.5 ${isActive() ? "text-text-secondary" : "text-text-muted"}`} />;
                            };

                            // Status line — matches chat status line pattern
                            const statusLine = () => {
                              if (isRunning()) return <span class="text-accent">Running...</span>;
                              if (isFailed()) return <span class="text-red-400">Failed</span>;
                              return formatRelativeTime(run.status.startTime || run.metadata.creationTimestamp);
                            };

                            return (
                              <button
                                onClick={() => selectRun(run, workflow)}
                                class={`relative w-full flex flex-col text-left transition-all duration-150 group rounded-lg mb-0.5 ${
                                  isRunning()
                                    ? "session-row-processing session-row-processing--accent"
                                    : ""
                                } ${
                                  isActive()
                                    ? "bg-primary/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-primary/20 z-10"
                                    : "hover:bg-surface-hover/70 text-text-muted"
                                }`}
                                role="listitem"
                                aria-current={isActive() ? "true" : undefined}
                                aria-label={`Run: ${run.metadata.name}`}
                              >
                                <div class={`absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full transition-colors duration-200 ${accentColor()}`} />
                                <div class="flex items-start gap-2.5 pl-2.5 pr-3 py-2.5 w-full">
                                  {/* Left indicator */}
                                  <div class="flex items-center justify-center w-4 h-4 mt-0.5 shrink-0">
                                    {leftIndicator()}
                                  </div>
                                  {/* Content */}
                                  <div class="min-w-0 flex-1">
                                    <div class="flex items-center gap-1.5">
                                      <p class={`text-[13px] truncate leading-snug flex-1 ${
                                        isActive() ? "text-text font-medium"
                                          : "text-text-secondary group-hover:text-text"
                                      }`}>
                                        {run.metadata.name}
                                      </p>
                                    </div>
                                    {/* Status + duration */}
                                    <div class="flex items-center gap-2 mt-0.5">
                                      <span class="text-[10px] text-text-muted/70 tabular-nums">
                                        {statusLine()}
                                      </span>
                                      <Show when={run.status.startTime}>
                                        <span class="text-[10px] font-mono flex items-center gap-1 text-text-muted/70">
                                          <FiClock class="w-2.5 h-2.5" />
                                          {formatDuration(run.status.startTime, run.status.endTime)}
                                        </span>
                                      </Show>
                                      <Show when={(run.status.steps?.length || 0) > 0}>
                                        <span class="text-[10px] flex items-center gap-1 text-text-muted/70">
                                          <FiActivity class="w-2.5 h-2.5" />
                                          {run.status.steps!.length}
                                        </span>
                                      </Show>
                                    </div>
                                  </div>
                                </div>
                              </button>
                            );
                          }}
                        </For>
                      </Show>
                    </Show>
                  </>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
};

export default WorkflowPanel;
