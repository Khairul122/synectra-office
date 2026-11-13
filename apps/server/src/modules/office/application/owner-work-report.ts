import type { Invoice, KanbanStatus, KanbanTask } from '@synectra/contracts';
import type { WhatsappService } from '../../whatsapp/application/whatsapp-service';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { findOwnersByWhatsapp, getProfile, listClients, listOwnerWhatsapps } from '../../business/application/business-service';
import { listInvoices } from '../../invoice/application/invoice-service';
import { listPayments } from '../../payment/application/payment-service';
import { listReceiptJobs } from '../../deliveries/application/receipt-jobs';
import { getBoardSnapshot, transitionTask } from '../../kanban/application/kanban-service';
import { createSchedule, getCalendarStore } from '../../calendar/application/calendar-service';
import { beginStaffActivity } from './staff-activity';

const STATUS_LABEL: Record<KanbanStatus, string> = { triage: 'Triase', todo: 'To do', scheduled: 'Terjadwal', ready: 'Siap', running: 'Dikerjakan', blocked: 'Terhambat', review: 'Perlu review', done: 'Selesai', archived: 'Arsip' };
const OPEN_ORDER: KanbanStatus[] = ['blocked', 'review', 'running', 'ready', 'scheduled', 'todo', 'triage'];
const MAX_ROWS = 15;
// ponytail: nota belum punya jatuh tempo; piutang dianggap terlambat 14 hari setelah terbit. Ganti dengan field dueDate bila ditambahkan.
const OVERDUE_DAYS = 14;
const DAY_MS = 86_400_000;
const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';

const rupiah = (value: number) => `Rp${value.toLocaleString('id-ID')}`;
const capped = (rows: string[]) => rows.length > MAX_ROWS ? [...rows.slice(0, MAX_ROWS), `…dan ${rows.length - MAX_ROWS} lainnya (lihat aplikasi)`] : rows;
const isOpen = (task: KanbanTask) => OPEN_ORDER.includes(task.status);
const issuedAt = (invoice: Invoice) => Date.parse(invoice.revisions.at(-1)?.createdAt ?? '') || 0;
const ageDays = (fromMs: number, now: Date) => Math.floor((now.getTime() - fromMs) / DAY_MS);
const chatIdFor = (phone: string) => `${phone}@s.whatsapp.net`;

type OwnerData = Awaited<ReturnType<typeof loadOwnerData>>;

async function loadOwnerData(ownerId: string) {
  const [profile, invoices, clients, payments, board, receipts] = await Promise.all([getProfile(ownerId), listInvoices(ownerId), listClients(ownerId), listPayments(ownerId), getBoardSnapshot(ownerId), listReceiptJobs(ownerId)]);
  const clientName = new Map(clients.map(client => [client.id, client.name]));
  const paid = new Map<string, number>();
  for (const payment of payments) if (payment.status === 'verified') paid.set(payment.invoiceId, (paid.get(payment.invoiceId) ?? 0) + payment.amount);
  const billed = invoices.filter(invoice => invoice.status === 'issued' || invoice.status === 'paid');
  const remaining = (invoice: Invoice) => Math.max(invoice.total - (paid.get(invoice.id) ?? 0), 0);
  return { profile, board, receipts, billed, remaining, clientOf: (invoice: Invoice) => clientName.get(invoice.clientId) ?? 'Klien', taskByInvoice: new Map(board.tasks.filter(task => task.invoiceId).map(task => [task.invoiceId!, task])) };
}

