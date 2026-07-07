// Vercel Geist design system, distilled to the tokens the Mermaid renderer and
// app shell consume. Values are lifted from docs/design/design.md (Light) and
// docs/design/design.dark.md (Dark). "Geist" here is the font family; the color
// system is Vercel's.

export type ColorMode = "light" | "dark";

export interface DiagramTokens {
  bg: string;
  fg: string;
  line: string;
  accent: string;
  muted: string;
  surface: string;
  border: string;
}

// Diagram palette per color mode.
//   bg      background-100   page/card surface
//   fg      gray-1000        primary text/icons
//   line    gray-900         connectors
//   accent  blue-700/900     links, focus, arrow heads
//   muted   gray-700         secondary/faint text
//   surface background-200   subtle node fill
//   border  gray-400         default border
export const VERCEL_DIAGRAM_TOKENS: Record<ColorMode, DiagramTokens> = {
  light: {
    bg: "#ffffff",
    fg: "#171717",
    line: "#4d4d4d",
    accent: "#006bff",
    muted: "#8f8f8f",
    surface: "#fafafa",
    border: "#eaeaea",
  },
  dark: {
    bg: "#000000",
    fg: "#ededed",
    line: "#a0a0a0",
    accent: "#47a8ff",
    muted: "#8f8f8f",
    surface: "#1a1a1a",
    border: "#2e2e2e",
  },
};

export const BASE_FONT_FAMILY = "Geist";
export const MONO_FONT_FAMILY = "Geist Mono";
