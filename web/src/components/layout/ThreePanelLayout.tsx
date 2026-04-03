import { type JSX, type Component, Show, createEffect, onCleanup } from "solid-js";
import { FiSidebar } from "solid-icons/fi";
import ResizablePanel from "./ResizablePanel";
import { panelStore, PANEL_DEFAULTS } from "../../stores/panelStore";
import { mobileStore } from "../../stores/mobileStore";

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
  // Close drawer on Escape key
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && mobileStore.state.drawerOpen) {
      mobileStore.closeDrawer();
    }
  };

  createEffect(() => {
    if (mobileStore.state.isMobile) {
      document.addEventListener("keydown", handleKeyDown);
    } else {
      document.removeEventListener("keydown", handleKeyDown);
    }
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  // Lock body scroll when drawer is open on mobile
  createEffect(() => {
    if (mobileStore.state.isMobile && mobileStore.state.drawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  });

  return (
    <div class="flex h-screen bg-background text-text overflow-hidden">
      {/* ========== DESKTOP: LEFT PANEL (resizable sidebar) ========== */}
      <Show when={!mobileStore.state.isMobile}>
        <Show
          when={!panelStore.state.leftCollapsed}
          fallback={
            /* Collapsed strip — narrow bar with expand button */
            <aside class="flex flex-col items-center justify-end shrink-0 border-r border-border bg-surface h-full py-2 w-10">
              <button
                onClick={panelStore.toggleLeft}
                class="p-1.5 text-text-muted hover:text-text hover:bg-surface-hover rounded-md transition-colors cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <FiSidebar class="w-4 h-4" />
              </button>
            </aside>
          }
        >
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
        </Show>
      </Show>

      {/* ========== MOBILE: DRAWER OVERLAY ========== */}
      <Show when={mobileStore.state.isMobile}>
        {/* Backdrop */}
        <div
          class={`mobile-drawer-backdrop ${mobileStore.state.drawerOpen ? "open" : ""}`}
          onClick={() => mobileStore.closeDrawer()}
          aria-hidden="true"
        />

        {/* Drawer panel */}
        <aside
          class={`mobile-drawer ${mobileStore.state.drawerOpen ? "open" : ""}`}
          role="dialog"
          aria-modal={mobileStore.state.drawerOpen}
          aria-label="Navigation drawer"
        >
          {props.left}
        </aside>
      </Show>

      {/* ========== CENTER (flex-1) ========== */}
      <div class={`flex-1 flex flex-col min-w-0 ${mobileStore.state.isMobile && !mobileStore.state.keyboardVisible ? "mobile-bottom-spacing" : ""}`}>
        {props.center}
      </div>
    </div>
  );
};

export default TwoPanelLayout;
