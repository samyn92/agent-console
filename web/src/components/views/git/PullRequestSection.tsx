import { type Component, For, Show } from "solid-js";
import {
  FiGitPullRequest,
  FiGitMerge,
  FiCheck,
  FiX,
  FiClock,
  FiExternalLink,
  FiAlertCircle,
  FiUser,
  FiArrowRight,
} from "solid-icons/fi";
import type { EnrichedPullRequest, CheckInfo, ReviewInfo } from "../../../lib/api";

// =============================================================================
// PULL REQUEST SECTION — PR/MR status with checks and reviews
// =============================================================================

interface PullRequestSectionProps {
  pullRequests: EnrichedPullRequest[];
  loading: boolean;
}

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

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/** State badge for the PR (open, merged, closed) */
const StateBadge: Component<{ state: string }> = (props) => {
  const colors = () => {
    switch (props.state) {
      case "open":
        return "bg-green-500/15 text-green-400 border-green-500/25";
      case "merged":
        return "bg-purple-500/15 text-purple-400 border-purple-500/25";
      case "closed":
        return "bg-red-500/15 text-red-400 border-red-500/25";
      default:
        return "bg-surface-2 text-text-muted border-border";
    }
  };

  const Icon = () => {
    switch (props.state) {
      case "open":
        return <FiGitPullRequest class="w-2.5 h-2.5" />;
      case "merged":
        return <FiGitMerge class="w-2.5 h-2.5" />;
      case "closed":
        return <FiX class="w-2.5 h-2.5" />;
      default:
        return <FiGitPullRequest class="w-2.5 h-2.5" />;
    }
  };

  return (
    <span
      class={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${colors()}`}
    >
      <Icon />
      {props.state}
    </span>
  );
};

/** Individual check/CI status */
const CheckStatus: Component<{ check: CheckInfo }> = (props) => {
  const icon = () => {
    const { status, conclusion } = props.check;
    // Completed checks use conclusion
    if (status === "completed" || status === "success") {
      switch (conclusion || status) {
        case "success":
          return <FiCheck class="w-3 h-3 text-green-400" />;
        case "failure":
        case "failed":
          return <FiX class="w-3 h-3 text-red-400" />;
        case "cancelled":
        case "canceled":
          return <FiX class="w-3 h-3 text-text-muted" />;
        case "skipped":
        case "neutral":
          return <FiAlertCircle class="w-3 h-3 text-yellow-400" />;
        default:
          return <FiCheck class="w-3 h-3 text-green-400" />;
      }
    }
    // In-progress or queued
    if (status === "in_progress" || status === "running") {
      return (
        <div class="w-3 h-3 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin" />
      );
    }
    // Pending / queued
    return <FiClock class="w-3 h-3 text-text-muted" />;
  };

  return (
    <div class="flex items-center gap-1.5 group/check">
      {icon()}
      <span class="text-[10px] text-text-muted truncate max-w-[100px]" title={props.check.name}>
        {props.check.name}
      </span>
      <Show when={props.check.url}>
        <a
          href={props.check.url}
          target="_blank"
          rel="noopener noreferrer"
          class="opacity-0 group-hover/check:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <FiExternalLink class="w-2.5 h-2.5 text-text-muted hover:text-accent" />
        </a>
      </Show>
    </div>
  );
};

/** Review status indicator */
const ReviewStatus: Component<{ review: ReviewInfo }> = (props) => {
  const icon = () => {
    switch (props.review.state) {
      case "APPROVED":
        return <FiCheck class="w-3 h-3 text-green-400" />;
      case "CHANGES_REQUESTED":
        return <FiAlertCircle class="w-3 h-3 text-red-400" />;
      case "COMMENTED":
        return <FiUser class="w-3 h-3 text-blue-400" />;
      case "DISMISSED":
        return <FiX class="w-3 h-3 text-text-muted" />;
      default:
        return <FiClock class="w-3 h-3 text-text-muted" />;
    }
  };

  const stateLabel = () => {
    switch (props.review.state) {
      case "APPROVED":
        return "approved";
      case "CHANGES_REQUESTED":
        return "changes requested";
      case "COMMENTED":
        return "commented";
      case "DISMISSED":
        return "dismissed";
      default:
        return "pending";
    }
  };

  return (
    <div class="flex items-center gap-1.5">
      {icon()}
      <span class="text-[10px] text-text-muted">
        {props.review.author}
      </span>
      <span class="text-[10px] text-text-muted/60">
        {stateLabel()}
      </span>
    </div>
  );
};

/** Merge readiness indicator */
const MergeReadiness: Component<{ ready: boolean; mergeable: boolean }> = (props) => {
  if (props.ready) {
    return (
      <div class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 border border-green-500/20">
        <FiCheck class="w-2.5 h-2.5 text-green-400" />
        <span class="text-[10px] text-green-400 font-medium">Ready to merge</span>
      </div>
    );
  }
  if (!props.mergeable) {
    return (
      <div class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/20">
        <FiX class="w-2.5 h-2.5 text-red-400" />
        <span class="text-[10px] text-red-400 font-medium">Conflicts</span>
      </div>
    );
  }
  return (
    <div class="flex items-center gap-1 px-1.5 py-0.5 rounded bg-yellow-500/10 border border-yellow-500/20">
      <FiClock class="w-2.5 h-2.5 text-yellow-400" />
      <span class="text-[10px] text-yellow-400 font-medium">Pending</span>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const PullRequestSection: Component<PullRequestSectionProps> = (props) => {
  return (
    <div class="px-3 py-2 border-t border-border">
      {/* Section header */}
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="section-label">Pull Requests</span>
          <Show when={props.pullRequests.length > 0}>
            <span class="text-xs text-text-muted tabular-nums">
              {props.pullRequests.length}
            </span>
          </Show>
        </div>
      </div>

      {/* Loading skeleton */}
      <Show when={props.loading && props.pullRequests.length === 0}>
        <div class="flex flex-col gap-2 animate-pulse">
          <div class="p-2.5 rounded-lg bg-surface-2 border border-border">
            <div class="flex items-center gap-2 mb-2">
              <div class="h-4 bg-surface-2 rounded w-12" />
              <div class="h-4 bg-surface-2 rounded flex-1" />
            </div>
            <div class="h-3 bg-surface-2 rounded w-2/3 mb-1.5" />
            <div class="h-3 bg-surface-2 rounded w-1/2" />
          </div>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!props.loading && props.pullRequests.length === 0}>
        <div class="flex flex-col items-center py-6 text-center">
          <div class="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-2">
            <FiGitPullRequest class="w-4 h-4 text-text-muted/40" />
          </div>
          <p class="text-xs text-text-muted">No active PRs</p>
        </div>
      </Show>

      {/* PR list */}
      <Show when={props.pullRequests.length > 0}>
        <div class="flex flex-col gap-2">
          <For each={props.pullRequests}>
            {(pr) => (
              <div class="p-2.5 rounded-lg bg-surface-2/50 border border-border hover:border-border-hover transition-colors">
                {/* Title row: state badge + title + external link */}
                <div class="flex items-start gap-2 mb-1.5">
                  <StateBadge state={pr.state} />
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1">
                      <span class="text-xs font-medium text-text truncate" title={pr.title}>
                        {pr.title}
                      </span>
                      <span class="text-[10px] text-text-muted shrink-0">
                        #{pr.number}
                      </span>
                    </div>
                  </div>
                  <Show when={pr.url}>
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="shrink-0"
                      title="Open in browser"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FiExternalLink class="w-3 h-3 text-text-muted hover:text-accent transition-colors" />
                    </a>
                  </Show>
                </div>

                {/* Branch info: branch → base */}
                <div class="flex items-center gap-1 mb-1.5">
                  <code class="text-[10px] text-accent font-mono truncate max-w-[80px]" title={pr.branch}>
                    {pr.branch}
                  </code>
                  <FiArrowRight class="w-2.5 h-2.5 text-text-muted shrink-0" />
                  <code class="text-[10px] text-text-muted font-mono truncate max-w-[80px]" title={pr.baseBranch}>
                    {pr.baseBranch}
                  </code>
                </div>

                {/* Meta: author, changed files, additions/deletions, time */}
                <div class="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-2">
                  <Show when={pr.author}>
                    <span class="flex items-center gap-0.5 text-[10px] text-text-muted">
                      <FiUser class="w-2.5 h-2.5" />
                      {pr.author}
                    </span>
                  </Show>
                  <Show when={pr.changedFiles > 0}>
                    <span class="text-[10px] text-text-muted">
                      {pr.changedFiles} {pr.changedFiles === 1 ? "file" : "files"}
                    </span>
                  </Show>
                  <Show when={pr.additions > 0 || pr.deletions > 0}>
                    <span class="flex items-center gap-1 text-[10px] tabular-nums">
                      <Show when={pr.additions > 0}>
                        <span class="text-green-400">+{pr.additions}</span>
                      </Show>
                      <Show when={pr.deletions > 0}>
                        <span class="text-red-400">-{pr.deletions}</span>
                      </Show>
                    </span>
                  </Show>
                  <Show when={pr.updatedAt}>
                    <span class="flex items-center gap-0.5 text-[10px] text-text-muted">
                      <FiClock class="w-2.5 h-2.5" />
                      {relativeTime(pr.updatedAt!)}
                    </span>
                  </Show>
                </div>

                {/* Checks section */}
                <Show when={pr.checks && pr.checks.length > 0}>
                  <div class="mb-1.5">
                    <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
                      <For each={pr.checks}>
                        {(check) => <CheckStatus check={check} />}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Reviews section */}
                <Show when={pr.reviews && pr.reviews.length > 0}>
                  <div class="mb-1.5">
                    <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
                      <For each={pr.reviews}>
                        {(review) => <ReviewStatus review={review} />}
                      </For>
                    </div>
                  </div>
                </Show>

                {/* Merge readiness */}
                <Show when={pr.state === "open"}>
                  <MergeReadiness ready={pr.mergeReady} mergeable={pr.mergeable} />
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default PullRequestSection;
