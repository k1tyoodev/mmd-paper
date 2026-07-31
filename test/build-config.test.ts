import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const viteConfigPath = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const editorPath = fileURLToPath(new URL('../src/components/MermaidEditor.tsx', import.meta.url));
const vercelConfigPath = fileURLToPath(new URL('../vercel.json', import.meta.url));

await test('keeps Monaco runtime outside the eager manual chunk graph', async () => {
  const [viteConfig, editor] = await Promise.all([
    readFile(viteConfigPath, 'utf8'),
    readFile(editorPath, 'utf8'),
  ]);

  assert.doesNotMatch(viteConfig, /name:\s*["']editor-monaco["']/u);
  assert.match(editor, /import\(["']monaco-editor["']\)/u);
  assert.doesNotMatch(editor, /vs\/language\/.+\.worker\?worker/u);
});

await test('points Vercel at the packaged client output', async () => {
  const vercelConfig: unknown = JSON.parse(await readFile(vercelConfigPath, 'utf8'));

  assert.deepEqual(vercelConfig, {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    outputDirectory: 'dist/client',
  });
});
