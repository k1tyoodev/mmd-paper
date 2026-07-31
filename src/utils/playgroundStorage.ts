import {
  RENDER_OUTPUT_MODE_OPTIONS,
  type EditorState,
  type RenderOutputMode,
  type WorkspaceMode,
} from '../types/playground';
import { clamp } from './color';

export const PLAYGROUND_STORAGE_KEY = 'mmd-paper-editor-state-v1';

export const DEFAULT_CODE = `sequenceDiagram
  actor U as User
  participant App as Client App
  participant Auth as Auth Server
  participant API as Resource API
  U->>App: Click Login
  App->>Auth: Authorization request
  Auth->>U: Login page
  U->>Auth: Credentials
  Auth-->>App: Authorization code
  App->>Auth: Exchange code for token
  Auth-->>App: Access token
  App->>API: Request + token
  API-->>App: Protected resource
  App-->>U: Display data`;

export const DEFAULT_EDITOR_STATE: EditorState = {
  code: DEFAULT_CODE,
  outputMode: 'svg',
  transparent: false,
  splitRatio: 0.5,
  lastSplitRatio: 0.5,
  workspaceMode: 'split',
};

export interface PlaygroundStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const outputModeSet = new Set<RenderOutputMode>(
  RENDER_OUTPUT_MODE_OPTIONS.map((outputModeOption) => outputModeOption.value),
);

function isRenderOutputMode(value: unknown): value is RenderOutputMode {
  return typeof value === 'string' && outputModeSet.has(value as RenderOutputMode);
}

function isWorkspaceMode(value: unknown): value is WorkspaceMode {
  return value === 'split' || value === 'editor-hidden' || value === 'preview-hidden';
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizeRatio(value: unknown, fallback: number, min = 0.08, max = 0.92): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return clamp(value, min, max);
}

function sanitizeState(source: unknown): EditorState {
  if (!source || typeof source !== 'object') {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }

  const raw = source as Partial<EditorState>;

  return {
    code: typeof raw.code === 'string' ? raw.code : DEFAULT_EDITOR_STATE.code,
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

export function loadPlaygroundState(storage: PlaygroundStorage | null): EditorState {
  if (!storage) {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }

  try {
    const raw = storage.getItem(PLAYGROUND_STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : structuredClone(DEFAULT_EDITOR_STATE);
  } catch {
    return structuredClone(DEFAULT_EDITOR_STATE);
  }
}

export function persistPlaygroundState(
  storage: PlaygroundStorage | null,
  state: EditorState,
): boolean {
  if (!storage) {
    return false;
  }

  try {
    storage.setItem(PLAYGROUND_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
