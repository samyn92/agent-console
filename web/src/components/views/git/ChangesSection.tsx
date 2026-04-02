import { type Component, For, Show } from "solid-js";
import { FiFile, FiFilePlus, FiFileMinus, FiEdit3 } from "solid-icons/fi";
import type { SessionDiffFile } from "../../../lib/api";

// =============================================================================
// CHANGES SECTION — List of files changed by the agent
// =============================================================================

interface ChangesSectionProps {
  diffs: SessionDiffFile[];
  selectedFile: string | null;
  loading: boolean;
  totalAdditions: number;
  totalDeletions: number;
  onSelectFile: (file: string | null) => void;
}

/** Derive file status from before/after content */
function fileStatus(diff: SessionDiffFile): "added" | "modified" | "deleted" {
  if (!diff.before || diff.before === "") return "added";
  if (!diff.after || diff.after === "") return "deleted";
  return "modified";
}

/** Short filename (last segment of path) */
function shortName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

/** Directory portion of path (everything before the filename) */
function dirPath(path: string): string {
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return "";
  return path.substring(0, idx + 1);
}

const StatusIcon: Component<{ status: "added" | "modified" | "deleted" }> = (
  props
) => {
  return (
    <Show
      when={props.status === "added"}
      fallback={
        <Show
          when={props.status === "deleted"}
          fallback={<FiEdit3 class="w-3 h-3 text-yellow-500 shrink-0" />}
        >
          <FiFileMinus class="w-3 h-3 text-red-400 shrink-0" />
        </Show>
      }
    >
      <FiFilePlus class="w-3 h-3 text-green-400 shrink-0" />
    </Show>
  );
};

const ChangesSection: Component<ChangesSectionProps> = (props) => {
  return (
    <div class="px-3 py-2 border-t border-border">
      {/* Section header */}
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="section-label">Changes</span>
          <span class="text-xs text-text-muted tabular-nums">
            {props.diffs.length} {props.diffs.length === 1 ? "file" : "files"}
          </span>
        </div>

        {/* Aggregate stats */}
        <Show when={props.diffs.length > 0}>
          <div class="flex items-center gap-1.5 text-[10px] tabular-nums">
            <span class="text-green-400">+{props.totalAdditions}</span>
            <span class="text-red-400">-{props.totalDeletions}</span>
          </div>
        </Show>
      </div>

      {/* Loading state */}
      <Show when={props.loading && props.diffs.length === 0}>
        <div class="flex flex-col gap-1.5 animate-pulse">
          <div class="h-7 bg-surface-2 rounded" />
          <div class="h-7 bg-surface-2 rounded w-4/5" />
          <div class="h-7 bg-surface-2 rounded w-3/5" />
        </div>
      </Show>

      {/* Empty state */}
      <Show when={!props.loading && props.diffs.length === 0}>
        <div class="flex flex-col items-center py-6 text-center">
          <div class="w-8 h-8 rounded-lg bg-surface-2 border border-border flex items-center justify-center mb-2">
            <FiFile class="w-4 h-4 text-text-muted/40" />
          </div>
          <p class="text-xs text-text-muted">No changes detected</p>
        </div>
      </Show>

      {/* File list */}
      <Show when={props.diffs.length > 0}>
        <div class="flex flex-col gap-0.5">
          <For each={props.diffs}>
            {(diff) => {
              const status = () => fileStatus(diff);
              const isSelected = () => props.selectedFile === diff.file;

              return (
                <button
                  class="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-left transition-colors"
                  classList={{
                    "bg-accent-muted border border-accent/20": isSelected(),
                    "hover:bg-surface-2": !isSelected(),
                  }}
                  onClick={() =>
                    props.onSelectFile(isSelected() ? null : diff.file)
                  }
                  title={diff.file}
                >
                  <StatusIcon status={status()} />

                  {/* File path */}
                  <div class="min-w-0 flex-1 flex items-baseline gap-0.5 overflow-hidden">
                    <span class="text-[10px] text-text-muted truncate shrink-0">
                      {dirPath(diff.file)}
                    </span>
                    <span
                      class="text-xs font-medium truncate"
                      classList={{
                        "text-text": !isSelected(),
                        "text-accent": isSelected(),
                      }}
                    >
                      {shortName(diff.file)}
                    </span>
                  </div>

                  {/* Per-file stats */}
                  <div class="flex items-center gap-1 text-[10px] tabular-nums shrink-0">
                    <Show when={diff.additions > 0}>
                      <span class="text-green-400">+{diff.additions}</span>
                    </Show>
                    <Show when={diff.deletions > 0}>
                      <span class="text-red-400">-{diff.deletions}</span>
                    </Show>
                  </div>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default ChangesSection;
