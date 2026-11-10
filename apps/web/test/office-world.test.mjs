import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NavGrid } from '../src/office3d/world/navigation.ts';
import { OBSTACLES, SPOTS, insideRect } from '../src/office3d/world/layout.ts';
import { StaffBrain, STAFF_IDS, workPlan } from '../src/office3d/world/staff-brain.ts';
import { targetPose } from '../src/office3d/world/characters.ts';

/** Acak deterministik agar simulasi bisa diulang. */
function seeded(seed = 7) {
  let value = seed;
  return () => { value = (value * 1664525 + 1013904223) % 4294967296; return value / 4294967296; };
}

test('every interaction spot is reachable and routes avoid furniture', () => {
  const nav = new NavGrid();
  const spots = Object.entries(SPOTS);
  for (const [id, spot] of spots) assert.ok(nav.nearestOpen(spot.pos[0], spot.pos[1]), `${id} has no walkable cell nearby`);
  for (const [fromId, from] of spots) {
    for (const [toId, to] of [spots[0], spots[9], spots[20]]) {
      const path = nav.findPath(from.pos, to.pos);
      assert.deepEqual(path.at(-1), to.pos, `${fromId} -> ${toId} does not end at the spot`);
      // Titik antara tidak boleh menembus furnitur. Langkah pertama (bangun dari kursi) dan terakhir
      // (duduk ke kursi/titik interaksi) memang berada di footprint furniturnya, jadi dikecualikan.
      let previous = path[0];
      for (const point of path.slice(1, -1)) {
        for (let t = 0.1; t < 1; t += 0.1) {
          const x = previous[0] + (point[0] - previous[0]) * t, z = previous[1] + (point[1] - previous[1]) * t;
          const hit = OBSTACLES.find(rect => insideRect(rect, x, z));
          assert.equal(hit, undefined, `${fromId} -> ${toId} crosses ${hit?.id} near ${x.toFixed(2)},${z.toFixed(2)}`);
        }
        previous = point;
      }
    }
  }
});

test('real server activity overrides decorative behaviour and follows the work plan', () => {
  const brain = new StaffBrain(seeded());
  brain.setActivity('admin', 'Membuat PDF');
  let intent = brain.intent('admin');
  assert.equal(intent.real, true);
  assert.equal(intent.spot, 'desk-admin');
  assert.equal(intent.anim, 'sit_type');
  assert.match(intent.label, /Membuat PDF/);
  assert.equal(brain.mood('admin'), 'fokus');

  // Timer langkah hanya berjalan setelah karyawan tiba di titiknya.
  brain.tick(10);
  assert.equal(brain.intent('admin').spot, 'desk-admin');
  brain.setArrived('admin', true); brain.tick(4.2);
  intent = brain.intent('admin');
  assert.equal(intent.spot, 'printer');
  assert.equal(intent.anim, 'wait_printer');
  brain.setArrived('admin', true); brain.tick(5.2);
  intent = brain.intent('admin');
  assert.equal(intent.spot, 'desk-admin');
  assert.equal(intent.real, true);
  assert.ok(brain.ui('admin').queue.length === 0);

  // Selesai bekerja: peregangan singkat, lalu kembali ke perilaku dekoratif (bukan "nyata").
  brain.setActivity('admin', null);
  intent = brain.intent('admin');
  assert.equal(intent.real, false);
  assert.equal(intent.anim, 'stretch');
  brain.setArrived('admin', true); brain.tick(6);
  assert.equal(brain.intent('admin').real, false);
});

test('work plans map real activities to fitting places and animations', () => {
  assert.deepEqual(workPlan('admin', 'Membuat PDF').map(step => step.spot), ['desk-admin', 'printer', 'desk-admin']);
  assert.equal(workPlan('communication', 'Memproses pengiriman WhatsApp')[0].anim, 'sit_phone');
  assert.equal(workPlan('hermes', 'Menanggapi percakapan')[0].anim, 'sit_talk');
  assert.deepEqual(workPlan('hermes', 'Menjalankan tugas Hermes').map(step => step.spot), ['board', 'desk-hermes']);
  for (const id of STAFF_IDS) assert.equal(workPlan(id, 'Operasi lain').at(-1).duration, Infinity);
});

