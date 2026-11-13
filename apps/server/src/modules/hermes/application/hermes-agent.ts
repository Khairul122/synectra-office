import { OFFICE_STAFF_SKILLS } from '@synectra/contracts';
import { HERMES_PROFILE, hermesTenantFor, stripAnsi, type HermesCliRunner } from '../../../infrastructure/hermes-cli';
import { listClients } from '../../business/application/business-service';
import { listInvoices } from '../../invoice/application/invoice-service';
import { listPayments } from '../../payment/application/payment-service';
import { listReceiptJobs } from '../../deliveries/application/receipt-jobs';
import { getStaffSnapshot, listStaffWork } from '../../office/application/staff-activity';
import { getCalendarStore } from '../../calendar/application/calendar-service';

/**
 * Agen Hermes asli (CLI `hermes chat`), bukan pengklasifikasi buatan aplikasi ini.
 * Jawaban chat bebas dan evaluasi karyawan berasal dari agen ini; aplikasi hanya melampirkan data nyata.
 */
let agentRunner: HermesCliRunner | null = null;

export function setHermesAgentRunner(runner: HermesCliRunner | null): void {
  agentRunner = runner;
}

export function hermesAgentEnabled(): boolean {
  return agentRunner !== null;
}

const STAFF_LABEL = { hermes: 'Hermes (Lead)', admin: 'Administrasi', communication: 'Komunikasi' } as const;
const rupiah = (value: number) => `Rp${value.toLocaleString('id-ID')}`;
const wib = (value: Date | string) => new Date(value).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
const wibDay = (value: Date | string) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

function countBy<T>(items: T[], key: (item: T) => string): string {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts].map(([name, count]) => `${name} ${count}`).join(', ') || 'tidak ada';
}

/** Ringkasan data nyata kantor (tanpa simulasi) yang dilampirkan ke setiap pertanyaan untuk agen Hermes. */
export async function buildOfficeData(ownerId: string, now = new Date()): Promise<string> {
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const [clients, invoices, payments, receipts, runs, work] = await Promise.all([
    listClients(ownerId),
    listInvoices(ownerId),
    listPayments(ownerId),
    listReceiptJobs(ownerId),
    getCalendarStore().listRuns(ownerId, undefined, 100),
    listStaffWork(ownerId, since)
  ]);
  const verified = payments.filter(payment => payment.status === 'verified');
  const paidAt = (payment: (typeof payments)[number]) => payment.paymentDate ?? payment.verifiedAt ?? payment.createdAt;
  const sum = (list: typeof payments) => list.reduce((total, payment) => total + payment.amount, 0);
  const today = wibDay(now);
  const billed = invoices.filter(invoice => invoice.status === 'issued' || invoice.status === 'paid').reduce((total, invoice) => total + invoice.total, 0);

  const snapshot = getStaffSnapshot(ownerId);
  const recentReceipts = receipts.filter(job => Date.parse(job.updatedAt) >= since);
  const recentRuns = runs.filter(run => Date.parse(run.startedAt) >= since);
  const finished = recentReceipts.filter(job => job.status !== 'queued' && job.status !== 'processing');
  const failRate = finished.length ? `${Math.round(finished.filter(job => job.status !== 'submitted').length / finished.length * 100)}% gagal/tidak pasti dari ${finished.length} pengiriman selesai` : 'belum ada pengiriman selesai';
  const failures = recentReceipts.filter(job => job.status === 'failed' && job.error).slice(-5).map(job => job.error);

  const staffLines = (Object.keys(STAFF_LABEL) as Array<keyof typeof STAFF_LABEL>).map(id => {
    const own = work.filter(record => record.staff === id);
    const seconds = Math.round(own.reduce((total, record) => total + record.durationMs, 0) / 1000);
    const average = own.length ? ` rata-rata ${(seconds / own.length).toFixed(1)} detik/operasi;` : '';
    const current = snapshot.staff[id];
    return `- ${STAFF_LABEL[id]}: status sekarang ${current.active ? `BEKERJA (${current.activity})` : 'IDLE'}; 24 jam terakhir ${own.length} operasi selesai, total ${seconds} detik kerja;${average}${own.length ? ` (${countBy(own, record => record.activity)})` : ''}. Keahlian: ${OFFICE_STAFF_SKILLS[id].join('; ')}.`;
  });

  return [
    `Data nyata kantor Synectra per ${wib(now)} WIB (sumber: database aplikasi, bukan simulasi).`,
    `Keuangan: pendapatan terverifikasi total ${rupiah(sum(verified))} dari ${verified.length} pembayaran; hari ini ${rupiah(sum(verified.filter(p => wibDay(paidAt(p)) === today)))}; bulan ini ${rupiah(sum(verified.filter(p => wibDay(paidAt(p)).slice(0, 7) === today.slice(0, 7))))}. Total ditagihkan ${rupiah(billed)}; piutang ${rupiah(Math.max(billed - sum(verified), 0))}. Pembayaran menurut status: ${countBy(payments, p => p.status)}.`,
    `Nota: ${invoices.length} total (${countBy(invoices, invoice => invoice.status)}). Klien terdaftar: ${clients.length}.`,
    `Pengiriman nota WhatsApp: semua ${countBy(receipts, job => job.status)}; 24 jam terakhir ${countBy(recentReceipts, job => job.status)} (${failRate}).${failures.length ? ` Error terakhir: ${failures.join(' | ').slice(0, 400)}` : ''}`,
    `Jadwal otomatis 24 jam terakhir: ${recentRuns.length} eksekusi (${countBy(recentRuns, run => `${run.actor}/${run.status}`)}).`,
    `Karyawan (log operasi ${process.env.FIREBASE_USE_FIRESTORE === 'true' ? 'tersimpan di database' : 'dicatat sejak server terakhir dinyalakan'}):`,
    ...staffLines
  ].join('\n');
}

