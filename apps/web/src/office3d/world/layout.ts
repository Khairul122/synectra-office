/**
 * Denah kantor 3D (satuan meter). Sumbu: x ke kanan, z ke arah kamera (selatan), y ke atas.
 * Data murni tanpa three.js supaya navigasi dan perilaku karyawan bisa diuji di Node.
 */
export type Vec2 = readonly [number, number];
export interface Rect { x0: number; z0: number; x1: number; z1: number }

/** Interior gedung. Dinding utara & barat penuh; dinding selatan & timur dipotong rendah (cutaway). */
export const BUILDING: Rect = { x0: -7, z0: -5, x1: 7, z1: 5 };
export const WALL_HEIGHT = 2.7;
/** Pintu dari dalam kantor ke teras di dinding selatan. */
export const TERRACE_DOOR = { x0: -1.5, x1: -0.3 };
export const DECK: Rect = { x0: -6.6, z0: 5.15, x1: 1.8, z1: 9.2 };
export const POOL: Rect = { x0: -4.9, z0: 6.15, x1: -0.9, z1: 8.4 };

export type ZoneId = 'owner' | 'work' | 'meeting' | 'pantry' | 'lounge' | 'rec' | 'terrace';
export const ZONES: Record<ZoneId, { name: string; rect: Rect }> = {
  owner: { name: 'Ruang pemilik', rect: { x0: -7, z0: -5, x1: -3.6, z1: -1.2 } },
  work: { name: 'Area kerja', rect: { x0: -3.6, z0: -5, x1: 3.7, z1: -0.4 } },
  meeting: { name: 'Ruang rapat', rect: { x0: 3.7, z0: -5, x1: 7, z1: -1.3 } },
  pantry: { name: 'Pantry', rect: { x0: -7, z0: -1.2, x1: -3.6, z1: 5 } },
  lounge: { name: 'Lounge', rect: { x0: -3.6, z0: -0.4, x1: 3.7, z1: 5 } },
  rec: { name: 'Pojok rekreasi', rect: { x0: 3.7, z0: -1.3, x1: 7, z1: 5 } },
  terrace: { name: 'Teras kolam', rect: DECK },
};

/** Segmen dinding/partisi yang tidak bisa dilewati (garis, ketebalan ditangani navigasi). */
export interface WallSegment { a: Vec2; b: Vec2; kind: 'exterior' | 'cutaway' | 'glass' }
export const WALLS: WallSegment[] = [
  { a: [-7, -5], b: [7, -5], kind: 'exterior' },
  { a: [-7, -5], b: [-7, 5], kind: 'exterior' },
  { a: [7, -5], b: [7, 5], kind: 'cutaway' },
  { a: [-7, 5], b: [TERRACE_DOOR.x0, 5], kind: 'cutaway' },
  { a: [TERRACE_DOOR.x1, 5], b: [7, 5], kind: 'cutaway' },
  // Ruang pemilik (pintu di sudut tenggara).
  { a: [-3.6, -5], b: [-3.6, -2.3], kind: 'glass' },
  { a: [-7, -1.2], b: [-4.9, -1.2], kind: 'glass' },
  // Ruang rapat (pintu di sudut barat daya).
  { a: [3.7, -5], b: [3.7, -2.6], kind: 'glass' },
  { a: [5.0, -1.3], b: [7, -1.3], kind: 'glass' },
];

