import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { ensurePrivateFilesRoot, privateFilePath } from '../../../infrastructure/private-files';

const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
const signatures = new Map<string, SignatureAsset>();

export type SignatureAsset = {
  id: string;
  ownerId: string;
  version: number;
  fileId: string;
  relativePath: string;
  sha256: string;
  mimeType: 'image/png';
  size: number;
  status: 'ready';
  createdAt: string;
};

function ownerRef(ownerId: string) { return getAppFirestore().collection('owners').doc(ownerId); }
function signatureRef(ownerId: string, id: string) { return ownerRef(ownerId).collection('signature_assets').doc(id); }
function decodePng(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('data:image/png;base64,')) throw new Error('PNG signature required');
  const buffer = Buffer.from(value.slice('data:image/png;base64,'.length), 'base64');
  if (buffer.length === 0 || buffer.length > 2_000_000) throw new Error('Invalid signature size');
  if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) throw new Error('Invalid PNG signature');
  return buffer;
}

export async function createSignature(ownerId: string, value: unknown) {
  const buffer = decodePng(value);
  await ensurePrivateFilesRoot();
  const id = randomUUID();
  const previous = await getCurrentSignature(ownerId);
  const version = (previous?.version ?? 0) + 1;
  const fileId = randomUUID();
  const relativePath = `signatures/${fileId}.png`;
  const target = privateFilePath(ownerId, relativePath);
  await mkdir(privateFilePath(ownerId, 'signatures'), { recursive: true });
  const temporary = `${target}.tmp-${randomUUID()}`;
  const asset: SignatureAsset = { id, ownerId, version, fileId, relativePath, sha256: createHash('sha256').update(buffer).digest('hex'), mimeType: 'image/png', size: buffer.length, status: 'ready', createdAt: new Date().toISOString() };
  let renamed = false;
  try {
    await writeFile(temporary, buffer, { flag: 'wx' });
    await rename(temporary, target);
    renamed = true;
    if (useFirestore) await signatureRef(ownerId, id).set(asset);
    else signatures.set(`${ownerId}:${id}`, asset);
    return structuredClone(asset);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    if (renamed) await unlink(target).catch(() => undefined);
    throw error;
  }
}

export async function getCurrentSignature(ownerId: string) {
  if (useFirestore) {
    const snapshot = await ownerRef(ownerId).collection('signature_assets').orderBy('version', 'desc').limit(1).get();
    return snapshot.empty ? null : snapshot.docs[0]!.data() as SignatureAsset;
  }
  return [...signatures.values()].filter((asset) => asset.ownerId === ownerId).sort((a, b) => b.version - a.version)[0] ?? null;
}

export async function readSignature(ownerId: string, asset: SignatureAsset) {
  if (asset.ownerId !== ownerId) throw new Error('Signature owner mismatch');
  const buffer = await readFile(privateFilePath(ownerId, asset.relativePath));
  if (buffer.length !== asset.size || createHash('sha256').update(buffer).digest('hex') !== asset.sha256) throw new Error('Signature checksum mismatch');
  return buffer;
}

export async function reconcileSignatureAssets(ownerId: string) {
  const assets = useFirestore ? (await ownerRef(ownerId).collection('signature_assets').get()).docs.map((doc) => doc.data() as SignatureAsset) : [...signatures.values()].filter((asset) => asset.ownerId === ownerId);
  const removed: string[] = [];
  for (const asset of assets) {
    try {
      await readSignature(ownerId, asset);
    } catch {
      removed.push(asset.id);
      if (useFirestore) await signatureRef(ownerId, asset.id).delete(); else signatures.delete(`${ownerId}:${asset.id}`);
    }
  }
  return { checked: assets.length, removed };
}

export function resetSignatureDataForTests() { signatures.clear(); }
