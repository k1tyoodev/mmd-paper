import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDividerKeyboardAction } from '../src/utils/splitPane';

await test('resolves divider arrow-key resize steps', () => {
  assert.deepEqual(resolveDividerKeyboardAction('ArrowLeft', false, 'split'), {
    type: 'resize',
    delta: -0.02,
  });
  assert.deepEqual(resolveDividerKeyboardAction('ArrowRight', true, 'split'), {
    type: 'resize',
    delta: 0.1,
  });
});

await test('restores a stable hidden pane from either arrow key', () => {
  assert.deepEqual(resolveDividerKeyboardAction('ArrowLeft', false, 'editor-hidden'), {
    type: 'restore',
  });
  assert.deepEqual(resolveDividerKeyboardAction('ArrowRight', false, 'preview-hidden'), {
    type: 'restore',
  });
});

await test('ignores unrelated keys and transitional workspace states', () => {
  assert.equal(resolveDividerKeyboardAction('Enter', false, 'split'), null);
  assert.equal(resolveDividerKeyboardAction('ArrowLeft', false, 'restoring-editor'), null);
});
