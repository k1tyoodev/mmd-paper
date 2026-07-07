import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, TransitionEvent } from "react";
import { Grid2X2, Moon, Sun } from "lucide-react";
import MermaidEditor, { type MermaidEditorHandle } from "@/components/MermaidEditor";
import MermaidPreview from "@/components/MermaidPreview";
import { preloadRenderer, useBeautifulRenderer } from "@/hooks/useBeautifulRenderer";
import { usePlaygroundState } from "@/hooks/usePlaygroundState";
import { useSplitPane } from "@/hooks/useSplitPane";
import { useTextOutputWarnings } from "@/hooks/useTextOutputWarnings";
import { VERCEL_DIAGRAM_TOKENS, type ColorMode } from "@/theme/vercel";
import type {
  EditorState,
  RenderConfig,
  RenderOutputMode,
  TextColorMode,
} from "@/types/playground";
import { TEXT_COLOR_MODE_OPTIONS } from "@/types/playground";
import { resolveUiPaletteWithFallback } from "@/utils/contrast";

type NoticeTone = "info" | "success" | "warning" | "error";
type NoticeState = {
  message: string;
  tone: NoticeTone;
};
type TextCopyPayload = {
  mode: Exclude<RenderOutputMode, "svg">;
  colorMode: TextColorMode;
};

const THEME_STORAGE_KEY = "mmd-paper-theme";
const SPLIT_DIVIDER_TRACK_PX = 10;
const HIDDEN_DIVIDER_TRACK_PX = 12;
const WORKSPACE_ANIMATION_SETTLE_MS = 260;
const EDITOR_FONT_SIZE = 13;
const EDITOR_FONT_FAMILY = '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const TEXT_OUTPUT_FONT_FAMILY =
  '"Geist Mono", "Noto Sans SC", "Noto Sans Symbols 2", "Apple Symbols", "Segoe UI Symbol", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const BASE_FONT_FAMILY =
  '"Geist", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const APP_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Noto+Sans+SC:wght@400;500&family=Noto+Sans+Symbols+2&display=swap";

function getSettledWorkspaceMode(
  mode: EditorState["workspaceMode"],
): EditorState["workspaceMode"] | null {
  if (mode === "collapsing-editor") {
    return "editor-hidden";
  }
  if (mode === "collapsing-preview") {
    return "preview-hidden";
  }
  if (mode === "restoring-editor" || mode === "restoring-preview") {
    return "split";
  }

  return null;
}

function getWorkspaceTracks(
  mode: EditorState["workspaceMode"],
  ratio: number,
): [string, string, string] {
  if (mode === "editor-hidden" || mode === "collapsing-editor") {
    return ["0px", `${HIDDEN_DIVIDER_TRACK_PX}px`, `calc(100% - ${HIDDEN_DIVIDER_TRACK_PX}px)`];
  }

  if (mode === "preview-hidden" || mode === "collapsing-preview") {
    return [`calc(100% - ${HIDDEN_DIVIDER_TRACK_PX}px)`, `${HIDDEN_DIVIDER_TRACK_PX}px`, "0px"];
  }

  const normalizedRatio = Math.max(0, Math.min(1, ratio));
  const editorPercent = normalizedRatio * 100;
  const previewPercent = 100 - editorPercent;
  const dividerHalf = SPLIT_DIVIDER_TRACK_PX / 2;
  return [
    `calc(${editorPercent}% - ${dividerHalf}px)`,
    `${SPLIT_DIVIDER_TRACK_PX}px`,
    `calc(${previewPercent}% - ${dividerHalf}px)`,
  ];
}

