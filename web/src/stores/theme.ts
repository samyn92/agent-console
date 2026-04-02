import { createSignal, createEffect, createRoot } from "solid-js";

type Theme = "dark" | "light" | "system";

const getSystemTheme = (): "dark" | "light" => {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const getInitialTheme = (): Theme => {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("agent-console-theme") as Theme;
  return stored || "system";
};

function createThemeStore() {
  const [themePreference, setThemePreference] = createSignal<Theme>(getInitialTheme());
  const [currentTheme, setCurrentTheme] = createSignal<"dark" | "light">("dark");

  createEffect(() => {
    const pref = themePreference();
    const system = getSystemTheme();
    const effectiveTheme = pref === "system" ? system : pref;
    
    setCurrentTheme(effectiveTheme);
    localStorage.setItem("agent-console-theme", pref);
    
    const root = document.documentElement;
    if (effectiveTheme === "dark") {
      root.classList.add("dark");
      root.style.colorScheme = "dark";
    } else {
      root.classList.remove("dark");
      root.style.colorScheme = "light";
    }
  });

  // Listen for system theme changes
  if (typeof window !== "undefined") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (themePreference() === "system") {
        setCurrentTheme(mediaQuery.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handleChange);
  }

  return { themePreference, setThemePreference, currentTheme };
}

export const themeStore = createRoot(createThemeStore);
