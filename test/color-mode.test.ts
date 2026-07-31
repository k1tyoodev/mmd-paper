import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import { nextColorMode, parseStoredColorMode, resolveColorMode } from '../src/utils/colorMode';

const indexPath = fileURLToPath(new URL('../index.html', import.meta.url));

async function readInlineThemeScript(): Promise<string> {
  const html = await readFile(indexPath, 'utf8');
  const match = /<script>([\s\S]*?)<\/script>/u.exec(html);
  assert.ok(match?.[1], 'Expected an inline theme script');
  return match[1];
}

function executeInlineThemeScript(
  script: string,
  storedMode: string | null,
  prefersDark: boolean,
  storageThrows = false,
): { dark: boolean; theme: string | undefined } {
  const dataset: Record<string, string> = {};
  let dark = false;

  runInNewContext(script, {
    document: {
      documentElement: {
        dataset,
        classList: {
          toggle: (name: string, enabled: boolean) => {
            if (name === 'dark') {
              dark = enabled;
            }
          },
        },
      },
    },
    localStorage: {
      getItem: () => {
        if (storageThrows) {
          throw new Error('storage disabled');
        }
        return storedMode;
      },
    },
    matchMedia: () => ({ matches: prefersDark }),
  });

  return { theme: dataset.theme, dark };
}

await test('keeps valid stored color modes as-is', () => {
  assert.equal(parseStoredColorMode('light'), 'light');
  assert.equal(parseStoredColorMode('dark'), 'dark');
  assert.equal(parseStoredColorMode('system'), 'system');
});

await test('normalizes invalid stored values to system', () => {
  assert.equal(parseStoredColorMode(undefined), 'system');
  assert.equal(parseStoredColorMode(null), 'system');
  assert.equal(parseStoredColorMode(''), 'system');
  assert.equal(parseStoredColorMode('sepia'), 'system');
  assert.equal(parseStoredColorMode(42), 'system');
});

await test('resolves explicit and system modes against the preferred scheme', () => {
  assert.equal(resolveColorMode('light', true), 'light');
  assert.equal(resolveColorMode('light', false), 'light');
  assert.equal(resolveColorMode('dark', true), 'dark');
  assert.equal(resolveColorMode('dark', false), 'dark');
  assert.equal(resolveColorMode('system', true), 'dark');
  assert.equal(resolveColorMode('system', false), 'light');
});

await test('cycles light to dark to system', () => {
  assert.equal(nextColorMode('light'), 'dark');
  assert.equal(nextColorMode('dark'), 'system');
  assert.equal(nextColorMode('system'), 'light');
});

await test('applies the stored or system theme before the app loads', async () => {
  const script = await readInlineThemeScript();

  assert.deepEqual(executeInlineThemeScript(script, 'light', true), {
    theme: 'light',
    dark: false,
  });
  assert.deepEqual(executeInlineThemeScript(script, 'dark', false), {
    theme: 'dark',
    dark: true,
  });
  assert.deepEqual(executeInlineThemeScript(script, 'system', true), {
    theme: 'dark',
    dark: true,
  });
  assert.deepEqual(executeInlineThemeScript(script, 'sepia', false), {
    theme: 'light',
    dark: false,
  });
});

await test('falls back to the system theme when storage is unavailable', async () => {
  const script = await readInlineThemeScript();

  assert.deepEqual(executeInlineThemeScript(script, null, true, true), {
    theme: 'dark',
    dark: true,
  });
});
