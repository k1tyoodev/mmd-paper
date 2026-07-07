export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const HEX_COLOR_PATTERN = /^[\da-f]{3}$|^[\da-f]{4}$|^[\da-f]{6}$|^[\da-f]{8}$/iu;

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampByte(value: number): number {
  return clamp(Math.round(value), 0, 255);
}

export function toHexChannel(value: number): string {
  return clampByte(value).toString(16).padStart(2, "0");
}

export function parseHexColor(input: string): RgbaColor | null {
  const normalized = input.trim().replace(/^#/u, "");
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    return null;
  }

  if (normalized.length === 3 || normalized.length === 4) {
    const [r, g, b, a] = normalized.split("");
    if (!r || !g || !b) {
      return null;
    }

    return {
      r: Number.parseInt(r + r, 16),
      g: Number.parseInt(g + g, 16),
      b: Number.parseInt(b + b, 16),
      a: a ? Number.parseInt(a + a, 16) / 255 : 1,
    };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
    a: normalized.length === 8 ? Number.parseInt(normalized.slice(6, 8), 16) / 255 : 1,
  };
}
