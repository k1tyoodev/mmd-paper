import assert from "node:assert/strict";
import test from "node:test";
import {
  getNextZoomPercent,
  getPreviousZoomPercent,
  resolvePreviewShortcut,
  ZOOM_STEPS,
} from "../src/utils/previewControls";

await test("builds the approved mixed zoom ladder", () => {
  assert.deepEqual(ZOOM_STEPS.slice(0, 10), [5, 10, 15, 25, 33, 50, 75, 100, 125, 150]);
  assert.equal(ZOOM_STEPS.at(-1), 800);
});

await test("selects adjacent zoom steps around arbitrary scales", () => {
  assert.equal(getPreviousZoomPercent(63), 50);
  assert.equal(getNextZoomPercent(63), 75);
  assert.equal(getPreviousZoomPercent(50), 33);
  assert.equal(getNextZoomPercent(50), 75);
  assert.equal(getPreviousZoomPercent(5), null);
  assert.equal(getNextZoomPercent(800), null);
});

await test("resolves preview shortcuts only in their intended scope", () => {
  assert.equal(
    resolvePreviewShortcut({
      code: "Equal",
      key: "+",
      shiftKey: true,
      previewActive: true,
      editableTarget: false,
    }),
    "zoom-in",
  );
  assert.equal(
    resolvePreviewShortcut({
      code: "Digit1",
      key: "!",
      shiftKey: true,
      previewActive: true,
      editableTarget: false,
    }),
    "fit",
  );
  assert.equal(
    resolvePreviewShortcut({
      code: "Digit1",
      key: "!",
      shiftKey: true,
      previewActive: false,
      editableTarget: false,
    }),
    null,
  );
  assert.equal(
    resolvePreviewShortcut({
      code: "Slash",
      key: "?",
      shiftKey: true,
      previewActive: false,
      editableTarget: false,
    }),
    "shortcuts",
  );
});

await test("does not steal shortcuts from editable targets", () => {
  assert.equal(
    resolvePreviewShortcut({
      code: "Digit0",
      key: ")",
      shiftKey: true,
      previewActive: true,
      editableTarget: true,
    }),
    null,
  );
  assert.equal(
    resolvePreviewShortcut({
      code: "Slash",
      key: "?",
      shiftKey: true,
      previewActive: false,
      editableTarget: true,
    }),
    null,
  );
});
