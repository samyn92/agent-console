import { createSignal, createEffect, createRoot } from "solid-js";
import {
  generateMaterialTheme,
  applyMaterialColors,
  clearMaterialColors,
  DEFAULT_SEED_COLOR,
} from "../lib/material-theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ThemeMode = "dark" | "light" | "system";
export type DesignTheme = "vercel" | "material";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getSystemTheme = (): "dark" | "light" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const getInitialTheme = (): ThemeMode => {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("agent-console-theme") as ThemeMode;
  return stored || "system";
};

const getInitialDesignTheme = (): DesignTheme => {
  if (typeof window === "undefined") return "vercel";
  const stored = localStorage.getItem("agent-console-design-theme") as DesignTheme;
  return stored === "material" ? "material" : "vercel";
};

const getInitialAccentColor = (): string => {
  if (typeof window === "undefined") return DEFAULT_SEED_COLOR;
  return localStorage.getItem("agent-console-accent-color") || DEFAULT_SEED_COLOR;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function createThemeStore() {
  const [themePreference, setThemePreference] = createSignal<ThemeMode>(getInitialTheme());
  const [currentTheme, setCurrentTheme] = createSignal<"dark" | "light">("dark");
  const [designTheme, setDesignTheme] = createSignal<DesignTheme>(getInitialDesignTheme());
  const [accentColor, setAccentColor] = createSignal<string>(getInitialAccentColor());

  // Cache the generated material palette to avoid regenerating on every effect run
  let materialCache: { seed: string; colors: ReturnType<typeof generateMaterialTheme> } | null = null;

  const getMaterialColors = (seed: string) => {
    if (materialCache && materialCache.seed === seed) return materialCache.colors;
    const colors = generateMaterialTheme(seed);
    materialCache = { seed, colors };
    return colors;
  };

  // Main effect: apply dark/light class + design theme CSS variables
  createEffect(() => {
    const pref = themePreference();
    const system = getSystemTheme();
    const effectiveTheme = pref === "system" ? system : pref;
    const design = designTheme();
    const accent = accentColor();

    setCurrentTheme(effectiveTheme);

    // Persist preferences
    localStorage.setItem("agent-console-theme", pref);
    localStorage.setItem("agent-console-design-theme", design);
    localStorage.setItem("agent-console-accent-color", accent);

    // Apply dark/light class on root
    const root = document.documentElement;
    if (effectiveTheme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }

    // Apply or clear Material You colors
    const colors = getMaterialColors(accent);
    const currentColors = effectiveTheme === "dark" ? colors.dark : colors.light;

    if (design === "material") {
      applyMaterialColors(currentColors, root);
      root.classList.add("material");
    } else {
      clearMaterialColors(root);
      root.classList.remove("material");
      root.style.setProperty("--accent", currentColors["--accent"]);
      root.style.setProperty("--accent-muted", currentColors["--accent-muted"]);
      root.style.setProperty("--primary", currentColors["--primary"]);
      root.style.setProperty("--primary-hover", currentColors["--primary-hover"]);
      root.style.setProperty("--primary-light", currentColors["--primary-light"]);
      root.style.setProperty("--primary-foreground", currentColors["--primary-foreground"]);
      root.style.setProperty("--success", currentColors["--success"]);
      root.style.setProperty("--warning", currentColors["--warning"]);
      root.style.setProperty("--error", currentColors["--error"]);
      root.style.setProperty("--info", currentColors["--info"]);
    }
  });

  // Listen for system theme changes
  if (typeof window !== "undefined") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (themePreference() === "system") {
        const system = mediaQuery.matches ? "dark" : "light";
        setCurrentTheme(system);

        // Toggle the dark class + colorScheme (the main effect won't re-run
        // because getSystemTheme() is not a tracked reactive signal)
        const root = document.documentElement;
        if (system === "dark") {
          root.classList.add("dark");
          root.style.colorScheme = "dark";
        } else {
          root.classList.remove("dark");
          root.style.colorScheme = "light";
        }

        // Reapply Material colors for the new effective theme
        const colors = getMaterialColors(accentColor());
        const currentColors = system === "dark" ? colors.dark : colors.light;
        if (designTheme() === "material") {
          applyMaterialColors(currentColors, root);
        } else {
          clearMaterialColors(root);
          root.style.setProperty("--accent", currentColors["--accent"]);
          root.style.setProperty("--accent-muted", currentColors["--accent-muted"]);
          root.style.setProperty("--primary", currentColors["--primary"]);
          root.style.setProperty("--primary-hover", currentColors["--primary-hover"]);
          root.style.setProperty("--primary-light", currentColors["--primary-light"]);
          root.style.setProperty("--primary-foreground", currentColors["--primary-foreground"]);
          root.style.setProperty("--success", currentColors["--success"]);
          root.style.setProperty("--warning", currentColors["--warning"]);
          root.style.setProperty("--error", currentColors["--error"]);
          root.style.setProperty("--info", currentColors["--info"]);
        }
      }
    };
    mediaQuery.addEventListener("change", handleChange);
  }

  return {
    themePreference,
    setThemePreference,
    currentTheme,
    designTheme,
    setDesignTheme,
    accentColor,
    setAccentColor,
  };
}

export const themeStore = createRoot(createThemeStore);
