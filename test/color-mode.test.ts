import assert from "node:assert/strict";
import test from "node:test";
import { nextColorMode, parseStoredColorMode, resolveColorMode } from "../src/utils/colorMode";

await test("keeps valid stored color modes as-is", () => {
  assert.equal(parseStoredColorMode("light"), "light");
  assert.equal(parseStoredColorMode("dark"), "dark");
  assert.equal(parseStoredColorMode("system"), "system");
});

await test("normalizes invalid stored values to system", () => {
  assert.equal(parseStoredColorMode(undefined), "system");
  assert.equal(parseStoredColorMode(null), "system");
  assert.equal(parseStoredColorMode(""), "system");
  assert.equal(parseStoredColorMode("sepia"), "system");
  assert.equal(parseStoredColorMode(42), "system");
});

await test("resolves explicit and system modes against the preferred scheme", () => {
  assert.equal(resolveColorMode("light", true), "light");
  assert.equal(resolveColorMode("light", false), "light");
  assert.equal(resolveColorMode("dark", true), "dark");
  assert.equal(resolveColorMode("dark", false), "dark");
  assert.equal(resolveColorMode("system", true), "dark");
  assert.equal(resolveColorMode("system", false), "light");
});

await test("cycles light to dark to system", () => {
  assert.equal(nextColorMode("light"), "dark");
  assert.equal(nextColorMode("dark"), "system");
  assert.equal(nextColorMode("system"), "light");
});
