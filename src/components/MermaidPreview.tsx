import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleX,
  Copy,
  Grid2X2,
  Info,
  Keyboard,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Redo2,
  Scan,
  Undo2,
} from "lucide-react";
import PreviewShortcutsPanel from "@/components/PreviewShortcutsPanel";
import { RENDER_OUTPUT_MODE_OPTIONS, TEXT_COLOR_MODE_OPTIONS } from "@/types/playground";
import type { RenderOutputMode, TextColorMode, TextOutputWarning } from "@/types/playground";
import { clamp } from "@/utils/color";
import {
  getNextZoomPercent,
  getPreviousZoomPercent,
  MAX_ZOOM_PERCENT,
  MIN_ZOOM_PERCENT,
  resolvePreviewShortcut,
} from "@/utils/previewControls";

type ViewportPoint = {
  x: number;
  y: number;
};

type ContentSize = {
  width: number;
  height: number;
};

type PreviewSurface = "export" | "shortcuts" | "viewport";

type TextOutputMode = Exclude<RenderOutputMode, "svg">;

type ExportAction =
  | { kind: "copy-svg" }
  | { kind: "copy-png" }
  | { kind: "download-svg" }
  | { kind: "download-png" }
  | { kind: "copy-text"; colorMode: TextColorMode };

type ExportItem = {
  key: string;
  label: string;
  action: ExportAction;
};

type MermaidPreviewProps = {
  outputMode: RenderOutputMode;
  fitRequestId: number;
  monoFontFamily: string;
  textWarnings: TextOutputWarning[];
  svg: string | null;
  asciiHtml: string | null;
  error: string | null;
  canExport: boolean;
  canRedo: boolean;
  canUndo: boolean;
  canToggleTransparentBackground: boolean;
  transparentApplied: boolean;
  onOutputModeChange: (value: RenderOutputMode) => void;
  onCopySvg: () => void;
  onCopyPng: () => void;
  onDownloadSvg: () => void;
  onDownloadPng: () => void;
  onCopyText: (payload: { mode: TextOutputMode; colorMode: TextColorMode }) => void;
  onRedo: () => void;
  onToggleTransparentBackground: () => void;
  onUndo: () => void;
};

const MIN_SCALE = MIN_ZOOM_PERCENT / 100;
const MAX_SCALE = MAX_ZOOM_PERCENT / 100;
const FIT_MAX_SCALE = 1;
const WHEEL_ZOOM_SPEED = 0.0018;
const FIT_PADDING = 36;
const FINE_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

const OUTPUT_MODE_ITEMS = RENDER_OUTPUT_MODE_OPTIONS.map((item) => ({
  key: item.value,
  label: item.label,
}));

function snapToDevicePixel(value: number): number {
  const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
  const step = 1 / devicePixelRatio;
  return Math.round(value / step) * step;
}

function getSvgIntrinsicSize(svgElement: SVGSVGElement): ContentSize {
  const viewBox = svgElement.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return { width: viewBox.width, height: viewBox.height };
  }

  const width = Number.parseFloat(svgElement.getAttribute("width") ?? "");
  const height = Number.parseFloat(svgElement.getAttribute("height") ?? "");
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width, height };
  }

  const rect = svgElement.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { width: rect.width, height: rect.height };
  }

  return { width: 1200, height: 800 };
}

function useResizeObserver(targetRef: React.RefObject<Element | null>, callback: () => void): void {
  useEffect(() => {
    const target = targetRef.current;
    if (!target || typeof ResizeObserver === "undefined") {
      return;
    }

    let frameId: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(() => {
        frameId = null;
        callback();
      });
    });
    observer.observe(target);
    return () => {
      if (frameId !== null) {
        cancelAnimationFrame(frameId);
      }
      observer.disconnect();
    };
  }, [callback, targetRef]);
}

