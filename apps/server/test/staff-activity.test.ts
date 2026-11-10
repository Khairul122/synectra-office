import { test } from 'node:test';
import assert from 'node:assert/strict';
import { officeStaffSnapshotSchema } from '@synectra/contracts';
import { beginStaffActivity, getStaffSnapshot, subscribeStaffActivity } from '../src/modules/office/application/staff-activity';
import { executeHermesTurn, resetHermesDataForTests, setHermesModelClient } from '../src/modules/hermes/application/hermes-service';
import { generateInvoicePdf } from '../src/modules/invoice/application/pdf-service';
import { sendPreparedDelivery } from '../src/modules/deliveries/application/send-prepared-delivery';
import type { WhatsappService } from '../src/modules/whatsapp/application/whatsapp-service';

test('staff activity is owner-scoped, handles concurrent tasks and stops idempotently', () => {
  const updates: number[] = [];
  const stop = subscribeStaffActivity('scope-a', snapshot => { updates.push(snapshot.revision); });
  const brokenStop = subscribeStaffActivity('scope-a', () => { throw new Error('disconnected'); });
  const first = beginStaffActivity('scope-a', 'admin', 'Membuat PDF');
  const second = beginStaffActivity('scope-a', 'admin', 'Membuat dokumen');
  assert.deepEqual(getStaffSnapshot('scope-a').staff.admin, { active: true, activity: 'Membuat dokumen' });
  assert.deepEqual(getStaffSnapshot('scope-b').staff.admin, { active: false, activity: null });
  second();
  assert.deepEqual(getStaffSnapshot('scope-a').staff.admin, { active: true, activity: 'Membuat PDF' });
  first(); first();
  const snapshot = getStaffSnapshot('scope-a');
  assert.deepEqual(snapshot.staff.admin, { active: false, activity: null });
  assert.equal(officeStaffSnapshotSchema.safeParse(snapshot).success, true);
  assert.deepEqual(updates, [1, 2, 3, 4]);
  stop(); brokenStop();
});

test('Hermes activity lasts through the actual turn', async () => {
  resetHermesDataForTests();
  let release!: (value: string) => void;
  let started!: () => void;
  const reachedModel = new Promise<void>(resolve => { started = resolve; });
  setHermesModelClient(() => { started(); return new Promise<string>(resolve => { release = resolve; }); });
  const pending = executeHermesTurn({ ownerId: 'scope-hermes', text: 'Halo' });
  await reachedModel;
  assert.equal(getStaffSnapshot('scope-hermes').staff.hermes.active, true);
  release('{"intent":"chat","reply":"Halo"}');
  await pending;
  assert.equal(getStaffSnapshot('scope-hermes').staff.hermes.active, false);
  resetHermesDataForTests();
});

test('failed PDF and delivery operations clear their activity', async () => {
  await assert.rejects(generateInvoicePdf('scope-errors', 'missing'));
  assert.equal(getStaffSnapshot('scope-errors').staff.admin.active, false);
  await assert.rejects(sendPreparedDelivery('scope-errors', 'missing', {} as WhatsappService));
  assert.equal(getStaffSnapshot('scope-errors').staff.communication.active, false);
});


test('unsubscribing twice cannot erase a newer activity tracker', () => {
  const stop = subscribeStaffActivity('scope-cleanup', () => undefined);
  stop();
  assert.equal(getStaffSnapshot('scope-cleanup').revision, 0);
  const finish = beginStaffActivity('scope-cleanup', 'hermes', 'Menanggapi percakapan');
  stop();
  assert.equal(getStaffSnapshot('scope-cleanup').staff.hermes.active, true);
  finish();
  assert.equal(getStaffSnapshot('scope-cleanup').revision, 0);
});
