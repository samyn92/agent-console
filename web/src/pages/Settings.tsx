import type { Component } from "solid-js";
import { createSignal, createEffect, For, Show } from "solid-js";
import { 
  FiMoon, FiSun, FiMonitor,
  FiCheck, FiTrash2, FiInfo
} from "solid-icons/fi";
import { themeStore } from "../stores/theme";

// Settings store (in a real app, this would persist to localStorage or API)
const [settings, setSettings] = createSignal({
  defaultNamespace: "",
  refreshInterval: 30,
  showSystemPrompts: true,
  compactMode: false,
});

// Section component
const SettingsSection: Component<{
  title: string;
  description?: string;
  children: any;
}> = (props) => (
  <div class="bg-surface border border-border rounded-xl p-5 mb-6 transition-colors duration-200">
    <h2 class="text-lg font-semibold text-text mb-1">{props.title}</h2>
    <Show when={props.description}>
      <p class="text-sm text-text-secondary mb-4">{props.description}</p>
    </Show>
    <div class="space-y-4">{props.children}</div>
  </div>
);

// Toggle component
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

// Radio option component
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

// Select component
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

const SettingsPage: Component = () => {
  const { themePreference, setThemePreference } = themeStore;
  const [saved, setSaved] = createSignal(false);

  const saveSettings = () => {
    // In a real app, save to localStorage or API
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
    // Clear any cached data
    localStorage.removeItem("agent-console-cache");
    window.location.reload();
  };

  return (
    <div class="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div class="flex items-center justify-between mb-8">
        <div>
          <h1 class="text-2xl font-semibold text-text">Settings</h1>
          <p class="text-text-secondary mt-1">Configure your console preferences</p>
        </div>
        <button
          onClick={saveSettings}
          class={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
            saved()
              ? "bg-success text-white"
              : "bg-primary hover:bg-primary-hover text-primary-foreground shadow-sm"
          }`}
        >
          {saved() ? (
            <>
              <FiCheck class="w-4 h-4" />
              Saved
            </>
          ) : (
            "Save Changes"
          )}
        </button>
      </div>

      {/* Appearance */}
      <SettingsSection
        title="Appearance"
        description="Customize how the console looks"
      >
        <p class="text-sm text-text-secondary mb-3">Theme</p>
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

        <div class="mt-4 pt-4 border-t border-border">
          <Toggle
            label="Compact Mode"
            description="Show more items with reduced spacing"
            checked={settings().compactMode}
            onChange={(v) => setSettings({ ...settings(), compactMode: v })}
          />
        </div>
      </SettingsSection>

      {/* Data & Refresh */}
      <SettingsSection
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
      </SettingsSection>

      {/* Display */}
      <SettingsSection
        title="Display Options"
        description="Control what information is shown"
      >
        <Toggle
          label="Show System Prompts"
          description="Display full system prompts on agent detail pages"
          checked={settings().showSystemPrompts}
          onChange={(v) => setSettings({ ...settings(), showSystemPrompts: v })}
        />
      </SettingsSection>

      {/* Danger Zone */}
      <SettingsSection title="Danger Zone">
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
      </SettingsSection>

      {/* Version Info */}
      <div class="flex items-center gap-2 text-xs text-text-muted mt-8">
        <FiInfo class="w-3.5 h-3.5" />
        <span>Agent Operator Console v0.1.0</span>
      </div>
    </div>
  );
};

export default SettingsPage;
