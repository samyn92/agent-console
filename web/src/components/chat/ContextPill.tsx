import type { Component } from "solid-js";
import { Show, Dynamic } from "solid-js/web";
import { FiX } from "solid-icons/fi";
import type { SelectedContext } from "../../types/context";
import { getContextLabel } from "./ContextBar";
import {
  KubernetesIcon,
  HelmIcon,
  GitHubIcon,
  GitLabIcon,
} from "../../lib/capability-themes";

// =============================================================================
// CONTEXT → ICON / COLOR MAPPING
// =============================================================================

interface ContextStyle {
  icon: Component<{ class?: string }>;
  pill: string; // Tailwind classes for the pill container
  iconClass: string; // Tailwind classes for the icon element
}

/** Default styles — for dark chat background (composer, sidebar, etc.) */
function getContextStyle(ctx: SelectedContext): ContextStyle {
  switch (ctx.type) {
    case "k8s-resource":
      return {
        icon: KubernetesIcon,
        pill: "bg-blue-500/10 border-blue-500/25 text-blue-400",
        iconClass: "text-blue-400",
      };
    case "helm-release":
      return {
        icon: HelmIcon,
        pill: "bg-cyan-500/10 border-cyan-500/25 text-cyan-400",
        iconClass: "text-cyan-400",
      };
    case "github-path":
      return {
        icon: GitHubIcon,
        pill: "bg-gray-500/10 border-gray-500/25 text-gray-300",
        iconClass: "text-gray-300",
      };
    case "gitlab-path":
      return {
        icon: GitLabIcon,
        pill: "bg-orange-500/10 border-orange-500/25 text-orange-400",
        iconClass: "text-orange-400",
      };
    default:
      return {
        icon: KubernetesIcon,
        pill: "bg-surface-2 border-border text-text-muted",
        iconClass: "text-text-muted",
      };
  }
}

/**
 * Styles for pills rendered ON the user message bubble (always white bg).
 * Use dark-on-light colors that work regardless of theme or accent color.
 */
function getContextStyleOnPrimary(ctx: SelectedContext): ContextStyle {
  switch (ctx.type) {
    case "k8s-resource":
      return {
        icon: KubernetesIcon,
        pill: "bg-gray-100 border-gray-200 text-gray-700",
        iconClass: "text-gray-500",
      };
    case "helm-release":
      return {
        icon: HelmIcon,
        pill: "bg-gray-100 border-gray-200 text-gray-700",
        iconClass: "text-gray-500",
      };
    case "github-path":
      return {
        icon: GitHubIcon,
        pill: "bg-gray-100 border-gray-200 text-gray-700",
        iconClass: "text-gray-500",
      };
    case "gitlab-path":
      return {
        icon: GitLabIcon,
        pill: "bg-gray-100 border-gray-200 text-gray-700",
        iconClass: "text-gray-500",
      };
    default:
      return {
        icon: KubernetesIcon,
        pill: "bg-gray-100 border-gray-200 text-gray-600",
        iconClass: "text-gray-400",
      };
  }
}

// =============================================================================
// CONTEXT PILL COMPONENT
// =============================================================================

export interface ContextPillProps {
  ctx: SelectedContext;
  /** When provided, shows a remove "x" button and calls this on click */
  onRemove?: (ctx: SelectedContext) => void;
  /** Compact mode for message bubbles (slightly smaller) */
  compact?: boolean;
  /** Use contrasting colors for rendering on bg-primary (user message bubble) */
  onPrimary?: boolean;
}

const ContextPill: Component<ContextPillProps> = (props) => {
  const style = () =>
    props.onPrimary ? getContextStyleOnPrimary(props.ctx) : getContextStyle(props.ctx);
  const label = () => getContextLabel(props.ctx);

  return (
    <span
      class={`inline-flex items-center gap-1 rounded-md border text-[11px] font-medium ${
        props.compact ? "pl-1.5 pr-1.5 py-px" : "pl-1.5 pr-1 py-0.5"
      } ${style().pill}`}
    >
      <Dynamic
        component={style().icon}
        class={`${props.compact ? "w-3 h-3" : "w-3.5 h-3.5"} shrink-0 ${style().iconClass}`}
      />
      <span class={`truncate ${props.compact ? "max-w-[120px]" : "max-w-[140px]"}`}>
        {label()}
      </span>
      <Show when={props.onRemove}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onRemove!(props.ctx);
          }}
          class="ml-0.5 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
          title="Remove from context"
        >
          <FiX class="w-2.5 h-2.5" />
        </button>
      </Show>
    </span>
  );
};

export default ContextPill;
