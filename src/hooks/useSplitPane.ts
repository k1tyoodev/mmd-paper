import { useCallback, useEffect, useRef, useState } from "react";
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type { WorkspaceMode } from "@/types/playground";
import { clamp } from "@/utils/color";

export type PendingCollapseTarget = "editor" | "preview" | null;

type StableHiddenWorkspaceMode = "editor-hidden" | "preview-hidden";

const SPLIT_DIVIDER_WIDTH = 10;

interface UseSplitPaneOptions {
  min?: number;
  max?: number;
  minLeftPx?: number;
  minRightPx?: number;
  collapseThresholdPx?: number;
}

interface UseSplitPaneParams {
  containerRef: RefObject<HTMLElement | null>;
  ratio: number;
  lastSplitRatio: number;
  workspaceMode: WorkspaceMode;
  setRatio: (value: number) => void;
  setLastSplitRatio: (value: number) => void;
  setWorkspaceMode: (value: WorkspaceMode) => void;
  options?: UseSplitPaneOptions;
}

interface ActiveDragState {
  startClientX: number;
  modeAtStart: WorkspaceMode;
  restoredFromHidden: boolean;
}

function isStableHiddenMode(mode: WorkspaceMode): mode is StableHiddenWorkspaceMode {
  return mode === "editor-hidden" || mode === "preview-hidden";
}

function canStartDividerDrag(mode: WorkspaceMode): boolean {
  return mode === "split" || isStableHiddenMode(mode);
}