test('business events trigger a short reaction, then the previous intent resumes', () => {
  const brain = new StaffBrain(seeded());
  brain.setActivity('communication', 'Memproses pengiriman WhatsApp');
  brain.react('communication', 'fail');
  assert.equal(brain.intent('communication').anim, 'facepalm');
  assert.equal(brain.mood('communication'), 'kesal');
  brain.tick(4);
  assert.equal(brain.intent('communication').anim, 'sit_phone');
  brain.react('admin', 'success');
  assert.equal(brain.intent('admin').anim, 'cheer');
  assert.equal(brain.mood('admin'), 'senang');
});

test('idle staff pick needs-driven activities, pair up socially, and never share a spot', () => {
  const brain = new StaffBrain(seeded(11));
  brain.setReserved(['desk-owner', 'coffee']);
  const seen = new Set();
  let paired = false;
  for (let i = 0; i < 2400; i++) {
    for (const id of STAFF_IDS) brain.setArrived(id, true);
    brain.tick(0.5);
    const spots = STAFF_IDS.map(id => brain.intent(id).spot);
    assert.equal(new Set(spots).size, spots.length, `shared spot at tick ${i}: ${spots}`);
    assert.ok(!spots.includes('coffee'), 'reserved owner spot was taken');
    for (const id of STAFF_IDS) {
      const intent = brain.intent(id);
      assert.equal(intent.real, false, 'idle staff must not claim real work');
      seen.add(intent.anim);
      if (intent.partner) { paired = true; assert.equal(brain.intent(intent.partner).partner, id, 'partner link must be mutual'); }
      for (const value of Object.values(brain.ui(id).needs)) assert.ok(value >= 0 && value <= 100);
    }
  }
  assert.ok(paired, 'staff never socialised');
  assert.ok(seen.size >= 5, `too few distinct activities: ${[...seen]}`);
});

test('manual poses apply only while no real work is running', () => {
  const brain = new StaffBrain(seeded());
  brain.setManual('hermes', 'drink');
  assert.equal(brain.intent('hermes').spot, 'coffee');
  assert.equal(brain.intent('hermes').anim, 'drink');
  brain.setActivity('hermes', 'Menanggapi percakapan');
  brain.setManual('hermes', 'rest');
  assert.equal(brain.intent('hermes').anim, 'sit_talk');
});

test('character poses: sitting lowers the hips, walking alternates legs', () => {
  const ctx = { seatHeight: 0.5, talk: 0, mood: 'neutral', moving: false, speed: 1.3 };
  const stand = targetPose('stand_idle', 1, { ...ctx, seatHeight: 0 }, 0).pose;
  const sit = targetPose('sit_type', 1, ctx, 0).pose;
  assert.ok(sit.hipsY < stand.hipsY - 0.2);
  assert.ok(sit.thLx < -1.3 && sit.knL > 1.3);
  const a = targetPose('walk', Math.PI / 2, { ...ctx, seatHeight: 0, moving: true }, 0).pose;
  const b = targetPose('walk', -Math.PI / 2, { ...ctx, seatHeight: 0, moving: true }, 0).pose;
  assert.ok(a.thLx > 0 && b.thLx < 0 && Math.sign(a.thLx) !== Math.sign(a.thRx));
  assert.equal(targetPose('drink', 0, { ...ctx, seatHeight: 0 }, 0).props.cup, true);
  assert.equal(targetPose('facepalm', 0, { ...ctx, seatHeight: 0, mood: 'upset' }, 0).mouth, 'frown');
});

test('very short real operations stay visible: the employee finishes at the work spot first', () => {
  const brain = new StaffBrain(seeded());
  brain.setActivity('hermes', 'Menanggapi percakapan');
  brain.setActivity('hermes', null); // operasi selesai sebelum Hermes tiba di meja
  let intent = brain.intent('hermes');
  assert.equal(intent.real, true);
  assert.equal(intent.spot, 'desk-hermes');
  assert.match(intent.label, /^Menyelesaikan · Menanggapi percakapan/);
  assert.equal(brain.mood('hermes'), 'fokus');
  brain.tick(5); // masih berjalan ke meja: belum dihitung
  assert.match(brain.intent('hermes').label, /^Menyelesaikan/);
  brain.setArrived('hermes', true); brain.tick(3.2);
  intent = brain.intent('hermes');
  assert.equal(intent.real, false);
  assert.equal(intent.anim, 'stretch');
});
