import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient, resetBusinessDataForTests, saveProfile } from '../src/modules/business/application/business-service';
import { createIssuedInvoice, resetInvoiceDataForTests } from '../src/modules/invoice/application/invoice-service';
import { resetKanbanDataForTests, setHermesCliRunnerForTests } from '../src/modules/kanban/application/kanban-service';
import { createOwnerCommandWorker, handleOwnerCommand, runOwnerAlerts, runOwnerDailyReport } from '../src/modules/office/application/owner-work-report';
import { getStaffSnapshot } from '../src/modules/office/application/staff-activity';
import type { WhatsappService } from '../src/modules/whatsapp/application/whatsapp-service';
import { hermesTenantFor } from '../src/infrastructure/hermes-cli';

const OWNER_PHONE = '6281234567890';

async function setup(ownerId: string) {
  resetBusinessDataForTests(); resetInvoiceDataForTests(); resetKanbanDataForTests();
  await saveProfile(ownerId, { businessName: 'Toko Uji', signerName: 'Budi', ownerWhatsapp: OWNER_PHONE });
  const client = await createClient(ownerId, { name: 'Klien Uji', phone: '6289876543210' });
  const invoice = await createIssuedInvoice(ownerId, { clientId: client.id, items: [{ description: 'Jasa', quantity: 1, unitPrice: 50000 }] }, `k-${ownerId}`);
  const tasks = [
    { id: 't1', title: 'Desain banner', status: 'blocked', priority: 1, created_at: 1, assignee: 'lead', tenant: hermesTenantFor(ownerId) },
    { id: 't2', title: 'Cetak brosur', status: 'todo', priority: 0, created_at: 1, assignee: null, tenant: hermesTenantFor(ownerId) }
  ];
  const calls: string[][] = [];
  setHermesCliRunnerForTests(async args => {
    calls.push(args);
    const sub = args[args.indexOf('--board') + 2];
    const id = args.at(-1)!;
    if (sub === 'complete') { tasks.find(task => task.id === id)!.status = 'done'; return { exitCode: 0, stdout: '', stderr: '' }; }
    if (sub === 'show') return { exitCode: 0, stdout: JSON.stringify(tasks.find(task => task.id === id)), stderr: '' };
    return { exitCode: 0, stdout: JSON.stringify(tasks), stderr: '' };
  });
  const sent: Array<{ chatId: string; text: string }> = [];
  const whatsapp = {
    getPairStatus: () => ({ status: 'connected' }),
    pollIncoming: async () => [] as unknown[],
    sendText: async (chatId: string, text: string) => { sent.push({ chatId, text }); return { success: true, messageId: 'm1' }; }
  };
  return { invoice, tasks, calls, sent, whatsapp: whatsapp as unknown as WhatsappService & typeof whatsapp };
}

test('worker: perintah owner terdaftar dibalas, pengirim asing & obrolan biasa diabaikan', async () => {
  const ownerId = 'owner-wa-worker';
  const { invoice, sent, whatsapp } = await setup(ownerId);
  whatsapp.pollIncoming = async () => [
    { chatId: `${OWNER_PHONE}@s.whatsapp.net`, senderId: `${OWNER_PHONE}@s.whatsapp.net`, body: '  List Kerjaan ' },
    { chatId: '6280000000000@s.whatsapp.net', senderId: '6280000000000@s.whatsapp.net', body: 'list kerjaan' },
    { chatId: `${OWNER_PHONE}@s.whatsapp.net`, senderId: `${OWNER_PHONE}@s.whatsapp.net`, body: 'halo' }
  ];
  await createOwnerCommandWorker(whatsapp).runOnce();

  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.chatId, `${OWNER_PHONE}@s.whatsapp.net`);
  assert.match(sent[0]!.text, new RegExp(`${invoice.number}.*Klien Uji`));
  assert.match(sent[0]!.text, /sisa Rp50\.000/);
  assert.match(sent[0]!.text, /\[Terhambat\] Desain banner — lead/);
  assert.match(sent[0]!.text, /Cetak brosur — BELUM ADA PJ/);
  assert.match(sent[0]!.text, /1 tugas belum punya penanggung jawab/);
  assert.equal(getStaffSnapshot(ownerId).staff.communication.active, false, 'aktivitas staf selesai setelah kirim');
});

test('perintah piutang, status nota, selesai tugas, bantuan', async () => {
  const ownerId = 'owner-wa-commands';
  const { invoice, tasks, calls } = await setup(ownerId);
  const now = new Date(Date.now() + 20 * 86_400_000);

  assert.match((await handleOwnerCommand(ownerId, 'piutang', now))!, /Total Rp50\.000 dari 1 nota[\s\S]*20 hari ⚠️/);
  assert.match((await handleOwnerCommand(ownerId, `status ${invoice.number}`, now))!, /Sisa Rp50\.000/);
  assert.match((await handleOwnerCommand(ownerId, 'status INV-TIDAK-ADA', now))!, /tidak ditemukan/);
  assert.match((await handleOwnerCommand(ownerId, 'bantuan'))!, /selesai <ID\/judul tugas>/);
  assert.match((await handleOwnerCommand(ownerId, 'selesai brosur'))!, /✅ "Cetak brosur"/);
  assert.equal(tasks[1]!.status, 'done');
  assert.ok(calls.some(args => args.includes('complete')));
  assert.equal(await handleOwnerCommand(ownerId, 'catatan pribadi'), null);
});

test('alert proaktif: hanya kondisi baru yang dikirim, kondisi pulih boleh memicu lagi', async () => {
  const ownerId = 'owner-wa-alerts';
  const { tasks, sent, whatsapp } = await setup(ownerId);
  const later = new Date(Date.now() + 20 * 86_400_000);

  assert.equal(await runOwnerAlerts(whatsapp, ownerId, OWNER_PHONE, later), 3); // terhambat, tanpa PJ, piutang
  assert.match(sent[0]!.text, /Tugas terhambat: Desain banner[\s\S]*tanpa penanggung jawab[\s\S]*Piutang 20 hari/);
  assert.equal(await runOwnerAlerts(whatsapp, ownerId, OWNER_PHONE, later), 0, 'tidak spam alert yang sama');

  tasks[0]!.status = 'running';
  await runOwnerAlerts(whatsapp, ownerId, OWNER_PHONE, later);
  tasks[0]!.status = 'blocked';
  assert.equal(await runOwnerAlerts(whatsapp, ownerId, OWNER_PHONE, later), 1);
});

test('laporan pagi terkirim ke No. WA owner', async () => {
  const ownerId = 'owner-wa-morning';
  const { sent, whatsapp } = await setup(ownerId);
  const result = await runOwnerDailyReport(whatsapp, ownerId);
  assert.equal(result.isChanged, true);
  assert.equal(sent[0]!.chatId, `${OWNER_PHONE}@s.whatsapp.net`);
  assert.match(sent[0]!.text, /^☀️ Laporan pagi Toko Uji/);
});