export class HermesAgentError extends Error {}

/** Kirim satu pertanyaan ke agen Hermes asli dan kembalikan jawabannya apa adanya. */
export async function askHermesAgent(ownerId: string, question: string, options?: { timeoutMs?: number; session?: string }): Promise<string> {
  if (!agentRunner) throw new HermesAgentError('Agen Hermes belum diaktifkan di server.');
  const data = await buildOfficeData(ownerId);
  const res = await agentRunner(
    [
      '-p', HERMES_PROFILE, 'chat', '-Q', '--source', 'tool',
      // Tanpa terminal/file/computer_use: chat web tidak boleh menyentuh mesin host.
      '-t', process.env.HERMES_CHAT_TOOLSETS || 'web,memory,skills,session_search',
      '--max-turns', '12',
      '--continue', `synectra-${options?.session ?? 'chat'}-${hermesTenantFor(ownerId)}`, '--create-if-missing',
      '-q', `[Lampiran otomatis dari aplikasi kantor]\n${data}\n[Akhir lampiran]\n\n${question}`
    ],
    { timeout: options?.timeoutMs ?? 120_000 }
  );
  const answer = stripAnsi(res.stdout).trim();
  if (res.exitCode !== 0 || !answer) {
    const detail = stripAnsi(`${res.stdout}\n${res.stderr}`);
    if (/MAX_CONCURRENT_SESSIONS/.test(detail)) throw new HermesAgentError('Hermes sedang dipakai sesi lain (batas 1 sesi aktif). Tutup sesi Hermes lain atau coba lagi sebentar lagi.');
    throw new HermesAgentError(`Agen Hermes tidak menjawab (exit ${res.exitCode}).`);
  }
  return answer.slice(0, 4000);
}

export const STAFF_EVALUATION_SCRIPT = 'staff_evaluation';
export const STAFF_EVALUATION_PROMPT = `Kamu Lead kantor ini. Lakukan evaluasi kinerja harian untuk tiga karyawan: Hermes (dirimu sendiri), Administrasi, dan Komunikasi.
Pakai HANYA data pada lampiran di atas. Jangan mengarang angka; bila data seorang karyawan kosong, katakan apa adanya.
Untuk tiap karyawan tulis: ringkasan kerja 24 jam terakhir, masalah yang terlihat (gagal kirim, antrean, idle), dan 1-3 tindakan konkret untuk meningkatkan kinerja besok.
Tutup dengan prioritas utama untuk pemilik. Tulis ringkas dalam bahasa Indonesia, teks polos tanpa tabel.`;
