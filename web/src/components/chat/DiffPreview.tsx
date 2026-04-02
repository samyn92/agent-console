import { type Component, Show, For, createMemo, createSignal } from "solid-js";
import { FiChevronRight, FiChevronDown } from "solid-icons/fi";
import { structuredPatch } from "diff";

// =============================================================================
// DIFF PREVIEW — Compact, collapsible inline diff for tool call cards
// =============================================================================
// Used by EditContent and WriteContent in ToolCallCard.tsx to show proper
// unified diffs instead of truncated text snippets.

export interface DiffPreviewProps {
  /** Original text (empty string for new files) */
  before: string;
  /** Updated text */
  after: string;
  /** Number of context lines around changes (default: 2) */
  contextLines?: number;
  /** Start expanded (default: false) */
  defaultOpen?: boolean;
  /** Max visible lines before scroll kicks in (default: 20) */
  maxLines?: number;
  /** Label for the summary toggle (default: auto-generated from stats) */
  label?: string;
}

interface DiffLine {
  type: "context" | "add" | "remove" | "header";
  content: string;
  oldLineNo?: number;
  newLineNo?: number;
}

const DiffPreview: Component<DiffPreviewProps> = (props) => {
  const contextLines = () => props.contextLines ?? 2;
  const maxLines = () => props.maxLines ?? 20;
  const [expanded, setExpanded] = createSignal(props.defaultOpen ?? false);

  // Compute structured diff
  const diffData = createMemo(() => {
    const before = props.before || "";
    const after = props.after || "";

    const patch = structuredPatch(
      "a",
      "b",
      before,
      after,
      "",
      "",
      { context: contextLines() }
    );

    const lines: DiffLine[] = [];
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const hunk of patch.hunks) {
      // Hunk header
      lines.push({
        type: "header",
        content: `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
      });

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const line of hunk.lines) {
        const prefix = line[0];
        const text = line.substring(1);

        if (prefix === "+") {
          totalAdded++;
          lines.push({ type: "add", content: text, newLineNo: newLine++ });
        } else if (prefix === "-") {
          totalRemoved++;
          lines.push({ type: "remove", content: text, oldLineNo: oldLine++ });
        } else {
          lines.push({
            type: "context",
            content: text,
            oldLineNo: oldLine++,
            newLineNo: newLine++,
          });
        }
      }
    }

    return { lines, added: totalAdded, removed: totalRemoved };
  });

  // Preview lines (first N lines when collapsed)
  const previewLines = createMemo(() => {
    const all = diffData().lines;
    // Skip header lines for preview, show only actual diff lines
    const nonHeader = all.filter((l) => l.type !== "header");
    return nonHeader.slice(0, 4);
  });

  const needsScroll = createMemo(() => diffData().lines.length > maxLines());
  const hasContent = createMemo(() => diffData().lines.length > 0);

  return (
    <Show when={hasContent()}>
      <div class="rounded overflow-hidden border border-border-subtle">
        {/* Toggle header */}
        <button
          type="button"
          class="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-text-muted hover:text-text-secondary hover:bg-surface-2/50 transition-colors"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <Show when={expanded()} fallback={<FiChevronRight class="w-3 h-3 shrink-0" />}>
            <FiChevronDown class="w-3 h-3 shrink-0" />
          </Show>
          <span class="flex items-center gap-1.5">
            <Show when={props.label}>
              <span class="text-text-muted">{props.label}</span>
            </Show>
            <Show when={diffData().added > 0}>
              <span class="text-green-400 font-mono">+{diffData().added}</span>
            </Show>
            <Show when={diffData().removed > 0}>
              <span class="text-red-400 font-mono">-{diffData().removed}</span>
            </Show>
            <Show when={!props.label && diffData().added === 0 && diffData().removed === 0}>
              <span class="text-text-muted">No changes</span>
            </Show>
          </span>
        </button>

        {/* Collapsed preview: show first few diff lines as a mini summary */}
        <Show when={!expanded() && previewLines().length > 0}>
          <div class="border-t border-border-subtle bg-surface-2/30 px-0 overflow-hidden">
            <For each={previewLines()}>
              {(line) => (
                <div
                  class="px-2 py-0 font-mono text-[11px] leading-[18px] whitespace-pre truncate"
                  classList={{
                    "bg-green-500/8 text-green-400": line.type === "add",
                    "bg-red-500/8 text-red-400": line.type === "remove",
                    "text-text-secondary": line.type === "context",
                  }}
                >
                  <span class="select-none text-text-muted/40 mr-1">
                    {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                  </span>
                  {line.content}
                </div>
              )}
            </For>
            <Show when={diffData().lines.filter((l) => l.type !== "header").length > 4}>
              <div class="px-2 py-0.5 text-[10px] text-text-muted">
                ...{diffData().lines.filter((l) => l.type !== "header").length - 4} more lines
              </div>
            </Show>
          </div>
        </Show>

        {/* Expanded full diff */}
        <Show when={expanded()}>
          <div
            class="border-t border-border-subtle overflow-auto"
            style={{ "max-height": needsScroll() ? `${maxLines() * 18 + 4}px` : "none" }}
          >
            <table class="w-full text-[11px] font-mono border-collapse leading-[18px]">
              <tbody>
                <For each={diffData().lines}>
                  {(line) => (
                    <tr
                      classList={{
                        "bg-green-500/8": line.type === "add",
                        "bg-red-500/8": line.type === "remove",
                        "bg-surface-2/50": line.type === "header",
                      }}
                    >
                      <Show
                        when={line.type !== "header"}
                        fallback={
                          <td
                            colspan={3}
                            class="px-2 py-0 text-text-muted/60 text-[10px] select-none"
                          >
                            {line.content}
                          </td>
                        }
                      >
                        <td class="w-[1px] px-1 py-0 text-right text-text-muted/40 select-none whitespace-nowrap border-r border-border-subtle tabular-nums">
                          {line.oldLineNo ?? ""}
                        </td>
                        <td class="w-[1px] px-1 py-0 text-right text-text-muted/40 select-none whitespace-nowrap border-r border-border-subtle tabular-nums">
                          {line.newLineNo ?? ""}
                        </td>
                        <td class="px-1.5 py-0 whitespace-pre-wrap break-all">
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
    </Show>
  );
};

export default DiffPreview;
