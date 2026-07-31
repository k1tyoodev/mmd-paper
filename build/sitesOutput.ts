import { access, copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type CopySitesOutputOptions = {
  outputRoot: string;
  projectRoot: string;
};

export async function copySitesOutput({
  outputRoot,
  projectRoot,
}: CopySitesOutputOptions): Promise<void> {
  const clientDirectory = join(outputRoot, 'client');
  const serverDirectory = join(outputRoot, 'server');

  await access(clientDirectory);
  await mkdir(serverDirectory, { recursive: true });
  await Promise.all([
    copyFile(join(projectRoot, 'worker/index.js'), join(serverDirectory, 'index.js')),
    copyFile(join(projectRoot, 'worker/wrangler.json'), join(serverDirectory, 'wrangler.json')),
  ]);
}
