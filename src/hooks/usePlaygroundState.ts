import { useEffect, useState } from "react";
import {
  RENDER_OUTPUT_MODE_OPTIONS,
  type EditorState,
  type RenderOutputMode,
  type WorkspaceMode,
} from "@/types/playground";
import { clamp } from "@/utils/color";

const STORAGE_KEY = "mmd-paper-editor-state-v1";
const DEFAULT_CODE = `stateDiagram-v2
  direction LR
  [*] --> Input
  Input --> Parse: DSL
  Parse --> Layout: AST
  Layout --> SVG: Vector
  Layout --> ASCII: Text
  SVG --> Theme
  ASCII --> Theme
  Theme --> Output
  Output --> [*]`;

export const DEFAULT_EDITOR_STATE: EditorState = {
  code: DEFAULT_CODE,
  outputMode: "svg",
  transparent: false,
  splitRatio: 0.5,
  lastSplitRatio: 0.5,
  workspaceMode: "split",
};

const outputModeSet = new Set<RenderOutputMode>(
  RENDER_OUTPUT_MODE_OPTIONS.map((outputModeOption) => outputModeOption.value),
);

function isRenderOutputMode(value: unknown): value is RenderOutputMode {
  return typeof value === "string" && outputModeSet.has(value as RenderOutputMode);
}

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === "split" || value === "editor-hidden" || value === "preview-hidden";
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function sanitizeRatio(value: unknown, fallback: number, min = 0.08, max = 0.92): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, min, max);
}

function sanitizeState(source: unknown): EditorState {
  if (!source || typeof source !== "object") {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }

  const raw = source as Partial<EditorState>;

  return {
    code: typeof raw.code === "string" ? raw.code : DEFAULT_EDITOR_STATE.code,
    outputMode: isRenderOutputMode(raw.outputMode)
      ? raw.outputMode
      : DEFAULT_EDITOR_STATE.outputMode,
    transparent: sanitizeBoolean(raw.transparent, DEFAULT_EDITOR_STATE.transparent),
    splitRatio: sanitizeRatio(raw.splitRatio, DEFAULT_EDITOR_STATE.splitRatio),
    lastSplitRatio: sanitizeRatio(
      raw.lastSplitRatio,
      sanitizeRatio(raw.splitRatio, DEFAULT_EDITOR_STATE.lastSplitRatio, 0.25, 0.75),
      0.25,
      0.75,
    ),
    workspaceMode: isWorkspaceMode(raw.workspaceMode)
      ? raw.workspaceMode
      : DEFAULT_EDITOR_STATE.workspaceMode,
  };
}

function loadState(): EditorState {
  if (typeof window === "undefined") {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }

  try {
    return sanitizeState(JSON.parse(raw));
  } catch {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }
}

export function usePlaygroundState() {
  const [state, setState] = useState<EditorState>(() => loadState());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  return {
    state,
    setState,
  };
}
