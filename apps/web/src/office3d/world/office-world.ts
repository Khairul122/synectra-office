import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDING, DECK, POOL, TERRACE_DOOR, WALL_HEIGHT, ZONES, type ZoneId } from './layout.ts';
import type { AtmosphereCycle } from '../types';

/**
 * Lingkungan 3D: lot kantor bergaya game life-sim di lingkungan kota kecil. Semua geometri prosedural;
 * benda statis digabung per material (vertex color) supaya draw call tetap rendah.
 */

/** Pengumpul geometri statis berwarna yang digabung menjadi satu mesh. */
class Batch {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();

  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, position: [number, number, number], rotation: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    this.quaternion.setFromEuler(this.euler.set(rotation[0], rotation[1], rotation[2]));
    this.matrix.compose(new THREE.Vector3(...position), this.quaternion, new THREE.Vector3(...scale));
    g.applyMatrix4(this.matrix);
    const c = new THREE.Color(color); const count = g.attributes.position!.count; const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.parts.push(g);
    if (geometry !== g) geometry.dispose();
  }
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, rotY = 0) { this.add(new THREE.BoxGeometry(w, h, d), color, [x, y, z], [0, rotY, 0]); }
  cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, color: THREE.ColorRepresentation, seg = 16, rot: [number, number, number] = [0, 0, 0]) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, [x, y, z], rot); }
  ball(x: number, y: number, z: number, r: number, color: THREE.ColorRepresentation, scale: [number, number, number] = [1, 1, 1], detail = 1) { this.add(new THREE.IcosahedronGeometry(r, detail), color, [x, y, z], [0, 0, 0], scale); }
  get empty() { return this.parts.length === 0; }
  build(material: THREE.Material, shadows = true) {
    const geometry = mergeGeometries(this.parts, false)!;
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    return mesh;
  }
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void, repeat: [number, number] = [1, 1]) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

const textures = {
  wood: (base: string, line: string) => (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 8; i++) {
      const y = i * s / 8; ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'; ctx.fillRect(0, y, s, s / 8);
      ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
      const offset = (i * 97) % s; ctx.beginPath(); ctx.moveTo(offset, y); ctx.lineTo(offset, y + s / 8); ctx.stroke();
      for (let k = 0; k < 6; k++) { ctx.strokeStyle = 'rgba(90,60,30,0.08)'; ctx.lineWidth = 1; ctx.beginPath(); const gy = y + 3 + k * (s / 8 - 6) / 6; ctx.moveTo(0, gy); ctx.bezierCurveTo(s * 0.3, gy + 2, s * 0.6, gy - 2, s, gy); ctx.stroke(); }
    }
  },
  tile: (a: string, b: string) => (ctx: CanvasRenderingContext2D, s: number) => {
    const n = 4; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = (i + j) % 2 ? a : b; ctx.fillRect(i * s / n, j * s / n, s / n, s / n); }
    ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 2; for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.moveTo(i * s / n, 0); ctx.lineTo(i * s / n, s); ctx.moveTo(0, i * s / n); ctx.lineTo(s, i * s / n); ctx.stroke(); }
  },
  carpet: (base: string, fleck: string) => (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) { ctx.fillStyle = fleck; ctx.globalAlpha = 0.12; ctx.fillRect((i * 7919) % s, (i * 104729) % s, 2, 2); }
    ctx.globalAlpha = 1;
  },
  grass: (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.fillStyle = '#7fbf5f'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 2600; i++) { const v = (i * 2654435761) % 1000 / 1000; ctx.fillStyle = v > 0.5 ? 'rgba(160,214,110,0.35)' : 'rgba(70,140,60,0.25)'; ctx.fillRect((i * 7919) % s, (i * 6271) % s, 2, 3); }
  },
  asphalt: (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.fillStyle = '#6f777a'; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) { ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; ctx.fillRect((i * 7919) % s, (i * 104729) % s, 2, 2); }
  },
  water: (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.fillStyle = '#388DA7'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) { const x = (i * 53) % s, y = (i * 97) % s; ctx.beginPath(); ctx.ellipse(x, y, 14 + (i % 5) * 4, 6, (i % 3) * 0.6, 0, Math.PI * 1.4); ctx.stroke(); }
  },
  facade: (base: string, window: string) => (ctx: CanvasRenderingContext2D, s: number) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { ctx.fillStyle = window; ctx.fillRect(c * s / 4 + 10, r * s / 4 + 12, s / 4 - 20, s / 4 - 24); }
  },
};