export function useSplitPane({
  containerRef,
  ratio,
  lastSplitRatio,
  workspaceMode,
  setRatio,
  setLastSplitRatio,
  setWorkspaceMode,
  options,
}: UseSplitPaneParams) {
  const min = options?.min ?? 0.25;
  const max = options?.max ?? 0.75;
  const minLeftPx = options?.minLeftPx ?? 0;
  const minRightPx = options?.minRightPx ?? 0;
  const collapseThresholdPx = options?.collapseThresholdPx ?? 96;
  const [isDragging, setIsDragging] = useState(false);
  const [pendingCollapse, setPendingCollapseState] = useState<PendingCollapseTarget>(null);
  const activePointerId = useRef<number | null>(null);
  const captureElement = useRef<HTMLElement | null>(null);
  const ratioRef = useRef(ratio);
  const lastSplitRatioRef = useRef(lastSplitRatio);
  const workspaceModeRef = useRef(workspaceMode);
  const pendingCollapseRef = useRef<PendingCollapseTarget>(pendingCollapse);
  const activeDrag = useRef<ActiveDragState | null>(null);

  useEffect(() => {
    ratioRef.current = ratio;
  }, [ratio]);

  useEffect(() => {
    lastSplitRatioRef.current = lastSplitRatio;
  }, [lastSplitRatio]);

  useEffect(() => {
    workspaceModeRef.current = workspaceMode;
  }, [workspaceMode]);

  const setPendingCollapse = useCallback((target: PendingCollapseTarget): void => {
    pendingCollapseRef.current = target;
    setPendingCollapseState(target);
  }, []);

  const resolveRatioBounds = useCallback(
    (containerWidth: number) => {
      let minRatio = min;
      let maxRatio = max;
      if (containerWidth > 0) {
        minRatio = Math.max(minRatio, minLeftPx / containerWidth);
        maxRatio = Math.min(maxRatio, 1 - minRightPx / containerWidth);
      }

      if (minRatio <= maxRatio) {
        return { minRatio, maxRatio };
      }

      const locked = clamp(0.5, min, max);
      return { minRatio: locked, maxRatio: locked };
    },
    [max, min, minLeftPx, minRightPx],
  );

  const setHealthyRatio = useCallback(
    (nextRatio: number, containerWidth: number): void => {
      const { minRatio, maxRatio } = resolveRatioBounds(containerWidth);
      const clampedRatio = clamp(nextRatio, minRatio, maxRatio);
      ratioRef.current = clampedRatio;
      lastSplitRatioRef.current = clampedRatio;
      setRatio(clampedRatio);
      setLastSplitRatio(clampedRatio);
    },
    [resolveRatioBounds, setLastSplitRatio, setRatio],
  );

  const restoreToLastSplit = useCallback((): void => {
    const mode = workspaceModeRef.current;
    if (!isStableHiddenMode(mode)) {
      return;
    }

    const container = containerRef.current;
    const containerWidth = container?.getBoundingClientRect().width ?? 0;
    const fallbackRatio = containerWidth > 0 ? lastSplitRatioRef.current : 0.5;
    const { minRatio, maxRatio } = resolveRatioBounds(containerWidth);
    const nextRatio = clamp(fallbackRatio, minRatio, maxRatio);
    const nextMode = mode === "editor-hidden" ? "restoring-editor" : "restoring-preview";
    workspaceModeRef.current = nextMode;
    ratioRef.current = nextRatio;
    lastSplitRatioRef.current = nextRatio;
    setPendingCollapse(null);
    setRatio(nextRatio);
    setLastSplitRatio(nextRatio);
    setWorkspaceMode(nextMode);
  }, [
    containerRef,
    resolveRatioBounds,
    setLastSplitRatio,
    setPendingCollapse,
    setRatio,
    setWorkspaceMode,
  ]);

  const clampRatioToBounds = useCallback((): void => {
    if (workspaceModeRef.current !== "split") {
      return;
    }

    const container = containerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const { minRatio, maxRatio } = resolveRatioBounds(rect.width);
    const nextRatio = clamp(ratioRef.current, minRatio, maxRatio);
    if (nextRatio !== ratioRef.current) {
      ratioRef.current = nextRatio;
      lastSplitRatioRef.current = nextRatio;
      setRatio(nextRatio);
      setLastSplitRatio(nextRatio);
    }
  }, [containerRef, resolveRatioBounds, setLastSplitRatio, setRatio]);

  const updateSplitRatio = useCallback(
    (clientX: number, allowCollapse: boolean): void => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) {
        return;
      }

      const offsetX = clientX - rect.left;
      const collapseThreshold = Math.min(collapseThresholdPx, rect.width * 0.28);
      const liveRatioFloor = Math.min(0.5, SPLIT_DIVIDER_WIDTH / 2 / rect.width);
      const rawRatio = offsetX / rect.width;

      if (allowCollapse && offsetX <= collapseThreshold) {
        const pendingRatio = clamp(rawRatio, liveRatioFloor, 1 - liveRatioFloor);
        ratioRef.current = pendingRatio;
        setRatio(pendingRatio);
        setPendingCollapse("editor");
        return;
      }

      if (allowCollapse && rect.width - offsetX <= collapseThreshold) {
        const pendingRatio = clamp(rawRatio, liveRatioFloor, 1 - liveRatioFloor);
        ratioRef.current = pendingRatio;
        setRatio(pendingRatio);
        setPendingCollapse("preview");
        return;
      }

      setPendingCollapse(null);
      setHealthyRatio(offsetX / rect.width, rect.width);
    },
    [collapseThresholdPx, containerRef, setHealthyRatio, setPendingCollapse, setRatio],
  );

  const restoreFromHiddenDrag = useCallback(
    (clientX: number): void => {
      workspaceModeRef.current = "split";
      setWorkspaceMode("split");
      setPendingCollapse(null);
      updateSplitRatio(clientX, false);
    },
    [setPendingCollapse, setWorkspaceMode, updateSplitRatio],
  );

  const commitPendingCollapse = useCallback((): void => {
    const pendingTarget = pendingCollapseRef.current;
    if (!pendingTarget) {
      return;
    }

    const nextMode: WorkspaceMode =
      pendingTarget === "editor" ? "collapsing-editor" : "collapsing-preview";
    workspaceModeRef.current = nextMode;
    setWorkspaceMode(nextMode);
    setPendingCollapse(null);
  }, [setPendingCollapse, setWorkspaceMode]);

  const handleDividerPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      if (event.button !== 0) {
        return;
      }

      const target = event.currentTarget;
      const modeAtStart = workspaceModeRef.current;
      if (!canStartDividerDrag(modeAtStart)) {
        return;
      }

      setIsDragging(true);
      activePointerId.current = event.pointerId;
      captureElement.current = target;
      activeDrag.current = {
        startClientX: event.clientX,
        modeAtStart,
        restoredFromHidden: false,
      };

      if (modeAtStart === "split") {
        updateSplitRatio(event.clientX, true);
      }

      target.setPointerCapture?.(event.pointerId);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      event.preventDefault();
    },
    [updateSplitRatio],
  );

  const handleDividerDoubleClick = useCallback(
    (event: ReactMouseEvent<HTMLElement>): void => {
      event.preventDefault();
      if (workspaceModeRef.current !== "split") {
        restoreToLastSplit();
        return;
      }

      const container = containerRef.current;
      const width = container?.getBoundingClientRect().width ?? 0;
      setPendingCollapse(null);
      setHealthyRatio(0.5, width);
    },
    [containerRef, restoreToLastSplit, setHealthyRatio, setPendingCollapse],
  );

  useEffect(() => {
    function onPointerMove(event: PointerEvent): void {
      if (activePointerId.current === null || activePointerId.current !== event.pointerId) {
        return;
      }

      const drag = activeDrag.current;
      if (!drag) {
        return;
      }

      if (drag.modeAtStart === "editor-hidden" && !drag.restoredFromHidden) {
        if (event.clientX - drag.startClientX <= 2) {
          return;
        }
        drag.restoredFromHidden = true;
        restoreFromHiddenDrag(event.clientX);
        event.preventDefault();
        return;
      }

      if (drag.modeAtStart === "preview-hidden" && !drag.restoredFromHidden) {
        if (drag.startClientX - event.clientX <= 2) {
          return;
        }
        drag.restoredFromHidden = true;
        restoreFromHiddenDrag(event.clientX);
        event.preventDefault();
        return;
      }

      if (workspaceModeRef.current === "split") {
        updateSplitRatio(event.clientX, true);
      }

      event.preventDefault();
    }

    function stopDragging(event: PointerEvent, shouldCommit: boolean): void {
      if (activePointerId.current === null || activePointerId.current !== event.pointerId) {
        return;
      }

      if (shouldCommit && workspaceModeRef.current === "split") {
        commitPendingCollapse();
      } else {
        if (pendingCollapseRef.current) {
          ratioRef.current = lastSplitRatioRef.current;
          setRatio(lastSplitRatioRef.current);
        }
        setPendingCollapse(null);
      }

      captureElement.current?.releasePointerCapture?.(event.pointerId);
      captureElement.current = null;
      activePointerId.current = null;
      activeDrag.current = null;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }

    function onPointerUp(event: PointerEvent): void {
      stopDragging(event, true);
    }

    function onPointerCancel(event: PointerEvent): void {
      stopDragging(event, false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("resize", clampRatioToBounds);
    clampRatioToBounds();

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("resize", clampRatioToBounds);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [
    clampRatioToBounds,
    commitPendingCollapse,
    restoreFromHiddenDrag,
    setPendingCollapse,
    setRatio,
    updateSplitRatio,
  ]);

  return {
    isDragging,
    pendingCollapse,
    handleDividerPointerDown,
    handleDividerDoubleClick,
  };
}
