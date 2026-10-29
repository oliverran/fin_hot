import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { config } from '@aihot/backend/config';
export const snapshotFile = (name: string) => path.join(config.dataDir, 'chronicle', `${name}.json`);
export async function readSnapshot<T>(name: string): Promise<T | null> {
  try { return JSON.parse(await readFile(snapshotFile(name), 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
export async function saveSnapshot(name: string, value: unknown) {
  const file = snapshotFile(name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(value));
  await rename(`${file}.tmp`, file);
}