function getInitialColorMode(): ColorMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Ignore storage access failures and fall back to system preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function ensureGeistFontsLoaded(): void {
  let linkElement = document.head.querySelector<HTMLLinkElement>("link[data-geist-fonts]");
  if (!linkElement) {
    linkElement = document.createElement("link");
    linkElement.rel = "stylesheet";
    linkElement.setAttribute("data-geist-fonts", "true");
    document.head.append(linkElement);
  }
  linkElement.href = APP_FONTS_HREF;
  void document.fonts.load(`13px ${BASE_FONT_FAMILY}`);
  void document.fonts.load(`13px ${EDITOR_FONT_FAMILY}`);
  void document.fonts.load(`13px ${TEXT_OUTPUT_FONT_FAMILY}`, "中文▲►●");
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getSvgSize(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const node = doc.documentElement;
  const width = Number.parseFloat(node.getAttribute("width") ?? "");
  const height = Number.parseFloat(node.getAttribute("height") ?? "");
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  const viewBox = node.getAttribute("viewBox");
  if (!viewBox) {
    return { width: 1200, height: 800 };
  }

  const parts = viewBox
    .trim()
    .split(/\s+/u)
    .map((part) => Number.parseFloat(part));
  const widthFromViewBox = parts[2];
  const heightFromViewBox = parts[3];
  if (
    parts.length === 4 &&
    widthFromViewBox !== undefined &&
    heightFromViewBox !== undefined &&
    Number.isFinite(widthFromViewBox) &&
    Number.isFinite(heightFromViewBox) &&
    widthFromViewBox > 0 &&
    heightFromViewBox > 0
  ) {
    return { width: widthFromViewBox, height: heightFromViewBox };
  }

  return { width: 1200, height: 800 };
}

async function renderSvgToPngBlob(
  svg: string,
  scale = 1,
  background: string | null,
): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("Failed to decode SVG image")), {
        once: true,
      });
      image.src = url;
    });

    const fallbackSize = getSvgSize(svg);
    const width = Math.max(1, Math.round(image.naturalWidth || fallbackSize.width));
    const height = Math.max(1, Math.round(image.naturalHeight || fallbackSize.height));
    const normalizedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const outputWidth = Math.max(1, Math.round(width * normalizedScale));
    const outputHeight = Math.max(1, Math.round(height * normalizedScale));
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Failed to create canvas context");
    }

    if (background) {
      context.fillStyle = background;
      context.fillRect(0, 0, outputWidth, outputHeight);
    }
    context.drawImage(image, 0, 0, outputWidth, outputHeight);

    const pngBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (!pngBlob) {
      throw new Error("Failed to convert image to PNG");
    }

    return pngBlob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function getTextColorModeLabel(colorMode: TextColorMode): string {
  return TEXT_COLOR_MODE_OPTIONS.find((option) => option.value === colorMode)?.label ?? colorMode;
}

