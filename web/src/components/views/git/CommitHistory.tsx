import { type Component, For, Show } from "solid-js";
import { FiGitCommit, FiClock } from "solid-icons/fi";
import type { CommitInfo } from "../../../lib/api";

// =============================================================================
// COMMIT HISTORY — Recent commits for the agent's repository
// =============================================================================

interface CommitHistoryProps {
  commits: CommitInfo[];
  loading: boolean;
}

/** Abbreviate a SHA to 7 chars */
function shortSHA(sha: string): string {
  return sha.slice(0, 7);
}

/** First line of a commit message */
function firstLine(message: string): string {
  const idx = message.indexOf("\n");
  if (idx === -1) return message;
  return message.slice(0, idx);
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

const CommitHistory: Component<CommitHistoryProps> = (props) => {
  return (
    <div class="px-3 py-2 border-t border-border">
      {/* Section header */}
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="section-label">Commits</span>
          <Show when={props.commits.length > 0}>
            <span class="text-xs text-text-muted tabular-nums">
              {props.commits.length}
            </span>
          </Show>
        </div>
      </div>

      {/* Loading skeleton */}
      <Show when={props.loading && props.commits.length === 0}>
        <div class="flex flex-col gap-1.5 animate-pulse">
          <div class="flex gap-2 items-start">
            <div class="w-1.5 h-1.5 rounded-full bg-surface-2 mt-1.5 shrink-0" />
            <div class="flex-1">
              <div class="h-4 bg-surface-2 rounded w-full mb-1" />
              <div class="h-3 bg-surface-2 rounded w-2/3" />
            </div>
          </div>
          <div class="flex gap-2 items-start">
            <div class="w-1.5 h-1.5 rounded-full bg-surface-2 mt-1.5 shrink-0" />
            <div class="flex-1">
              <div class="h-4 bg-surface-2 rounded w-4/5 mb-1" />
              <div class="h-3 bg-surface-2 rounded w-1/2" />
            </div>
          </div>
          <div class="flex gap-2 items-start">
            <div class="w-1.5 h-1.5 rounded-full bg-surface-2 mt-1.5 shrink-0" />
            <div class="flex-1">
              <div class="h-4 bg-surface-2 rounded w-3/5 mb-1" />
              <div class="h-3 bg-surface-2 rounded w-1/3" />
            </div>
          </div>
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!props.loading && props.commits.length === 0}>
        <div class="flex flex-col items-center py-6 text-center">
          <div class="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-2">
            <FiGitCommit class="w-4 h-4 text-text-muted/40" />
          </div>
          <p class="text-xs text-text-muted">No commits found</p>
        </div>
      </Show>

      {/* Commit list with visual timeline */}
      <Show when={props.commits.length > 0}>
        <div class="relative">
          {/* Vertical timeline line */}
          <div
            class="absolute left-[5px] top-2 bottom-2 w-px bg-border"
            aria-hidden="true"
          />

          <div class="flex flex-col gap-0.5">
            <For each={props.commits}>
              {(commit) => (
                <div class="relative flex gap-2.5 pl-0 py-1 group">
                  {/* Timeline dot */}
                  <div class="relative z-10 mt-1.5 shrink-0">
                    <div class="w-[11px] h-[11px] rounded-full border-2 border-border bg-background group-hover:border-accent transition-colors" />
                  </div>

                  {/* Commit content */}
                  <div class="min-w-0 flex-1">
                    {/* Message (first line only) */}
                    <p class="text-xs text-text leading-snug truncate" title={firstLine(commit.message)}>
                      {firstLine(commit.message)}
                    </p>

                    {/* Meta line: SHA, author, time */}
                    <div class="flex items-center gap-1.5 mt-0.5">
                      <code class="text-[10px] text-accent font-mono tabular-nums">
                        {shortSHA(commit.sha)}
                      </code>
                      <span class="text-[10px] text-text-muted truncate">
                        {commit.author}
                      </span>
                      <Show when={commit.timestamp}>
                        <span class="flex items-center gap-0.5 text-[10px] text-text-muted shrink-0">
                          <FiClock class="w-2.5 h-2.5" />
                          {relativeTime(commit.timestamp!)}
                        </span>
                      </Show>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
};

export default CommitHistory;
