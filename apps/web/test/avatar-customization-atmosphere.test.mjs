import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_AVATAR,
  DEFAULT_AUDIO,
  getStoredAvatar,
  setStoredAvatar,
  getStoredAtmosphere,
  setStoredAtmosphere,
  getStoredAudio,
  setStoredAudio,
} from '../src/office3d/avatar-storage.ts';
import { OfficeAudioEngine } from '../src/office3d/office-audio.ts';
import { officeObjects, expansionRooms } from '../src/office3d/office-data.ts';
import { NavGrid } from '../src/office3d/world/navigation.ts';
import { SPOTS, BUILDING, TERRACE_DOOR } from '../src/office3d/world/layout.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../src/office3d/office.css');
const spikeViewPath = resolve(__dirname, '../src/office3d/OfficeSpikeView.tsx');
const sceneManagerPath = resolve(__dirname, '../src/office3d/scene-manager-3d.ts');
const worldPath = resolve(__dirname, '../src/office3d/world/office-world.ts');

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

test('avatar-storage: saves and loads avatar customization with fallback validation', () => {
  const storage = createMockStorage();

  // Default fallback when empty
  assert.deepEqual(getStoredAvatar(storage), DEFAULT_AVATAR);
  assert.equal(DEFAULT_AVATAR.hairStyle, 'short');
  assert.equal(DEFAULT_AVATAR.accentColor, '#388DA7');

  // Valid customization roundtrip
  const custom = {
    hairStyle: 'ponytail',
    hairColor: '#4A3728',
    outfitStyle: 'formal',
    outfitColor: '#1E293B',
    accessory: 'glasses',
    accentColor: '#388DA7',
  };
  setStoredAvatar(custom, storage);
  assert.deepEqual(getStoredAvatar(storage), custom);

  // Partial or corrupted payload fallback
  storage.setItem('synectra:avatar-customization', 'invalid-json');
  assert.deepEqual(getStoredAvatar(storage), DEFAULT_AVATAR);

  storage.setItem('synectra:avatar-customization', JSON.stringify({ hairStyle: 'mohawk', outfitStyle: 'unknown' }));
  const sanitized = getStoredAvatar(storage);
  assert.equal(sanitized.hairStyle, DEFAULT_AVATAR.hairStyle);
  assert.equal(sanitized.outfitStyle, DEFAULT_AVATAR.outfitStyle);
});

test('avatar-storage: saves and loads atmosphere cycle (day, sunset, night)', () => {
  const storage = createMockStorage();

  // Default is 'day'
  assert.equal(getStoredAtmosphere(storage), 'day');

  // Valid cycle updates
  setStoredAtmosphere('sunset', storage);
  assert.equal(getStoredAtmosphere(storage), 'sunset');

  setStoredAtmosphere('night', storage);
  assert.equal(getStoredAtmosphere(storage), 'night');

  setStoredAtmosphere('day', storage);
  assert.equal(getStoredAtmosphere(storage), 'day');

  // Invalid values fallback to 'day'
  storage.setItem('synectra:office-atmosphere', 'eclipse');
  assert.equal(getStoredAtmosphere(storage), 'day');
});

test('avatar-storage: saves and loads audio preferences with volume clamp', () => {
  const storage = createMockStorage();

  // Default audio is disabled
  assert.deepEqual(getStoredAudio(storage), DEFAULT_AUDIO);
  assert.equal(DEFAULT_AUDIO.enabled, false);
  assert.equal(DEFAULT_AUDIO.volume, 0.3);

  // Valid preference update
  setStoredAudio({ enabled: true, volume: 0.5 }, storage);
  assert.deepEqual(getStoredAudio(storage), { enabled: true, volume: 0.5 });

  // Volume bounds clamping
  setStoredAudio({ enabled: true, volume: 1.5 }, storage);
  assert.equal(getStoredAudio(storage).volume, 1.0);

  setStoredAudio({ enabled: true, volume: -0.2 }, storage);
  assert.equal(getStoredAudio(storage).volume, 0.0);
});

test('office-audio: synthesizes audio via Web Audio API without external file dependencies', () => {
  const audioCode = readFileSync(resolve(__dirname, '../src/office3d/office-audio.ts'), 'utf8');

  // Must not import or reference external mp3/wav/ogg files
  assert.doesNotMatch(audioCode, /\.(mp3|wav|ogg|aac|m4a)/i);

  // Must use Web Audio oscillator and gain nodes
  assert.match(audioCode, /createOscillator/);
  assert.match(audioCode, /createGain/);
  assert.match(audioCode, /createBiquadFilter/);

  // Engine instantiation respects initial opt-in preference
  const engineOff = new OfficeAudioEngine({ enabled: false, volume: 0.3 });
  assert.ok(engineOff);

  // Quiet mode, click, and ripple methods can be invoked safely in node/headless environment
  assert.doesNotThrow(() => {
    engineOff.setQuiet(true);
    engineOff.setVolume(0.4);
    engineOff.setAtmosphere('sunset');
    engineOff.playClick();
    engineOff.playRipple();
  });
});