export interface OfficeWorld {
  group: THREE.Group;
  screens: Map<string, THREE.MeshStandardMaterial>;
  setAtmosphere(cycle: AtmosphereCycle): void;
  setCutaway(yaw: number): void;
  setScreenActive(id: string, active: boolean): void;
  setPrinting(active: boolean): void;
  update(t: number, dt: number): void;
  dispose(): void;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

const ZONE_FLOOR: Record<Exclude<ZoneId, 'terrace'>, () => THREE.Texture> = {
  owner: () => canvasTexture(256, textures.carpet('#4f6d8f', '#c8d8ea'), [3, 3]),
  work: () => canvasTexture(256, textures.wood('#d9b48a', 'rgba(120,80,45,0.35)'), [4, 4]),
  meeting: () => canvasTexture(256, textures.wood('#e3c9a3', 'rgba(130,95,60,0.3)'), [3, 3]),
  pantry: () => canvasTexture(256, textures.tile('#f4efe4', '#9fc7c4'), [5, 5]),
  lounge: () => canvasTexture(256, textures.wood('#c99a6c', 'rgba(110,70,40,0.35)'), [4, 4]),
  rec: () => canvasTexture(256, textures.wood('#d8ae80', 'rgba(115,78,45,0.35)'), [3, 3]),
};
/** Warna cat dinding dalam per zona (seperti wallpaper berbeda per ruangan). */
const ZONE_PAINT: Record<ZoneId, string> = { owner: '#d9e6ef', work: '#e8f3ea', meeting: '#e3ecf8', pantry: '#fbefcf', lounge: '#f6e6dc', rec: '#efe7f7', terrace: '#ffffff' };
const SIDING = '#f3ead8', TRIM = '#ffffff', BASEBOARD = '#c9b79c';

export function buildOfficeWorld(): OfficeWorld {
  const group = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const vertexMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
  const glossyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });
  disposables.push(vertexMaterial, glossyMaterial);
  const furniture = new Batch(); const glossy = new Batch(); const outdoor = new Batch();
  const textured = (geometry: THREE.BufferGeometry, texture: THREE.Texture, position: [number, number, number], rotationX = -Math.PI / 2, options: THREE.MeshStandardMaterialParameters = {}) => {
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.85, ...options }); disposables.push(material, texture, geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.rotation.x = rotationX; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };

  // ===================== Tanah, jalan, dan lingkungan kota =====================
  textured(new THREE.PlaneGeometry(120, 120), canvasTexture(256, textures.grass, [40, 40]), [0, -0.02, 0]);
  textured(new THREE.PlaneGeometry(120, 4.6), canvasTexture(256, textures.asphalt, [30, 1]), [0, -0.005, 14.6]);
  for (let x = -58; x <= 58; x += 3.2) outdoor.box(x, 0.003, 14.6, 1.6, 0.01, 0.12, '#f5e9c8'); // marka tengah
  for (const z of [11.75, 17.45]) { outdoor.box(0, 0.06, z, 120, 0.12, 1.1, '#d9d4c7'); outdoor.box(0, 0.06, z + (z < 14 ? 0.58 : -0.58), 120, 0.14, 0.08, '#bdb6a6'); }
  for (let i = 0; i < 6; i++) outdoor.box(-1.2 + i * 0.5, 0.004, 14.6, 0.3, 0.01, 4.2, '#f7f2e6'); // zebra cross
  // Jalan setapak lot: dari trotoar ke pintu teras dan ke sisi gedung.
  for (let z = 9.4; z < 11.3; z += 0.55) outdoor.box(-0.9, 0.03, z, 1.2, 0.05, 0.42, '#e7dcc6');
  for (let x = 2.4; x < 9; x += 0.6) outdoor.box(x, 0.03, 10.4, 0.46, 0.05, 1.0, '#e7dcc6');
  // Pagar putih mengelilingi lot (sisi jalan dengan celah gerbang).
  const fence = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0); const angle = Math.atan2(x1 - x0, z1 - z0); const n = Math.floor(length / 0.42);
    for (let i = 0; i <= n; i++) { const t = i / n; outdoor.box(x0 + (x1 - x0) * t, 0.38, z0 + (z1 - z0) * t, 0.08, 0.76, 0.08, '#fbfaf3', angle); }
    outdoor.box((x0 + x1) / 2, 0.55, (z0 + z1) / 2, 0.05, 0.07, length, '#fbfaf3', angle);
    outdoor.box((x0 + x1) / 2, 0.25, (z0 + z1) / 2, 0.05, 0.07, length, '#fbfaf3', angle);
  };
  fence(-10.5, 11, -1.8, 11); fence(0.2, 11, 10.5, 11); fence(-10.5, -7.5, -10.5, 11); fence(10.5, -7.5, 10.5, 11); fence(-10.5, -7.5, 10.5, -7.5);
  // Pagar tanaman & bunga.
  const flowerColors = ['#f06292', '#ffd54f', '#ba68c8', '#ff8a65', '#ffffff'];
  for (let i = 0; i < 18; i++) {
    const x = -9.6 + (i % 9) * 1.1 + (i > 8 ? 10.4 : 0); if (Math.abs(x + 0.9) < 1.4) continue;
    outdoor.ball(x, 0.35, 10.3, 0.42, '#5f9e4f', [1.2, 0.8, 0.9]);
    for (let k = 0; k < 4; k++) outdoor.ball(x + (k - 1.5) * 0.22, 0.62, 10.05 + (k % 2) * 0.15, 0.07, flowerColors[(i + k) % flowerColors.length]!, [1, 1, 1], 0);
  }
  const tree = (x: number, z: number, scale = 1, leaf = '#5fa14f') => {
    outdoor.cyl(x, 0.9 * scale, z, 0.12 * scale, 0.18 * scale, 1.8 * scale, '#8b5e3c', 8);
    outdoor.ball(x, 2.3 * scale, z, 1.05 * scale, leaf, [1, 0.9, 1]);
    outdoor.ball(x + 0.55 * scale, 2.0 * scale, z + 0.2 * scale, 0.72 * scale, shadeHex(leaf, 0.06));
    outdoor.ball(x - 0.5 * scale, 2.05 * scale, z - 0.25 * scale, 0.7 * scale, shadeHex(leaf, -0.04));
    outdoor.ball(x, 2.95 * scale, z, 0.65 * scale, shadeHex(leaf, 0.1));
  };
  for (const [x, z, s] of [[-9.2, -6.3, 1.1], [9.0, -6.2, 1.2], [-9.4, 4.5, 0.95], [9.3, 7.5, 1.0], [8.8, 0.5, 0.85], [-9.5, 9.6, 0.8], [4.6, 9.8, 0.75]] as const) tree(x, z, s);
  for (let x = -40; x <= 40; x += 9) { if (Math.abs(x) < 3) continue; tree(x + 1.5, 18.4, 0.8, '#6aa857'); }
  // Lampu jalan.
  const lampHeads: THREE.Vector3[] = [];
  for (const x of [-16, -6, 6, 16]) {
    outdoor.cyl(x, 1.7, 12.1, 0.06, 0.08, 3.4, '#3d4a52', 8); outdoor.box(x, 3.42, 12.35, 0.08, 0.08, 0.6, '#3d4a52');
    lampHeads.push(new THREE.Vector3(x, 3.3, 12.6));
  }
  // Kotak surat & bangku.
  outdoor.box(2.0, 0.55, 11.5, 0.08, 1.1, 0.08, '#6d4c41'); outdoor.box(2.0, 1.1, 11.5, 0.35, 0.25, 0.5, '#2f6fb0');
  // Rumah tetangga di seberang jalan (atap pelana, jendela, pintu, beranda).
  const houseColors = ['#f4c7a1', '#bfe0d4', '#f7e3a4', '#c9d7f2', '#f2c2c9', '#d6e7b5'];
  const roofColors = ['#b5523b', '#4e6e8e', '#7a5c45', '#5b7f52', '#8e4e66', '#a2643c'];
  for (let i = 0; i < 6; i++) {
    const x = -27.5 + i * 11, z = 23.5, color = houseColors[i]!, roof = roofColors[i]!; const w = 7, d = 6, h = 3.1;
    outdoor.box(x, h / 2, z, w, h, d, color);
    outdoor.box(x, 0.1, z, w + 0.3, 0.2, d + 0.3, '#cdbfa8');
    const roofGeometry = new THREE.CylinderGeometry(0.01, d * 0.72, 2.2, 4, 1); // limas
    outdoor.add(roofGeometry, roof, [x, h + 1.1, z], [0, Math.PI / 4, 0], [w / d * 1.08, 1, 1]);
    for (const dx of [-2.2, 2.2]) { outdoor.box(x + dx, 1.75, z - d / 2 - 0.03, 1.2, 1.0, 0.06, '#9fd2e6'); outdoor.box(x + dx, 1.75, z - d / 2 - 0.05, 1.32, 1.12, 0.03, TRIM); }
    outdoor.box(x, 1.05, z - d / 2 - 0.03, 1.0, 2.0, 0.08, roofColors[(i + 2) % 6]!);
    outdoor.box(x, 0.12, z - d / 2 - 0.9, 2.4, 0.24, 1.5, '#d8cdb8');
    for (const dx of [-1.05, 1.05]) outdoor.cyl(x + dx, 1.2, z - d / 2 - 1.5, 0.07, 0.07, 2.2, TRIM, 8);
    outdoor.box(x, 2.35, z - d / 2 - 0.9, 2.6, 0.12, 1.7, roof);
    if (i % 2 === 0) { outdoor.box(x + 2.3, h + 1.3, z + 1, 0.6, 1.6, 0.6, '#a0715a'); }
    for (let k = -2; k <= 2; k++) outdoor.ball(x + k * 1.2, 0.35, z - d / 2 - 0.35, 0.35, '#5f9e4f', [1.1, 0.8, 0.8]);
  }
  // Mobil terparkir di tepi jalan.
  const car = (x: number, z: number, color: string, flip = false) => {
    const r = flip ? Math.PI : 0;
    outdoor.box(x, 0.55, z, 3.8, 0.6, 1.7, color, r); outdoor.box(x + (flip ? 0.3 : -0.3), 1.05, z, 2.0, 0.55, 1.5, color, r);
    outdoor.box(x + (flip ? 0.3 : -0.3), 1.07, z, 2.04, 0.42, 1.52, '#a8d4e8', r);
    for (const dx of [-1.2, 1.2]) for (const dz of [-0.82, 0.82]) outdoor.cyl(x + dx, 0.32, z + dz, 0.32, 0.32, 0.22, '#2b2b2b', 14, [Math.PI / 2, 0, 0]);
  };
  car(-12.5, 13.3, '#e05f4f'); car(9.5, 15.9, '#4f8fe0', true); car(21, 13.3, '#f2c94c');
  // Gedung kota di belakang lot memberi nuansa "kota".
  const cityTexture = canvasTexture(256, textures.facade('#c6d3dc', '#7fa9c4'), [2, 3]);
  const cityMaterial = new THREE.MeshStandardMaterial({ map: cityTexture, roughness: 0.7 }); disposables.push(cityMaterial, cityTexture);
  for (const [x, z, w, h, d] of [[-22, -20, 8, 11, 7], [-11, -24, 9, 16, 8], [1, -21, 7, 9, 7], [12, -25, 10, 19, 8], [24, -20, 8, 12, 7], [-34, -26, 9, 14, 8], [35, -27, 9, 17, 8]] as const) {
    const geometry = new THREE.BoxGeometry(w, h, d); disposables.push(geometry);
    const building = new THREE.Mesh(geometry, cityMaterial); building.position.set(x, h / 2, z); building.receiveShadow = true; group.add(building);
    outdoor.box(x, h + 0.15, z, w + 0.3, 0.3, d + 0.3, '#9eb0bd');
  }

  // ===================== Gedung kantor =====================
  outdoor.box(0, -0.06, 0, BUILDING.x1 - BUILDING.x0 + 0.6, 0.12, BUILDING.z1 - BUILDING.z0 + 0.6, '#cbbfa9'); // fondasi
  for (const zone of Object.keys(ZONE_FLOOR) as Array<keyof typeof ZONE_FLOOR>) {
    const rect = ZONES[zone].rect; const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    textured(new THREE.PlaneGeometry(w, d), ZONE_FLOOR[zone](), [(rect.x0 + rect.x1) / 2, 0.005, (rect.z0 + rect.z1) / 2]);
  }
  // Karpet lounge & ruang rapat.
  const rugTexture = canvasTexture(256, (ctx, s) => { ctx.fillStyle = '#e9a38b'; ctx.fillRect(0, 0, s, s); ctx.strokeStyle = '#fbe6d4'; ctx.lineWidth = 10; ctx.strokeRect(14, 14, s - 28, s - 28); ctx.lineWidth = 3; ctx.strokeRect(34, 34, s - 68, s - 68); });
  textured(new THREE.PlaneGeometry(4.2, 2.8), rugTexture, [0.2, 0.012, 2.0]);

  // Dinding luar: tiap sisi punya versi penuh & versi rendah. Sisi yang menghadap kamera dipotong (cutaway).
  type WallSide = 'north' | 'south' | 'west' | 'east';
  const walls: Record<WallSide, { full: THREE.Mesh; cut: THREE.Mesh; normal: THREE.Vector2 }> = {} as never;
  const paintAt = (x: number, z: number): string => {
    const zone = (Object.keys(ZONES) as ZoneId[]).find(id => id !== 'terrace' && x >= ZONES[id].rect.x0 - 0.01 && x <= ZONES[id].rect.x1 + 0.01 && z >= ZONES[id].rect.z0 - 0.01 && z <= ZONES[id].rect.z1 + 0.01);
    return ZONE_PAINT[zone ?? 'work'];
  };
  const buildWall = (side: WallSide, height: number, withWindows: boolean) => {
    const b = new Batch(); const t = 0.16; const horizontal = side === 'north' || side === 'south';
    const fixed = side === 'north' ? BUILDING.z0 : side === 'south' ? BUILDING.z1 : side === 'west' ? BUILDING.x0 : BUILDING.x1;
    const length = horizontal ? BUILDING.x1 - BUILDING.x0 : BUILDING.z1 - BUILDING.z0;
    const outward = side === 'north' || side === 'west' ? -1 : 1;
    const segments: Array<[number, number]> = side === 'south' ? [[BUILDING.x0, TERRACE_DOOR.x0], [TERRACE_DOOR.x1, BUILDING.x1]] : [[horizontal ? BUILDING.x0 : BUILDING.z0, horizontal ? BUILDING.x1 : BUILDING.z1]];
    const place = (along: number, y: number, a: number, h: number, layer: 'out' | 'in', color: string) => {
      const offset = layer === 'out' ? outward * t * 0.25 : -outward * t * 0.25;
      if (horizontal) b.box(along, y, fixed + offset, a, h, t / 2, color); else b.box(fixed + offset, y, along, t / 2, h, a, color);
    };
    for (const [s0, s1] of segments) {
      const windows: Array<[number, number]> = [];
      if (withWindows) for (let c = s0 + 1.2; c < s1 - 1.0; c += 2.4) windows.push([c, c + 1.3]);
      let cursor = s0;
      const solid = (a0: number, a1: number, y0: number, y1: number) => {
        if (a1 - a0 < 0.01 || y1 - y0 < 0.01) return;
        const mid = (a0 + a1) / 2; const paint = horizontal ? paintAt(mid, fixed - outward * 0.3) : paintAt(fixed - outward * 0.3, mid);
        place(mid, (y0 + y1) / 2, a1 - a0, y1 - y0, 'out', SIDING); place(mid, (y0 + y1) / 2, a1 - a0, y1 - y0, 'in', paint);
      };
      for (const [w0, w1] of windows) {
        solid(cursor, w0, 0, height);
        solid(w0, w1, 0, 0.9); solid(w0, w1, 2.15, height);
        // kusen & kaca
        if (horizontal) { b.box((w0 + w1) / 2, 1.525, fixed, w1 - w0, 1.25, 0.03, '#bfe4f2'); b.box((w0 + w1) / 2, 0.92, fixed - outward * 0.1, w1 - w0 + 0.12, 0.05, 0.22, TRIM); b.box((w0 + w1) / 2, 1.525, fixed, 0.05, 1.25, 0.08, TRIM); }
        else { b.box(fixed, 1.525, (w0 + w1) / 2, 0.03, 1.25, w1 - w0, '#bfe4f2'); b.box(fixed - outward * 0.1, 0.92, (w0 + w1) / 2, 0.22, 0.05, w1 - w0 + 0.12, TRIM); b.box(fixed, 1.525, (w0 + w1) / 2, 0.08, 1.25, 0.05, TRIM); }
        cursor = w1;
      }
      solid(cursor, s1, 0, height);
      // plint & list atas
      const mid = (s0 + s1) / 2, len = s1 - s0;
      if (horizontal) { b.box(mid, 0.06, fixed - outward * 0.09, len, 0.12, 0.03, BASEBOARD); b.box(mid, height + 0.03, fixed, len + 0.02, 0.06, t + 0.04, TRIM); }
      else { b.box(fixed - outward * 0.09, 0.06, mid, 0.03, 0.12, len, BASEBOARD); b.box(fixed, height + 0.03, mid, t + 0.04, 0.06, len + 0.02, TRIM); }
    }
    if (side === 'south') { // kusen pintu kaca teras
      b.box((TERRACE_DOOR.x0 + TERRACE_DOOR.x1) / 2, height + 0.0 - (height > 1 ? 0.25 : 0) , fixed, TERRACE_DOOR.x1 - TERRACE_DOOR.x0, height > 1 ? 0.5 : 0.04, t, TRIM);
    }
    void length;
    const mesh = b.build(vertexMaterial); group.add(mesh); return mesh;
  };
  for (const side of ['north', 'south', 'west', 'east'] as WallSide[]) {
    const normal = side === 'north' ? new THREE.Vector2(0, -1) : side === 'south' ? new THREE.Vector2(0, 1) : side === 'west' ? new THREE.Vector2(-1, 0) : new THREE.Vector2(1, 0);
    walls[side] = { full: buildWall(side, WALL_HEIGHT, true), cut: buildWall(side, 0.42, false), normal };
  }
  // Pilar sudut.
  for (const [x, z] of [[BUILDING.x0, BUILDING.z0], [BUILDING.x1, BUILDING.z0], [BUILDING.x0, BUILDING.z1], [BUILDING.x1, BUILDING.z1]]) outdoor.box(x!, 0.25, z!, 0.3, 0.5, 0.3, TRIM);

  // Partisi kaca ruang pemilik & ruang rapat.
  const glassMaterial = new THREE.MeshStandardMaterial({ color: '#cfeaf5', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }); disposables.push(glassMaterial);
  const partition = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0); const horizontal = z0 === z1; const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const geometry = new THREE.BoxGeometry(horizontal ? length : 0.04, 2.1, horizontal ? 0.04 : length); disposables.push(geometry);
    const pane = new THREE.Mesh(geometry, glassMaterial); pane.position.set(cx, 1.08, cz); pane.renderOrder = 2; group.add(pane);
    furniture.box(cx, 2.16, cz, horizontal ? length : 0.08, 0.08, horizontal ? 0.08 : length, '#e9eef1');
    furniture.box(cx, 0.04, cz, horizontal ? length : 0.08, 0.08, horizontal ? 0.08 : length, '#e9eef1');
    for (const end of [[x0, z0], [x1, z1]]) furniture.box(end[0]!, 1.1, end[1]!, 0.08, 2.2, 0.08, '#e9eef1');
  };
  partition(-3.6, -5, -3.6, -2.3); partition(-7, -1.2, -4.9, -1.2); partition(3.7, -5, 3.7, -2.6); partition(5.0, -1.3, 7, -1.3);

  // ===================== Furnitur =====================
  const screens = new Map<string, THREE.MeshStandardMaterial>();
  const screen = (id: string, x: number, y: number, z: number, w: number, h: number, rotY = 0) => {
    const material = new THREE.MeshStandardMaterial({ color: '#1d2a35', emissive: '#5fb6dc', emissiveIntensity: 0.15, roughness: 0.3 }); disposables.push(material);
    const geometry = new THREE.PlaneGeometry(w, h); disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.rotation.y = rotY; group.add(mesh); screens.set(id, material);
  };
  const officeChair = (x: number, z: number, rotY: number, color: string) => {
    const back = rotY === 0 ? -1 : 1;
    furniture.cyl(x, 0.24, z, 0.035, 0.035, 0.4, '#555c63', 8);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; furniture.box(x + Math.sin(a) * 0.18, 0.05, z + Math.cos(a) * 0.18, 0.05, 0.04, 0.34, '#4a5057', a); furniture.ball(x + Math.sin(a) * 0.32, 0.03, z + Math.cos(a) * 0.32, 0.035, '#222', [1, 1, 1], 0); }
    furniture.box(x, 0.45, z, 0.5, 0.08, 0.48, color);
    furniture.box(x, 0.8, z + back * 0.24, 0.48, 0.6, 0.08, color);
  };
  const desk = (id: string, cx: number, cz: number, w: number, color: string, chairColor: string, monitors = 1) => {
    const top = '#caa27a';
    furniture.box(cx, 0.75, cz, w, 0.05, 0.7, top);
    furniture.box(cx - w / 2 + 0.22, 0.37, cz, 0.36, 0.7, 0.62, color); // laci
    for (const dx of [w / 2 - 0.05]) for (const dz of [-0.3, 0.3]) furniture.box(cx + dx, 0.37, cz + dz, 0.05, 0.72, 0.05, '#e7e3d9');
    furniture.box(cx - w / 2 + 0.22, 0.5, cz + 0.315, 0.28, 0.03, 0.01, '#f2efe6'); furniture.box(cx - w / 2 + 0.22, 0.25, cz + 0.315, 0.28, 0.03, 0.01, '#f2efe6');
    for (let m = 0; m < monitors; m++) {
      const mx = cx + (monitors === 2 ? (m ? 0.33 : -0.33) : 0.08);
      furniture.box(mx, 0.8, cz + 0.12, 0.2, 0.02, 0.14, '#3d464f'); furniture.box(mx, 0.93, cz + 0.17, 0.04, 0.25, 0.04, '#3d464f');
      glossy.box(mx, 1.1, cz + 0.18, 0.62, 0.4, 0.035, '#2b333b');
      screen(`${id}-${m}`, mx, 1.1, cz + 0.158, 0.56, 0.34, Math.PI);
    }
    furniture.box(cx + 0.05, 0.785, cz - 0.15, 0.45, 0.02, 0.15, '#e8e8e2'); // keyboard
    furniture.box(cx + 0.38, 0.785, cz - 0.15, 0.06, 0.02, 0.09, '#e8e8e2');
    furniture.cyl(cx - w / 2 + 0.22, 0.83, cz - 0.15, 0.045, 0.04, 0.1, ['#e57373', '#64b5f6', '#81c784', '#ffb74d'][Math.abs(Math.round(cx)) % 4]!, 12);
    furniture.box(cx - w / 2 + 0.55, 0.785, cz + 0.05, 0.22, 0.02, 0.3, '#fbfbf6');
    furniture.cyl(cx + w / 2 - 0.15, 0.82, cz + 0.2, 0.06, 0.05, 0.1, '#d9875f', 10); furniture.ball(cx + w / 2 - 0.15, 0.92, cz + 0.2, 0.09, '#5d9c4e');
    officeChair(cx, cz - 0.75, 0, chairColor);
  };
  desk('desk-admin', -1.5, -3.3, 1.4, '#f2c29b', '#e07b54');
  desk('desk-communication', 0.5, -3.3, 1.4, '#a8d5c2', '#4f9e7c');
  desk('desk-hermes', 2.5, -3.3, 1.5, '#b7c8e6', '#33507f', 2);
  // Meja pemilik: kayu gelap, kursi kulit, rak buku, lampu.
  furniture.box(-5.3, 0.76, -3.3, 1.6, 0.06, 0.8, '#7a4e33'); furniture.box(-5.3, 0.38, -2.95, 1.55, 0.7, 0.06, '#6a432c');
  for (const dx of [-0.75, 0.75]) furniture.box(-5.3 + dx, 0.38, -3.3, 0.08, 0.72, 0.72, '#6a432c');
  glossy.box(-5.1, 1.1, -3.15, 0.66, 0.42, 0.035, '#2b333b'); furniture.box(-5.1, 0.92, -3.16, 0.04, 0.26, 0.04, '#3d464f'); screen('desk-owner-0', -5.1, 1.1, -3.172, 0.6, 0.36, Math.PI);
  furniture.cyl(-5.95, 0.85, -3.4, 0.07, 0.09, 0.14, '#2f4f4f', 10); furniture.cyl(-5.95, 1.02, -3.4, 0.12, 0.17, 0.16, '#fbe8b5', 12, [Math.PI, 0, 0]);
  officeChair(-5.3, -4.05, 0, '#3a2a24');
  furniture.box(-6.67, 1.0, -4.42, 0.5, 2.0, 1.0, '#8a5a3c');
  for (let r = 0; r < 4; r++) for (let k = 0; k < 6; k++) furniture.box(-6.6, 0.32 + r * 0.46, -4.82 + k * 0.15, 0.3, 0.32 - (k % 3) * 0.04, 0.1, ['#c0504d', '#4f81bd', '#9bbb59', '#f79646', '#8064a2', '#4bacc6'][(r + k) % 6]!);
  furniture.ball(-4.0, 0.55, -4.6, 0.35, '#4f8f45', [1, 1.3, 1]); furniture.cyl(-4.0, 0.2, -4.6, 0.2, 0.16, 0.4, '#d7c3a5', 12);
  textured(new THREE.PlaneGeometry(2.2, 1.6), canvasTexture(128, textures.carpet('#d8c6a8', '#7a5c3a')), [-5.3, 0.012, -3.6]);
  // Printer.
  glossy.box(-2.9, 0.42, -4.65, 0.75, 0.84, 0.55, '#eceff1'); furniture.box(-2.9, 0.86, -4.65, 0.7, 0.06, 0.5, '#cfd8dc'); furniture.box(-2.9, 0.68, -4.37, 0.5, 0.03, 0.12, '#90a4ae'); furniture.box(-2.68, 0.9, -4.45, 0.18, 0.02, 0.1, '#37474f');
  const paperGeometry = new THREE.PlaneGeometry(0.3, 0.4); const paperMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide }); disposables.push(paperGeometry, paperMaterial);
  const paper = new THREE.Mesh(paperGeometry, paperMaterial); paper.rotation.x = -Math.PI / 2; paper.position.set(-2.9, 0.7, -4.36); paper.visible = false; group.add(paper);
  // Ruang rapat: meja, kursi, papan kanban, kalender, layar.
  furniture.box(5.4, 0.74, -3.15, 2.0, 0.06, 1.0, '#e8d3b0'); for (const dx of [-0.85, 0.85]) furniture.box(5.4 + dx, 0.37, -3.15, 0.08, 0.72, 0.8, '#d1bb96');
  for (const dx of [-0.6, 0, 0.6]) { furniture.box(5.4 + dx, 0.45, -2.45, 0.42, 0.06, 0.4, '#6c8ebf'); furniture.box(5.4 + dx, 0.7, -2.27, 0.42, 0.46, 0.05, '#6c8ebf'); for (const lx of [-0.17, 0.17]) furniture.box(5.4 + dx + lx, 0.22, -2.45, 0.03, 0.44, 0.03, '#888'); }
  furniture.box(4.75, 1.55, -4.9, 1.7, 1.05, 0.05, '#fcfcfa'); furniture.box(4.75, 1.55, -4.92, 1.8, 1.15, 0.03, '#90a4ae');
  for (let col = 0; col < 3; col++) for (let k = 0; k < 3; k++) furniture.box(4.25 + col * 0.5, 1.82 - k * 0.24, -4.87, 0.16, 0.16, 0.01, ['#ffe082', '#80deea', '#f48fb1'][col]!);
  furniture.box(6.3, 1.6, -4.9, 0.8, 0.8, 0.04, '#ffffff'); furniture.box(6.3, 1.92, -4.88, 0.8, 0.14, 0.01, '#e57373');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) furniture.box(6.0 + c * 0.15, 1.75 - r * 0.13, -4.875, 0.1, 0.08, 0.005, (r * 5 + c) % 7 === 3 ? '#64b5f6' : '#eceff1');
  // Arsip.
  furniture.box(6.67, 0.95, -2.3, 0.55, 1.9, 1.3, '#b0bec5');
  for (let r = 0; r < 4; r++) for (const dz of [-0.32, 0.32]) { furniture.box(6.39, 0.3 + r * 0.45, -2.3 + dz, 0.02, 0.36, 0.56, '#cfd8dc'); furniture.box(6.37, 0.42 + r * 0.45, -2.3 + dz, 0.02, 0.05, 0.16, '#607d8b'); }
  // Pantry: kabinet, meja dapur, mesin kopi, kulkas, meja bundar.
  furniture.box(-6.65, 0.45, 0.75, 0.6, 0.9, 3.3, '#7fb5b0'); furniture.box(-6.62, 0.92, 0.75, 0.68, 0.05, 3.36, '#f3f1ec');
  for (let k = 0; k < 4; k++) furniture.box(-6.34, 0.45, -0.55 + k * 0.85, 0.02, 0.74, 0.8, '#8dc3be');
  glossy.box(-6.65, 1.15, 0.25, 0.38, 0.42, 0.34, '#37474f'); furniture.box(-6.5, 1.04, 0.25, 0.1, 0.1, 0.12, '#b0bec5'); furniture.cyl(-6.45, 0.98, 0.25, 0.04, 0.035, 0.08, '#ffffff', 10);
  glossy.box(-6.65, 1.1, 1.4, 0.45, 0.3, 0.55, '#eceff1'); furniture.box(-6.42, 1.1, 1.4, 0.02, 0.2, 0.36, '#263238'); // microwave
  furniture.box(-6.65, 0.96, 2.05, 0.4, 0.04, 0.5, '#cfd8dc'); // bak cuci
  furniture.box(-6.82, 2.0, 0.75, 0.32, 0.6, 3.3, '#a3cfca'); // kabinet atas
  glossy.box(-6.62, 0.9, 3.0, 0.65, 1.8, 0.8, '#f5f5f5'); furniture.box(-6.28, 1.1, 2.75, 0.03, 0.5, 0.04, '#90a4ae'); furniture.box(-6.28, 0.5, 2.75, 0.03, 0.3, 0.04, '#90a4ae');
  furniture.cyl(-4.8, 0.74, 2.2, 0.48, 0.48, 0.05, '#fbf7ef', 24); furniture.cyl(-4.8, 0.37, 2.2, 0.05, 0.08, 0.72, '#8d6e63', 10); furniture.cyl(-4.8, 0.02, 2.2, 0.25, 0.28, 0.04, '#8d6e63', 16);
  furniture.cyl(-4.8, 0.8, 2.2, 0.14, 0.1, 0.07, '#ffffff', 14); for (let k = 0; k < 3; k++) furniture.ball(-4.84 + k * 0.05, 0.86, 2.18 + (k % 2) * 0.05, 0.045, ['#ef5350', '#ffca28', '#66bb6a'][k]!, [1, 1, 1], 0);
  for (const [z, rot] of [[1.3, 0], [3.1, Math.PI]] as const) { furniture.box(-4.8, 0.45, z, 0.42, 0.05, 0.42, '#ffb74d'); furniture.box(-4.8, 0.72, z - (rot ? -0.2 : 0.2), 0.42, 0.5, 0.05, '#ffb74d'); for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) furniture.box(-4.8 + dx, 0.22, z + dz, 0.03, 0.44, 0.03, '#795548'); }
  // Lounge: sofa, kursi berlengan, meja kopi, rak buku, lampu lantai.
  furniture.box(0.2, 0.25, 0.8, 2.4, 0.3, 0.75, '#5c8fb5'); furniture.box(0.2, 0.62, 0.48, 2.4, 0.55, 0.18, '#4f7fa3');
  for (const dx of [-0.6, 0.6]) furniture.box(0.2 + dx, 0.45, 0.85, 1.12, 0.14, 0.62, '#6aa0c7');
  for (const dx of [-1.25, 1.25]) furniture.box(0.2 + dx, 0.45, 0.8, 0.16, 0.5, 0.75, '#4f7fa3');
  furniture.box(-0.3, 0.68, 0.62, 0.32, 0.28, 0.12, '#f6c96b'); furniture.box(0.75, 0.68, 0.62, 0.32, 0.28, 0.12, '#e88a8a');
  furniture.box(0.2, 0.42, 2.3, 1.25, 0.06, 0.65, '#c69c6d'); for (const dx of [-0.55, 0.55]) for (const dz of [-0.26, 0.26]) furniture.box(0.2 + dx, 0.2, 2.3 + dz, 0.05, 0.4, 0.05, '#8d6e63');
  furniture.box(0.0, 0.46, 2.25, 0.3, 0.02, 0.22, '#64b5f6'); furniture.box(0.45, 0.47, 2.35, 0.24, 0.03, 0.3, '#fff59d');
  const armchair = (x: number, z: number, rotY: number) => {
    const dir = Math.sin(rotY) || 1; const color = '#e3a15a';
    furniture.box(x, 0.25, z, 0.8, 0.3, 0.8, color, rotY); furniture.box(x - dir * 0.32, 0.6, z, 0.16, 0.6, 0.8, shadeHex(color, -0.08), rotY);
    furniture.box(x, 0.45, z - 0.35, 0.8, 0.35, 0.12, shadeHex(color, -0.06)); furniture.box(x, 0.45, z + 0.35, 0.8, 0.35, 0.12, shadeHex(color, -0.06));
    furniture.box(x, 0.45, z, 0.62, 0.12, 0.6, shadeHex(color, 0.05));
  };
  armchair(-1.75, 2.3, Math.PI / 2); armchair(2.15, 2.3, -Math.PI / 2);
  furniture.box(-3.2, 1.0, 4.25, 0.5, 2.0, 1.25, '#a1887f');
  for (let r = 0; r < 4; r++) for (let k = 0; k < 7; k++) furniture.box(-2.97, 0.33 + r * 0.46, 3.72 + k * 0.15, 0.06, 0.3 - (k % 2) * 0.05, 0.11, ['#ef5350', '#42a5f5', '#66bb6a', '#ffca28', '#ab47bc', '#26c6da', '#ff7043'][(r * 3 + k) % 7]!);
  furniture.cyl(2.85, 0.03, 0.95, 0.18, 0.18, 0.04, '#5d4037', 14); furniture.cyl(2.85, 0.8, 0.95, 0.02, 0.02, 1.55, '#5d4037', 8); furniture.cyl(2.85, 1.62, 0.95, 0.12, 0.22, 0.28, '#fff3d6', 16);
  // Pojok rekreasi: foosball, dispenser air, bean bag.
  // Meja foosball: sisi panjang menghadap pemain (barat & timur), batang mengarah ke pemain.
  furniture.box(5.3, 0.78, 1.6, 0.7, 0.25, 1.1, '#8d5a3b'); furniture.box(5.3, 0.79, 1.6, 0.6, 0.04, 1.0, '#58a55c');
  for (const dx of [-0.28, 0.28]) for (const dz of [-0.46, 0.46]) furniture.box(5.3 + dx, 0.33, 1.6 + dz, 0.07, 0.66, 0.07, '#6d4c41');
  for (let k = 0; k < 4; k++) {
    furniture.cyl(5.3, 0.86, 1.25 + k * 0.23, 0.012, 0.012, 1.1, '#cfd8dc', 6, [0, 0, Math.PI / 2]);
    for (const end of [-0.55, 0.55]) furniture.ball(5.3 + end, 0.86, 1.25 + k * 0.23, 0.03, k % 2 ? '#e53935' : '#1e88e5', [1, 1, 1], 0);
    for (const dz of [-0.06, 0.06]) furniture.box(5.3 + (k % 2 ? 0.08 : -0.08), 0.84, 1.25 + k * 0.23 + dz, 0.03, 0.08, 0.03, k % 2 ? '#e53935' : '#1e88e5');
  }
  glossy.box(6.65, 0.5, 4.15, 0.36, 1.0, 0.36, '#eceff1'); glossy.cyl(6.65, 1.22, 4.15, 0.15, 0.15, 0.42, '#7fc3e8', 16);
  furniture.ball(4.4, 0.28, 4.0, 0.42, '#7e57c2', [1.1, 0.7, 1.1]); furniture.ball(5.4, 0.28, 4.3, 0.42, '#ffb74d', [1.1, 0.7, 1.1]);
  // Tanaman dalam ruangan.
  for (const [x, z, s] of [[3.45, -0.9, 1.0], [2.85, 4.45, 1.1], [-3.35, -0.9, 0.9], [6.7, 0.0, 0.9], [-3.35, 0.2, 0.8]] as const) {
    furniture.cyl(x, 0.2 * s, z, 0.2 * s, 0.15 * s, 0.4 * s, '#d9a67d', 12);
    furniture.ball(x, 0.65 * s, z, 0.32 * s, '#5b9e4c', [1, 1.2, 1]); furniture.ball(x + 0.12 * s, 0.9 * s, z, 0.22 * s, '#78b860');
  }
  // Bingkai foto di dinding utara (terlihat dari sudut kamera default).
  for (const [x, color] of [[-1.5, '#f6b26b'], [0.5, '#93c47d'], [2.5, '#8e7cc3']] as const) { furniture.box(x, 1.95, -4.9, 0.55, 0.4, 0.03, '#5d4037'); furniture.box(x, 1.95, -4.885, 0.45, 0.3, 0.01, color); }

  // ===================== Teras & kolam =====================
  textured(new THREE.PlaneGeometry(DECK.x1 - DECK.x0, DECK.z1 - DECK.z0), canvasTexture(256, textures.wood('#c08a5b', 'rgba(90,55,30,0.45)'), [4, 2]), [(DECK.x0 + DECK.x1) / 2, 0.06, (DECK.z0 + DECK.z1) / 2]);
  outdoor.box((DECK.x0 + DECK.x1) / 2, 0.02, (DECK.z0 + DECK.z1) / 2, DECK.x1 - DECK.x0 + 0.1, 0.06, DECK.z1 - DECK.z0 + 0.1, '#8a6040');
  const poolW = POOL.x1 - POOL.x0, poolD = POOL.z1 - POOL.z0, poolX = (POOL.x0 + POOL.x1) / 2, poolZ = (POOL.z0 + POOL.z1) / 2;
  for (const [x, z, w, d] of [[poolX, POOL.z0 - 0.08, poolW + 0.32, 0.16], [poolX, POOL.z1 + 0.08, poolW + 0.32, 0.16], [POOL.x0 - 0.08, poolZ, 0.16, poolD], [POOL.x1 + 0.08, poolZ, 0.16, poolD]] as const) outdoor.box(x, 0.1, z, w, 0.08, d, '#f1ede4');
  const waterTexture = canvasTexture(256, textures.water, [2, 1.2]);
  const water = textured(new THREE.PlaneGeometry(poolW, poolD), waterTexture, [poolX, 0.075, poolZ], -Math.PI / 2, { color: '#ffffff', roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.92, emissive: '#388DA7', emissiveIntensity: 0.12 });
  for (const dx of [-0.12, 0.12]) outdoor.cyl(POOL.x1 - 0.35 + dx, 0.35, POOL.z0 + 0.05, 0.015, 0.015, 0.6, '#cfd8dc', 8);
  const lounger = (x: number, z: number) => {
    outdoor.box(x, 0.25, z, 1.5, 0.08, 0.55, '#fafafa'); outdoor.box(x + 0.62, 0.45, z, 0.5, 0.08, 0.55, '#fafafa', 0); // rangka
    outdoor.box(x - 0.15, 0.31, z, 1.15, 0.06, 0.5, '#4fb3bf'); outdoor.add(new THREE.BoxGeometry(0.5, 0.06, 0.5), '#4fb3bf', [x + 0.6, 0.5, z], [0, 0, 0.75]);
    for (const dx of [-0.65, 0.5]) for (const dz of [-0.22, 0.22]) outdoor.box(x + dx, 0.12, z + dz, 0.04, 0.24, 0.04, '#bdbdbd');
  };
  lounger(0.82, 6.18); lounger(0.82, 7.38);
  outdoor.cyl(1.3, 1.1, 8.55, 0.03, 0.03, 2.2, '#8d6e63', 8); outdoor.add(new THREE.ConeGeometry(1.1, 0.45, 10), '#f06c64', [1.3, 2.25, 8.55]);
  for (const [x, z] of [[-6.2, 5.6], [-6.2, 8.8], [1.5, 5.5]] as const) { outdoor.cyl(x, 0.28, z, 0.24, 0.2, 0.5, '#ffffff', 12); outdoor.ball(x, 0.75, z, 0.32, '#4f9e4f', [1, 1.3, 1]); }

  // ===================== Bangun mesh statis =====================
  for (const batch of [furniture, outdoor]) if (!batch.empty) group.add(batch.build(vertexMaterial));
  if (!glossy.empty) group.add(glossy.build(glossyMaterial));

  // ===================== Cahaya =====================
  const hemi = new THREE.HemisphereLight('#d7ecff', '#a89a7c', 1.25);
  const sun = new THREE.DirectionalLight('#fff1d6', 2.7);
  sun.position.set(-9, 16, 10); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025; sun.shadow.radius = 3;
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 50 });
  group.add(hemi, sun, sun.target);
  const nightLights: THREE.PointLight[] = [];
  for (const [x, y, z] of [[-5.3, 2.3, -3.2], [0.4, 2.4, -3.0], [5.4, 2.3, -3.0], [-5.0, 2.3, 1.8], [0.3, 2.4, 2.2], [5.3, 2.3, 2.5], [-2.6, 2.0, 7.2]] as const) {
    // Tidak terlihat di siang hari: lampu tak terlihat tidak ikut dihitung di shader (hemat GPU).
    const light = new THREE.PointLight('#ffd9a0', 0, 9, 1.6); light.position.set(x, y, z); light.visible = false; nightLights.push(light); group.add(light);
  }
  const lampMaterial = new THREE.MeshStandardMaterial({ color: '#fff4cf', emissive: '#ffd27a', emissiveIntensity: 0 }); disposables.push(lampMaterial);
  for (const head of lampHeads) { const geometry = new THREE.SphereGeometry(0.16, 12, 8); disposables.push(geometry); const bulb = new THREE.Mesh(geometry, lampMaterial); bulb.position.copy(head); group.add(bulb); }

  let printing = false; let printTime = 0;
  const activeScreens = new Set<string>();
  let night = false;

  const world: OfficeWorld = {
    group, screens, sun, hemi,
    setAtmosphere(cycle) {
      night = cycle === 'night';
      const day = cycle === 'day';
      sun.color.set(day ? '#fff1d6' : cycle === 'sunset' ? '#ffb070' : '#9fb4ff');
      sun.intensity = day ? 2.7 : cycle === 'sunset' ? 2.0 : 0.45;
      sun.position.set(day ? -9 : cycle === 'sunset' ? -16 : 8, day ? 16 : cycle === 'sunset' ? 6.5 : 14, day ? 10 : cycle === 'sunset' ? 4 : -6);
      hemi.color.set(day ? '#d7ecff' : cycle === 'sunset' ? '#ffd2b0' : '#4a5d8f');
      hemi.groundColor.set(day ? '#a89a7c' : cycle === 'sunset' ? '#8f6f5a' : '#1f2638');
      hemi.intensity = day ? 1.25 : cycle === 'sunset' ? 1.05 : 0.55;
      for (const light of nightLights) { light.intensity = night ? 7 : cycle === 'sunset' ? 1.5 : 0; light.visible = !day; }
      lampMaterial.emissiveIntensity = night ? 2.4 : cycle === 'sunset' ? 0.6 : 0;
      for (const [id, material] of screens) material.emissiveIntensity = activeScreens.has(id.replace(/-\d$/, '')) ? 0.9 : night ? 0.35 : 0.15;
    },
    setCutaway(yaw) {
      const view = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
      for (const wall of Object.values(walls)) { const facing = wall.normal.dot(view) > 0.2; wall.full.visible = !facing; wall.cut.visible = facing; }
    },
    setScreenActive(id, active) {
      if (active) activeScreens.add(id); else activeScreens.delete(id);
      for (const [key, material] of screens) if (key.startsWith(id)) { material.emissive.set(active ? '#7fd3f5' : '#5fb6dc'); material.emissiveIntensity = active ? 0.9 : night ? 0.35 : 0.15; }
    },
    setPrinting(active) { printing = active; if (!active) { paper.visible = false; printTime = 0; } },
    update(t, dt) {
      waterTexture.offset.set(Math.sin(t * 0.25) * 0.05, t * 0.02);
      if (printing) { printTime = (printTime + dt) % 2.2; paper.visible = true; paper.position.z = -4.36 + Math.min(1, printTime / 1.4) * 0.18; paper.position.y = 0.7 - Math.max(0, printTime - 1.4) * 0.04; }
      for (const [id, material] of screens) if (activeScreens.has(id.replace(/-\d$/, ''))) material.emissiveIntensity = 0.75 + Math.sin(t * 6 + id.length) * 0.12;
    },
    dispose() {
      group.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
      for (const item of disposables) item.dispose();
    },
  };
  void water;
  world.setCutaway(Math.PI / 4);
  return world;
}

function shadeHex(hex: string, amount: number) {
  const color = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amount)));
  return `#${color.getHexString()}`;
}
