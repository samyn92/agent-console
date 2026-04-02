import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";

// =============================================================================
// TYPES
// =============================================================================

export interface PanelState {
  /** Left panel width in pixels */
  leftWidth: number;
  /** Right panel width in pixels */
  rightWidth: number;
  /** Whether the left panel is collapsed */
  leftCollapsed: boolean;
  /** Whether the right panel is collapsed */
  rightCollapsed: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const PANEL_DEFAULTS = {
  leftWidth: 380,
  rightWidth: 340,
  leftMin: 240,
  leftMax: 560,
  rightMin: 260,
  rightMax: 560,
} as const;

const STORAGE_KEY = "agent-console-panels";

// =============================================================================
// STORE
// =============================================================================

function createPanelStore() {
  // Load persisted state from localStorage
  const loadState = (): Partial<PanelState> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  const persisted = loadState();

  const [state, setState] = createStore<PanelState>({
    leftWidth: persisted.leftWidth ?? PANEL_DEFAULTS.leftWidth,
    rightWidth: persisted.rightWidth ?? PANEL_DEFAULTS.rightWidth,
    leftCollapsed: persisted.leftCollapsed ?? false,
    rightCollapsed: persisted.rightCollapsed ?? false,
  });

  // Persist to localStorage
  const persist = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        leftWidth: state.leftWidth,
        rightWidth: state.rightWidth,
        leftCollapsed: state.leftCollapsed,
        rightCollapsed: state.rightCollapsed,
      }));
    } catch {
      // ignore
    }
  };

  // Actions
  const setLeftWidth = (width: number) => {
    const clamped = Math.max(PANEL_DEFAULTS.leftMin, Math.min(PANEL_DEFAULTS.leftMax, width));
    setState("leftWidth", clamped);
    persist();
  };

  const setRightWidth = (width: number) => {
    const clamped = Math.max(PANEL_DEFAULTS.rightMin, Math.min(PANEL_DEFAULTS.rightMax, width));
    setState("rightWidth", clamped);
    persist();
  };

  const toggleLeft = () => {
    setState("leftCollapsed", !state.leftCollapsed);
    persist();
  };

  const toggleRight = () => {
    setState("rightCollapsed", !state.rightCollapsed);
    persist();
  };

  const setLeftCollapsed = (collapsed: boolean) => {
    setState("leftCollapsed", collapsed);
    persist();
  };

  const setRightCollapsed = (collapsed: boolean) => {
    setState("rightCollapsed", collapsed);
    persist();
  };

  return {
    state,
    setLeftWidth,
    setRightWidth,
    toggleLeft,
    toggleRight,
    setLeftCollapsed,
    setRightCollapsed,
  };
}

export const panelStore = createRoot(createPanelStore);
