import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const appPath = fileURLToPath(new URL('../src/App.tsx', import.meta.url));
const previewPath = fileURLToPath(new URL('../src/components/MermaidPreview.tsx', import.meta.url));

await test('keeps divider keyboard state wired to its accessible value', async () => {
  const app = await readFile(appPath, 'utf8');

  assert.match(app, /aria-valuenow=\{Math\.round\(state\.splitRatio \* 100\)\}/u);
  assert.match(app, /onKeyDown=\{handleDividerKeyDown\}/u);
});

await test('restores viewport menu focus through the percentage trigger', async () => {
  const preview = await readFile(previewPath, 'utf8');

  assert.match(preview, /ref=\{viewportButtonRef\}[\s\S]*className="zoom-percent-button"/u);
  assert.match(preview, /viewportButtonRef\.current\?\.focus\(\)/u);
  assert.match(preview, /closeViewportMenu\(\);[\s\S]*<Scan/u);
});
