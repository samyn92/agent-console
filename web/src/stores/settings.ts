import { createSignal, createRoot } from "solid-js";

// ---------------------------------------------------------------------------
// Persisted UI settings (localStorage-backed)
// ---------------------------------------------------------------------------

const STORAGE_KEY = "agent-console-ui-settings";

interface UiSettings {
  /** Compact mode: collapse tool cards (only errors expanded) */
  compactMode: boolean;
  /** Last selected agent key ("namespace/name") — restored on page load */
  selectedAgent: string | null;
}

const DEFAULTS: UiSettings = {
  compactMode: false,
  selectedAgent: null,
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

    // -- compact mode --
    compactMode: () => settings().compactMode,
    setCompactMode: (v: boolean) => update({ compactMode: v }),

    // -- selected agent persistence --
    selectedAgent: () => settings().selectedAgent,
    setSelectedAgent: (key: string | null) => update({ selectedAgent: key }),
  };
}

export const settingsStore = createRoot(createSettingsStore);
