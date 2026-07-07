import assert from "node:assert/strict";
import test from "node:test";
import { collectTextOutputWarnings } from "../src/utils/textOutputWarnings";

const ASCII_ONLY_RANGES = [{ start: 0x20, end: 0x7e }];

await test("reports unicode structural glyphs when the mono font lacks them", () => {
  const warnings = collectTextOutputWarnings(
    "A ──► B\n▲ ●",
    "unicode",
    '"Geist Mono", ui-monospace, monospace',
    ASCII_ONLY_RANGES,
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.id, "text-structure-glyphs");
  assert.match(warnings[0]?.message ?? "", /▲ \(U\+25B2\)/u);
  assert.match(warnings[0]?.message ?? "", /► \(U\+25BA\)/u);
  assert.match(warnings[0]?.message ?? "", /● \(U\+25CF\)/u);
});

await test("accepts an explicit symbol fallback for unicode structural glyphs", () => {
  const warnings = collectTextOutputWarnings(
    "A ──► B\n▲ ●",
    "unicode",
    '"Geist Mono", "Noto Sans Symbols 2", "Apple Symbols", ui-monospace, monospace',
    ASCII_ONLY_RANGES,
  );

  assert.deepEqual(warnings, []);
});

await test("keeps text glyph warnings even when structural symbols have a fallback", () => {
  const warnings = collectTextOutputWarnings(
    "节点 ──► Output",
    "unicode",
    '"Geist Mono", "Noto Sans Symbols 2", "Apple Symbols", ui-monospace, monospace',
    ASCII_ONLY_RANGES,
  );

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.id, "text-unsupported-glyphs");
  assert.match(warnings[0]?.message ?? "", /节 \(U\+8282\)/u);
});

await test("accepts an explicit CJK fallback for text glyphs", () => {
  const warnings = collectTextOutputWarnings(
    "中文 ──► Output",
    "unicode",
    '"Geist Mono", "Noto Sans SC", "Noto Sans Symbols 2", "Apple Symbols", ui-monospace, monospace',
    ASCII_ONLY_RANGES,
  );

  assert.deepEqual(warnings, []);
});
