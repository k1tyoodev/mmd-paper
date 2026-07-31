export const MAX_PNG_EDGE = 8192;
export const MAX_PNG_PIXELS = 16_777_216;

type PngOutputSize = {
  height: number;
  width: number;
};

export function resolvePngOutputSize(
  sourceWidth: number,
  sourceHeight: number,
  requestedScale: number,
): PngOutputSize {
  const normalizedScale =
    Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 1;
  const edgeScale = Math.min(
    normalizedScale,
    MAX_PNG_EDGE / sourceWidth,
    MAX_PNG_EDGE / sourceHeight,
  );
  const pixelScale = Math.sqrt(MAX_PNG_PIXELS / (sourceWidth * sourceHeight));
  const safeScale = Math.min(edgeScale, pixelScale);

  return {
    width: Math.max(1, Math.floor(sourceWidth * safeScale)),
    height: Math.max(1, Math.floor(sourceHeight * safeScale)),
  };
}
