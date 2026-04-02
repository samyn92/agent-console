import { createSignal, createResource, Show, For, type Component } from "solid-js";
import {
  FiClock, FiCheck, FiX, FiChevronRight,
  FiZap, FiCalendar, FiGlobe, FiGithub, FiArrowLeft, FiRefreshCw,
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
// WORKFLOW RUN TRACE VIEW (step timeline)
// =============================================================================

const WorkflowRunTrace: Component<{
  run: WorkflowRunResponse;
  workflow?: WorkflowResponse;
  onBack: () => void;
}> = (props) => {
  const steps = () => props.run.status.steps || [];

  // Get the step definition from the workflow spec for prompt info
  const getStepSpec = (stepName: string) =>
    props.workflow?.spec.steps.find(s => s.name === stepName);

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border">
        <button
          onClick={props.onBack}
          class="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text-secondary transition-colors"
        >
          <FiArrowLeft class="w-3.5 h-3.5" />
        </button>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-medium text-text truncate">{props.run.metadata.name}</p>
          <div class="flex items-center gap-1.5 text-[10px] text-text-muted">
            <span>{props.run.spec.workflowRef}</span>
            <span class="text-border-hover">·</span>
            <span>{formatRelativeTime(props.run.status.startTime || props.run.metadata.creationTimestamp)}</span>
          </div>
        </div>
        {(() => {
          const sc = getStatusConfig(props.run.status.phase);
          const Icon = sc.icon;
          return (
            <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded border ${sc.bg} ${sc.border} ${sc.color}`}>
              <Icon class={`w-2.5 h-2.5 ${props.run.status.phase === "Running" ? "animate-spin" : ""}`} />
              {props.run.status.phase || "Pending"}
            </span>
          );
        })()}
      </div>

      {/* Run summary bar */}
      <div class="shrink-0 px-3 py-2 bg-surface-2/50 border-b border-border flex items-center gap-3 text-[10px] text-text-muted">
        <Show when={props.run.status.startTime}>
          <div class="flex items-center gap-1">
            <FiClock class="w-2.5 h-2.5" />
            <span>{formatDuration(props.run.status.startTime, props.run.status.endTime)}</span>
          </div>
        </Show>
        <div class="flex items-center gap-1">
          <FiActivity class="w-2.5 h-2.5" />
          <span>{steps().length} step{steps().length !== 1 ? "s" : ""}</span>
        </div>
        <Show when={steps().filter(s => s.phase === "Succeeded").length > 0}>
          <div class="flex items-center gap-1">
            <FiCheck class="w-2.5 h-2.5 text-success" />
            <span>{steps().filter(s => s.phase === "Succeeded").length} passed</span>
          </div>
        </Show>
        <Show when={steps().filter(s => s.phase === "Failed").length > 0}>
          <div class="flex items-center gap-1">
            <FiX class="w-2.5 h-2.5 text-red-400" />
            <span>{steps().filter(s => s.phase === "Failed").length} failed</span>
          </div>
        </Show>
      </div>

      {/* Steps Timeline */}
      <div class="flex-1 overflow-y-auto px-3 py-3">
        <Show
          when={steps().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-8 text-text-muted">
              <FiActivity class="w-6 h-6 mb-2 opacity-30" />
              <p class="text-xs">No step data available</p>
            </div>
          }
        >
          <div class="relative">
            {/* Vertical line */}
            <div class="absolute left-[11px] top-3 bottom-3 w-px bg-border" />

            <For each={steps()}>
              {(step, index) => {
                const sc = getStatusConfig(step.phase);
                const Icon = sc.icon;
                const spec = getStepSpec(step.name);
                const [expanded, setExpanded] = createSignal(step.phase === "Failed");
                const isLast = () => index() === steps().length - 1;

                return (
                  <div class={`relative pl-8 ${isLast() ? "" : "pb-4"}`}>
                    {/* Node dot */}
                    <div class={`absolute left-0 top-0.5 w-[23px] h-[23px] rounded-full flex items-center justify-center border-2 ${
                      step.phase === "Running" 
                        ? "bg-accent/20 border-accent" 
                        : step.phase === "Succeeded"
                          ? "bg-success/20 border-success"
                          : step.phase === "Failed"
                            ? "bg-red-400/20 border-red-400"
                            : "bg-surface-2 border-border"
                    }`}>
                      <Icon class={`w-2.5 h-2.5 ${sc.color} ${step.phase === "Running" ? "animate-spin" : ""}`} />
                    </div>

                    {/* Step card */}
                    <div class="bg-surface-2 rounded-lg border border-border overflow-hidden">
                      <button
                        onClick={() => setExpanded(!expanded())}
                        class="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-surface-hover/30 transition-colors"
                      >
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-1.5">
                            <span class="text-xs font-medium text-text">{step.name}</span>
                            <span class={`text-[10px] px-1 py-px rounded ${sc.bg} ${sc.color} font-medium`}>
                              {step.phase}
                            </span>
                          </div>
                          <Show when={spec}>
                            <p class="text-[10px] text-text-muted truncate mt-0.5">
                              Agent: {spec!.agent}
                            </p>
                          </Show>
                        </div>
                        <Show when={step.startTime}>
                          <span class="text-[10px] text-text-muted shrink-0 tabular-nums">
                            {formatDuration(step.startTime, step.endTime)}
                          </span>
                        </Show>
                        <FiChevronRight
                          class={`w-3 h-3 text-text-muted shrink-0 transition-transform duration-150 ${expanded() ? "rotate-90" : ""}`}
                        />
                      </button>

                      <Show when={expanded()}>
                        <div class="border-t border-border px-2.5 py-2 space-y-2">
                          {/* Agent + Prompt */}
                          <Show when={spec}>
                            <div>
                              <p class="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Prompt</p>
                              <p class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap max-h-20 overflow-y-auto leading-relaxed">
                                {spec!.prompt}
                              </p>
                            </div>
                          </Show>

                          {/* Output */}
                          <Show when={step.output}>
                            <div>
                              <p class="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Output</p>
                              <div class="bg-background rounded border border-border px-2 py-1.5 max-h-24 overflow-y-auto">
                                <p class="text-[11px] text-text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                                  {step.output}
                                </p>
                              </div>
                            </div>
                          </Show>

                          {/* Timing */}
                          <Show when={step.startTime}>
                            <div class="flex items-center gap-3 text-[10px] text-text-muted">
                              <span>Started: {new Date(step.startTime!).toLocaleTimeString()}</span>
                              <Show when={step.endTime}>
                                <span>Finished: {new Date(step.endTime!).toLocaleTimeString()}</span>
                              </Show>
                            </div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
};

// =============================================================================
// WORKFLOW LIST PANEL
// =============================================================================

interface WorkflowPanelProps {
  namespace?: string;
}

const WorkflowPanel: Component<WorkflowPanelProps> = (props) => {
  // View state: list | trace
  const [view, setView] = createSignal<"list" | "trace">("list");
  const [selectedRun, setSelectedRun] = createSignal<WorkflowRunResponse | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = createSignal<WorkflowResponse | null>(null);
  const [expandedWorkflow, setExpandedWorkflow] = createSignal<string | null>(null);

  // Data
  const [workflows, { refetch: refetchWorkflows }] = createResource(
    () => props.namespace,
    (ns) => listWorkflows(ns)
  );
  const [runs, { refetch: refetchRuns }] = createResource(
    () => props.namespace,
    (ns) => listWorkflowRuns(ns)
  );

  // Get runs for a specific workflow
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

  const openRunTrace = (run: WorkflowRunResponse, workflow: WorkflowResponse) => {
    setSelectedRun(run);
    setSelectedWorkflow(workflow);
    setView("trace");
  };

  return (
    <div class="flex flex-col h-full">
      <Show when={view() === "trace" && selectedRun()}>
        <WorkflowRunTrace
          run={selectedRun()!}
          workflow={selectedWorkflow() || undefined}
          onBack={() => {
            setView("list");
            setSelectedRun(null);
            setSelectedWorkflow(null);
          }}
        />
      </Show>

      <Show when={view() === "list"}>
        {/* Header */}
        <div class="shrink-0 flex items-center justify-between px-3 py-2">
          <span class="section-label">Workflows</span>
          <button
            onClick={handleRefresh}
            class="p-1 text-text-muted hover:text-text-secondary rounded transition-colors"
            title="Refresh"
          >
            <FiRefreshCw class={`w-3 h-3 ${workflows.loading || runs.loading ? "animate-spin" : ""}`} />
          </button>
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
          <div class="flex-1 overflow-y-auto px-1.5 pb-2">
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
                  const isExpanded = () => expandedWorkflow() === workflow.metadata.name;
                  const TriggerIcon = triggerIcon(workflow);
                  const lastStatus = () => {
                    const last = wfRuns()[0];
                    return last ? last.status.phase : null;
                  };
                  const sc = () => lastStatus() ? getStatusConfig(lastStatus()!) : null;

                  return (
                    <div class="mb-1">
                      {/* Workflow row */}
                      <button
                        onClick={() => setExpandedWorkflow(isExpanded() ? null : workflow.metadata.name)}
                        class={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors group ${
                          isExpanded() ? "bg-surface-2 text-text" : "hover:bg-surface-hover text-text-secondary"
                        }`}
                      >
                        <div class={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                          isExpanded() ? "bg-accent/10" : "bg-surface-2"
                        }`}>
                          <FiZap class={`w-3 h-3 ${isExpanded() ? "text-accent" : "text-text-muted"}`} />
                        </div>
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-1.5">
                            <span class="text-xs font-medium truncate">{workflow.metadata.name}</span>
                            <Show when={sc()}>
                              <span class={`w-1.5 h-1.5 rounded-full ${
                                lastStatus() === "Succeeded" ? "bg-success" :
                                lastStatus() === "Failed" ? "bg-red-400" :
                                lastStatus() === "Running" ? "bg-accent animate-pulse" :
                                "bg-text-muted"
                              }`} />
                            </Show>
                          </div>
                          <div class="flex items-center gap-1 text-[10px] text-text-muted leading-tight">
                            <TriggerIcon class="w-2.5 h-2.5" />
                            <span class="truncate">{triggerLabel(workflow)}</span>
                          </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                          <Show when={workflow.status.runCount > 0}>
                            <span class="text-[10px] text-text-muted tabular-nums">
                              {workflow.status.runCount} runs
                            </span>
                          </Show>
                          <FiChevronRight
                            class={`w-3 h-3 text-text-muted transition-transform duration-150 ${isExpanded() ? "rotate-90" : ""}`}
                          />
                        </div>
                      </button>

                      {/* Expanded: show runs */}
                      <Show when={isExpanded()}>
                        <div class="ml-4 mt-1 mb-1 space-y-0.5">
                          {/* Steps overview */}
                          <div class="px-2.5 py-1.5 text-[10px] text-text-muted">
                            <span class="font-medium">{workflow.spec.steps.length} steps:</span>{" "}
                            {workflow.spec.steps.map(s => s.name).join(" → ")}
                          </div>

                          {/* Recent runs */}
                          <Show
                            when={wfRuns().length > 0}
                            fallback={
                              <p class="px-2.5 py-2 text-[10px] text-text-muted/60">No runs yet</p>
                            }
                          >
                            <div class="px-1">
                              <p class="text-[10px] text-text-muted font-medium px-1.5 py-1">Recent Runs</p>
                              <For each={wfRuns().slice(0, 5)}>
                                {(run) => {
                                  const rsc = getStatusConfig(run.status.phase);
                                  const RunIcon = rsc.icon;
                                  return (
                                    <button
                                      onClick={() => openRunTrace(run, workflow)}
                                      class="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-hover transition-colors text-left group/run"
                                    >
                                      <RunIcon class={`w-3 h-3 shrink-0 ${rsc.color} ${run.status.phase === "Running" ? "animate-spin" : ""}`} />
                                      <div class="flex-1 min-w-0">
                                        <span class="text-[11px] text-text-secondary truncate block">
                                          {run.metadata.name}
                                        </span>
                                      </div>
                                      <div class="flex items-center gap-1.5 shrink-0">
                                        <Show when={run.status.startTime}>
                                          <span class="text-[10px] text-text-muted tabular-nums">
                                            {formatDuration(run.status.startTime, run.status.endTime)}
                                          </span>
                                        </Show>
                                        <span class="text-[10px] text-text-muted tabular-nums opacity-0 group-hover/run:opacity-100 transition-opacity">
                                          {formatRelativeTime(run.status.startTime || run.metadata.creationTimestamp)}
                                        </span>
                                        <FiChevronRight class="w-2.5 h-2.5 text-text-muted opacity-0 group-hover/run:opacity-100 transition-opacity" />
                                      </div>
                                    </button>
                                  );
                                }}
                              </For>
                            </div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
};

export default WorkflowPanel;
