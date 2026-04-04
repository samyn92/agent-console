import { createSignal, createRoot } from "solid-js";

// ---------------------------------------------------------------------------
// Persisted UI settings (localStorage-backed)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "agent-console-ui-settings";

interface UiSettings {
  /** Last selected agent key ("namespace/name") -- restored on page load */
  selectedAgent: string | null;
  /** Show the resource browser panel in the left sidebar (in addition to the composer popover) */
  sidebarBrowser: boolean;
  /** Per-tool default expansion state. Key = tool name, value = "expanded" | "collapsed" */
  toolExpansionDefaults: Record<string, "expanded" | "collapsed">;
  /** Show the system prompt section in the agent sidebar */
  showSystemPrompts: boolean;
}

const DEFAULTS: UiSettings = {
  selectedAgent: null,
  sidebarBrowser: false,
  toolExpansionDefaults: {},
  showSystemPrompts: true,
};

function loadSettings(): UiSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...DEFAULTS };
}

function persist(settings: UiSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function createSettingsStore() {
  const [settings, setSettingsRaw] = createSignal<UiSettings>(loadSettings());

  const update = (patch: Partial<UiSettings>) => {
    const next = { ...settings(), ...patch };
    setSettingsRaw(next);
    persist(next);
  };

  return {
    /** Read-only accessor for the full settings object */
    settings,

    // -- sidebar resource browser --
    sidebarBrowser: () => settings().sidebarBrowser,
    setSidebarBrowser: (v: boolean) => update({ sidebarBrowser: v }),

    // -- show system prompts --
    showSystemPrompts: () => settings().showSystemPrompts,
    setShowSystemPrompts: (v: boolean) => update({ showSystemPrompts: v }),

    // -- selected agent persistence --
    selectedAgent: () => settings().selectedAgent,
    setSelectedAgent: (key: string | null) => update({ selectedAgent: key }),

    // -- per-tool expansion defaults --
    toolExpansionDefaults: () => settings().toolExpansionDefaults,
    setToolExpansionDefault: (toolName: string, state: "expanded" | "collapsed") => {
      const current = { ...settings().toolExpansionDefaults };
      current[toolName] = state;
      update({ toolExpansionDefaults: current });
    },
    /** Batch-set all known tools to the same state */
    setAllToolExpansionDefaults: (tools: string[], state: "expanded" | "collapsed") => {
      const current = { ...settings().toolExpansionDefaults };
      for (const t of tools) current[t] = state;
      update({ toolExpansionDefaults: current });
    },
  };
}

export const settingsStore = createRoot(createSettingsStore);
