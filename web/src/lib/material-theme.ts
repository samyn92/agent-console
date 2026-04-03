/**
 * Material You (MD3) dynamic color theme generator.
 *
 * Uses Google's @material/material-color-utilities to generate a full
 * color scheme from a single seed hex color, then maps it to our app's
 * existing CSS custom properties (--bg-main, --text-main, --primary, etc.).
 *
 * This means **zero** component changes are needed — the same Tailwind
 * utility classes (bg-background, text-text, border-border, etc.) pick up
 * the Material You palette automatically.
 */

import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
  TonalPalette,
} from "@material/material-color-utilities";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaterialColors {
  /** Raw CSS property map, e.g. { "--bg-main": "#1c1b1f", ... } */
  light: Record<string, string>;
  dark: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get a hex color at a specific tone (0=black, 100=white) from a TonalPalette */
function tone(palette: TonalPalette, t: number): string {
  return hexFromArgb(palette.tone(t));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a complete set of CSS custom property values for both light and
 * dark modes from a single hex seed color.
 *
 * The returned property names match the raw variables defined in index.css
 * (:root / :root.dark), so setting them on documentElement overrides the
 * Vercel theme with Material You colors.
 */
export function generateMaterialTheme(seedHex: string): MaterialColors {
  const theme = themeFromSourceColor(argbFromHex(seedHex));

  // Extract the 5 tonal palettes (already TonalPalette instances)
  const primary = theme.palettes.primary;
  const tertiary = theme.palettes.tertiary;
  const neutral = theme.palettes.neutral;
  const neutralVariant = theme.palettes.neutralVariant;
  const error = theme.palettes.error;

  // ------------------------------------------------------------------
  // LIGHT MODE — MD3 light scheme mapped to our semantic tokens
  // ------------------------------------------------------------------
  const light: Record<string, string> = {
    // Surfaces
    "--bg-main": tone(neutral, 99),            // surface — near-white
    "--bg-secondary": tone(neutral, 96),       // surface-container-low
    "--bg-tertiary": tone(neutral, 94),        // surface-container
    "--bg-hover": tone(neutral, 90),           // surface-container-high

    // Borders
    "--border-main": tone(neutralVariant, 87), // outline-variant
    "--border-hover": tone(neutralVariant, 50),// outline
    "--border-subtle": tone(neutral, 92),      // surface-container-low edge

    // Text
    "--text-main": tone(neutral, 10),          // on-surface
    "--text-secondary": tone(neutralVariant, 30), // on-surface-variant
    "--text-muted": tone(neutralVariant, 50),  // muted

    // Primary action
    "--primary": tone(primary, 40),            // primary
    "--primary-foreground": tone(primary, 100),// on-primary
    "--primary-hover": tone(primary, 30),      // primary pressed
    "--primary-light": tone(primary, 95),      // primary-container light

    // Status colors — derived from error palette + fixed semantic hues
    "--success": "#2e7d32",                    // green-700 (not derived from seed)
    "--warning": "#f9a825",                    // amber-700
    "--error": tone(error, 40),                // MD3 error
    "--info": tone(tertiary, 40),              // use tertiary as info

    // Accent (interactive highlights, focus rings, etc.)
    "--accent": tone(primary, 40),
    "--accent-muted": tone(primary, 40) + "20",// 12% opacity
  };

  // ------------------------------------------------------------------
  // DARK MODE — MD3 dark scheme mapped to our semantic tokens
  // ------------------------------------------------------------------
  const dark: Record<string, string> = {
    // Surfaces
    "--bg-main": tone(neutral, 6),             // surface — very dark
    "--bg-secondary": tone(neutral, 10),       // surface-container-low
    "--bg-tertiary": tone(neutral, 17),        // surface-container
    "--bg-hover": tone(neutral, 22),           // surface-container-high

    // Borders
    "--border-main": tone(neutralVariant, 30), // outline-variant (dark)
    "--border-hover": tone(neutralVariant, 60),// outline
    "--border-subtle": tone(neutral, 15),      // subtle edge

    // Text
    "--text-main": tone(neutral, 90),          // on-surface
    "--text-secondary": tone(neutralVariant, 80), // on-surface-variant
    "--text-muted": tone(neutralVariant, 60),  // muted

    // Primary action
    "--primary": tone(primary, 80),            // primary (dark mode)
    "--primary-foreground": tone(primary, 20), // on-primary
    "--primary-hover": tone(primary, 70),      // primary pressed
    "--primary-light": tone(primary, 30),      // primary-container dark

    // Status
    "--success": "#66bb6a",
    "--warning": "#ffca28",
    "--error": tone(error, 80),
    "--info": tone(tertiary, 80),

    // Accent
    "--accent": tone(primary, 80),
    "--accent-muted": tone(primary, 80) + "18",
  };

  return { light, dark };
}

/**
 * Apply a Material You color map to the document root.
 * Pass either `colors.light` or `colors.dark`.
 */
export function applyMaterialColors(
  colors: Record<string, string>,
  element: HTMLElement = document.documentElement
): void {
  for (const [prop, value] of Object.entries(colors)) {
    element.style.setProperty(prop, value);
  }
}

/**
 * Remove all Material You inline styles from the document root,
 * allowing the CSS-defined Vercel theme to take over again.
 */
export function clearMaterialColors(
  element: HTMLElement = document.documentElement
): void {
  const props = [
    "--bg-main", "--bg-secondary", "--bg-tertiary", "--bg-hover",
    "--border-main", "--border-hover", "--border-subtle",
    "--text-main", "--text-secondary", "--text-muted",
    "--primary", "--primary-foreground", "--primary-hover", "--primary-light",
    "--success", "--warning", "--error", "--info",
    "--accent", "--accent-muted",
  ];
  for (const prop of props) {
    element.style.removeProperty(prop);
  }
}

/** Default Material You seed color: Google's classic purple */
export const DEFAULT_SEED_COLOR = "#6750A4";
