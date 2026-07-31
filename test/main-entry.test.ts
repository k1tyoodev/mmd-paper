import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const entryPath = fileURLToPath(new URL('../src/main.tsx', import.meta.url));

await test('keeps Vercel telemetry lazy and opt-in for compatible hosts', async () => {
  const entry = await readFile(entryPath, 'utf8');

  assert.doesNotMatch(
    entry,
    /^import\s+(?:type\s+)?[\w{}*,\s]+from\s+["']@vercel\/analytics["']/mu,
    'main.tsx must not statically import @vercel/analytics',
  );
  assert.match(
    entry,
    /import\.meta\.env\.PROD\s*&&\s*import\.meta\.env\.VITE_VERCEL_ANALYTICS\s*===\s*["']true["']/u,
    'analytics must require an explicit compatible-host flag',
  );
  assert.match(
    entry,
    /import\(["']@vercel\/analytics["']\)/u,
    'analytics must be a lazy dynamic import',
  );
});
