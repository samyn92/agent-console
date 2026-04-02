import { type JSX, type Component } from "solid-js";
import ResizablePanel from "./ResizablePanel";
import { panelStore, PANEL_DEFAULTS } from "../../stores/panelStore";

// =============================================================================
// TYPES
// =============================================================================

interface TwoPanelLayoutProps {
  /** Left panel content (agent selector, tabs, config, nav) */
  left: JSX.Element;
  /** Center content (chat tabs + chat interface) */
  center: JSX.Element;
}

// =============================================================================
// COMPONENT
// =============================================================================

const TwoPanelLayout: Component<TwoPanelLayoutProps> = (props) => {
  return (
    <div class="flex h-screen bg-background text-text overflow-hidden">
      {/* ========== LEFT PANEL ========== */}
      <ResizablePanel
        side="left"
        width={panelStore.state.leftWidth}
        minWidth={PANEL_DEFAULTS.leftMin}
        maxWidth={PANEL_DEFAULTS.leftMax}
        collapsed={panelStore.state.leftCollapsed}
        onResize={panelStore.setLeftWidth}
        onToggleCollapse={panelStore.toggleLeft}
      >
        {props.left}
      </ResizablePanel>

      {/* ========== CENTER (flex-1) ========== */}
      <div class="flex-1 flex flex-col min-w-0">
        {props.center}
      </div>
    </div>
  );
};

export default TwoPanelLayout;
