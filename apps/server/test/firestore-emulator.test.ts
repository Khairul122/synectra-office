/**
 * Uji store Firestore terhadap Firestore Emulator (bukan cloud). Dilewati bila FIRESTORE_EMULATOR_HOST tidak diset.
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 GCLOUD_PROJECT=demo-synectra pnpm --filter @synectra/server test:firestore
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { HermesMessage } from '@synectra/contracts';
import { getAppFirestore } from '../src/infrastructure/firestore';
import { createFirestoreHermesStore, HERMES_MESSAGE_TTL_DAYS } from '../src/modules/hermes/infrastructure/hermes-store';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const skip = !emulator || !/^demo-/.test(process.env.GCLOUD_PROJECT ?? '') ? 'butuh FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*' : false;

function msg(role: 'owner' | 'hermes', text: string, result?: unknown): HermesMessage {
  return { id: randomUUID(), role, text, progress: [], result, createdAt: new Date().toISOString() };
}

test('firestore hermes store: atomic turns, ordering, JSON round-trip, TTL field, owner isolation', { skip }, async () => {
  const store = createFirestoreHermesStore();
  const ownerA = `emu-a-${randomUUID()}`;
  const ownerB = `emu-b-${randomUUID()}`;

  const fresh = await store.getSession(ownerA);
  assert.equal(fresh.messageCount, 0);

  // Giliran paralel milik owner yang sama: transaksi menjaga messageCount dan seq unik.
  await Promise.all(
    Array.from({ length: 5 }, (_, i) => store.appendTurn(ownerA, [msg('owner', `q${i}`), msg('hermes', `a${i}`)]))
  );
  const session = await store.getSession(ownerA);
  assert.equal(session.messageCount, 10);

  const docs = await getAppFirestore().collection(`owners/${ownerA}/hermes_messages`).get();
  const seqs = docs.docs.map((d) => d.data().seq as number).sort((a, b) => a - b);
  assert.deepEqual(seqs, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const expireAt = docs.docs[0]!.data().expireAt.toDate() as Date;
  const days = (expireAt.getTime() - Date.now()) / 86_400_000;
  assert.ok(Math.abs(days - HERMES_MESSAGE_TTL_DAYS) < 1, 'expireAt ~180 hari ke depan');

  // Setiap pasangan tetap berurutan (q sebelum a) dan limit mengambil pesan terakhir.
  const all = await store.listMessages(ownerA, 200);
  assert.equal(all.length, 10);
  for (let i = 0; i < all.length; i += 2) {
    assert.equal(all[i]!.role, 'owner');
    assert.equal(all[i + 1]!.text, `a${all[i]!.text.slice(1)}`);
  }
  const last2 = await store.listMessages(ownerA, 2);
  assert.deepEqual(last2.map((m) => m.text), all.slice(-2).map((m) => m.text));

  // result bebas bentuk (array bersarang ditolak Firestore bila disimpan mentah) kembali utuh.
  const nested = { grid: [[1, 2], [3, [4]]], invoice: { total: 2500000, items: [{ d: 'logo' }] } };
  await store.appendTurn(ownerB, [msg('owner', 'x'), msg('hermes', 'y', nested)]);
  const bMessages = await store.listMessages(ownerB, 10);
  assert.deepEqual(bMessages[1]!.result, nested);
  assert.equal((await store.getSession(ownerB)).messageCount, 2);
  assert.equal((await store.listMessages(ownerA, 200)).length, 10, 'owner A tidak melihat pesan owner B');

  // Audit: input bebas bentuk, terurut, terpisah per owner.
  const at = (n: number) => new Date(Date.now() + n).toISOString();
  await store.addAudit({ id: randomUUID(), ownerId: ownerA, actorId: ownerA, tool: 'clients.search', input: { query: 'Budi' }, ok: true, at: at(0) });
  await store.addAudit({
    id: randomUUID(), ownerId: ownerA, actorId: ownerA, tool: 'invoices.preview', input: { matrix: [[1]] }, ok: false,
    error: { code: 'NOT_FOUND', message: 'x' }, at: at(1)
  });
  const audits = await store.listAudits(ownerA);
  assert.deepEqual(audits.map((a) => a.tool), ['clients.search', 'invoices.preview']);
  assert.deepEqual(audits[1]!.input, { matrix: [[1]] });
  assert.equal(audits[1]!.error?.code, 'NOT_FOUND');
  assert.equal((await store.listAudits(ownerB)).length, 0);
});
