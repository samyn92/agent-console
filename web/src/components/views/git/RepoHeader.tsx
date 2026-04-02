import { type Component, Show } from "solid-js";
import { FiGitBranch, FiArrowUp, FiArrowDown, FiRefreshCw } from "solid-icons/fi";
import type { VCSInfo, GitRepoInfo } from "../../../lib/api";

// =============================================================================
// REPO HEADER — Shows repo name, current branch, ahead/behind
// =============================================================================

interface RepoHeaderProps {
  vcs: VCSInfo | null;
  repositories: GitRepoInfo[];
  loading: boolean;
  onRefresh?: () => void;
}

const RepoHeader: Component<RepoHeaderProps> = (props) => {
  // Derive the primary repo (first one, if any)
  const primaryRepo = () => props.repositories[0] ?? null;

  const repoLabel = () => {
    const repo = primaryRepo();
    if (repo) return `${repo.owner}/${repo.name}`;
    return "No repository";
  };

  const providerLabel = () => {
    const repo = primaryRepo();
    if (!repo) return "";
    switch (repo.provider) {
      case "github":
        return "GitHub";
      case "gitlab":
        return "GitLab";
      default:
        return "Git";
    }
  };

  return (
    <div class="px-3 py-2">
      <div class="flex items-center justify-between mb-2">
        <span class="section-label">Repository</span>
        <Show when={props.onRefresh}>
          <button
            onClick={props.onRefresh}
            class="p-0.5 rounded hover:bg-surface-2 text-text-muted hover:text-text transition-colors"
            title="Refresh git status"
          >
            <FiRefreshCw
              class="w-3 h-3"
              classList={{ "animate-spin": props.loading }}
            />
          </button>
        </Show>
      </div>

      <div class="flex flex-col gap-1.5 px-2.5 py-2 bg-surface-2 rounded-lg border border-border">
        {/* Repo name */}
        <Show
          when={primaryRepo()}
          fallback={
            <div class="flex items-center gap-2">
              <FiGitBranch class="w-3 h-3 text-text-muted shrink-0" />
              <p class="text-xs text-text-muted">No repository configured</p>
            </div>
          }
        >
          <div class="flex items-center gap-2 min-w-0">
            <FiGitBranch class="w-3 h-3 text-text-secondary shrink-0" />
            <span class="text-xs font-medium text-text truncate">
              {repoLabel()}
            </span>
            <Show when={providerLabel()}>
              <span class="text-[10px] px-1 py-0.5 rounded bg-surface-3 text-text-muted shrink-0">
                {providerLabel()}
              </span>
            </Show>
          </div>
        </Show>

        {/* Branch + ahead/behind */}
        <Show when={props.vcs?.branch}>
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-3 shrink-0" /> {/* Spacer to align with repo name */}
            <span class="text-xs text-text-secondary font-mono truncate">
              {props.vcs!.branch}
            </span>

            {/* Ahead / Behind indicators */}
            <Show when={(props.vcs!.ahead ?? 0) > 0}>
              <span class="flex items-center gap-0.5 text-[10px] text-green-400" title={`${props.vcs!.ahead} ahead`}>
                <FiArrowUp class="w-2.5 h-2.5" />
                {props.vcs!.ahead}
              </span>
            </Show>
            <Show when={(props.vcs!.behind ?? 0) > 0}>
              <span class="flex items-center gap-0.5 text-[10px] text-orange-400" title={`${props.vcs!.behind} behind`}>
                <FiArrowDown class="w-2.5 h-2.5" />
                {props.vcs!.behind}
              </span>
            </Show>

            {/* Dirty indicator */}
            <Show when={props.vcs!.dirty}>
              <span class="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0" title="Uncommitted changes" />
            </Show>
          </div>
        </Show>

        {/* SHA (abbreviated) */}
        <Show when={props.vcs?.sha}>
          <div class="flex items-center gap-2 min-w-0">
            <div class="w-3 shrink-0" />
            <span class="text-[10px] text-text-muted font-mono">
              {props.vcs!.sha.substring(0, 8)}
            </span>
          </div>
        </Show>

        {/* Additional repos indicator */}
        <Show when={props.repositories.length > 1}>
          <div class="flex items-center gap-2 mt-0.5">
            <div class="w-3 shrink-0" />
            <span class="text-[10px] text-text-muted">
              +{props.repositories.length - 1} more{" "}
              {props.repositories.length - 1 === 1 ? "repo" : "repos"}
            </span>
          </div>
        </Show>
      </div>
    </div>
  );
};

export default RepoHeader;
