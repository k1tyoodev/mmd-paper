import assert from 'node:assert/strict';
import test from 'node:test';

import { MAX_PNG_EDGE, MAX_PNG_PIXELS, resolvePngOutputSize } from '../src/utils/pngExport';

await test('keeps ordinary two-times PNG exports at their requested size', () => {
  assert.deepEqual(resolvePngOutputSize(1200, 800, 2), {
    width: 2400,
    height: 1600,
  });
});

await test('caps PNG exports by edge length and total pixel count', () => {
  const square = resolvePngOutputSize(5000, 5000, 2);
  const wide = resolvePngOutputSize(10_000, 1000, 2);

  assert.ok(square.width * square.height <= MAX_PNG_PIXELS);
  assert.ok(wide.width <= MAX_PNG_EDGE);
  assert.ok(wide.height <= MAX_PNG_EDGE);
  assert.equal(square.width, 4096);
  assert.equal(square.height, 4096);
  assert.deepEqual(wide, { width: 8192, height: 819 });
});

await test('normalizes invalid PNG scales', () => {
  assert.deepEqual(resolvePngOutputSize(320, 180, Number.NaN), {
    width: 320,
    height: 180,
  });
  assert.deepEqual(resolvePngOutputSize(320, 180, 0), {
    width: 320,
    height: 180,
  });
});
