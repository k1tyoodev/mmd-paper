import type { DiagramTokens } from "@/theme/vercel";

export type RenderOutputMode = "svg" | "unicode" | "ascii";
export type TextColorMode = "none" | "ansi16" | "ansi256" | "truecolor" | "html";

export type WorkspaceMode =
  | "split"
  | "editor-hidden"
  | "preview-hidden"
  | "collapsing-editor"
  | "collapsing-preview"
  | "restoring-editor"
  | "restoring-preview";

// The render inputs the renderer needs. The diagram palette is fixed per color
// mode (Vercel Geist), so there are no per-diagram theme or per-element knobs.
export interface RenderConfig {
  tokens: DiagramTokens;
  outputMode: RenderOutputMode;
  transparent: boolean;
}

// Persisted playground state. Everything the removed options panel exposed is
// now a fixed default in the renderer; only these fields remain user-facing.
export interface EditorState {
  code: string;
  outputMode: RenderOutputMode;
  transparent: boolean;
  splitRatio: number;
  lastSplitRatio: number;
  workspaceMode: WorkspaceMode;
}

export interface RenderState {
  svg: string | null;
  asciiHtml: string | null;
  textOutputMode: Exclude<RenderOutputMode, "svg"> | null;
  error: string | null;
  durationMs: number | null;
  renderId: number;
}

export type TextOutputWarningTone = "warning" | "info";

export interface TextOutputWarning {
  key: string;
  id: string;
  tone: TextOutputWarningTone;
  message: string;
  examples: string[];
}

export const RENDER_OUTPUT_MODE_OPTIONS: Array<{ label: string; value: RenderOutputMode }> = [
  { label: "SVG", value: "svg" },
  { label: "Unicode", value: "unicode" },
  { label: "ASCII", value: "ascii" },
];

export const TEXT_COLOR_MODE_OPTIONS: Array<{ label: string; value: TextColorMode }> = [
  { label: "plain text", value: "none" },
  { label: "ANSI 16", value: "ansi16" },
  { label: "ANSI 256", value: "ansi256" },
  { label: "true color", value: "truecolor" },
  { label: "HTML", value: "html" },
];
