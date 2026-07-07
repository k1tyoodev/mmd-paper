import assert from "node:assert/strict";
import test from "node:test";
import { normalizeTextOutputHtmlForDisplay } from "../src/utils/textOutputDisplay";

await test("wraps variable-width unicode structural glyphs in fixed cells", () => {
  const html = '<span class="line">A►B ▲ ●</span><span title="►">ok</span>';

  assert.equal(
    normalizeTextOutputHtmlForDisplay(html, "unicode"),
    '<span class="line">A<span class="unicode-cell-glyph">►</span>B <span class="unicode-cell-glyph">▲</span> <span class="unicode-cell-glyph">●</span></span><span title="►">ok</span>',
  );
});

await test("leaves ascii display html untouched", () => {
  const html = '<span class="line">A►B ▲ ●</span>';

  assert.equal(normalizeTextOutputHtmlForDisplay(html, "ascii"), html);
});