function isViewportChromeEvent(event: Event): boolean {
  const target = event.target;
  return (
    target instanceof Element &&
    Boolean(
      target.closest(
        ".feedback-layer, .preview-toolbar-row, .preview-viewport-controls, .preview-shortcuts-panel, .preview-shortcuts-interaction-guard",
      ),
    )
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(
    target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor"),
  );
}

function getModifierLabel(): "⌘" | "Ctrl" {
  return /Mac|iPhone|iPad/u.test(navigator.platform) ? "⌘" : "Ctrl";
}

export default function MermaidPreview(props: MermaidPreviewProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const textCanvasRef = useRef<HTMLPreElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const viewportMenuRef = useRef<HTMLDivElement | null>(null);
  const shortcutsButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewportMenuCloseTimer = useRef<number | null>(null);
  const pointerPositions = useRef(new Map<number, ViewportPoint>());
  const dragStartPointer = useRef<ViewportPoint | null>(null);
  const dragStartOffset = useRef<ViewportPoint | null>(null);
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const pinchStartWorldAnchor = useRef<ViewportPoint | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<ViewportPoint>({ x: 0, y: 0 });
  const [activePointerIds, setActivePointerIds] = useState<Set<number>>(new Set());
  const [autoFit, setAutoFit] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [openSurface, setOpenSurface] = useState<PreviewSurface | null>(null);
  const isExportMenuOpen = openSurface === "export";
  const isShortcutsOpen = openSurface === "shortcuts";
  const isViewportMenuOpen = openSurface === "viewport";

  const hasCurrentOutput =
    props.outputMode === "svg" ? Boolean(props.svg) : Boolean(props.asciiHtml);
  const zoomLabel = `${Math.round(scale * 100)}%`;
  const previousZoomPercent = getPreviousZoomPercent(scale * 100);
  const nextZoomPercent = getNextZoomPercent(scale * 100);
  const isTransparentPreview = props.outputMode === "svg" && props.transparentApplied;
  const visibleWarnings = props.outputMode === "svg" || props.error ? [] : props.textWarnings;

  const exportItems = useMemo<ExportItem[]>(() => {
    if (props.outputMode === "svg") {
      return [
        { key: "copy-svg", label: "Copy SVG", action: { kind: "copy-svg" } },
        { key: "copy-png", label: "Copy PNG (@2x)", action: { kind: "copy-png" } },
        { key: "download-svg", label: "Download SVG", action: { kind: "download-svg" } },
        { key: "download-png", label: "Download PNG (@2x)", action: { kind: "download-png" } },
      ];
    }

    return TEXT_COLOR_MODE_OPTIONS.map((option) => ({
      key: `copy-text-${option.value}`,
      label: `Copy ${option.label}`,
      action: { kind: "copy-text", colorMode: option.value },
    }));
  }, [props.outputMode]);

  const readCurrentContentSize = useCallback((outputMode: RenderOutputMode): ContentSize | null => {
    if (outputMode === "svg") {
      const svgElement = svgHostRef.current?.querySelector("svg");
      return svgElement instanceof SVGSVGElement ? getSvgIntrinsicSize(svgElement) : null;
    }

    const textElement = textCanvasRef.current;
    if (!textElement) {
      return null;
    }

    return {
      width: Math.max(1, Math.ceil(textElement.scrollWidth)),
      height: Math.max(1, Math.ceil(textElement.scrollHeight)),
    };
  }, []);

  const centerAtScale = useCallback((nextScale: number, size: ContentSize): boolean => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return false;
    }

    const viewportRect = viewport.getBoundingClientRect();
    if (viewportRect.width <= 0 || viewportRect.height <= 0) {
      return false;
    }

    setOffset({
      x: (viewportRect.width - size.width * nextScale) / 2,
      y: (viewportRect.height - size.height * nextScale) / 2,
    });
    return true;
  }, []);

  const zoomToFit = useCallback(
    (outputMode: RenderOutputMode = props.outputMode): boolean => {
      const viewport = viewportRef.current;
      const size = readCurrentContentSize(outputMode);
      if (!viewport || !size) {
        return false;
      }

      const viewportRect = viewport.getBoundingClientRect();
      if (viewportRect.width <= 0 || viewportRect.height <= 0) {
        return false;
      }

      const availableWidth = Math.max(1, viewportRect.width - FIT_PADDING * 2);
      const availableHeight = Math.max(1, viewportRect.height - FIT_PADDING * 2);
      const fitScale = clamp(
        Math.min(availableWidth / size.width, availableHeight / size.height),
        MIN_SCALE,
        FIT_MAX_SCALE,
      );

      setScale(fitScale);
      if (!centerAtScale(fitScale, size)) {
        return false;
      }
      setAutoFit(true);
      return true;
    },
    [centerAtScale, props.outputMode, readCurrentContentSize],
  );

  const zoomToOneHundredPercent = useCallback((): void => {
    const size = readCurrentContentSize(props.outputMode);
    if (!size) {
      return;
    }

    setScale(1);
    centerAtScale(1, size);
    setAutoFit(false);
  }, [centerAtScale, props.outputMode, readCurrentContentSize]);

  const clearPointerState = useCallback((): void => {
    pointerPositions.current = new Map();
    setActivePointerIds(new Set());
    dragStartPointer.current = null;
    dragStartOffset.current = null;
    pinchStartDistance.current = 0;
    pinchStartWorldAnchor.current = null;
  }, []);

  const getLocalPoint = useCallback((event: PointerEvent | WheelEvent): ViewportPoint | null => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return null;
    }

    const rect = viewport.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const zoomAt = useCallback(
    (localX: number, localY: number, nextScale: number): void => {
      const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      if (Math.abs(clampedScale - scale) < 0.0001) {
        return;
      }

      const worldX = (localX - offset.x) / scale;
      const worldY = (localY - offset.y) / scale;
      setScale(clampedScale);
      setOffset({
        x: localX - worldX * clampedScale,
        y: localY - worldY * clampedScale,
      });
    },
    [offset, scale],
  );

  const zoomFromViewportCenter = useCallback(
    (nextScale: number): void => {
      const viewport = viewportRef.current;
      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      zoomAt(rect.width / 2, rect.height / 2, nextScale);
      setAutoFit(false);
    },
    [zoomAt],
  );

  const zoomOutOneStep = useCallback((): void => {
    const previous = getPreviousZoomPercent(scale * 100);
    if (previous !== null) {
      zoomFromViewportCenter(previous / 100);
    }
  }, [scale, zoomFromViewportCenter]);

  const zoomInOneStep = useCallback((): void => {
    const next = getNextZoomPercent(scale * 100);
    if (next !== null) {
      zoomFromViewportCenter(next / 100);
    }
  }, [scale, zoomFromViewportCenter]);

  const getPointerPairMidpoint = useCallback((): ViewportPoint | null => {
    const entries = Array.from(pointerPositions.current.values());
    const first = entries[0];
    const second = entries[1];
    if (!first || !second) {
      return null;
    }

    return {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
  }, []);

  const getPointerPairDistance = useCallback((): number => {
    const entries = Array.from(pointerPositions.current.values());
    const first = entries[0];
    const second = entries[1];
    if (!first || !second) {
      return 0;
    }

    return Math.hypot(second.x - first.x, second.y - first.y);
  }, []);

  const beginPinch = useCallback((): void => {
    if (pointerPositions.current.size < 2) {
      return;
    }

    const midpoint = getPointerPairMidpoint();
    const distance = getPointerPairDistance();
    if (!midpoint || distance <= 0) {
      return;
    }

    pinchStartDistance.current = distance;
    pinchStartScale.current = scale;
    pinchStartWorldAnchor.current = {
      x: (midpoint.x - offset.x) / scale,
      y: (midpoint.y - offset.y) / scale,
    };
  }, [getPointerPairDistance, getPointerPairMidpoint, offset, scale]);

  useEffect(() => {
    if (!hasCurrentOutput) {
      clearPointerState();
      setAutoFit(true);
      return;
    }

    const id = requestAnimationFrame(() => {
      zoomToFit(props.outputMode);
    });
    return () => cancelAnimationFrame(id);
  }, [
    clearPointerState,
    hasCurrentOutput,
    props.fitRequestId,
    props.outputMode,
    props.svg,
    props.asciiHtml,
    zoomToFit,
  ]);

  const syncFitWithLayout = useCallback((): void => {
    if (hasCurrentOutput && autoFit) {
      zoomToFit(props.outputMode);
    }
  }, [autoFit, hasCurrentOutput, props.outputMode, zoomToFit]);

  useResizeObserver(viewportRef, syncFitWithLayout);
  useResizeObserver(svgHostRef, syncFitWithLayout);
  useResizeObserver(textCanvasRef, syncFitWithLayout);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (isViewportChromeEvent(event.nativeEvent) || !hasCurrentOutput) {
      return;
    }

    setAutoFit(false);
    const localPoint = getLocalPoint(event.nativeEvent);
    if (!localPoint) {
      return;
    }

    viewportRef.current?.setPointerCapture(event.pointerId);
    pointerPositions.current.set(event.pointerId, localPoint);
    const nextIds = new Set(activePointerIds);
    nextIds.add(event.pointerId);
    setActivePointerIds(nextIds);

    if (pointerPositions.current.size >= 2) {
      dragStartPointer.current = null;
      dragStartOffset.current = null;
      beginPinch();
      return;
    }

    dragStartPointer.current = localPoint;
    dragStartOffset.current = offset;
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    if (!hasCurrentOutput || !activePointerIds.has(event.pointerId)) {
      return;
    }

    const localPoint = getLocalPoint(event.nativeEvent);
    if (!localPoint) {
      return;
    }

    pointerPositions.current.set(event.pointerId, localPoint);

    if (pointerPositions.current.size >= 2) {
      const midpoint = getPointerPairMidpoint();
      const distance = getPointerPairDistance();
      if (
        !midpoint ||
        distance <= 0 ||
        pinchStartDistance.current <= 0 ||
        !pinchStartWorldAnchor.current
      ) {
        return;
      }

      const nextScale = clamp(
        (pinchStartScale.current * distance) / pinchStartDistance.current,
        MIN_SCALE,
        MAX_SCALE,
      );
      setScale(nextScale);
      setOffset({
        x: midpoint.x - pinchStartWorldAnchor.current.x * nextScale,
        y: midpoint.y - pinchStartWorldAnchor.current.y * nextScale,
      });
      return;
    }

    if (!dragStartPointer.current || !dragStartOffset.current) {
      return;
    }

    setOffset({
      x: dragStartOffset.current.x + (localPoint.x - dragStartPointer.current.x),
      y: dragStartOffset.current.y + (localPoint.y - dragStartPointer.current.y),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    if (!activePointerIds.has(event.pointerId)) {
      return;
    }

    pointerPositions.current.delete(event.pointerId);
    const nextIds = new Set(activePointerIds);
    nextIds.delete(event.pointerId);
    setActivePointerIds(nextIds);

    if (pointerPositions.current.size >= 2) {
      beginPinch();
      return;
    }

    dragStartPointer.current = null;
    dragStartOffset.current = null;
    pinchStartDistance.current = 0;
    pinchStartWorldAnchor.current = null;
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (isViewportChromeEvent(event.nativeEvent) || !hasCurrentOutput) {
      return;
    }

    event.preventDefault();
    setAutoFit(false);
    const localPoint = getLocalPoint(event.nativeEvent);
    if (!localPoint) {
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      zoomAt(localPoint.x, localPoint.y, scale * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED));
      return;
    }

    setOffset((current) => ({
      x: current.x - event.deltaX,
      y: current.y - event.deltaY,
    }));
  }

  function handleExportAction(action: ExportAction): void {
    setOpenSurface(null);
    switch (action.kind) {
      case "copy-svg":
        props.onCopySvg();
        return;
      case "copy-png":
        props.onCopyPng();
        return;
      case "download-svg":
        props.onDownloadSvg();
        return;
      case "download-png":
        props.onDownloadPng();
        return;
      case "copy-text":
        if (props.outputMode !== "svg") {
          props.onCopyText({ mode: props.outputMode, colorMode: action.colorMode });
        }
    }
  }

  function toggleViewportFullscreen(): void {
    setOpenSurface(null);
    setIsFullscreen((value) => !value);
  }

  function openViewportMenu(): void {
    if (viewportMenuCloseTimer.current !== null) {
      window.clearTimeout(viewportMenuCloseTimer.current);
      viewportMenuCloseTimer.current = null;
    }
    setOpenSurface("viewport");
  }

  function scheduleViewportMenuClose(): void {
    if (!window.matchMedia(FINE_POINTER_QUERY).matches) {
      return;
    }
    if (viewportMenuCloseTimer.current !== null) {
      window.clearTimeout(viewportMenuCloseTimer.current);
    }
    viewportMenuCloseTimer.current = window.setTimeout(() => {
      setOpenSurface((current) => (current === "viewport" ? null : current));
      viewportMenuCloseTimer.current = null;
    }, 150);
  }

  const closeShortcuts = useCallback((): void => {
    setOpenSurface(null);
    requestAnimationFrame(() => shortcutsButtonRef.current?.focus());
  }, []);

  const toggleShortcuts = useCallback((): void => {
    if (openSurface === "shortcuts") {
      closeShortcuts();
      return;
    }

    setOpenSurface("shortcuts");
  }, [closeShortcuts, openSurface]);

  function handlePercentClick(): void {
    if (window.matchMedia(FINE_POINTER_QUERY).matches) {
      zoomToOneHundredPercent();
      return;
    }

    if (isViewportMenuOpen) {
      setOpenSurface(null);
    } else {
      openViewportMenu();
    }
  }

  function handleViewportMenuKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const items = Array.from(
      viewportMenuRef.current?.querySelectorAll<HTMLButtonElement>(
        "[role='menuitem']:not(:disabled), [role='menuitemcheckbox']:not(:disabled)",
      ) ?? [],
    );
    if (items.length === 0) {
      return;
    }

    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex < 0 ? (direction > 0 ? 0 : items.length - 1) : currentIndex + direction;
    items[(nextIndex + items.length) % items.length]?.focus();
  }

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const id = requestAnimationFrame(() => zoomToFit());
    return () => {
      cancelAnimationFrame(id);
    };
  }, [isFullscreen, zoomToFit]);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setOpenSurface((current) => (current === "export" ? null : current));
      }
    };
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
    };
  }, [isExportMenuOpen]);

  useEffect(() => {
    if (!isViewportMenuOpen || window.matchMedia(FINE_POINTER_QUERY).matches) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      if (!viewportMenuRef.current?.contains(event.target as Node)) {
        setOpenSurface((current) => (current === "viewport" ? null : current));
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    return () => document.removeEventListener("pointerdown", handleDocumentPointerDown);
  }, [isViewportMenuOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (openSurface === "shortcuts") {
          event.preventDefault();
          closeShortcuts();
        } else if (openSurface !== null) {
          event.preventDefault();
          setOpenSurface(null);
        } else if (isFullscreen) {
          event.preventDefault();
          setIsFullscreen(false);
        }
        return;
      }

      const shortcut = resolvePreviewShortcut({
        code: event.code,
        key: event.key,
        shiftKey: event.shiftKey,
        previewActive: Boolean(sectionRef.current?.contains(document.activeElement)),
        editableTarget: isEditableTarget(event.target),
      });
      if (!shortcut) {
        return;
      }

      event.preventDefault();
      switch (shortcut) {
        case "fit":
          zoomToFit();
          return;
        case "fullscreen":
          toggleViewportFullscreen();
          return;
        case "shortcuts":
          toggleShortcuts();
          return;
        case "zoom-in":
          zoomInOneStep();
          return;
        case "zoom-out":
          zoomOutOneStep();
          return;
        case "zoom-reset":
          zoomToOneHundredPercent();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    closeShortcuts,
    isFullscreen,
    openSurface,
    toggleShortcuts,
    zoomInOneStep,
    zoomOutOneStep,
    zoomToFit,
    zoomToOneHundredPercent,
  ]);

  useEffect(
    () => () => {
      if (viewportMenuCloseTimer.current !== null) {
        window.clearTimeout(viewportMenuCloseTimer.current);
      }
    },
    [],
  );

  const renderedOffsetX = props.outputMode === "svg" ? snapToDevicePixel(offset.x) : offset.x;
  const renderedOffsetY = props.outputMode === "svg" ? snapToDevicePixel(offset.y) : offset.y;
  const modifierLabel = getModifierLabel();

  return (
    <section ref={sectionRef} className="panel-shell" aria-label="Diagram preview">
      <div className="panel-header">
        <h2>Preview</h2>
        <div className="preview-info">
          <div ref={exportMenuRef} className="export-menu">
            <button
              type="button"
              className="export-menu-button"
              aria-label="Preview export"
              aria-haspopup="menu"
              aria-expanded={isExportMenuOpen}
              disabled={!props.canExport}
              onClick={() => setOpenSurface((current) => (current === "export" ? null : "export"))}
            >
              <Copy size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>Export</span>
              <ChevronDown size={13} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {isExportMenuOpen ? (
              <div className="export-menu-list" role="menu">
                {exportItems.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportAction(item.action)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="preview-stage">
        <div
          ref={viewportRef}
          className={[
            "preview-viewport",
            isTransparentPreview ? "preview-viewport-transparent" : "",
            isFullscreen ? "preview-viewport-fullscreen" : "",
            isShortcutsOpen ? "preview-dialog-open" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
          tabIndex={0}
        >
          <div className="preview-toolbar-row">
            <div className="preview-toolbar-right" role="tablist" aria-label="Output mode">
              {OUTPUT_MODE_ITEMS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={props.outputMode === item.key}
                  className="segmented-button"
                  data-active={props.outputMode === item.key}
                  onClick={() => props.onOutputModeChange(item.key as RenderOutputMode)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div
            className="content-canvas"
            style={{
              transform: `translate(${renderedOffsetX}px, ${renderedOffsetY}px) scale(${scale})`,
            }}
          >
            {props.outputMode === "svg" ? (
              <div
                ref={svgHostRef}
                className="svg-host"
                dangerouslySetInnerHTML={{ __html: props.svg ?? "" }}
              />
            ) : (
              <pre
                ref={textCanvasRef}
                className="ascii-canvas"
                style={{ fontFamily: props.monoFontFamily }}
                dangerouslySetInnerHTML={{ __html: props.asciiHtml ?? "" }}
              />
            )}
          </div>

          <div className="preview-viewport-controls" aria-label="Viewport controls">
            <div className="preview-history-control" role="group" aria-label="Source edit history">
              <button
                type="button"
                className="preview-history-button"
                disabled={!props.canUndo}
                aria-label="Undo source edit"
                title={`Undo source edit (${modifierLabel}Z)`}
                onClick={props.onUndo}
              >
                <Undo2 size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="preview-history-button"
                disabled={!props.canRedo}
                aria-label="Redo source edit"
                title={`Redo source edit (${modifierLabel}${modifierLabel === "⌘" ? "⇧" : "+Shift+"}Z)`}
                onClick={props.onRedo}
              >
                <Redo2 size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <div className="preview-zoom-control" aria-label="Preview zoom controls">
              <button
                type="button"
                className="preview-zoom-step"
                disabled={!hasCurrentOutput || previousZoomPercent === null}
                aria-label="Zoom out one step"
                title="Zoom out (−)"
                onClick={zoomOutOneStep}
              >
                <Minus size={13} strokeWidth={1.8} aria-hidden="true" />
              </button>

              <div
                ref={viewportMenuRef}
                className="preview-zoom-menu-root"
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") {
                    openViewportMenu();
                  }
                }}
                onPointerLeave={scheduleViewportMenuClose}
                onFocusCapture={() => {
                  if (window.matchMedia(FINE_POINTER_QUERY).matches) {
                    openViewportMenu();
                  }
                }}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    scheduleViewportMenuClose();
                  }
                }}
              >
                <div
                  className="preview-zoom-menu"
                  data-state={isViewportMenuOpen ? "open" : "closed"}
                  role="menu"
                  aria-label="Preview view options"
                  aria-hidden={!isViewportMenuOpen}
                  inert={!isViewportMenuOpen}
                  onKeyDown={handleViewportMenuKeyDown}
                >
                  <button
                    type="button"
                    role="menuitem"
                    className="preview-zoom-menu-reset-touch"
                    disabled={!hasCurrentOutput}
                    onClick={() => {
                      zoomToOneHundredPercent();
                      setOpenSurface(null);
                    }}
                  >
                    <span>Reset to 100%</span>
                    <kbd>Shift 0</kbd>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasCurrentOutput}
                    onClick={toggleViewportFullscreen}
                  >
                    {isFullscreen ? (
                      <Minimize2 size={14} strokeWidth={1.7} aria-hidden="true" />
                    ) : (
                      <Maximize2 size={14} strokeWidth={1.7} aria-hidden="true" />
                    )}
                    <span>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</span>
                    <kbd>Shift F</kbd>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!hasCurrentOutput}
                    onClick={() => {
                      zoomToFit();
                      setOpenSurface(null);
                    }}
                  >
                    <Scan size={14} strokeWidth={1.7} aria-hidden="true" />
                    <span>Fit</span>
                    <kbd>Shift 1</kbd>
                  </button>
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={props.transparentApplied}
                    disabled={!props.canToggleTransparentBackground}
                    title={
                      props.canToggleTransparentBackground
                        ? "Toggle transparent background"
                        : "Transparent background is available for SVG"
                    }
                    onClick={() => {
                      props.onToggleTransparentBackground();
                      setOpenSurface(null);
                    }}
                  >
                    <Grid2X2 size={14} strokeWidth={1.7} aria-hidden="true" />
                    <span>Transparent</span>
                    <span className="preview-menu-state" aria-hidden="true">
                      {props.transparentApplied ? "On" : "Off"}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  className="zoom-percent-button"
                  disabled={!hasCurrentOutput}
                  aria-label={`Current zoom ${zoomLabel}. Reset to 100% or open view options`}
                  aria-haspopup="menu"
                  aria-expanded={isViewportMenuOpen}
                  title="Reset zoom to 100%"
                  onClick={handlePercentClick}
                >
                  {zoomLabel}
                </button>
              </div>

              <button
                type="button"
                className="preview-zoom-step"
                disabled={!hasCurrentOutput || nextZoomPercent === null}
                aria-label="Zoom in one step"
                title="Zoom in (+)"
                onClick={zoomInOneStep}
              >
                <Plus size={13} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>

            <button
              ref={shortcutsButtonRef}
              type="button"
              className="icon-button shortcut-trigger-button"
              aria-label={isShortcutsOpen ? "Close keyboard shortcuts" : "Open keyboard shortcuts"}
              aria-haspopup="dialog"
              aria-expanded={isShortcutsOpen}
              title="Keyboard shortcuts (?)"
              onClick={toggleShortcuts}
            >
              <Keyboard size={14} strokeWidth={1.7} aria-hidden="true" />
            </button>
          </div>

          {isShortcutsOpen ? (
            <>
              <div className="preview-shortcuts-interaction-guard" aria-hidden="true" />
              <PreviewShortcutsPanel modifierLabel={modifierLabel} onClose={closeShortcuts} />
            </>
          ) : null}

          {props.error ? (
            <p className="feedback-layer feedback-block tone-error">
              <CircleX size={12} strokeWidth={1.85} className="feedback-label-icon" />
              <span>{props.error}</span>
            </p>
          ) : null}

          {!props.error && visibleWarnings.length > 0 ? (
            <div className="feedback-layer feedback-stack">
              {visibleWarnings.map((warning) => (
                <p key={warning.key} className={`feedback-block tone-${warning.tone}`}>
                  {warning.tone === "warning" ? (
                    <AlertTriangle size={12} strokeWidth={1.85} className="feedback-label-icon" />
                  ) : (
                    <Info size={12} strokeWidth={1.85} className="feedback-label-icon" />
                  )}
                  <span>{warning.message}</span>
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
