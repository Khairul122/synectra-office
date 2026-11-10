import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { privateFilePath, ensurePrivateFilesRoot } from '../../../infrastructure/private-files';
import { getInvoice } from './invoice-service';
import { getClient, getProfile } from '../../business/application/business-service';
import { invoiceHtml } from './pdf-template';
import { getCurrentSignature, readSignature } from './signature-service';
import { getInvoicePaymentDetails, paymentFingerprint } from '../../payment/application/payment-service';
import { publishBusinessEvent } from '../../office/application/office-event-service';

const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
const chromium = process.env.CHROMIUM_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
export type PdfAsset = { id: string; ownerId: string; invoiceId: string; invoiceVersion: number; signatureAssetId: string; paymentFingerprint?: string; relativePath: string; sha256: string; size: number; mimeType: 'application/pdf'; status: 'ready'; createdAt: string };
const pdfs = new Map<string, PdfAsset>();
function ownerRef(ownerId: string) { return getAppFirestore().collection('owners').doc(ownerId); }
function pdfRef(ownerId: string, id: string) { return ownerRef(ownerId).collection('file_assets').doc(id); }
function runChromium(input: string, output: string) { return new Promise<void>((resolve, reject) => { const child = spawn(chromium, ['--headless', '--disable-gpu', '--no-sandbox', '--disable-network', '--no-pdf-header-footer', `--print-to-pdf=${output}`, input], { stdio: 'ignore' }); child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Chromium exited ${code}`))); }); }
export async function generateInvoicePdf(ownerId: string, invoiceId: string) {
  const invoice = await getInvoice(ownerId, invoiceId); if (!invoice) throw new Error('Invoice not found');
  if (invoice.status !== 'issued' && invoice.status !== 'paid') throw new Error('Invoice must be issued');
  const signature = await getCurrentSignature(ownerId); if (!signature) throw new Error('Signature not configured');
  await ensurePrivateFilesRoot();
  const signatureBuffer = await readSignature(ownerId, signature);
  const signatureData = `data:image/png;base64,${signatureBuffer.toString('base64')}`;
  const [paymentDetails, profile, client] = await Promise.all([getInvoicePaymentDetails(ownerId, invoiceId), getProfile(ownerId), getClient(ownerId, invoice.clientId)]);
  const id = randomUUID(); const relativePath = `invoices/${invoiceId}/${id}.pdf`; const target = privateFilePath(ownerId, relativePath); const temporary = `${target}.tmp-${randomUUID()}`; const htmlPath = privateFilePath(ownerId, `invoices/${invoiceId}/${id}.html`);
  await mkdir(privateFilePath(ownerId, `invoices/${invoiceId}`), { recursive: true });
  await writeFile(htmlPath, invoiceHtml(invoice, paymentDetails.summary, signatureData, profile, client, paymentDetails.payments), { flag: 'wx' });
  let renamed = false;
  try {
    await runChromium(htmlPath, temporary); const buffer = await readFile(temporary); await rename(temporary, target); renamed = true;
    const asset: PdfAsset = { id, ownerId, invoiceId, invoiceVersion: invoice.version, signatureAssetId: signature.id, paymentFingerprint: paymentFingerprint(paymentDetails.payments), relativePath, sha256: createHash('sha256').update(buffer).digest('hex'), size: buffer.length, mimeType: 'application/pdf', status: 'ready', createdAt: new Date().toISOString() };
    if (useFirestore) await pdfRef(ownerId, id).set(asset); else pdfs.set(`${ownerId}:${id}`, asset);
    await unlink(htmlPath).catch(() => undefined);
    publishBusinessEvent({ type: 'pdf_generated', ownerId, invoiceId, invoiceNumber: invoice.number, status: { workState: 'working', heartbeatAt: Date.now(), activity: 'PDF nota selesai dibuat' } }).catch(() => undefined);
    return asset;
  } catch (error) { await unlink(temporary).catch(() => undefined); if (renamed) await unlink(target).catch(() => undefined); await unlink(htmlPath).catch(() => undefined); throw error; }
}
export async function getPdfAsset(ownerId: string, id: string) { if (useFirestore) { const snapshot = await pdfRef(ownerId, id).get(); return snapshot.exists ? snapshot.data() as PdfAsset : null; } return pdfs.get(`${ownerId}:${id}`) ?? null; }
export async function findLatestPdfAssetForInvoice(ownerId: string, invoiceId: string): Promise<PdfAsset | null> {
  const assets = useFirestore
    ? (await ownerRef(ownerId).collection('file_assets').where('invoiceId', '==', invoiceId).get()).docs.map((doc) => doc.data() as PdfAsset)
    : [...pdfs.values()].filter((asset) => asset.ownerId === ownerId && asset.invoiceId === invoiceId);
  if (assets.length === 0) return null;
  assets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return assets[0]!;
}
export async function findPdfAssetByHash(ownerId: string, invoiceId: string, sha256: string): Promise<PdfAsset | null> {
  const assets = useFirestore
    ? (await ownerRef(ownerId).collection('file_assets').where('sha256', '==', sha256).get()).docs.map((doc) => doc.data() as PdfAsset)
    : [...pdfs.values()].filter((asset) => asset.ownerId === ownerId && asset.sha256 === sha256);
  return assets.find((asset) => asset.invoiceId === invoiceId) ?? null;
}
export async function readPdf(ownerId: string, asset: PdfAsset) { const buffer = await readFile(privateFilePath(ownerId, asset.relativePath)); if (createHash('sha256').update(buffer).digest('hex') !== asset.sha256) throw new Error('PDF checksum mismatch'); return buffer; }
export async function reconcilePdfAssets(ownerId: string) {
  const assets = useFirestore ? (await ownerRef(ownerId).collection('file_assets').get()).docs.map((doc) => doc.data() as PdfAsset) : [...pdfs.values()].filter((asset) => asset.ownerId === ownerId);
  const missing = [] as string[];
  for (const asset of assets) { try { await readPdf(ownerId, asset); } catch { missing.push(asset.id); if (useFirestore) await pdfRef(ownerId, asset.id).delete(); else pdfs.delete(`${ownerId}:${asset.id}`); } }
  return { checked: assets.length, removed: missing };
}
export function resetPdfDataForTests() { pdfs.clear(); }
export function setPdfAssetForTests(asset: PdfAsset) { pdfs.set(`${asset.ownerId}:${asset.id}`, asset); }
