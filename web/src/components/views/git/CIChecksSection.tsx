import { type Component, For, Show, createSignal } from "solid-js";
import {
  FiActivity,
  FiCheck,
  FiX,
  FiClock,
  FiExternalLink,
  FiChevronDown,
  FiChevronRight,
  FiAlertCircle,
  FiPlay,
} from "solid-icons/fi";
import type { PipelineInfo, PipelineJobInfo } from "../../../lib/api";

// =============================================================================
// CI/CD CHECKS SECTION — Pipeline/workflow status tracking
// =============================================================================

interface CIChecksSectionProps {
  pipelines: PipelineInfo[];
  loading: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Relative time (e.g., "2h ago", "3d ago") */
function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 52) return `${weeks}w ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Format duration in seconds to human readable */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
}

/** Abbreviate a SHA to 7 chars */
function shortSHA(sha: string): string {
  return sha.slice(0, 7);
}

/**
 * Normalize pipeline status across providers into a unified status.
 * GitHub: queued, in_progress, completed (with conclusion: success, failure, cancelled, etc.)
 * GitLab: pending, running, success, failed, canceled, skipped
 */
function normalizeStatus(status: string, conclusion?: string): "success" | "failure" | "running" | "pending" | "cancelled" | "skipped" {
  // GitHub completed runs — use conclusion
  if (status === "completed") {
    switch (conclusion) {
      case "success":
        return "success";
      case "failure":
      case "timed_out":
      case "action_required":
        return "failure";
      case "cancelled":
        return "cancelled";
      case "skipped":
      case "neutral":
        return "skipped";
      default:
        return "success";
    }
  }

  // Direct status mapping
  switch (status) {
    case "success":
      return "success";
    case "failure":
    case "failed":
      return "failure";
    case "in_progress":
    case "running":
      return "running";
    case "queued":
    case "pending":
    case "waiting":
      return "pending";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** Status icon for a pipeline or job */
const StatusIcon: Component<{ status: string; conclusion?: string; size?: "sm" | "md" }> = (props) => {
  const sizeClass = () => props.size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";
  const spinnerSize = () => props.size === "md" ? "w-3.5 h-3.5" : "w-3 h-3";

  const normalized = () => normalizeStatus(props.status, props.conclusion);

  return (
    <>
      {normalized() === "success" && <FiCheck class={`${sizeClass()} text-green-400`} />}
      {normalized() === "failure" && <FiX class={`${sizeClass()} text-red-400`} />}
      {normalized() === "running" && (
        <div class={`${spinnerSize()} border-2 border-yellow-400 border-t-transparent rounded-full animate-spin`} />
      )}
      {normalized() === "pending" && <FiClock class={`${sizeClass()} text-text-muted`} />}
      {normalized() === "cancelled" && <FiX class={`${sizeClass()} text-text-muted`} />}
      {normalized() === "skipped" && <FiAlertCircle class={`${sizeClass()} text-yellow-400/60`} />}
    </>
  );
};

/** Status badge (colored pill) */
const StatusBadge: Component<{ status: string; conclusion?: string }> = (props) => {
  const normalized = () => normalizeStatus(props.status, props.conclusion);

  const colors = () => {
    switch (normalized()) {
      case "success":
        return "bg-green-500/15 text-green-400 border-green-500/25";
      case "failure":
        return "bg-red-500/15 text-red-400 border-red-500/25";
      case "running":
        return "bg-yellow-500/15 text-yellow-400 border-yellow-500/25";
      case "pending":
        return "bg-surface-2 text-text-muted border-border";
      case "cancelled":
        return "bg-surface-2 text-text-muted border-border";
      case "skipped":
        return "bg-surface-2 text-text-muted/60 border-border";
    }
  };

  const label = () => {
    switch (normalized()) {
      case "success":
        return "passed";
      case "failure":
        return "failed";
      case "running":
        return "running";
      case "pending":
        return "pending";
      case "cancelled":
        return "cancelled";
      case "skipped":
        return "skipped";
    }
  };

  return (
    <span class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${colors()}`}>
      <StatusIcon status={props.status} conclusion={props.conclusion} />
      {label()}
    </span>
  );
};

