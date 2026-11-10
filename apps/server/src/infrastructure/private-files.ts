import { resolve, sep } from 'node:path';
import { mkdir } from 'node:fs/promises';

const root = resolve(process.env.PRIVATE_FILES_ROOT ?? '.local/private');
export const PRIVATE_FILES_ROOT = root;

export async function ensurePrivateFilesRoot() {
  await mkdir(root, { recursive: true });
  return root;
}

export function privateFilePath(ownerId: string, relativePath: string) {
  const ownerRoot = resolve(root, ownerId);
  const target = resolve(ownerRoot, relativePath);
  if (target !== ownerRoot && !target.startsWith(`${ownerRoot}${sep}`)) throw new Error('Invalid private file path');
  return target;
}