function header(data: OwnerData, title: string, now: Date) {
  const when = now.toLocaleString('id-ID', { timeZone: data.profile?.timezone ?? 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' });
  return [`${title} ${data.profile?.businessName ?? 'Synectra Office'} — ${when}`, ...(data.board.isOffline ? ['⚠️ Papan tugas Hermes sedang offline; todo memakai data terakhir.'] : [])];
}

const join = (lines: string[]) => lines.filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n').trim();

/** Laporan status pesanan + todo list + hal yang butuh perhatian, dari data nyata. */
export async function buildOwnerWorkReport(ownerId: string, now = new Date(), title = '📋 List kerjaan'): Promise<string> {
  const data = await loadOwnerData(ownerId);
  const orders = data.billed.flatMap(invoice => {
    const task = data.taskByInvoice.get(invoice.id);
    const left = data.remaining(invoice);
    if (left === 0 && (!task || task.status === 'done' || task.status === 'archived')) return []; // pesanan tuntas
    const progress = task ? `${STATUS_LABEL[task.status]}${task.blockedReason ? ` (${task.blockedReason})` : ''}` : 'belum ada tugas';
    return [`• ${invoice.number ?? invoice.id} · ${data.clientOf(invoice)} · ${rupiah(invoice.total)}\n  Progres: ${progress} · Bayar: ${left === 0 ? 'lunas' : `sisa ${rupiah(left)}`}`];
  });
  const open = data.board.tasks.filter(isOpen).sort((a, b) => OPEN_ORDER.indexOf(a.status) - OPEN_ORDER.indexOf(b.status) || b.priority - a.priority);
  const todos = open.map(task => `• [${STATUS_LABEL[task.status]}] ${task.title} — ${task.assignee ?? 'BELUM ADA PJ'} (${task.id})`);

  const review = open.filter(task => task.status === 'review');
  const oldestReview = Math.max(0, ...review.map(task => ageDays((task.startedAt ?? task.createdAt) * 1000, now)));
  const attention = [
    open.some(task => task.status === 'blocked') && `${open.filter(task => task.status === 'blocked').length} tugas terhambat`,
    review.length && `${review.length} tugas menunggu review (terlama ±${oldestReview} hari)`,
    open.some(task => !task.assignee) && `${open.filter(task => !task.assignee).length} tugas belum punya penanggung jawab`,
    data.billed.some(invoice => data.remaining(invoice) > 0 && ageDays(issuedAt(invoice), now) >= OVERDUE_DAYS) && `piutang lewat ${OVERDUE_DAYS} hari — ketik "piutang"`
  ].filter((item): item is string => !!item);

  return join([
    ...header(data, title, now), '',
    `*Pesanan berjalan (${orders.length})*`, ...(orders.length ? capped(orders) : ['Tidak ada pesanan berjalan.']), '',
    `*Todo list (${todos.length})*`, ...(todos.length ? capped(todos) : ['Semua tugas selesai.']), '',
    ...(attention.length ? ['*Butuh perhatian*', ...attention.map(item => `• ${item}`), ''] : []),
    'Ketik "bantuan" untuk daftar perintah.'
  ]);
}

async function buildReceivables(ownerId: string, now: Date) {
  const data = await loadOwnerData(ownerId);
  const rows = data.billed.filter(invoice => data.remaining(invoice) > 0).sort((a, b) => issuedAt(a) - issuedAt(b));
  const total = rows.reduce((sum, invoice) => sum + data.remaining(invoice), 0);
  return join([
    ...header(data, '💰 Piutang', now), '',
    `Total ${rupiah(total)} dari ${rows.length} nota.`,
    ...capped(rows.map(invoice => { const age = ageDays(issuedAt(invoice), now); return `• ${invoice.number ?? invoice.id} · ${data.clientOf(invoice)} · sisa ${rupiah(data.remaining(invoice))} · ${age} hari${age >= OVERDUE_DAYS ? ' ⚠️' : ''}`; }))
  ]);
}

async function buildInvoiceStatus(ownerId: string, number: string, now: Date) {
  const data = await loadOwnerData(ownerId);
  const invoice = data.billed.find(item => item.number?.toLowerCase() === number.toLowerCase() || item.id === number);
  if (!invoice) return `Nota ${number} tidak ditemukan atau belum terbit.`;
  const task = data.taskByInvoice.get(invoice.id);
  const left = data.remaining(invoice);
  return join([
    ...header(data, `🧾 Status ${invoice.number ?? invoice.id}`, now), '',
    `Klien: ${data.clientOf(invoice)}`,
    `Total: ${rupiah(invoice.total)} · ${left === 0 ? 'Lunas' : `Sisa ${rupiah(left)}`} · terbit ${ageDays(issuedAt(invoice), now)} hari lalu`,
    `Progres: ${task ? `${STATUS_LABEL[task.status]} — ${task.title}${task.blockedReason ? ` (${task.blockedReason})` : ''}` : 'belum ada tugas terkait'}`
  ]);
}

async function completeTask(ownerId: string, query: string) {
  const open = (await getBoardSnapshot(ownerId)).tasks.filter(isOpen);
  const exact = open.find(task => task.id === query);
  const matches = exact ? [exact] : open.filter(task => task.title.toLowerCase().includes(query.toLowerCase()));
  if (matches.length !== 1) return matches.length ? `Ada ${matches.length} tugas cocok. Pakai ID:\n${matches.slice(0, 10).map(task => `• ${task.title} (${task.id})`).join('\n')}` : `Tugas "${query}" tidak ditemukan di todo.`;
  const done = await transitionTask(ownerId, matches[0]!.id, { action: 'complete', summary: 'Diselesaikan owner lewat WhatsApp' });
  return `✅ "${done.title}" ditandai ${STATUS_LABEL[done.status].toLowerCase()}.`;
}

const OWNER_COMMAND = /^(list kerjaan|piutang|bantuan|help|menu|status \S|selesai \S)/i;
const HELP = ['Perintah WA owner:', '• list kerjaan — pesanan berjalan & todo', '• piutang — nota belum lunas', '• status <no nota> — progres satu pesanan', '• selesai <ID/judul tugas> — tandai tugas selesai', '• bantuan — daftar perintah'].join('\n');

/** Jawaban untuk perintah owner, atau null bila pesan bukan perintah (diabaikan). */
export async function handleOwnerCommand(ownerId: string, body: string, now = new Date()): Promise<string | null> {
  const text = body.trim().replace(/\s+/g, ' ');
  let match: RegExpMatchArray | null;
  if (/^list kerjaan$/i.test(text)) return buildOwnerWorkReport(ownerId, now);
  if (/^piutang$/i.test(text)) return buildReceivables(ownerId, now);
  if (/^(bantuan|help|menu)$/i.test(text)) return HELP;
  if ((match = text.match(/^status (.+)$/i))) return buildInvoiceStatus(ownerId, match[1]!, now);
  if ((match = text.match(/^selesai (.+)$/i))) return completeTask(ownerId, match[1]!);
  return null;
}

/** Lead Hermes menyusun jawaban, Komunikasi mengirimnya. Keduanya tampak bekerja di kantor 3D. */
async function orchestrate(whatsapp: WhatsappService, ownerId: string, chatId: string, activity: string, compose: () => Promise<string | null>) {
  const finishLead = beginStaffActivity(ownerId, 'hermes', activity);
  let reply: string | null;
  try { reply = await compose(); } finally { finishLead(); }
  if (!reply) return false;
  const finishSend = beginStaffActivity(ownerId, 'communication', 'Mengirim pesan ke WA owner');
  try { await whatsapp.sendText(chatId, reply); } finally { finishSend(); }
  return true;
}

// ---- Alert proaktif ----

type Alert = { key: string; text: string };

function collectAlerts(data: OwnerData, now: Date): Alert[] {
  const alerts: Alert[] = [];
  for (const task of data.board.tasks) {
    if (task.status === 'blocked') alerts.push({ key: `blocked:${task.id}`, text: `⛔ Tugas terhambat: ${task.title}${task.blockedReason ? ` — ${task.blockedReason}` : ''}` });
    if (isOpen(task) && !task.assignee) alerts.push({ key: `unassigned:${task.id}`, text: `👤 Tugas tanpa penanggung jawab: ${task.title} (${task.id})` });
  }
  for (const job of data.receipts) {
    if ((job.status === 'failed' || job.status === 'review') && now.getTime() - Date.parse(job.updatedAt) < DAY_MS) alerts.push({ key: `delivery:${job.paymentId}:${job.updatedAt}`, text: `📵 Kirim nota ${job.status === 'failed' ? 'gagal' : 'tidak pasti'}: ${job.error ?? job.invoiceId}` });
  }
  for (const invoice of data.billed) {
    const age = ageDays(issuedAt(invoice), now);
    if (data.remaining(invoice) > 0 && age >= OVERDUE_DAYS) alerts.push({ key: `overdue:${invoice.id}`, text: `💸 Piutang ${age} hari: ${invoice.number ?? invoice.id} · ${data.clientOf(invoice)} · sisa ${rupiah(data.remaining(invoice))}` });
  }
  return alerts;
}

const memoryAlertKeys = new Map<string, string[]>();
const alertDoc = (ownerId: string) => getAppFirestore().collection('owners').doc(ownerId).collection('internal').doc('owner_alerts');
async function loadAlertKeys(ownerId: string): Promise<string[]> {
  return useFirestore ? ((await alertDoc(ownerId).get()).data()?.keys ?? []) : (memoryAlertKeys.get(ownerId) ?? []);
}
async function saveAlertKeys(ownerId: string, keys: string[]) {
  if (useFirestore) await alertDoc(ownerId).set({ keys, updatedAt: new Date().toISOString() });
  else memoryAlertKeys.set(ownerId, keys);
}

/** Kirim alert baru saja; kondisi yang sudah pulih dilupakan sehingga bisa memicu alert lagi bila terulang. */
export async function runOwnerAlerts(whatsapp: WhatsappService, ownerId: string, phone: string, now = new Date()) {
  const data = await loadOwnerData(ownerId);
  if (data.board.isOffline) return 0; // data tugas basi tidak boleh memicu/menghapus alert
  const alerts = collectAlerts(data, now);
  const known = new Set(await loadAlertKeys(ownerId));
  const fresh = alerts.filter(alert => !known.has(alert.key));
  if (fresh.length) await orchestrate(whatsapp, ownerId, chatIdFor(phone), 'Memeriksa hal yang butuh perhatian', async () => join(['🔔 Perlu perhatian', ...capped(fresh.map(alert => alert.text))]));
  await saveAlertKeys(ownerId, alerts.map(alert => alert.key));
  return fresh.length;
}

// ---- Laporan pagi via jadwal kalender ----

export const OWNER_DAILY_REPORT_SCRIPT = 'owner_daily_report';
const ensuredSchedules = new Set<string>();

/** Pastikan owner dengan No. WA punya jadwal laporan pagi 07:30. Jadwal yang dijeda/diubah owner tetap dihormati. */
export async function ensureOwnerDailyReportSchedule(ownerId: string, timezone = 'Asia/Jakarta') {
  if (ensuredSchedules.has(ownerId)) return;
  const existing = await getCalendarStore().listSchedules(ownerId, { type: 'app_job' });
  if (!existing.some(schedule => schedule.script === OWNER_DAILY_REPORT_SCRIPT)) {
    await createSchedule(ownerId, { name: 'Laporan pagi ke WA owner', type: 'app_job', actor: 'communication', schedule: 'daily 07:30', timezone, script: OWNER_DAILY_REPORT_SCRIPT, effects: 'Lead Hermes menyusun pesanan berjalan & todo, Komunikasi mengirimnya ke No. WA owner', timeoutMs: 120_000, missedRunPolicy: 'skip' });
  }
  ensuredSchedules.add(ownerId);
}

export async function runOwnerDailyReport(whatsapp: WhatsappService, ownerId: string) {
  const phone = (await getProfile(ownerId))?.ownerWhatsapp;
  if (!phone) return { summary: 'Laporan pagi dilewati: No. WA owner belum diisi.', isChanged: false };
  if (whatsapp.getPairStatus().status !== 'connected') throw new Error('WhatsApp kantor belum terhubung.');
  await orchestrate(whatsapp, ownerId, chatIdFor(phone), 'Menyusun laporan pagi', () => buildOwnerWorkReport(ownerId, new Date(), '☀️ Laporan pagi'));
  return { summary: 'Laporan pagi terkirim ke WA owner.', isChanged: true };
}

// ---- Worker ----

function senderPhones(message: { chatId?: string; senderId?: string }): string[] {
  // ponytail: hanya JID nomor (@s.whatsapp.net); pengirim yang hanya muncul sebagai @lid belum bisa dicocokkan.
  return [...new Set([message.senderId, message.chatId].filter((id): id is string => !!id?.endsWith('@s.whatsapp.net')).map(id => id.split(/[@:]/)[0]!))];
}

/** Menjawab perintah owner terdaftar (pengirim lain diabaikan) dan berkala mengirim alert proaktif. */
export function createOwnerCommandWorker(whatsapp: WhatsappService, opts: { intervalMs?: number; alertIntervalMs?: number } = {}) {
  let timers: Array<ReturnType<typeof setInterval>> = [];
  let busy = false;
  let alerting = false;
  async function runOnce() {
    if (busy || whatsapp.getPairStatus().status !== 'connected') return;
    busy = true;
    try {
      for (const message of await whatsapp.pollIncoming()) {
        if (!message.chatId || !message.body?.trim()) continue;
        let owners: string[] = [];
        for (const phone of senderPhones(message)) if ((owners = await findOwnersByWhatsapp(phone)).length) break;
        if (!owners.length) continue;
        try {
          if (owners.length > 1) { if (OWNER_COMMAND.test(message.body.trim())) await whatsapp.sendText(message.chatId, 'Nomor ini terdaftar sebagai owner di lebih dari satu akun. Hapus dari salah satu profil usaha.'); }
          else await orchestrate(whatsapp, owners[0]!, message.chatId, 'Menjawab perintah owner', () => handleOwnerCommand(owners[0]!, message.body!));
        } catch (error) {
          console.error('[owner-command] gagal membalas:', error instanceof Error ? error.message : error);
          await whatsapp.sendText(message.chatId, 'Maaf, perintah gagal diproses. Coba lagi sebentar lagi.').catch(() => undefined);
        }
      }
    } finally { busy = false; }
  }
  async function runAlerts() {
    if (alerting) return;
    alerting = true;
    try {
      for (const { ownerId, phone } of await listOwnerWhatsapps()) {
        try {
          await ensureOwnerDailyReportSchedule(ownerId, (await getProfile(ownerId))?.timezone);
          if (whatsapp.getPairStatus().status === 'connected') await runOwnerAlerts(whatsapp, ownerId, phone);
        } catch (error) {
          console.error('[owner-alert] gagal:', error instanceof Error ? error.message : error);
        }
      }
    } finally { alerting = false; }
  }
  return {
    runOnce,
    runAlerts,
    start() {
      if (timers.length) return;
      timers = [setInterval(() => { void runOnce().catch(() => undefined); }, opts.intervalMs ?? 3000), setInterval(() => { void runAlerts().catch(() => undefined); }, opts.alertIntervalMs ?? 5 * 60_000)];
      void runAlerts().catch(() => undefined);
    },
    stop() { timers.forEach(clearInterval); timers = []; }
  };
}