/** Furnitur yang menghalangi jalan (footprint di lantai). Kursi sengaja tidak termasuk. */
export const OBSTACLES: Array<Rect & { id: string }> = [
  { id: 'desk-admin', x0: -2.2, z0: -3.65, x1: -0.8, z1: -2.95 },
  { id: 'desk-communication', x0: -0.2, z0: -3.65, x1: 1.2, z1: -2.95 },
  { id: 'desk-hermes', x0: 1.75, z0: -3.7, x1: 3.25, z1: -2.9 },
  { id: 'desk-owner', x0: -6.1, z0: -3.7, x1: -4.5, z1: -2.9 },
  { id: 'owner-shelf', x0: -6.95, z0: -4.95, x1: -6.4, z1: -3.9 },
  { id: 'printer', x0: -3.3, z0: -4.95, x1: -2.5, z1: -4.35 },
  { id: 'meeting-table', x0: 4.4, z0: -3.65, x1: 6.4, z1: -2.65 },
  { id: 'archive', x0: 6.4, z0: -2.95, x1: 6.95, z1: -1.65 },
  { id: 'pantry-counter', x0: -6.95, z0: -0.9, x1: -6.35, z1: 2.4 },
  { id: 'fridge', x0: -6.95, z0: 2.6, x1: -6.3, z1: 3.4 },
  { id: 'pantry-table', x0: -5.25, z0: 1.75, x1: -4.35, z1: 2.65 },
  { id: 'sofa', x0: -1.0, z0: 0.55, x1: 1.4, z1: 1.05 },
  { id: 'coffee-table', x0: -0.45, z0: 1.95, x1: 0.85, z1: 2.65 },
  { id: 'bookshelf', x0: -3.5, z0: 3.6, x1: -2.9, z1: 4.9 },
  { id: 'foosball', x0: 4.95, z0: 1.05, x1: 5.65, z1: 2.15 },
  { id: 'water-cooler', x0: 6.4, z0: 3.9, x1: 6.9, z1: 4.4 },
  { id: 'plant-work', x0: 3.25, z0: -1.1, x1: 3.65, z1: -0.7 },
  { id: 'plant-lounge', x0: 2.6, z0: 4.2, x1: 3.1, z1: 4.7 },
  { id: 'lounger-a', x0: 0.05, z0: 5.9, x1: 1.6, z1: 6.45 },
  { id: 'lounger-b', x0: 0.05, z0: 7.1, x1: 1.6, z1: 7.65 },
  { id: 'pool', ...POOL },
];

export type SpotId =
  | 'desk-hermes' | 'desk-admin' | 'desk-communication' | 'desk-owner'
  | 'printer' | 'board' | 'calendar' | 'archive' | 'window'
  | 'coffee' | 'fridge' | 'pantry-seat-a' | 'pantry-seat-b'
  | 'sofa-a' | 'sofa-b' | 'armchair-a' | 'armchair-b'
  | 'foosball-a' | 'foosball-b' | 'chat-a' | 'chat-b'
  | 'plant-work' | 'plant-lounge' | 'bookshelf'
  | 'lounger-a' | 'lounger-b' | 'terrace-view'
  | 'stand-hermes' | 'stand-admin' | 'stand-communication';

export type SpotKind = 'sit' | 'stand' | 'lie';
export interface Spot { pos: Vec2; /** Arah hadap (rotasi Y). 0 = menghadap +z/kamera. */ facing: number; kind: SpotKind; zone: ZoneId }

