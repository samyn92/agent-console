import { type Component, Show, For, createMemo } from "solid-js";
import { FiFile, FiX } from "solid-icons/fi";
import { structuredPatch } from "diff";
import type { SessionDiffFile } from "../../../lib/api";

// =============================================================================
// DIFF VIEWER — Inline unified diff for a selected file
// =============================================================================

interface DiffViewerProps {
  diff: SessionDiffFile | null;
  onClose: () => void;
}

interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

const DiffViewer: Component<DiffViewerProps> = (props) => {
  const lines = createMemo<DiffLine[]>(() => {
    const d = props.diff;
    if (!d) return [];

    const patch = structuredPatch(
      d.file,
      d.file,
      d.before || "",
      d.after || "",
      "",
      "",
      { context: 3 }
    );

    const result: DiffLine[] = [];

    for (const hunk of patch.hunks) {
      // Hunk header
      result.push({
        type: "header",
        content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      });

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const line of hunk.lines) {
        const prefix = line[0];
        const text = line.substring(1);

        if (prefix === "+") {
          result.push({
            type: "add",
            content: text,
            newLineNo: newLine++,
          });
        } else if (prefix === "-") {
          result.push({
            type: "remove",
            content: text,
            oldLineNo: oldLine++,
          });
        } else {
          result.push({
            type: "context",
            content: text,
            oldLineNo: oldLine++,
            newLineNo: newLine++,
          });
        }
      }
    }

    return result;
  });

  return (
    <div class="flex flex-col border-t border-border h-full min-h-0">
      {/* Header */}
      <Show when={props.diff}>
        <div class="shrink-0 flex items-center justify-between px-3 py-1.5 bg-surface-2 border-b border-border">
          <div class="flex items-center gap-2 min-w-0">
            <FiFile class="w-3 h-3 text-text-muted shrink-0" />
            <span class="text-xs font-mono text-text-secondary truncate">
              {props.diff!.file}
            </span>
            <div class="flex items-center gap-1 text-[10px] tabular-nums shrink-0">
              <Show when={props.diff!.additions > 0}>
                <span class="text-green-400">+{props.diff!.additions}</span>
              </Show>
              <Show when={props.diff!.deletions > 0}>
                <span class="text-red-400">-{props.diff!.deletions}</span>
              </Show>
            </div>
          </div>
          <button
            onClick={props.onClose}
            class="p-0.5 rounded hover:bg-surface text-text-muted hover:text-text transition-colors"
            title="Close diff"
          >
            <FiX class="w-3 h-3" />
          </button>
        </div>
      </Show>

      {/* Diff content */}
      <Show
        when={props.diff && lines().length > 0}
        fallback={
          <Show when={props.diff}>
            <div class="flex flex-col items-center justify-center py-8 text-center">
              <p class="text-xs text-text-muted">No differences found</p>
            </div>
          </Show>
        }
      >
        <div class="flex-1 overflow-auto">
          <table class="w-full text-xs font-mono border-collapse">
            <tbody>
              <For each={lines()}>
                {(line) => (
                  <tr
                    classList={{
                      "bg-green-500/8": line.type === "add",
                      "bg-red-500/8": line.type === "remove",
                      "bg-surface-2/50": line.type === "header",
                    }}
                  >
                    {/* Line numbers */}
                    <Show
                      when={line.type !== "header"}
                      fallback={
                        <td
                          colspan={3}
                          class="px-3 py-0.5 text-text-muted text-[10px] select-none"
                        >
                          {line.content}
                        </td>
                      }
                    >
                      <td class="w-[1px] px-1.5 py-0 text-right text-text-muted/50 select-none whitespace-nowrap border-r border-border-subtle">
                        {line.oldLineNo ?? ""}
                      </td>
                      <td class="w-[1px] px-1.5 py-0 text-right text-text-muted/50 select-none whitespace-nowrap border-r border-border-subtle">
                        {line.newLineNo ?? ""}
                      </td>
                      <td class="px-2 py-0 whitespace-pre-wrap break-all">
                        <span
                          classList={{
                            "text-green-400": line.type === "add",
                            "text-red-400": line.type === "remove",
                            "text-text-secondary": line.type === "context",
                          }}
                        >
                          <span class="select-none text-text-muted/40 mr-1">
                            {line.type === "add"
                              ? "+"
                              : line.type === "remove"
                                ? "-"
                                : " "}
                          </span>
                          {line.content}
                        </span>
                      </td>
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
};

export default DiffViewer;
