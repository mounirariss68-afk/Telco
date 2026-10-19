/* GENERATED FROM tokens.json -- DO NOT EDIT. Run scripts/build-tokens.mjs. */
// Portable design tokens (colors as hex). Web consumes the theme via
// src/index.css; mobile (Expo) and any other platform import this object so the
// whole product shares one source of truth.
export const tokens = {
  "color": {
    "light": {
      "background": "#FDFBF7",
      "foreground": "#102957",
      "border": "#CBD3E1",
      "card": "#FFFFFF",
      "cardForeground": "#102957",
      "popover": "#F4F5F9",
      "popoverForeground": "#102957",
      "primary": "#B5367C",
      "primaryForeground": "#FFFFFF",
      "secondary": "#6A4ED0",
      "secondaryForeground": "#FFFFFF",
      "muted": "#EEF0F5",
      "mutedForeground": "#506583",
      "accent": "#FF775D",
      "accentForeground": "#071936",
      "destructive": "#B91C1C",
      "destructiveForeground": "#FFFFFF",
      "input": "#CBD3E1",
      "ring": "#B5367C",
      "chart1": "#7659DF",
      "chart2": "#DB509E",
      "chart3": "#FF775D",
      "chart4": "#102957",
      "chart5": "#15803D",
      "sidebar": "#FFFFFF",
      "sidebarForeground": "#102957",
      "sidebarBorder": "#CBD3E1",
      "sidebarPrimary": "#B5367C",
      "sidebarPrimaryForeground": "#FFFFFF",
      "sidebarAccent": "#EEF0F5",
      "sidebarAccentForeground": "#102957",
      "sidebarRing": "#B5367C"
    },
    "dark": {
      "background": "#071936",
      "foreground": "#EEF1FA",
      "border": "#243B66",
      "card": "#0B2246",
      "cardForeground": "#EEF1FA",
      "popover": "#122B57",
      "popoverForeground": "#EEF1FA",
      "primary": "#E980BC",
      "primaryForeground": "#071936",
      "secondary": "#9A84EE",
      "secondaryForeground": "#071936",
      "muted": "#122B57",
      "mutedForeground": "#9FB0CC",
      "accent": "#FF775D",
      "accentForeground": "#071936",
      "destructive": "#F87171",
      "destructiveForeground": "#071936",
      "input": "#243B66",
      "ring": "#E980BC",
      "chart1": "#9A84EE",
      "chart2": "#E980BC",
      "chart3": "#FF775D",
      "chart4": "#7FA3E8",
      "chart5": "#4ADE80",
      "sidebar": "#0B2246",
      "sidebarForeground": "#EEF1FA",
      "sidebarBorder": "#243B66",
      "sidebarPrimary": "#E980BC",
      "sidebarPrimaryForeground": "#071936",
      "sidebarAccent": "#122B57",
      "sidebarAccentForeground": "#EEF1FA",
      "sidebarRing": "#E980BC"
    }
  },
  "fontFamily": {
    "sans": [
      "Inter",
      "system-ui",
      "-apple-system",
      "sans-serif"
    ],
    "serif": [
      "Comfortaa",
      "Inter",
      "Georgia",
      "serif"
    ],
    "mono": [
      "ui-monospace",
      "SFMono-Regular",
      "Menlo",
      "monospace"
    ],
    "wordmark": [
      "Comfortaa",
      "system-ui",
      "sans-serif"
    ]
  },
  "radius": "0.625rem",
  "spacing": "0.25rem",
  "brand": {
    "gradient": [
      "#7659DF",
      "#A557C8",
      "#DB509E",
      "#FF775D"
    ],
    "status": {
      "light": {
        "success": "#15803D",
        "warn": "#B45309",
        "danger": "#B91C1C"
      },
      "dark": {
        "success": "#4ADE80",
        "warn": "#FBBF24",
        "danger": "#F87171"
      }
    },
    "backdrop": {
      "light": {
        "deep": "#EEF0F5",
        "mid": "#FDFBF7",
        "hi": "#FFFFFF"
      },
      "dark": {
        "deep": "#071936",
        "mid": "#0B2246",
        "hi": "#122B57"
      }
    },
    "hero": {
      "background": "#071936",
      "foreground": "#EEF1FA",
      "card": "#0B2246",
      "cardForeground": "#EEF1FA",
      "border": "#243B66",
      "mutedForeground": "#9FB0CC",
      "primary": "#E980BC",
      "primaryForeground": "#071936"
    }
  }
} as const;

export type Tokens = typeof tokens;
export default tokens;
