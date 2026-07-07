import type { RenderOutputMode, TextOutputWarning } from "@/types/playground";

export type TextOutputMode = Exclude<RenderOutputMode, "svg">;

export type UnicodeRange = {
  start: number;
  end: number;
};

const MAX_WARNING_EXAMPLES = 6;
const STRUCTURAL_SYMBOL_FALLBACK_FONTS = new Set([
  "Apple Symbols",
  "Noto Sans Symbols",
  "Noto Sans Symbols 2",
  "Segoe UI Symbol",
  "Symbola",
]);
const CJK_TEXT_FALLBACK_FONTS = new Set([
  "Hiragino Sans GB",
  "Microsoft YaHei",
  "Noto Sans CJK SC",
  "Noto Sans SC",
  "PingFang SC",
  "Source Han Sans SC",
]);

const STRUCTURAL_CHARS: Record<TextOutputMode, Set<string>> = {
  ascii: new Set([
    "+",
    "-",
    "=",
    "|",
    ":",
    ".",
    "<",
    ">",
    "^",
    "v",
    "(",
    ")",
    "'",
    '"',
    "/",
    "\\",
    "#",
    "*",
    "o",
    "@",
    "~",
    "_",
    "[",
    "]",
    "{",
    "}",
    "‖",
  ]),
  unicode: new Set([
    "·",
    "⌜",
    "⌝",
    "⌞",
    "⌟",
    "─",
    "━",
    "│",
    "┃",
    "┄",
    "┆",
    "┊",
    "┌",
    "┐",
    "└",
    "┘",
    "├",
    "┤",
    "┬",
    "┴",
    "┼",
    "╌",
    "═",
    "║",
    "╔",
    "╗",
    "╚",
    "╝",
    "╟",
    "╢",
    "╭",
    "╮",
    "╯",
    "╰",
    "╱",
    "╲",
    "╴",
    "╵",
    "╶",
    "╷",
    "█",
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
  ]),
};

let graphemeSegmenter:
  | {
      segment: (input: string) => Iterable<{ segment: string }>;
    }
  | null
  | undefined = undefined;

function getGraphemeSegmenter(): {
  segment: (input: string) => Iterable<{ segment: string }>;
} | null {
  if (graphemeSegmenter !== undefined) {
    return graphemeSegmenter;
  }

  const intlWithSegmenter = Intl as unknown as {
    Segmenter?: new (
      locales?: string | string[],
      options?: { granularity: "grapheme" },
    ) => {
      segment: (input: string) => Iterable<{ segment: string }>;
    };
  };

  graphemeSegmenter = intlWithSegmenter.Segmenter
    ? new intlWithSegmenter.Segmenter(undefined, { granularity: "grapheme" })
    : null;

  return graphemeSegmenter;
}

function splitGraphemes(text: string): string[] {
  const segmenter = getGraphemeSegmenter();
  if (!segmenter) {
    return Array.from(text);
  }

  return Array.from(segmenter.segment(text), (entry) => entry.segment);
}

function stripFontFamilyQuotes(fontFamily: string): string {
  return fontFamily.trim().replace(/^["']|["']$/gu, "");
}

function splitFontFamilyList(fontFamily: string): string[] {
  return fontFamily
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(stripFontFamilyQuotes);
}

function resolvePrimaryFontName(fontFamily: string): string {
  const [primary] = splitFontFamilyList(fontFamily);

  if (!primary) {
    return "monospace";
  }

  return primary;
}

function hasStructuralSymbolFallback(fontFamily: string): boolean {
  return splitFontFamilyList(fontFamily).some((family) =>
    STRUCTURAL_SYMBOL_FALLBACK_FONTS.has(family),
  );
}

function hasCjkTextFallback(fontFamily: string): boolean {
  return splitFontFamilyList(fontFamily).some((family) => CJK_TEXT_FALLBACK_FONTS.has(family));
}

function isStructuralSymbolFallbackGlyph(grapheme: string): boolean {
  const [char] = Array.from(grapheme);
  const codePoint = char?.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }

  return (
    (codePoint >= 0x2300 && codePoint <= 0x23ff) ||
    (codePoint >= 0x2500 && codePoint <= 0x259f) ||
    (codePoint >= 0x25a0 && codePoint <= 0x25ff)
  );
}

function isCjkFallbackGlyph(grapheme: string): boolean {
  const [char] = Array.from(grapheme);
  const codePoint = char?.codePointAt(0);
  if (codePoint === undefined) {
    return false;
  }

  return (
    (codePoint >= 0x2e80 && codePoint <= 0x2eff) ||
    (codePoint >= 0x3000 && codePoint <= 0x303f) ||
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef)
  );
}