function Header({
  colorMode,
  transparentBackground,
  canToggleTransparentBackground,
  onToggleColorMode,
  onToggleTransparentBackground,
}: {
  colorMode: ColorMode;
  transparentBackground: boolean;
  canToggleTransparentBackground: boolean;
  onToggleColorMode: () => void;
  onToggleTransparentBackground: () => void;
}) {
  const transparentTitle = canToggleTransparentBackground
    ? "Transparent background"
    : "Transparent background is available for SVG";

  return (
    <header className="mmd-header">
      <div className="mmd-brand">
        <div className="mmd-title">MMD Paper</div>
        <div className="mmd-subtitle">Paste Mermaid. See the diagram.</div>
      </div>
      <div className="mmd-actions">
        <button
          type="button"
          className="header-icon-button transparent-toggle-button"
          aria-label="Toggle transparent background"
          aria-pressed={transparentBackground}
          title={transparentTitle}
          disabled={!canToggleTransparentBackground}
          onClick={onToggleTransparentBackground}
        >
          <Grid2X2 size={14} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="header-icon-button theme-toggle-button"
          aria-label="Toggle theme"
          aria-pressed={colorMode === "dark"}
          title={colorMode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          onClick={onToggleColorMode}
        >
          {colorMode === "dark" ? (
            <Sun size={14} strokeWidth={1.7} aria-hidden="true" />
          ) : (
            <Moon size={14} strokeWidth={1.7} aria-hidden="true" />
          )}
        </button>
      </div>
    </header>
  );
}

function App() {
  const { state, setState } = usePlaygroundState();
  const [colorMode, setColorMode] = useState<ColorMode>(getInitialColorMode);
  const [notice, setNoticeState] = useState<NoticeState | null>(null);
  const [previewFitRequestId, setPreviewFitRequestId] = useState(0);
  const [editorFocusToEndToken, setEditorFocusToEndToken] = useState(0);
  const splitPaneRef = useRef<HTMLElement | null>(null);
  const editorRef = useRef<MermaidEditorHandle | null>(null);
  const noticeTimer = useRef<number | null>(null);

  const updateState = useCallback(
    (recipe: (draft: EditorState) => void): void => {
      setState((previous) => {
        const next: EditorState = { ...previous };
        recipe(next);
        return next;
      });
    },
    [setState],
  );

  const tokens = VERCEL_DIAGRAM_TOKENS[colorMode];
  const config = useMemo<RenderConfig>(
    () => ({ tokens, outputMode: state.outputMode, transparent: state.transparent }),
    [tokens, state.outputMode, state.transparent],
  );

  const { renderState, renderTextByColorMode } = useBeautifulRenderer(state.code, config);

  const setSplitRatio = useCallback(
    (value: number): void => {
      updateState((draft) => {
        draft.splitRatio = value;
      });
    },
    [updateState],
  );

  const setLastSplitRatio = useCallback(
    (value: number): void => {
      updateState((draft) => {
        draft.lastSplitRatio = value;
      });
    },
    [updateState],
  );

  const setWorkspaceMode = useCallback(
    (value: EditorState["workspaceMode"]): void => {
      updateState((draft) => {
        draft.workspaceMode = value;
      });
    },
    [updateState],
  );

  const settleWorkspaceMode = useCallback(
    (mode: EditorState["workspaceMode"]): void => {
      const settledMode = getSettledWorkspaceMode(mode);
      if (!settledMode) {
        return;
      }

      updateState((draft) => {
        if (draft.workspaceMode === mode) {
          draft.workspaceMode = settledMode;
        }
      });
      requestAnimationFrame(() => {
        editorRef.current?.layout();
      });
    },
    [updateState],
  );

  const { isDragging, pendingCollapse, handleDividerPointerDown, handleDividerDoubleClick } =
    useSplitPane({
      containerRef: splitPaneRef,
      ratio: state.splitRatio,
      lastSplitRatio: state.lastSplitRatio,
      workspaceMode: state.workspaceMode,
      setRatio: setSplitRatio,
      setLastSplitRatio,
      setWorkspaceMode,
      options: {
        min: 0.28,
        max: 0.72,
        minLeftPx: 280,
        minRightPx: 360,
        collapseThresholdPx: 96,
      },
    });

  const uiPaletteResult = useMemo(
    () =>
      resolveUiPaletteWithFallback({
        bg: tokens.bg,
        fg: tokens.fg,
        accent: tokens.accent,
        editedToken: null,
      }),
    [tokens],
  );
  const appliedUiPalette = uiPaletteResult.palette;
  const textOutputWarnings = useTextOutputWarnings(
    renderState.asciiHtml,
    state.outputMode,
    renderState.textOutputMode,
    TEXT_OUTPUT_FONT_FAMILY,
    APP_FONTS_HREF,
  );
  const canExportCurrentOutput =
    state.outputMode === "svg" ? Boolean(renderState.svg) : Boolean(renderState.asciiHtml);
  const canTogglePreviewTransparency = state.outputMode === "svg";
  const appliedPreviewTransparency = canTogglePreviewTransparency && state.transparent;

  const setNotice = useCallback((message: string, tone: NoticeTone = "info"): void => {
    setNoticeState({ message, tone });
    if (noticeTimer.current !== null) {
      window.clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = window.setTimeout(() => {
      setNoticeState(null);
      noticeTimer.current = null;
    }, 2600);
  }, []);

  useEffect(() => {
    ensureGeistFontsLoaded();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode;
    document.documentElement.classList.toggle("dark", colorMode === "dark");
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, colorMode);
    } catch {
      // Ignore storage access failures.
    }
  }, [colorMode]);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void preloadRenderer();
    }, 0);
    setEditorFocusToEndToken((value) => value + 1);
    return () => {
      window.clearTimeout(id);
      if (noticeTimer.current !== null) {
        window.clearTimeout(noticeTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (renderState.renderId > 0) {
      setPreviewFitRequestId((value) => value + 1);
    }
  }, [renderState.renderId]);

  useEffect(() => {
    if (!getSettledWorkspaceMode(state.workspaceMode)) {
      return;
    }

    const id = window.setTimeout(() => {
      settleWorkspaceMode(state.workspaceMode);
    }, WORKSPACE_ANIMATION_SETTLE_MS);

    return () => {
      window.clearTimeout(id);
    };
  }, [settleWorkspaceMode, state.workspaceMode]);

  function updateCode(value: string): void {
    updateState((draft) => {
      draft.code = value;
    });
  }

  function toggleColorMode(): void {
    setColorMode((current) => (current === "dark" ? "light" : "dark"));
    setPreviewFitRequestId((value) => value + 1);
  }

  function toggleTransparentBackground(): void {
    if (!canTogglePreviewTransparency) {
      return;
    }

    updateState((draft) => {
      draft.transparent = !draft.transparent;
    });
  }

  async function copySvg(): Promise<void> {
    const svg = renderState.svg;
    if (!svg) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable in this browser");
      }

      await navigator.clipboard.writeText(svg);
      setNotice("SVG copied", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Copy failed", "error");
    }
  }

  function exportSvg(): void {
    const svg = renderState.svg;
    if (!svg) {
      return;
    }

    downloadBlob("mmd-paper.svg", new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    setNotice("SVG downloaded", "success");
  }

  async function copyPng(): Promise<void> {
    const svg = renderState.svg;
    if (!svg) {
      return;
    }

    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Clipboard image copy is unavailable in this browser");
      }

      const pngBlob = await renderSvgToPngBlob(svg, 2, state.transparent ? null : tokens.bg);
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": pngBlob,
        }),
      ]);
      setNotice("PNG copied", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Copy failed", "error");
    }
  }

  async function exportPng(): Promise<void> {
    const svg = renderState.svg;
    if (!svg) {
      return;
    }

    try {
      const pngBlob = await renderSvgToPngBlob(svg, 2, state.transparent ? null : tokens.bg);
      downloadBlob("mmd-paper.png", pngBlob);
      setNotice("PNG downloaded", "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "PNG export failed", "error");
    }
  }

  async function copyTextOutput(payload: TextCopyPayload): Promise<void> {
    const text = await renderTextByColorMode(payload.colorMode, payload.mode);
    if (!text) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable in this browser");
      }

      await navigator.clipboard.writeText(text);
      const outputLabel = payload.mode === "unicode" ? "Unicode" : "ASCII";
      setNotice(`${outputLabel} ${getTextColorModeLabel(payload.colorMode)} copied`, "success");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Copy failed", "error");
    }
  }

  const appStyle = {
    "--t-bg": appliedUiPalette.bg,
    "--t-fg": appliedUiPalette.fg,
    "--t-accent": appliedUiPalette.accent,
  } as CSSProperties;
  const [editorTrack, dividerTrack, previewTrack] = getWorkspaceTracks(
    state.workspaceMode,
    state.splitRatio,
  );
  const workspaceStyle = {
    "--editor-track": editorTrack,
    "--divider-track": dividerTrack,
    "--preview-track": previewTrack,
  } as CSSProperties;
  const workspaceClassName = [
    "editor-preview-workspace",
    `workspace-${state.workspaceMode}`,
    pendingCollapse ? `pending-collapse-${pendingCollapse}` : "",
    isDragging ? "workspace-dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const dividerLabel =
    state.workspaceMode === "editor-hidden" || state.workspaceMode === "collapsing-editor"
      ? "Restore editor pane"
      : state.workspaceMode === "preview-hidden" || state.workspaceMode === "collapsing-preview"
        ? "Restore preview pane"
        : "Resize editor and preview panes";

  function handleWorkspaceTransitionEnd(event: TransitionEvent<HTMLElement>): void {
    if (event.target !== event.currentTarget || event.propertyName !== "grid-template-columns") {
      return;
    }

    settleWorkspaceMode(state.workspaceMode);
  }

  return (
    <div className="app-shell" style={appStyle}>
      <Header
        colorMode={colorMode}
        transparentBackground={appliedPreviewTransparency}
        canToggleTransparentBackground={canTogglePreviewTransparency}
        onToggleColorMode={toggleColorMode}
        onToggleTransparentBackground={toggleTransparentBackground}
      />

      <main className="mmd-main">
        <section
          ref={splitPaneRef}
          className={workspaceClassName}
          style={workspaceStyle}
          onTransitionEnd={handleWorkspaceTransitionEnd}
        >
          <div className="pane editor-pane">
            <MermaidEditor
              ref={editorRef}
              value={state.code}
              fontSize={EDITOR_FONT_SIZE}
              fontFamily={EDITOR_FONT_FAMILY}
              colorScheme={colorMode}
              surfaceColor={appliedUiPalette.bg}
              focusToEndToken={editorFocusToEndToken}
              onChange={updateCode}
            />
          </div>

          <div
            className={`divider ${isDragging ? "dragging" : ""}`}
            role="separator"
            aria-label={dividerLabel}
            aria-orientation="vertical"
            onPointerDown={handleDividerPointerDown}
            onDoubleClick={handleDividerDoubleClick}
          />

          <div className="pane preview-pane">
            <MermaidPreview
              outputMode={state.outputMode}
              fitRequestId={previewFitRequestId}
              monoFontFamily={TEXT_OUTPUT_FONT_FAMILY}
              textWarnings={textOutputWarnings}
              svg={renderState.svg}
              asciiHtml={renderState.asciiHtml}
              error={renderState.error}
              canExport={canExportCurrentOutput}
              transparentApplied={appliedPreviewTransparency}
              onOutputModeChange={(value) =>
                updateState((draft) => {
                  draft.outputMode = value;
                })
              }
              onCopySvg={() => void copySvg()}
              onCopyPng={() => void copyPng()}
              onDownloadSvg={exportSvg}
              onDownloadPng={() => void exportPng()}
              onCopyText={(payload) => void copyTextOutput(payload)}
            />
          </div>
        </section>
      </main>

      {notice ? (
        <div className={`toast toast-${notice.tone}`} role="status">
          {notice.message}
        </div>
      ) : null}
    </div>
  );
}

export default App;
