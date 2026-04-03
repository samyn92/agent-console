import { type JSX, type Component, createSignal, Show } from "solid-js";

// =============================================================================
// TYPES
// =============================================================================

export type PanelSide = "left" | "right";

interface ResizablePanelProps {
  /** Which side of the layout this panel is on */
  side: PanelSide;
  /** Current width in pixels */
  width: number;
  /** Minimum width in pixels */
  minWidth: number;
  /** Maximum width in pixels */
  maxWidth: number;
  /** Whether the panel is collapsed */
  collapsed: boolean;
  /** Called when user drags the resize handle */
  onResize: (width: number) => void;
  /** Called when user double-clicks the resize handle to toggle collapse */
  onToggleCollapse: () => void;
  /** Panel content */
  children: JSX.Element;
}

// =============================================================================
// COMPONENT
// =============================================================================

const ResizablePanel: Component<ResizablePanelProps> = (props) => {
  const [isResizing, setIsResizing] = createSignal(false);

  // --- Mouse resize ---
  const startResize = (e: MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = props.width;

    const onMouseMove = (e: MouseEvent) => {
      const delta = props.side === "left"
        ? e.clientX - startX
        : startX - e.clientX;
      const newWidth = Math.max(props.minWidth, Math.min(props.maxWidth, startWidth + delta));
      props.onResize(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  // --- Touch resize ---
  const startTouchResize = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    setIsResizing(true);

    const startX = e.touches[0].clientX;
    const startWidth = props.width;

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const delta = props.side === "left"
        ? e.touches[0].clientX - startX
        : startX - e.touches[0].clientX;
      const newWidth = Math.max(props.minWidth, Math.min(props.maxWidth, startWidth + delta));
      props.onResize(newWidth);
    };

    const onTouchEnd = () => {
      setIsResizing(false);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchEnd);
  };

  const handleDoubleClick = () => {
    props.onToggleCollapse();
  };

  // Resize handle position based on panel side
  const handleClasses = () => {
    const base = "absolute top-0 h-full cursor-col-resize panel-resize-handle z-10";
    const activeClass = isResizing() ? "active" : "";
    if (props.side === "left") {
      return `${base} ${activeClass} right-0 w-[3px]`;
    }
    return `${base} ${activeClass} left-0 w-[3px]`;
  };

  return (
    <Show when={!props.collapsed}>
      <aside
        class={`relative flex flex-col h-full shrink-0 bg-surface ${
          props.side === "left" ? "border-r border-border" : "border-l border-border"
        }`}
        style={{ width: `${props.width}px` }}
      >
        {props.children}

        {/* Resize handle — wider touch area on touch devices */}
        <div
          class={handleClasses()}
          onMouseDown={startResize}
          onTouchStart={startTouchResize}
          onDblClick={handleDoubleClick}
          style={{ "touch-action": "none" }}
        />
      </aside>
    </Show>
  );
};

export default ResizablePanel;
