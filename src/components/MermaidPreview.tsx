import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleX,
  Copy,
  Info,
  Maximize2,
  Minimize2,
  Scan,
} from "lucide-react";
import { RENDER_OUTPUT_MODE_OPTIONS, TEXT_COLOR_MODE_OPTIONS } from "@/types/playground";
import type { RenderOutputMode, TextColorMode, TextOutputWarning } from "@/types/playground";
import { clamp } from "@/utils/color";

type ViewportPoint = {
  x: number;
  y: number;
};

type ContentSize = {
  width: number;
  height: number;
};

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
  transparentApplied: boolean;
  onOutputModeChange: (value: RenderOutputMode) => void;
  onCopySvg: () => void;
  onCopyPng: () => void;
  onDownloadSvg: () => void;
  onDownloadPng: () => void;
  onCopyText: (payload: { mode: TextOutputMode; colorMode: TextColorMode }) => void;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;
const FIT_MAX_SCALE = 1;
const WHEEL_ZOOM_SPEED = 0.0018;
const FIT_PADDING = 36;

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
    Boolean(target.closest(".feedback-layer, .preview-toolbar-row, .preview-viewport-controls"))
  );
}

export default function MermaidPreview(props: MermaidPreviewProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const svgHostRef = useRef<HTMLDivElement | null>(null);
  const textCanvasRef = useRef<HTMLPreElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
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
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const hasCurrentOutput =
    props.outputMode === "svg" ? Boolean(props.svg) : Boolean(props.asciiHtml);
  const zoomLabel = `${Math.round(scale * 100)}%`;
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
    setIsExportMenuOpen(false);
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
    setIsFullscreen((value) => !value);
  }

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    const id = requestAnimationFrame(() => zoomToFit());
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(id);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFullscreen, zoomToFit]);

  useEffect(() => {
    if (!isExportMenuOpen) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      if (!exportMenuRef.current?.contains(event.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const renderedOffsetX = props.outputMode === "svg" ? snapToDevicePixel(offset.x) : offset.x;
  const renderedOffsetY = props.outputMode === "svg" ? snapToDevicePixel(offset.y) : offset.y;

  return (
    <section className="panel-shell" aria-label="Diagram preview">
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
              onClick={() => setIsExportMenuOpen((value) => !value)}
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
          ]
            .filter(Boolean)
            .join(" ")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
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
            <button
              type="button"
              className="icon-button"
              disabled={!hasCurrentOutput}
              aria-label={isFullscreen ? "Exit viewport fullscreen" : "Open viewport fullscreen"}
              title={isFullscreen ? "Exit viewport fullscreen" : "Viewport fullscreen"}
              onClick={toggleViewportFullscreen}
            >
              {isFullscreen ? (
                <Minimize2 size={14} strokeWidth={1.7} />
              ) : (
                <Maximize2 size={14} strokeWidth={1.7} />
              )}
            </button>
            <button
              type="button"
              className="icon-button"
              disabled={!hasCurrentOutput}
              aria-label="Zoom to fit"
              title="Zoom to fit"
              onClick={() => zoomToFit()}
            >
              <Scan size={14} strokeWidth={1.7} />
            </button>
            <button
              type="button"
              className="zoom-percent-button"
              disabled={!hasCurrentOutput}
              aria-label="Zoom to 100%"
              title="Zoom to 100%"
              onClick={zoomToOneHundredPercent}
            >
              {zoomLabel}
            </button>
          </div>

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
