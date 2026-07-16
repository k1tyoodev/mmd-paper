import type { ColorMode } from '@/theme/vercel';

export function parseStoredColorMode(value: unknown): ColorMode {
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return 'system';
}

export function resolveColorMode(mode: ColorMode, prefersDark: boolean): 'light' | 'dark' {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }

  return prefersDark ? 'dark' : 'light';
}

export function nextColorMode(mode: ColorMode): ColorMode {
  if (mode === 'light') {
    return 'dark';
  }
  if (mode === 'dark') {
    return 'system';
  }

  return 'light';
}
