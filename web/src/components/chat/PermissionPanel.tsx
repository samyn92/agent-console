import type { Component } from "solid-js";
import { Show } from "solid-js";
import { FiShield, FiCheck, FiX, FiRepeat } from "solid-icons/fi";
import type { PendingPermission } from "../../lib/api";

interface PermissionPanelProps {
  permission: PendingPermission;
  onAllow: (permissionId: string) => void;
  onAlwaysAllow: (permissionId: string) => void;
  onDeny: (permissionId: string) => void;
}

const PermissionPanel: Component<PermissionPanelProps> = (props) => {
  const command = () => {
    // The actual command is in metadata.command or the first pattern
    const meta = props.permission.metadata;
    return (meta?.command as string) || props.permission.patterns?.[0] || "";
  };

  const toolName = () => props.permission.permission || "Tool";

  const alwaysPattern = () => {
    const a = props.permission.always;
    if (!a || a.length === 0) return null;
    return a.join(", ");
  };

  return (
    <div class="bg-surface border border-warning/30 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div class="px-4 py-3 bg-warning/10 border-b border-warning/20 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <FiShield class="w-5 h-5 text-warning" />
          <span class="font-semibold text-text">Permission required</span>
          <span class="text-xs text-text-muted px-2 py-0.5 bg-surface-2 rounded-full">{toolName()}</span>
        </div>
      </div>

      {/* Command details */}
      <div class="p-4 space-y-3">
        <Show when={command()}>
          <div class="bg-background border border-border rounded-lg p-3">
            <code class="text-sm font-mono text-text break-all">{command()}</code>
          </div>
        </Show>

        <Show when={alwaysPattern()}>
          <p class="text-xs text-text-muted">
            Always allow pattern: <code class="px-1 py-0.5 bg-surface-2 rounded text-text-secondary">{alwaysPattern()}</code>
          </p>
        </Show>
      </div>

      {/* Actions */}
      <div class="px-4 py-3 bg-surface-2 border-t border-border flex items-center justify-end gap-2">
        <button
          onClick={() => props.onDeny(props.permission.id)}
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-error bg-error/10 hover:bg-error/20 border border-error/20 rounded-lg transition-colors cursor-pointer"
        >
          <FiX class="w-4 h-4" />
          Deny
        </button>
        <button
          onClick={() => props.onAlwaysAllow(props.permission.id)}
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-text-secondary bg-surface hover:bg-surface-hover border border-border rounded-lg transition-colors cursor-pointer"
          title={alwaysPattern() ? `Auto-approve future commands matching: ${alwaysPattern()}` : "Auto-approve similar commands"}
        >
          <FiRepeat class="w-4 h-4" />
          Always Allow
        </button>
        <button
          onClick={() => props.onAllow(props.permission.id)}
          class="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-lg transition-colors cursor-pointer"
        >
          <FiCheck class="w-4 h-4" />
          Allow Once
        </button>
      </div>
    </div>
  );
};

export default PermissionPanel;