/** Single job row within an expanded pipeline */
const JobRow: Component<{ job: PipelineJobInfo }> = (props) => {
  return (
    <div class="flex items-center gap-2 py-1 px-2 group/job hover:bg-surface-2/50 rounded transition-colors">
      <StatusIcon status={props.job.status} conclusion={props.job.conclusion} />

      <span class="text-[10px] text-text truncate flex-1" title={props.job.name}>
        {props.job.name}
      </span>

      <Show when={props.job.stage}>
        <span class="text-[10px] text-text-muted/60 shrink-0">{props.job.stage}</span>
      </Show>

      <Show when={props.job.durationSeconds != null && props.job.durationSeconds > 0}>
        <span class="text-[10px] text-text-muted tabular-nums shrink-0">
          {formatDuration(props.job.durationSeconds!)}
        </span>
      </Show>

      <Show when={props.job.url}>
        <a
          href={props.job.url}
          target="_blank"
          rel="noopener noreferrer"
          class="opacity-0 group-hover/job:opacity-100 transition-opacity shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <FiExternalLink class="w-2.5 h-2.5 text-text-muted hover:text-accent" />
        </a>
      </Show>
    </div>
  );
};

/** Single pipeline card (expandable to show jobs) */
const PipelineCard: Component<{ pipeline: PipelineInfo }> = (props) => {
  const [expanded, setExpanded] = createSignal(false);
  const hasJobs = () => (props.pipeline.jobs?.length ?? 0) > 0;

  /** Count jobs by normalized status */
  const jobSummary = () => {
    const jobs = props.pipeline.jobs ?? [];
    let passed = 0;
    let failed = 0;
    let running = 0;
    let pending = 0;
    for (const j of jobs) {
      const s = normalizeStatus(j.status, j.conclusion);
      if (s === "success" || s === "skipped") passed++;
      else if (s === "failure") failed++;
      else if (s === "running") running++;
      else pending++;
    }
    return { total: jobs.length, passed, failed, running, pending };
  };

  return (
    <div class="rounded-lg bg-surface-2/50 border border-border hover:border-border-hover transition-colors">
      {/* Pipeline header (clickable to expand) */}
      <div
        class={`flex items-start gap-2 p-2.5 ${hasJobs() ? "cursor-pointer" : ""}`}
        onClick={() => hasJobs() && setExpanded(!expanded())}
      >
        {/* Expand/collapse chevron */}
        <Show when={hasJobs()}>
          <div class="mt-0.5 shrink-0 text-text-muted">
            {expanded()
              ? <FiChevronDown class="w-3 h-3" />
              : <FiChevronRight class="w-3 h-3" />
            }
          </div>
        </Show>
        <Show when={!hasJobs()}>
          <div class="mt-0.5 shrink-0">
            <StatusIcon status={props.pipeline.status} conclusion={props.pipeline.conclusion} size="md" />
          </div>
        </Show>

        {/* Pipeline info */}
        <div class="min-w-0 flex-1">
          {/* Name + status badge */}
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-medium text-text truncate" title={props.pipeline.name}>
              {props.pipeline.name}
            </span>
            <StatusBadge status={props.pipeline.status} conclusion={props.pipeline.conclusion} />
          </div>

          {/* Meta line: SHA, event, duration, time */}
          <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5">
            <code class="text-[10px] text-accent font-mono tabular-nums">
              {shortSHA(props.pipeline.sha)}
            </code>

            <Show when={props.pipeline.event}>
              <span class="flex items-center gap-0.5 text-[10px] text-text-muted">
                <FiPlay class="w-2 h-2" />
                {props.pipeline.event}
              </span>
            </Show>

            <Show when={props.pipeline.durationSeconds != null && props.pipeline.durationSeconds > 0}>
              <span class="text-[10px] text-text-muted tabular-nums">
                {formatDuration(props.pipeline.durationSeconds!)}
              </span>
            </Show>

            <Show when={props.pipeline.createdAt}>
              <span class="flex items-center gap-0.5 text-[10px] text-text-muted shrink-0">
                <FiClock class="w-2.5 h-2.5" />
                {relativeTime(props.pipeline.createdAt!)}
              </span>
            </Show>
          </div>

          {/* Job summary bar (if has jobs and not expanded) */}
          <Show when={hasJobs() && !expanded()}>
            {(() => {
              const summary = jobSummary();
              return (
                <div class="flex items-center gap-2 mt-1.5">
                  {/* Mini progress bar */}
                  <div class="flex h-1.5 flex-1 rounded-full overflow-hidden bg-surface-2 border border-border">
                    <Show when={summary.passed > 0}>
                      <div
                        class="bg-green-400"
                        style={{ width: `${(summary.passed / summary.total) * 100}%` }}
                      />
                    </Show>
                    <Show when={summary.failed > 0}>
                      <div
                        class="bg-red-400"
                        style={{ width: `${(summary.failed / summary.total) * 100}%` }}
                      />
                    </Show>
                    <Show when={summary.running > 0}>
                      <div
                        class="bg-yellow-400"
                        style={{ width: `${(summary.running / summary.total) * 100}%` }}
                      />
                    </Show>
                    <Show when={summary.pending > 0}>
                      <div
                        class="bg-surface-3"
                        style={{ width: `${(summary.pending / summary.total) * 100}%` }}
                      />
                    </Show>
                  </div>
                  <span class="text-[10px] text-text-muted tabular-nums shrink-0">
                    {summary.passed}/{summary.total}
                  </span>
                </div>
              );
            })()}
          </Show>
        </div>

        {/* External link */}
        <Show when={props.pipeline.url}>
          <a
            href={props.pipeline.url}
            target="_blank"
            rel="noopener noreferrer"
            class="shrink-0 mt-0.5"
            title="Open in browser"
            onClick={(e) => e.stopPropagation()}
          >
            <FiExternalLink class="w-3 h-3 text-text-muted hover:text-accent transition-colors" />
          </a>
        </Show>
      </div>

      {/* Expanded jobs list */}
      <Show when={expanded() && hasJobs()}>
        <div class="border-t border-border px-1 py-1">
          <For each={props.pipeline.jobs}>
            {(job) => <JobRow job={job} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const CIChecksSection: Component<CIChecksSectionProps> = (props) => {
  /** Summary across all pipelines */
  const overallStatus = () => {
    if (props.pipelines.length === 0) return null;
    const latest = props.pipelines[0]; // Pipelines are sorted newest first
    return normalizeStatus(latest.status, latest.conclusion);
  };

  return (
    <div class="px-3 py-2 border-t border-border">
      {/* Section header */}
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="section-label">CI/CD</span>
          <Show when={props.pipelines.length > 0}>
            <span class="text-xs text-text-muted tabular-nums">
              {props.pipelines.length}
            </span>
          </Show>
          <Show when={overallStatus()}>
            <StatusIcon status={props.pipelines[0]?.status ?? ""} conclusion={props.pipelines[0]?.conclusion} />
          </Show>
        </div>
      </div>

      {/* Loading skeleton */}
      <Show when={props.loading && props.pipelines.length === 0}>
        <div class="flex flex-col gap-2 animate-pulse">
          <div class="p-2.5 rounded-lg bg-surface-2 border border-border">
            <div class="flex items-center gap-2 mb-2">
              <div class="h-4 bg-surface-2 rounded w-12" />
              <div class="h-4 bg-surface-2 rounded flex-1" />
            </div>
            <div class="h-3 bg-surface-2 rounded w-2/3 mb-1.5" />
            <div class="h-1.5 bg-surface-2 rounded w-full" />
          </div>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!props.loading && props.pipelines.length === 0}>
        <div class="flex flex-col items-center py-6 text-center">
          <div class="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-2">
            <FiActivity class="w-4 h-4 text-text-muted/40" />
          </div>
          <p class="text-xs text-text-muted">No pipelines found</p>
        </div>
      </Show>

      {/* Pipeline list */}
      <Show when={props.pipelines.length > 0}>
        <div class="flex flex-col gap-2">
          <For each={props.pipelines}>
            {(pipeline) => <PipelineCard pipeline={pipeline} />}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default CIChecksSection;
