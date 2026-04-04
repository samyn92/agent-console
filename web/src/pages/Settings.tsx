import type { Component } from "solid-js";
import { createSignal, createEffect, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import {
  FiMoon, FiSun, FiMonitor,
  FiCheck, FiTrash2, FiInfo,
  FiArrowLeft, FiSliders, FiEye, FiDatabase, FiAlertTriangle,
  FiSidebar, FiMenu,
} from "solid-icons/fi";
import { themeStore } from "../stores/theme";
import { settingsStore } from "../stores/settings";
import { panelStore } from "../stores/panelStore";
import { mobileStore } from "../stores/mobileStore";
import TwoPanelLayout from "../components/layout/ThreePanelLayout";

// =============================================================================
// LOCAL SETTINGS (persisted separately via Save button)
// =============================================================================

const [settings, setSettings] = createSignal({
  defaultNamespace: "",
  refreshInterval: 30,
  showSystemPrompts: true,
});

// =============================================================================
// SECTION NAVIGATION
// =============================================================================

type SettingsSectionId = "appearance" | "data" | "display" | "danger";

const SECTIONS: { id: SettingsSectionId; label: string; icon: Component<{ class?: string }> }[] = [
  { id: "appearance", label: "Appearance", icon: FiSliders },
  { id: "data", label: "Data & Refresh", icon: FiDatabase },
  { id: "display", label: "Display", icon: FiEye },
  { id: "danger", label: "Danger Zone", icon: FiAlertTriangle },
];

// =============================================================================
// REUSABLE SUB-COMPONENTS
// =============================================================================

const SettingsCard: Component<{
  id: string;
  title: string;
  description?: string;
  children: any;
}> = (props) => (
  <div
    id={props.id}
    class="bg-surface border border-border rounded-xl p-5 mb-6 transition-colors duration-200 scroll-mt-6"
  >
    <h2 class="text-lg font-semibold text-text mb-1">{props.title}</h2>
    <Show when={props.description}>
      <p class="text-sm text-text-secondary mb-4">{props.description}</p>
    </Show>
    <div class="space-y-4">{props.children}</div>
  </div>
);

const Toggle: Component<{
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = (props) => (
  <div class="flex items-center justify-between py-2">
    <div>
      <p class="text-sm font-semibold text-text">{props.label}</p>
      <Show when={props.description}>
        <p class="text-xs text-text-secondary mt-0.5">{props.description}</p>
      </Show>
    </div>
    <button
      onClick={() => props.onChange(!props.checked)}
      class={`relative w-11 h-6 rounded-full transition-colors ${
        props.checked ? "bg-primary" : "bg-surface-hover"
      }`}
    >
      <span
        class={`absolute top-1 left-1 w-4 h-4 rounded-full shadow-sm transition-transform ${
          props.checked ? "bg-primary-foreground translate-x-5" : "bg-white"
        }`}
      />
    </button>
  </div>
);

const RadioOption: Component<{
  label: string;
  description?: string;
  icon?: any;
  selected: boolean;
  onClick: () => void;
}> = (props) => (
  <button
    onClick={props.onClick}
    class={`flex items-center gap-3 p-3 rounded-lg border transition-all w-full text-left ${
      props.selected
        ? "border-primary bg-primary/10"
        : "border-border hover:border-border-hover hover:bg-surface-hover"
    }`}
  >
    <Show when={props.icon}>
      <span class={props.selected ? "text-primary" : "text-text-secondary"}>
        {props.icon}
      </span>
    </Show>
    <div class="flex-1">
      <p class={`text-sm font-semibold ${props.selected ? "text-primary" : "text-text"}`}>
        {props.label}
      </p>
      <Show when={props.description}>
        <p class="text-xs text-text-muted">{props.description}</p>
      </Show>
    </div>
    <Show when={props.selected}>
      <FiCheck class="w-4 h-4 text-primary" />
    </Show>
  </button>
);

const Select: Component<{
  label: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string) => void;
}> = (props) => (
  <div class="flex items-center justify-between py-2">
    <span class="text-sm font-semibold text-text">{props.label}</span>
    <select
      value={props.value}
      onChange={(e) => props.onChange(e.currentTarget.value)}
      class="px-3 py-1.5 bg-surface-hover border border-border rounded-lg text-sm text-text focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent"
    >
      <For each={props.options}>
        {(opt) => <option value={opt.value}>{opt.label}</option>}
      </For>
    </select>
  </div>
);

// Accent color presets
const ACCENT_PRESETS = [
  { color: "#ffffff", label: "Vercel (Default)" },
  { color: "#0070F3", label: "Vercel Blue" },
  { color: "#171717", label: "Neutral" },
  { color: "#6750A4", label: "Purple" },
  { color: "#006A6A", label: "Teal" },
  { color: "#0061A4", label: "Blue" },
  { color: "#7D5260", label: "Rose" },
  { color: "#006E1C", label: "Green" },
  { color: "#A8400D", label: "Orange" },
  { color: "#904B40", label: "Brown" },
  { color: "#006874", label: "Cyan" },
];

// =============================================================================
// SETTINGS PAGE
// =============================================================================

const SettingsPage: Component = () => {
  const {
    themePreference, setThemePreference,
    designTheme, setDesignTheme,
    accentColor, setAccentColor,
  } = themeStore;

  const [saved, setSaved] = createSignal(false);
  const [activeSection, setActiveSection] = createSignal<SettingsSectionId>("appearance");

  const saveSettings = () => {
    localStorage.setItem("agent-console-settings", JSON.stringify(settings()));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Load settings on mount
  createEffect(() => {
    const stored = localStorage.getItem("agent-console-settings");
    if (stored) {
      try {
        setSettings({ ...settings(), ...JSON.parse(stored) });
      } catch {
        // Ignore parse errors
      }
    }
  });

  const clearCache = () => {
    localStorage.removeItem("agent-console-cache");
    window.location.reload();
  };

  const scrollToSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    const el = document.getElementById(`settings-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Close drawer on mobile after selecting section
    if (mobileStore.state.isMobile) {
      mobileStore.closeDrawer();
    }
  };

  // =========================================================================
  // LEFT PANEL (sidebar)
  // =========================================================================
  const leftPanel = () => (
    <>
      {/* Header — back arrow + title */}
      <div class="shrink-0 border-b border-border/60 px-3 py-3">
        <A
          href="/"
          class="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text transition-colors rounded-md px-1.5 py-1 -ml-1.5 hover:bg-surface-hover"
        >
          <FiArrowLeft class="w-4 h-4" />
          <span class="font-medium">Settings</span>
        </A>
      </div>

      {/* Section nav */}
      <nav class="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        <For each={SECTIONS}>
          {(section) => {
            const Icon = section.icon;
            return (
              <button
                onClick={() => scrollToSection(section.id)}
                class={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer ${
                  activeSection() === section.id
                    ? "bg-surface-hover text-text"
                    : "text-text-secondary hover:text-text hover:bg-surface-hover/60"
                }`}
              >
                <Icon class="w-4 h-4 shrink-0" />
                <span>{section.label}</span>
              </button>
            );
          }}
        </For>
      </nav>

      {/* Footer — matches MainApp sidebar footer */}
      <footer class="shrink-0 border-t border-border/60 bg-surface/50">
        <div class="flex items-center gap-1 px-2.5 py-2">
          {/* Panel toggle (desktop) / Close drawer (mobile) */}
          <Show
            when={!mobileStore.state.isMobile}
            fallback={
              <button
                onClick={() => mobileStore.closeDrawer()}
                class="p-1.5 text-text-muted/60 hover:text-text-secondary hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
                title="Close drawer"
                aria-label="Close navigation drawer"
              >
                <FiSidebar class="w-3.5 h-3.5" />
              </button>
            }
          >
            <button
              onClick={panelStore.toggleLeft}
              class="p-1.5 text-text-muted/60 hover:text-text-secondary hover:bg-surface-hover rounded-md transition-all duration-150 cursor-pointer"
              title="Toggle left panel"
              aria-label="Toggle left panel"
            >
              <FiSidebar class="w-3.5 h-3.5" />
            </button>
          </Show>
          <div class="flex-1" />
          <button
            onClick={saveSettings}
            class={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
              saved()
                ? "bg-success text-white"
                : "text-text-muted/70 hover:text-text-secondary hover:bg-surface-hover"
            }`}
          >
            {saved() ? (
              <>
                <FiCheck class="w-3.5 h-3.5" />
                <span>Saved</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </footer>
    </>
  );

  // =========================================================================
  // CENTER CONTENT
  // =========================================================================
  const centerContent = () => (
    <>
      {/* Mobile header bar */}
      <Show when={mobileStore.state.isMobile}>
        <header class="mobile-header shrink-0 flex items-center gap-3 px-3 py-2.5 border-b border-border bg-surface">
          <button
            onClick={() => mobileStore.openDrawer()}
            class="p-2 -ml-1 text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer touch-target"
            aria-label="Open navigation menu"
          >
            <FiMenu class="w-5 h-5" />
          </button>
          <div class="flex-1 min-w-0">
            <span class="text-sm font-medium text-text truncate">Settings</span>
          </div>
          <A
            href="/"
            class="p-2 -mr-1 text-text-secondary hover:text-text hover:bg-surface-hover rounded-lg transition-colors cursor-pointer touch-target"
            aria-label="Back to home"
          >
            <FiArrowLeft class="w-5 h-5" />
          </A>
        </header>
      </Show>

      {/* Scrollable settings content */}
      <div class="flex-1 overflow-y-auto">
        <div class="max-w-2xl mx-auto px-6 py-8">

          {/* ── Appearance ── */}
          <SettingsCard
            id="settings-appearance"
            title="Appearance"
            description="Customize how the console looks"
          >
            {/* Design Theme */}
            <div>
              <p class="text-sm text-text-secondary mb-3">Design Theme</p>
              <div class="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setDesignTheme("vercel")}
                  class={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                    designTheme() === "vercel"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border-hover hover:bg-surface-hover"
                  }`}
                >
                  {/* Vercel preview */}
                  <div class="w-full h-20 rounded-lg overflow-hidden border border-border/50">
                    <div class="h-full flex flex-col">
                      <div class="h-3 bg-[#09090b] flex items-center gap-0.5 px-1">
                        <span class="w-1 h-1 rounded-full bg-[#ef4444]" />
                        <span class="w-1 h-1 rounded-full bg-[#eab308]" />
                        <span class="w-1 h-1 rounded-full bg-[#22c55e]" />
                      </div>
                      <div class="flex-1 flex">
                        <div class="w-1/4 bg-[#0c0c0e] border-r border-[#27272a]" />
                        <div class="flex-1 bg-[#09090b] p-1.5">
                          <div class="w-3/4 h-1 bg-[#27272a] rounded mb-1" />
                          <div class="w-1/2 h-1 bg-[#27272a] rounded mb-1" />
                          <div class="w-2/3 h-1 rounded" style={{ "background-color": "var(--accent-muted)" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="text-center">
                    <p class={`text-sm font-semibold ${designTheme() === "vercel" ? "text-primary" : "text-text"}`}>
                      Vercel
                    </p>
                    <p class="text-[11px] text-text-muted">Minimal & sharp</p>
                  </div>
                  <Show when={designTheme() === "vercel"}>
                    <span class="absolute top-2 right-2">
                      <FiCheck class="w-4 h-4 text-primary" />
                    </span>
                  </Show>
                </button>

                <button
                  onClick={() => setDesignTheme("material")}
                  class={`relative flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                    designTheme() === "material"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-border-hover hover:bg-surface-hover"
                  }`}
                >
                  {/* Material preview */}
                  <div class="w-full h-20 rounded-lg overflow-hidden border border-border/50">
                    <div class="h-full flex flex-col">
                      <div class="h-3 bg-[#1c1b1f] flex items-center px-1">
                        <div class="w-4 h-1 rounded-full" style={{ "background-color": "var(--primary)" }} />
                      </div>
                      <div class="flex-1 flex">
                        <div class="w-1/4 bg-[#1c1b1f] border-r border-[#49454f]" />
                        <div class="flex-1 bg-[#141218] p-1.5">
                          <div class="w-3/4 h-1 bg-[#49454f] rounded-full mb-1" />
                          <div class="w-1/2 h-1 bg-[#49454f] rounded-full mb-1" />
                          <div class="w-2/3 h-1 rounded-full" style={{ "background-color": "var(--accent-muted)" }} />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="text-center">
                    <p class={`text-sm font-semibold ${designTheme() === "material" ? "text-primary" : "text-text"}`}>
                      Material You
                    </p>
                    <p class="text-[11px] text-text-muted">Dynamic & expressive</p>
                  </div>
                  <Show when={designTheme() === "material"}>
                    <span class="absolute top-2 right-2">
                      <FiCheck class="w-4 h-4 text-primary" />
                    </span>
                  </Show>
                </button>
              </div>
            </div>

            {/* Accent Color */}
            <div class="mt-4 pt-4 border-t border-border">
              <div class="flex items-center justify-between mb-3">
                <div>
                  <p class="text-sm font-semibold text-text">Accent Color</p>
                  <p class="text-xs text-text-secondary mt-0.5">Pick a seed color for the system palette</p>
                </div>
                <div class="flex items-center gap-2">
                  <div
                    class="w-6 h-6 rounded-full border-2 border-border shadow-sm"
                    style={{ "background-color": accentColor() }}
                  />
                  <input
                    type="color"
                    value={accentColor()}
                    onInput={(e) => setAccentColor(e.currentTarget.value)}
                    class="w-8 h-8 cursor-pointer bg-transparent border-0 p-0"
                    title="Custom color"
                  />
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <For each={ACCENT_PRESETS}>
                  {(preset) => (
                    <button
                      onClick={() => setAccentColor(preset.color)}
                      class={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                        accentColor().toLowerCase() === preset.color.toLowerCase()
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-border-hover text-text-secondary hover:bg-surface-hover"
                      }`}
                    >
                      <span
                        class="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ "background-color": preset.color }}
                      />
                      {preset.label}
                    </button>
                  )}
                </For>
              </div>
              <button
                onClick={() => setAccentColor("#ffffff")}
                class="mt-2 text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Reset to default
              </button>
            </div>

            {/* Light/Dark Mode */}
            <div class="mt-4 pt-4 border-t border-border">
              <p class="text-sm text-text-secondary mb-3">Mode</p>
              <div class="grid grid-cols-3 gap-3">
                <RadioOption
                  label="Dark"
                  icon={<FiMoon class="w-4 h-4" />}
                  selected={themePreference() === "dark"}
                  onClick={() => setThemePreference("dark")}
                />
                <RadioOption
                  label="Light"
                  icon={<FiSun class="w-4 h-4" />}
                  selected={themePreference() === "light"}
                  onClick={() => setThemePreference("light")}
                />
                <RadioOption
                  label="System"
                  icon={<FiMonitor class="w-4 h-4" />}
                  selected={themePreference() === "system"}
                  onClick={() => setThemePreference("system")}
                />
              </div>
            </div>

            <div class="mt-4 pt-4 border-t border-border">
              <Toggle
                label="Compact Mode"
                description="Collapse tool cards by default; only errors stay expanded"
                checked={settingsStore.compactMode()}
                onChange={(v) => settingsStore.setCompactMode(v)}
              />
            </div>
          </SettingsCard>

          {/* ── Data & Refresh ── */}
          <SettingsCard
            id="settings-data"
            title="Data & Refresh"
            description="Configure how data is loaded and refreshed"
          >
            <Select
              label="Auto-refresh interval"
              value={settings().refreshInterval}
              options={[
                { value: 0, label: "Disabled" },
                { value: 10, label: "10 seconds" },
                { value: 30, label: "30 seconds" },
                { value: 60, label: "1 minute" },
                { value: 300, label: "5 minutes" },
              ]}
              onChange={(v) => setSettings({ ...settings(), refreshInterval: parseInt(v) })}
            />

            <div class="flex items-center justify-between py-2">
              <div>
                <p class="text-sm font-semibold text-text">Default Namespace</p>
                <p class="text-xs text-text-secondary mt-0.5">Filter resources by namespace</p>
              </div>
              <input
                type="text"
                value={settings().defaultNamespace}
                onInput={(e) => setSettings({ ...settings(), defaultNamespace: e.currentTarget.value })}
                placeholder="All namespaces"
                class="px-3 py-1.5 w-48 bg-surface-hover border border-border rounded-lg text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 focus:border-accent"
              />
            </div>
          </SettingsCard>

          {/* ── Display Options ── */}
          <SettingsCard
            id="settings-display"
            title="Display Options"
            description="Control what information is shown"
          >
            <Toggle
              label="Show System Prompts"
              description="Display full system prompts on agent detail pages"
              checked={settings().showSystemPrompts}
              onChange={(v) => setSettings({ ...settings(), showSystemPrompts: v })}
            />
            <Toggle
              label="Sidebar Resource Browser"
              description="Also show the resource browser panel in the left sidebar (always available in composer)"
              checked={settingsStore.sidebarBrowser()}
              onChange={(v) => settingsStore.setSidebarBrowser(v)}
            />
          </SettingsCard>

          {/* ── Danger Zone ── */}
          <SettingsCard id="settings-danger" title="Danger Zone">
            <div class="flex items-center justify-between py-2">
              <div>
                <p class="text-sm font-semibold text-text">Clear Cache</p>
                <p class="text-xs text-text-secondary mt-0.5">Clear locally cached data and reload</p>
              </div>
              <button
                onClick={clearCache}
                class="flex items-center gap-2 px-3 py-1.5 text-sm text-error hover:bg-error/10 rounded-lg transition-colors border border-transparent hover:border-error/20"
              >
                <FiTrash2 class="w-4 h-4" />
                Clear
              </button>
            </div>
          </SettingsCard>

          {/* Version Info */}
          <div class="flex items-center gap-2 text-xs text-text-muted mt-8">
            <FiInfo class="w-3.5 h-3.5" />
            <span>Agent Operator Console v0.1.0</span>
          </div>
        </div>
      </div>
    </>
  );

  // =========================================================================
  // RENDER
  // =========================================================================
  return <TwoPanelLayout left={leftPanel()} center={centerContent()} />;
};

export default SettingsPage;