test('3D office renders terrace pool with exact turquoise accent #388DA7 and day/sunset/night atmosphere', () => {
  const sceneCode = readFileSync(sceneManagerPath, 'utf8');
  const worldCode = readFileSync(worldPath, 'utf8');

  // Air kolam memakai warna turquoise #388DA7 persis.
  assert.match(worldCode, /#388DA7/);
  assert.match(worldCode, /ctx\.fillStyle\s*=\s*['"]#388DA7['"]/);
  assert.match(worldCode, /POOL/);

  // Tiga fase suasana pada cahaya dunia 3D.
  assert.match(worldCode, /cycle\s*===\s*['"]sunset['"]/);
  assert.match(worldCode, /cycle\s*===\s*['"]night['"]/);
  assert.match(sceneCode, /cycle\s*===\s*['"]night['"]/);

  // Kompatibilitas toggle siang lama.
  assert.match(sceneCode, /public\s+setDaylight\((?:value|daylight):\s*boolean\)/);

  // Kustomisasi avatar pemilik diterapkan ke karakter 3D.
  assert.match(sceneCode, /this\.avatar\.hairStyle/);
  assert.match(sceneCode, /this\.avatar\.hairColor/);
  assert.match(sceneCode, /this\.avatar\.outfitStyle/);
  assert.match(sceneCode, /this\.avatar\.accessory/);
  assert.match(sceneCode, /this\.avatar\.accentColor/);
});

test('terrace navigation: owner reaches the pool loungers through the terrace door', () => {
  assert.ok(officeObjects.terrace);
  assert.equal(officeObjects.terrace.role, 'Relaksasi & kolam');
  assert.ok(officeObjects.terrace.description.includes('#388DA7'));

  const nav = new NavGrid();
  const route = nav.findPath(SPOTS['desk-owner'].pos, SPOTS['lounger-b'].pos);
  assert.ok(route.length > 1);
  assert.deepEqual(route.at(-1), SPOTS['lounger-b'].pos);
  // Jalur keluar gedung harus melewati pintu teras di dinding selatan.
  let previous = SPOTS['desk-owner'].pos;
  let crossedAt = null;
  for (const point of route) {
    if (previous[1] < BUILDING.z1 && point[1] >= BUILDING.z1) crossedAt = previous[0] + (point[0] - previous[0]) * (BUILDING.z1 - previous[1]) / (point[1] - previous[1]);
    previous = point;
  }
  assert.ok(crossedAt !== null && crossedAt > TERRACE_DOOR.x0 && crossedAt < TERRACE_DOOR.x1, `crossed wall at x=${crossedAt}`);

  const back = nav.findPath(SPOTS['lounger-b'].pos, SPOTS['armchair-a'].pos);
  assert.deepEqual(back.at(-1), SPOTS['armchair-a'].pos);
});

test('expansion rooms: metadata defines terrace, creative studio, and gaming room with budget notes', () => {
  assert.ok(expansionRooms.terrace);
  assert.equal(expansionRooms.terrace.status, 'active');
  assert.equal(expansionRooms.terrace.accentColor, '#388DA7');

  assert.ok(expansionRooms.studio);
  assert.equal(expansionRooms.studio.status, 'concept');
  assert.equal(expansionRooms.studio.category, 'creative');

  assert.ok(expansionRooms.gaming);
  assert.equal(expansionRooms.gaming.status, 'concept');
  assert.equal(expansionRooms.gaming.category, 'leisure');
});

test('ui & accessibility: OfficeSpikeView and CSS provide accessible dialogs and controls', () => {
  const spikeView = readFileSync(spikeViewPath, 'utf8');
  const css = readFileSync(cssPath, 'utf8');

  // Controls for atmosphere, audio, avatar, and expansion
  assert.match(spikeView, /Kustomisasi avatar/);
  assert.match(spikeView, /Ganti suasana/);
  assert.match(spikeView, /audio kantor/);
  assert.match(spikeView, /Katalog ekspansi ruangan/i);

  // Accessible dialog markup
  assert.match(spikeView, /<dialog[^>]*ref=\{avatarDialogRef\}[^>]*aria-labelledby=['"]avatar-dialog-title['"]/);
  assert.match(spikeView, /<dialog[^>]*ref=\{expansionDialogRef\}[^>]*aria-labelledby=['"]expansion-dialog-title['"]/);

  // CSS dialog styling and chips
  assert.match(css, /\.avatar-dialog/);
  assert.match(css, /\.expansion-dialog/);
  assert.match(css, /\.chip-button/);
  assert.match(css, /\.color-picker-wrap/);
  assert.match(css, /\.expansion-card/);
});
