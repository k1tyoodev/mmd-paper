import type { RenderOutputMode } from "@/types/playground";

const FIXED_WIDTH_UNICODE_GLYPHS = new Set([
  "▲",
  "△",
  "▶",
  "▷",
  "►",
  "▼",
  "▽",
  "◀",
  "◁",
  "◄",
  "◆",
  "◇",
  "○",
  "◎",
  "●",
  "◉",
  "◯",
]);

const FIXED_WIDTH_GLYPH_CLASS = "unicode-cell-glyph";

function wrapGlyph(char: string): string {
  return `<span class="${FIXED_WIDTH_GLYPH_CLASS}">${char}</span>`;
}

export function normalizeTextOutputHtmlForDisplay(
  html: string,
  outputMode: RenderOutputMode,
): string {
  if (outputMode !== "unicode") {
    return html;
  }

  let output = "";
  let index = 0;
  let insideTag = false;

  while (index < html.length) {
    const char = html[index];
    if (!char) {
      break;
    }

    if (char === "<") {
      insideTag = true;
      output += char;
      index += char.length;
      continue;
    }

    if (char === ">") {
      insideTag = false;
      output += char;
      index += char.length;
      continue;
    }

    const codePoint = html.codePointAt(index);
    if (codePoint === undefined) {
      break;
    }

    const grapheme = String.fromCodePoint(codePoint);
    output +=
      !insideTag && FIXED_WIDTH_UNICODE_GLYPHS.has(grapheme) ? wrapGlyph(grapheme) : grapheme;
    index += grapheme.length;
  }

  return output;
}