function isCodePointCovered(codePoint: number, ranges: UnicodeRange[]): boolean {
  for (const range of ranges) {
    if (codePoint >= range.start && codePoint <= range.end) {
      return true;
    }
  }

  return false;
}

function isGraphemeCovered(grapheme: string, ranges: UnicodeRange[] | null): boolean {
  if (!ranges) {
    return true;
  }

  for (const char of Array.from(grapheme)) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    if (!isCodePointCovered(codePoint, ranges)) {
      return false;
    }
  }

  return true;
}

function glyphLabel(grapheme: string): string {
  if (grapheme === " ") {
    return "SPACE (U+0020)";
  }

  const codePoints = Array.from(grapheme).map(
    (char) => `U+${char.codePointAt(0)?.toString(16).toUpperCase().padStart(4, "0") ?? "0000"}`,
  );

  return `${grapheme} (${codePoints.join(" + ")})`;
}

function summarizeGlyphs(glyphs: Set<string>): string {
  const ordered = Array.from(glyphs).toSorted((a, b) => a.codePointAt(0)! - b.codePointAt(0)!);
  const visible = ordered.slice(0, 3).map(glyphLabel);
  const remaining = ordered.length - visible.length;

  if (remaining < 3) {
    return ordered.map(glyphLabel).join(", ");
  }

  return `${visible.join(", ")}, ... (${remaining} more)`;
}

function collectUnsupportedGlyphs(
  graphemes: Set<string>,
  include: (grapheme: string) => boolean,
  ranges: UnicodeRange[] | null,
): Set<string> {
  const unsupported = new Set<string>();

  for (const grapheme of graphemes) {
    if (!include(grapheme)) {
      continue;
    }

    if (!isGraphemeCovered(grapheme, ranges)) {
      unsupported.add(grapheme);
    }
  }

  return unsupported;
}

export function collectTextOutputWarnings(
  plainText: string,
  mode: TextOutputMode,
  monoFontFamily: string,
  ranges: UnicodeRange[] | null,
): TextOutputWarning[] {
  const structuralSet = STRUCTURAL_CHARS[mode];
  const graphemes = new Set(splitGraphemes(plainText));
  const primaryFont = resolvePrimaryFontName(monoFontFamily);
  const hasSymbolFallback = hasStructuralSymbolFallback(monoFontFamily);
  const hasCjkFallback = hasCjkTextFallback(monoFontFamily);
  const keyPrefix = `${mode}\u0000${primaryFont}`;

  const unsupportedStructure = collectUnsupportedGlyphs(
    graphemes,
    (grapheme) => structuralSet.has(grapheme),
    ranges,
  );

  const unsupportedText = collectUnsupportedGlyphs(
    graphemes,
    (grapheme) => grapheme.length > 0 && grapheme.trim().length > 0 && !structuralSet.has(grapheme),
    ranges,
  );

  if (hasSymbolFallback) {
    for (const grapheme of Array.from(unsupportedStructure)) {
      if (isStructuralSymbolFallbackGlyph(grapheme)) {
        unsupportedStructure.delete(grapheme);
      }
    }
  }

  if (hasCjkFallback) {
    for (const grapheme of Array.from(unsupportedText)) {
      if (isCjkFallbackGlyph(grapheme)) {
        unsupportedText.delete(grapheme);
      }
    }
  }

  const warnings: TextOutputWarning[] = [];

  if (unsupportedText.size > 0) {
    const unsupportedTextList = Array.from(unsupportedText).toSorted();
    warnings.push({
      key: `${keyPrefix}\u0000text-unsupported-glyphs\u0000${unsupportedTextList.join("")}`,
      id: "text-unsupported-glyphs",
      tone: "warning",
      message: `The following glyphs are not supported by "${primaryFont}": ${summarizeGlyphs(unsupportedText)}. Glyph width may differ; labels can shift.`,
      examples: unsupportedTextList.slice(0, MAX_WARNING_EXAMPLES).map(glyphLabel),
    });
  }

  if (unsupportedStructure.size > 0) {
    const unsupportedStructureList = Array.from(unsupportedStructure).toSorted();
    warnings.push({
      key: `${keyPrefix}\u0000text-structure-glyphs\u0000${unsupportedStructureList.join("")}`,
      id: "text-structure-glyphs",
      tone: "info",
      message: `The following glyphs are not supported by "${primaryFont}": ${summarizeGlyphs(unsupportedStructure)}. Fallback glyphs can alter connector and border shapes.`,
      examples: unsupportedStructureList.slice(0, MAX_WARNING_EXAMPLES).map(glyphLabel),
    });
  }

  return warnings;
}