const S = 0, N = Math.PI, E = Math.PI / 2, W = -Math.PI / 2;
export const SPOTS: Record<SpotId, Spot> = {
  // Karyawan duduk di sisi utara meja menghadap kamera agar wajahnya terlihat.
  'desk-admin': { pos: [-1.5, -4.05], facing: S, kind: 'sit', zone: 'work' },
  'desk-communication': { pos: [0.5, -4.05], facing: S, kind: 'sit', zone: 'work' },
  'desk-hermes': { pos: [2.5, -4.1], facing: S, kind: 'sit', zone: 'work' },
  'desk-owner': { pos: [-5.3, -4.1], facing: S, kind: 'sit', zone: 'owner' },
  'stand-admin': { pos: [-1.0, -2.45], facing: N, kind: 'stand', zone: 'work' },
  'stand-communication': { pos: [1.0, -2.45], facing: N, kind: 'stand', zone: 'work' },
  'stand-hermes': { pos: [3.0, -2.4], facing: N, kind: 'stand', zone: 'work' },
  printer: { pos: [-2.9, -3.75], facing: N, kind: 'stand', zone: 'work' },
  window: { pos: [-0.5, -4.5], facing: N, kind: 'stand', zone: 'work' },
  board: { pos: [4.75, -4.25], facing: N, kind: 'stand', zone: 'meeting' },
  calendar: { pos: [6.3, -4.25], facing: N, kind: 'stand', zone: 'meeting' },
  archive: { pos: [5.85, -2.3], facing: E, kind: 'stand', zone: 'meeting' },
  coffee: { pos: [-5.8, 0.25], facing: W, kind: 'stand', zone: 'pantry' },
  fridge: { pos: [-5.75, 3.0], facing: W, kind: 'stand', zone: 'pantry' },
  'pantry-seat-a': { pos: [-4.8, 1.3], facing: S, kind: 'sit', zone: 'pantry' },
  'pantry-seat-b': { pos: [-4.8, 3.1], facing: N, kind: 'sit', zone: 'pantry' },
  'sofa-a': { pos: [-0.45, 1.15], facing: S, kind: 'sit', zone: 'lounge' },
  'sofa-b': { pos: [0.85, 1.15], facing: S, kind: 'sit', zone: 'lounge' },
  'armchair-a': { pos: [-1.75, 2.3], facing: E, kind: 'sit', zone: 'lounge' },
  'armchair-b': { pos: [2.15, 2.3], facing: W, kind: 'sit', zone: 'lounge' },
  'foosball-a': { pos: [4.5, 1.6], facing: E, kind: 'stand', zone: 'rec' },
  'foosball-b': { pos: [6.1, 1.6], facing: W, kind: 'stand', zone: 'rec' },
  'chat-a': { pos: [5.35, 3.7], facing: E, kind: 'stand', zone: 'rec' },
  'chat-b': { pos: [6.15, 3.7], facing: W, kind: 'stand', zone: 'rec' },
  'plant-work': { pos: [3.0, -0.4], facing: E, kind: 'stand', zone: 'lounge' },
  'plant-lounge': { pos: [2.35, 3.95], facing: E, kind: 'stand', zone: 'lounge' },
  bookshelf: { pos: [-2.4, 4.25], facing: W, kind: 'stand', zone: 'lounge' },
  'lounger-a': { pos: [0.85, 6.15], facing: W, kind: 'lie', zone: 'terrace' },
  'lounger-b': { pos: [0.85, 7.35], facing: W, kind: 'lie', zone: 'terrace' },
  'terrace-view': { pos: [-2.9, 5.75], facing: S, kind: 'stand', zone: 'terrace' },
};

export const STAFF_DESK = { hermes: 'desk-hermes', admin: 'desk-admin', communication: 'desk-communication' } as const satisfies Record<string, SpotId>;
export const STAFF_STAND = { hermes: 'stand-hermes', admin: 'stand-admin', communication: 'stand-communication' } as const satisfies Record<string, SpotId>;

/** Titik untuk label objek (prop) di atas lantai. */
export const PROP_POINTS = {
  board: [4.75, -4.75], calendar: [6.3, -4.75], printer: [-2.9, -4.6], archive: [6.65, -2.3],
  coffee: [-6.6, 0.25], lounge: [0.2, 1.6], terrace: [-2.9, 7.2],
} as const satisfies Record<string, Vec2>;

export function insideRect(rect: Rect, x: number, z: number, pad = 0) {
  return x >= rect.x0 - pad && x <= rect.x1 + pad && z >= rect.z0 - pad && z <= rect.z1 + pad;
}

export function zoneAt(x: number, z: number): ZoneId | undefined {
  if (insideRect(DECK, x, z)) return 'terrace';
  return (Object.keys(ZONES) as ZoneId[]).find(id => id !== 'terrace' && insideRect(ZONES[id].rect, x, z));
}
