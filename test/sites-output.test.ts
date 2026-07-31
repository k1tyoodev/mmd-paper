import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { copySitesOutput } from '../build/sitesOutput';

await test('copies a complete Sites server bundle beside the client output', async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'mmd-paper-sites-'));
  context.after(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  const outputRoot = join(projectRoot, 'dist');
  await mkdir(join(projectRoot, 'worker'), { recursive: true });
  await mkdir(join(outputRoot, 'client'), { recursive: true });
  await Promise.all([
    writeFile(join(projectRoot, 'worker/index.js'), 'export default {};\n'),
    writeFile(join(projectRoot, 'worker/wrangler.json'), '{"main":"index.js"}\n'),
    writeFile(join(outputRoot, 'client/index.html'), '<div>app</div>\n'),
  ]);

  await copySitesOutput({ projectRoot, outputRoot });

  assert.equal(await readFile(join(outputRoot, 'server/index.js'), 'utf8'), 'export default {};\n');
  assert.equal(
    await readFile(join(outputRoot, 'server/wrangler.json'), 'utf8'),
    '{"main":"index.js"}\n',
  );
  assert.equal(await readFile(join(outputRoot, 'client/index.html'), 'utf8'), '<div>app</div>\n');
});

await test('rejects a server bundle when the client output is missing', async (context) => {
  const projectRoot = await mkdtemp(join(tmpdir(), 'mmd-paper-sites-missing-'));
  context.after(async () => {
    await rm(projectRoot, { recursive: true, force: true });
  });

  await assert.rejects(
    copySitesOutput({
      projectRoot,
      outputRoot: join(projectRoot, 'dist'),
    }),
  );
});
