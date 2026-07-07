import { useEffect, useMemo, useState } from "react";
import type { RenderOutputMode, TextOutputWarning } from "@/types/playground";
import {
  collectTextOutputWarnings,
  type TextOutputMode,
  type UnicodeRange,
} from "@/utils/textOutputWarnings";

const unicodeRangesByCssUrl = new Map<string, UnicodeRange[] | null>();
const unicodeRangesPromiseByCssUrl = new Map<string, Promise<UnicodeRange[] | null>>();

function htmlToText(html: string): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.textContent ?? "";
}

function parseUnicodeRangeToken(token: string): UnicodeRange | null {
  const match = token.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/iu);
  if (!match) {
    return null;
  }

  const [, startToken, endToken] = match;
  if (!startToken) {
    return null;
  }

  if (endToken) {
    const start = Number.parseInt(startToken, 16);
    const end = Number.parseInt(endToken, 16);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      return null;
    }

    return { start, end };
  }

  if (startToken.includes("?")) {
    const start = Number.parseInt(startToken.replace(/\?/gu, "0"), 16);
    const end = Number.parseInt(startToken.replace(/\?/gu, "F"), 16);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
      return null;
    }

    return { start, end };
  }

  const codePoint = Number.parseInt(startToken, 16);
  if (!Number.isFinite(codePoint)) {
    return null;
  }

  return { start: codePoint, end: codePoint };
}

function parseUnicodeRanges(cssText: string): UnicodeRange[] {
  const ranges: UnicodeRange[] = [];
  const regex = /unicode-range\s*:\s*([^;]+);/giu;
  let match = regex.exec(cssText);

  while (match) {
    const [, list] = match;
    if (list) {
      for (const token of list.split(",")) {
        const range = parseUnicodeRangeToken(token);
        if (range) {
          ranges.push(range);
        }
      }
    }

    match = regex.exec(cssText);
  }

  return ranges;
}

async function loadUnicodeRanges(cssUrl: string): Promise<UnicodeRange[] | null> {
  const cached = unicodeRangesByCssUrl.get(cssUrl);
  if (cached !== undefined) {
    return cached;
  }

  const pending = unicodeRangesPromiseByCssUrl.get(cssUrl);
  if (pending) {
    return pending;
  }

  const promise = (async () => {
    try {
      const response = await fetch(cssUrl);
      if (!response.ok) {
        return null;
      }

      const cssText = await response.text();
      const ranges = parseUnicodeRanges(cssText);
      return ranges.length > 0 ? ranges : null;
    } catch {
      return null;
    }
  })();

  unicodeRangesPromiseByCssUrl.set(cssUrl, promise);
  const ranges = await promise;
  unicodeRangesPromiseByCssUrl.delete(cssUrl);
  unicodeRangesByCssUrl.set(cssUrl, ranges);
  return ranges;
}

export function useTextOutputWarnings(
  asciiHtml: string | null,
  selectedOutputMode: RenderOutputMode,
  renderedTextOutputMode: TextOutputMode | null,
  monoFontFamily: string,
  monoFontCssUrl: string | null,
): TextOutputWarning[] {
  const [rangesVersion, setRangesVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      if (monoFontCssUrl) {
        await loadUnicodeRanges(monoFontCssUrl);
      }

      if (!cancelled) {
        setRangesVersion((value) => value + 1);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [monoFontCssUrl]);

  return useMemo<TextOutputWarning[]>(() => {
    void rangesVersion;

    if (selectedOutputMode === "svg") {
      return [];
    }

    const mode = renderedTextOutputMode;
    if (!mode || mode !== selectedOutputMode) {
      return [];
    }

    const ascii = asciiHtml;
    if (!ascii) {
      return [];
    }

    const plainText = htmlToText(ascii);
    if (!plainText) {
      return [];
    }

    const cssUrl = monoFontCssUrl;
    const ranges = cssUrl ? (unicodeRangesByCssUrl.get(cssUrl) ?? null) : null;
    return collectTextOutputWarnings(plainText, mode, monoFontFamily, ranges);
  }, [
    asciiHtml,
    monoFontCssUrl,
    monoFontFamily,
    rangesVersion,
    renderedTextOutputMode,
    selectedOutputMode,
  ]);
}
