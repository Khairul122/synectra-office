import { createHash, randomUUID } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ensurePrivateFilesRoot, PRIVATE_FILES_ROOT } from '../../../infrastructure/private-files';
import { listClients } from '../../business/application/business-service';
import { listInvoices } from '../../invoice/application/invoice-service';
import { listDeliveries } from '../../deliveries/application/delivery-service';
import { getCurrentSignature } from '../../invoice/application/signature-service';

export interface BackupManifestItem {
  path: string;
  sha256: string;
  size: number;
}

export interface BackupManifest {
  version: '1.0';
  ownerId: string;
  createdAt: string;
  workerQuiescent: boolean;
  metadataCount: {
    clients: number;
    invoices: number;
    deliveries: number;
  };
  files: BackupManifestItem[];
  manifestHash?: string;
}

let isWorkerQuiescent = false;

export function setWorkerQuiescent(quiescent: boolean): void {
  isWorkerQuiescent = quiescent;
}

export function getWorkerQuiescentState(): boolean {
  return isWorkerQuiescent;
}

export function computeSha256(data: Buffer | string): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function createOwnerBackup(params: {
  ownerId: string;
  targetDir: string;
  enforceQuiescent?: boolean;
}): Promise<BackupManifest> {
  const { ownerId, targetDir, enforceQuiescent = true } = params;

  if (enforceQuiescent && !isWorkerQuiescent) {
    throw new Error('Worker must be in quiescent state during backup');
  }

  await mkdir(targetDir, { recursive: true });
  const manifestFiles: BackupManifestItem[] = [];

  // 1. Ekspor metadata
  const clients = await listClients(ownerId);
  const invoices = await listInvoices(ownerId);
  const deliveries = await listDeliveries(ownerId);
  const signature = await getCurrentSignature(ownerId);

  const metadata = {
    ownerId,
    exportedAt: new Date().toISOString(),
    clients,
    invoices,
    deliveries,
    signature
  };

  const metaJson = JSON.stringify(metadata, null, 2);
  const metaRelativePath = 'metadata.json';
  const metaDest = join(targetDir, metaRelativePath);
  await writeFile(metaDest, metaJson, 'utf8');

  manifestFiles.push({
    path: metaRelativePath,
    sha256: computeSha256(metaJson),
    size: Buffer.byteLength(metaJson, 'utf8')
  });

  // 2. Ekspor private files lokal owner jika ada
  await ensurePrivateFilesRoot();
  const ownerPrivateDir = join(PRIVATE_FILES_ROOT, ownerId);

  if (existsSync(ownerPrivateDir)) {
    const filesDir = join(targetDir, 'files');
    await mkdir(filesDir, { recursive: true });

    async function walkAndCopy(currentDir: string, relBase: string): Promise<void> {
      const entries = await readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        const relPath = join(relBase, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          await walkAndCopy(fullPath, relPath);
        } else if (entry.isFile()) {
          const content = await readFile(fullPath);
          const destPath = join(filesDir, relPath);
          await mkdir(resolve(destPath, '..'), { recursive: true });
          await writeFile(destPath, content);

          manifestFiles.push({
            path: `files/${relPath}`,
            sha256: computeSha256(content),
            size: content.length
          });
        }
      }
    }

    await walkAndCopy(ownerPrivateDir, '');
  }

  // 3. Bangun manifest
  const manifest: BackupManifest = {
    version: '1.0',
    ownerId,
    createdAt: new Date().toISOString(),
    workerQuiescent: isWorkerQuiescent,
    metadataCount: {
      clients: clients.length,
      invoices: invoices.length,
      deliveries: deliveries.length
    },
    files: manifestFiles
  };

  const manifestPayloadForHash = JSON.stringify({
    version: manifest.version,
    ownerId: manifest.ownerId,
    createdAt: manifest.createdAt,
    files: manifest.files
  });
  manifest.manifestHash = computeSha256(manifestPayloadForHash);

  await writeFile(join(targetDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

export async function verifyAndRestoreBackup(params: {
  backupDir: string;
  restoreTargetDir: string;
  expectedOwnerId?: string;
}): Promise<{
  restoredFiles: number;
  metadata: { clients: number; invoices: number; deliveries: number };
  verified: boolean;
}> {
  const { backupDir, restoreTargetDir, expectedOwnerId } = params;

  const manifestPath = join(backupDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error('Backup manifest not found');
  }

  const manifestRaw = await readFile(manifestPath, 'utf8');
  const manifest: BackupManifest = JSON.parse(manifestRaw);

  if (expectedOwnerId && manifest.ownerId !== expectedOwnerId) {
    throw new Error(`Owner mismatch in backup: expected ${expectedOwnerId}, got ${manifest.ownerId}`);
  }

  // Verifikasi keaslian manifest hash
  const manifestPayloadForHash = JSON.stringify({
    version: manifest.version,
    ownerId: manifest.ownerId,
    createdAt: manifest.createdAt,
    files: manifest.files
  });
  const expectedHash = computeSha256(manifestPayloadForHash);
  if (manifest.manifestHash !== expectedHash) {
    throw new Error('Manifest tampering detected: checksum mismatch');
  }

  // Verifikasi setiap file terhadap manifest checksum
  for (const item of manifest.files) {
    const itemPath = join(backupDir, item.path);
    if (!existsSync(itemPath)) {
      throw new Error(`Missing backup artifact: ${item.path}`);
    }
    const content = await readFile(itemPath);
    const actualHash = computeSha256(content);
    if (actualHash !== item.sha256) {
      throw new Error(`Checksum mismatch for file ${item.path}`);
    }
  }

  // Pulihkan ke direktori target terisolasi
  await mkdir(restoreTargetDir, { recursive: true });

  for (const item of manifest.files) {
    const src = join(backupDir, item.path);
    const dest = join(restoreTargetDir, item.path);
    await mkdir(resolve(dest, '..'), { recursive: true });
    const content = await readFile(src);
    await writeFile(dest, content);
  }

  // Verifikasi metadata yang terpulihkan
  const restoredMetaPath = join(restoreTargetDir, 'metadata.json');
  const restoredMeta = JSON.parse(await readFile(restoredMetaPath, 'utf8'));

  return {
    restoredFiles: manifest.files.length,
    metadata: {
      clients: restoredMeta.clients?.length ?? 0,
      invoices: restoredMeta.invoices?.length ?? 0,
      deliveries: restoredMeta.deliveries?.length ?? 0
    },
    verified: true
  };
}

export interface PruneBackupsOptions {
  backupsBaseDir: string;
  retentionDays?: number;
  minKeepCount?: number;
  now?: () => Date;
}

export async function pruneBackups(options: PruneBackupsOptions): Promise<{
  pruned: string[];
  retained: string[];
}> {
  const { backupsBaseDir, retentionDays = 7, minKeepCount = 3 } = options;
  if (!existsSync(backupsBaseDir)) {
    return { pruned: [], retained: [] };
  }

  const entries = await readdir(backupsBaseDir, { withFileTypes: true });
  const backupFolders: Array<{ path: string; name: string; createdAt: Date }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = join(backupsBaseDir, entry.name);
    const manifestPath = join(fullPath, 'manifest.json');
    if (existsSync(manifestPath)) {
      try {
        const manifestRaw = await readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(manifestRaw) as Partial<BackupManifest>;
        const createdAt = manifest.createdAt ? new Date(manifest.createdAt) : (await stat(fullPath)).mtime;
        backupFolders.push({ path: fullPath, name: entry.name, createdAt });
      } catch {
        const stats = await stat(fullPath);
        backupFolders.push({ path: fullPath, name: entry.name, createdAt: stats.mtime });
      }
    }
  }

  // Sort newest first
  backupFolders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const now = options.now ? options.now() : new Date();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const pruned: string[] = [];
  const retained: string[] = [];

  for (let i = 0; i < backupFolders.length; i++) {
    const backup = backupFolders[i]!;
    const ageMs = now.getTime() - backup.createdAt.getTime();
    if (i < minKeepCount || ageMs <= maxAgeMs) {
      retained.push(backup.path);
    } else {
      await rm(backup.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      pruned.push(backup.path);
    }
  }

  return { pruned, retained };
}

export async function runDailyBackup(options: {
  ownerId: string;
  backupsBaseDir: string;
  retentionDays?: number;
  minKeepCount?: number;
}): Promise<{
  backupDir: string;
  manifest: BackupManifest;
  pruned: string[];
  retained: string[];
}> {
  const { ownerId, backupsBaseDir, retentionDays = 7, minKeepCount = 3 } = options;
  await mkdir(backupsBaseDir, { recursive: true });

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = join(backupsBaseDir, `backup-${timestampStr}`);

  const manifest = await createOwnerBackup({ ownerId, targetDir: backupDir });
  const pruneResult = await pruneBackups({
    backupsBaseDir,
    retentionDays,
    minKeepCount
  });

  return {
    backupDir,
    manifest,
    pruned: pruneResult.pruned,
    retained: pruneResult.retained
  };
}

