export const MIN_ZOOM_PERCENT = 5;
export const MAX_ZOOM_PERCENT = 800;

const LOW_ZOOM_STEPS = [5, 10, 15, 25, 33, 50] as const;

export const ZOOM_STEPS = [
  ...LOW_ZOOM_STEPS,
  ...Array.from({ length: (MAX_ZOOM_PERCENT - 75) / 25 + 1 }, (_, index) => 75 + index * 25),
];

const ZOOM_EPSILON = 0.01;

export function getPreviousZoomPercent(currentPercent: number): number | null {
  for (let index = ZOOM_STEPS.length - 1; index >= 0; index -= 1) {
    const step = ZOOM_STEPS[index];
    if (step !== undefined && step < currentPercent - ZOOM_EPSILON) {
      return step;
    }
  }

  return null;
}

export function getNextZoomPercent(currentPercent: number): number | null {
  return ZOOM_STEPS.find((step) => step > currentPercent + ZOOM_EPSILON) ?? null;
}

export type PreviewShortcutAction =
  | "fit"
  | "fullscreen"
  | "shortcuts"
  | "zoom-in"
  | "zoom-out"
  | "zoom-reset";

type ShortcutInput = {
  code: string;
  key: string;
  shiftKey: boolean;
  previewActive: boolean;
  editableTarget: boolean;
};

export function resolvePreviewShortcut(input: ShortcutInput): PreviewShortcutAction | null {
  if (input.editableTarget) {
    return null;
  }

  if (input.key === "?") {
    return "shortcuts";
  }

  if (!input.previewActive) {
    return null;
  }

  if (input.code === "Minus" && !input.shiftKey) {
    return "zoom-out";
  }
  if (input.code === "Equal" && input.shiftKey) {
    return "zoom-in";
  }
  if (input.code === "Digit0" && input.shiftKey) {
    return "zoom-reset";
  }
  if (input.code === "Digit1" && input.shiftKey) {
    return "fit";
  }
  if (input.code === "KeyF" && input.shiftKey) {
    return "fullscreen";
  }

  return null;
}
