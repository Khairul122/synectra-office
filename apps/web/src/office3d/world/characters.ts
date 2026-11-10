import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Anim } from './staff-brain.ts';

/**
 * Karakter kartun prosedural (tanpa file model): proporsi kepala besar, mata ekspresif, rig sendi
 * sederhana, dan animasi prosedural dengan transisi halus antar-pose.
 */
export type HairKind = 'side-part' | 'bun' | 'curly' | 'short' | 'long' | 'wavy' | 'ponytail' | 'bald';
export type TopKind = 'blazer' | 'cardigan' | 'hoodie' | 'tshirt' | 'shirt';
export type AccessoryKind = 'glasses' | 'headset' | 'earrings' | 'badge' | 'headphones' | 'watch' | 'coffee-cup';

export interface Appearance {
  skin: string; hair: string; hairStyle: HairKind; eyes: string;
  top: TopKind; topColor: string; accent: string; pants: string; shoes: string;
  accessories: AccessoryKind[];
  /** Skala tinggi (1 ≈ 1,62 m) dan lebar badan. */
  height: number; build: number;
  lips?: string;
}

export const STAFF_APPEARANCE: Record<'hermes' | 'admin' | 'communication', Appearance> = {
  // Lead yang rapi: blazer navy, kemeja putih, kacamata, rambut belah samping.
  hermes: { skin: '#e8b48f', hair: '#2b2220', hairStyle: 'side-part', eyes: '#4a3424', top: 'blazer', topColor: '#33507f', accent: '#f4f1ea', pants: '#2f3a4c', shoes: '#3b2a22', accessories: ['glasses', 'watch'], height: 1.03, build: 1.02 },
  // Administrasi: rambut cepol, kardigan jingga hangat, anting.
  admin: { skin: '#c98c66', hair: '#3a221b', hairStyle: 'bun', eyes: '#3b2416', top: 'cardigan', topColor: '#e3874f', accent: '#fbecd9', pants: '#5b4a6e', shoes: '#7a3f35', accessories: ['earrings', 'badge'], height: 0.95, build: 0.95, lips: '#b4575a' },
  // Komunikasi: rambut keriting, hoodie hijau, headset untuk WhatsApp/telepon.
  communication: { skin: '#a8714f', hair: '#1f1a19', hairStyle: 'curly', eyes: '#2c1c12', top: 'hoodie', topColor: '#4f9e7c', accent: '#e9f4ee', pants: '#36435a', shoes: '#f2f2ee', accessories: ['headset'], height: 0.99, build: 1.0 },
};

export interface Rig {
  root: THREE.Group; body: THREE.Group;
  hips: THREE.Group; spine: THREE.Group; chest: THREE.Group; neck: THREE.Group; head: THREE.Group;
  shoulderL: THREE.Group; shoulderR: THREE.Group; elbowL: THREE.Group; elbowR: THREE.Group; handL: THREE.Group; handR: THREE.Group;
  thighL: THREE.Group; thighR: THREE.Group; kneeL: THREE.Group; kneeR: THREE.Group;
  eyes: THREE.Group[]; browL: THREE.Mesh; browR: THREE.Mesh; smile: THREE.Mesh; mouthOpen: THREE.Mesh;
  props: Record<'cup' | 'phone' | 'book' | 'marker' | 'can', THREE.Object3D>;
  shadow: THREE.Mesh;
  state: AnimState;
  appearance: Appearance;
}

interface AnimState { blinkIn: number; blink: number; walkPhase: number; current: Record<string, number>; talkPhase: number }

const HIP_HEIGHT = 0.86;
const BASE_SCALE = 0.82;

/** Material dibagikan per warna agar hemat GPU; dibuang lewat CharacterKit.dispose(). */
export class CharacterKit {
  private readonly materials = new Map<string, THREE.Material>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private shadowTexture?: THREE.Texture;
  private vertexMaterial?: THREE.MeshStandardMaterial;

  /** Material bersama untuk bagian karakter yang digabung (warna per vertex). */
  bodyMaterial() { return (this.vertexMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 })); }

  material(color: string, options: { rough?: number; emissive?: string; transparent?: number } = {}) {
    const key = `${color}|${options.rough ?? 0.72}|${options.emissive ?? ''}|${options.transparent ?? ''}`;
    let material = this.materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness: options.rough ?? 0.72, metalness: 0, emissive: options.emissive ?? '#000000', emissiveIntensity: options.emissive ? 0.6 : 0, transparent: options.transparent !== undefined, opacity: options.transparent ?? 1, depthWrite: options.transparent === undefined });
      this.materials.set(key, material);
    }
    return material;
  }

  geometry(key: string, create: () => THREE.BufferGeometry) {
    let geometry = this.geometries.get(key);
    if (!geometry) { geometry = create(); this.geometries.set(key, geometry); }
    return geometry;
  }

  contactShadow() {
    if (!this.shadowTexture) {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!; const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
      gradient.addColorStop(0, 'rgba(20,30,40,0.55)'); gradient.addColorStop(1, 'rgba(20,30,40,0)');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
      this.shadowTexture = new THREE.CanvasTexture(canvas);
    }
    return this.shadowTexture;
  }

  dispose() {
    for (const material of this.materials.values()) material.dispose();
    for (const geometry of this.geometries.values()) geometry.dispose();
    this.shadowTexture?.dispose();
    this.vertexMaterial?.dispose();
    this.materials.clear(); this.geometries.clear();
  }
}

function group(parent: THREE.Object3D, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

export function buildCharacter(kit: CharacterKit, look: Appearance): Rig {
  const mesh = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, opts: Parameters<CharacterKit['material']>[1] = {}) => {
    const m = new THREE.Mesh(geometry, kit.material(color, opts)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const sphere = (r: number, w = 18, h = 14) => kit.geometry(`s${r}-${w}-${h}`, () => new THREE.SphereGeometry(r, w, h));
  const capsule = (r: number, l: number) => kit.geometry(`c${r}-${l}`, () => new THREE.CapsuleGeometry(r, l, 6, 14));
  const box = (w: number, h: number, d: number) => kit.geometry(`b${w}-${h}-${d}`, () => new THREE.BoxGeometry(w, h, d));
  const cylinder = (rt: number, rb: number, h: number, seg = 14) => kit.geometry(`y${rt}-${rb}-${h}-${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const torus = (r: number, t: number, arc = Math.PI * 2) => kit.geometry(`t${r}-${t}-${arc}`, () => new THREE.TorusGeometry(r, t, 8, 24, arc));
  const partial = (r: number, phiStart: number, phiLength: number, thetaStart: number, thetaLength: number) =>
    kit.geometry(`p${r}-${phiStart}-${phiLength}-${thetaStart}-${thetaLength}`, () => new THREE.SphereGeometry(r, 24, 16, phiStart, phiLength, thetaStart, thetaLength));

  const root = new THREE.Group();
  const body = group(root); body.scale.setScalar(BASE_SCALE * look.height);
  const w = look.build;
  const sleeveLong = look.top !== 'tshirt';

  // Bayangan kontak lembut di lantai (tetap terlihat walau shadow map dimatikan).
  const shadow = new THREE.Mesh(kit.geometry('shadow', () => new THREE.PlaneGeometry(0.9, 0.9)), new THREE.MeshBasicMaterial({ map: kit.contactShadow(), transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; shadow.renderOrder = 1; root.add(shadow);

  // ---------- Pinggul & kaki ----------
  const hips = group(body, 0, HIP_HEIGHT, 0);
  const pelvis = mesh(hips, sphere(0.19), look.pants, 0, 0.02, 0); pelvis.scale.set(1.12 * w, 0.72, 0.86);
  const leg = (side: 1 | -1) => {
    const thigh = group(hips, 0.1 * side * w, -0.02, 0);
    mesh(thigh, capsule(0.085, 0.28), look.pants, 0, -0.2, 0);
    const knee = group(thigh, 0, -0.42, 0);
    mesh(knee, capsule(0.075, 0.26), look.pants, 0, -0.18, 0);
    const foot = group(knee, 0, -0.4, 0);
    const shoe = mesh(foot, capsule(0.066, 0.12), look.shoes, 0, -0.025, 0.05); shoe.rotation.x = Math.PI / 2; shoe.scale.set(1.05, 1, 0.72);
    return { thigh, knee };
  };
  const { thigh: thighL, knee: kneeL } = leg(1);
  const { thigh: thighR, knee: kneeR } = leg(-1);

  // ---------- Badan ----------
  const spine = group(hips, 0, 0.08, 0);
  const chest = group(spine, 0, 0.2, 0);
  const torso = mesh(spine, capsule(0.2, 0.26), look.topColor, 0, 0.2, 0); torso.scale.set(1.13 * w, 1, 0.82);
  if (look.top === 'blazer') {
    for (const side of [1, -1]) { const lapel = mesh(spine, box(0.09, 0.26, 0.02), look.accent, 0.045 * side, 0.27, 0.16); lapel.rotation.z = 0.32 * side; }
    mesh(spine, box(0.045, 0.2, 0.02), '#9b3b3b', 0, 0.24, 0.17); // dasi
    for (const y of [0.13, 0.05]) mesh(spine, sphere(0.014, 8, 6), '#d9c58c', 0.06, y, 0.165);
  } else if (look.top === 'cardigan') {
    mesh(spine, box(0.13, 0.36, 0.02), look.accent, 0, 0.21, 0.155);
    for (const y of [0.3, 0.2, 0.1]) mesh(spine, sphere(0.013, 8, 6), '#f6e2c4', 0.075, y, 0.165);
  } else if (look.top === 'hoodie') {
    const hood = mesh(chest, torus(0.15, 0.05), look.topColor, 0, 0.07, -0.06); hood.rotation.x = Math.PI / 2.3;
    const pocket = mesh(spine, box(0.24, 0.1, 0.03), look.topColor, 0, 0.05, 0.165); pocket.scale.set(w, 1, 1);
    for (const side of [1, -1]) mesh(spine, cylinder(0.006, 0.006, 0.14, 6), look.accent, 0.05 * side, 0.26, 0.17);
  } else if (look.top === 'shirt') {
    for (const side of [1, -1]) { const collar = mesh(chest, box(0.09, 0.05, 0.03), look.accent, 0.05 * side, 0.08, 0.13); collar.rotation.z = -0.5 * side; }
    for (const y of [0.3, 0.2, 0.1]) mesh(spine, sphere(0.012, 8, 6), look.accent, 0, y, 0.168);
  }
  if (look.accessories.includes('badge')) mesh(spine, box(0.06, 0.08, 0.01), '#ffffff', -0.1 * w, 0.27, 0.165);

  // ---------- Lengan ----------
  const arm = (side: 1 | -1) => {
    const shoulder = group(chest, 0.25 * side * w, 0.2, 0);
    mesh(shoulder, sphere(0.075), look.topColor, 0, 0, 0);
    mesh(shoulder, capsule(0.064, 0.2), look.topColor, 0, -0.14, 0);
    const elbow = group(shoulder, 0, -0.29, 0);
    mesh(elbow, capsule(0.057, 0.17), sleeveLong ? look.topColor : look.skin, 0, -0.12, 0);
    if (sleeveLong) mesh(elbow, cylinder(0.06, 0.06, 0.04), look.top === 'hoodie' ? look.accent : look.topColor, 0, -0.22, 0);
    const hand = group(elbow, 0, -0.27, 0);
    const palm = mesh(hand, sphere(0.062), look.skin, 0, -0.02, 0); palm.scale.set(0.85, 1.12, 0.72);
    mesh(hand, sphere(0.026, 8, 6), look.skin, 0.045 * side, 0.005, 0.03);
    if (side === 1 && look.accessories.includes('watch')) { const watch = mesh(elbow, torus(0.058, 0.014), '#2a2a2e', 0, -0.21, 0); watch.rotation.x = Math.PI / 2; }
    return { shoulder, elbow, hand };
  };
  const { shoulder: shoulderL, elbow: elbowL, hand: handL } = arm(1);
  const { shoulder: shoulderR, elbow: elbowR, hand: handR } = arm(-1);

  // ---------- Kepala ----------
  const neck = group(chest, 0, 0.27, 0);
  mesh(neck, cylinder(0.065, 0.072, 0.12), look.skin, 0, 0.02, 0);
  const head = group(neck, 0, 0.1, 0);
  const skull = mesh(head, sphere(0.27, 28, 22), look.skin, 0, 0.25, 0); skull.scale.set(1, 1.02, 0.95);
  const face = group(head, 0, 0.25, 0);
  for (const side of [1, -1]) { const ear = mesh(face, sphere(0.055), look.skin, 0.262 * side, 0, 0); ear.scale.set(0.55, 1, 0.75); }
  mesh(face, sphere(0.034), shade(look.skin, -0.06), 0, -0.035, 0.258);
  const eyes: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const eye = group(face, 0.096 * side, 0.025, 0.222);
    const white = mesh(eye, sphere(0.062), '#fbfbf7', 0, 0, 0, { rough: 0.3 }); white.scale.set(0.82, 1.05, 0.45);
    const iris = mesh(eye, sphere(0.041), look.eyes, 0, -0.004, 0.02, { rough: 0.25 }); iris.scale.set(0.95, 1.05, 0.35);
    const pupil = mesh(eye, sphere(0.022), '#111214', 0, -0.004, 0.032, { rough: 0.2 }); pupil.scale.set(1, 1.05, 0.3);
    mesh(eye, sphere(0.012, 8, 6), '#ffffff', 0.012, 0.014, 0.04, { rough: 0.1, emissive: '#ffffff' });
    eye.children.forEach(child => { (child as THREE.Mesh).castShadow = false; });
    eyes.push(eye);
  }
  const browColor = shade(look.hair, -0.05);
  const browL = mesh(face, box(0.08, 0.019, 0.02), browColor, 0.098, 0.112, 0.238);
  const browR = mesh(face, box(0.08, 0.019, 0.02), browColor, -0.098, 0.112, 0.238);
  const smile = mesh(face, torus(0.048, 0.011, Math.PI), look.lips ?? '#8a3d3a', 0, -0.098, 0.236); smile.rotation.z = Math.PI;
  const mouthOpen = mesh(face, sphere(0.04), '#6b2326', 0, -0.105, 0.232); mouthOpen.scale.set(1.15, 0.75, 0.4); mouthOpen.visible = false;
  for (const side of [1, -1]) { const blush = mesh(face, sphere(0.045), '#ff8a8a', 0.158 * side, -0.065, 0.2, { transparent: 0.32 }); blush.scale.set(1, 0.6, 0.25); blush.castShadow = false; }
  buildHair(face, look, mesh, sphere, capsule, partial);
  if (look.accessories.includes('glasses')) {
    for (const side of [1, -1]) mesh(face, torus(0.056, 0.008), '#262626', 0.096 * side, 0.025, 0.252);
    mesh(face, box(0.06, 0.008, 0.008), '#262626', 0, 0.035, 0.258);
    for (const side of [1, -1]) { const temple = mesh(face, box(0.008, 0.008, 0.2), '#262626', 0.15 * side, 0.03, 0.15); temple.rotation.y = 0.15 * side; }
  }
  if (look.accessories.includes('earrings')) for (const side of [1, -1]) mesh(face, sphere(0.016, 8, 6), '#e6c35c', 0.268 * side, -0.055, 0.01, { rough: 0.2 });
  if (look.accessories.includes('headset') || look.accessories.includes('headphones')) {
    const big = look.accessories.includes('headphones');
    const band = mesh(face, torus(0.285, big ? 0.022 : 0.014, Math.PI), '#2b2f36', 0, 0.02, 0); band.rotation.y = Math.PI / 2;
    for (const side of [1, -1]) { const cup = mesh(face, cylinder(big ? 0.075 : 0.05, big ? 0.075 : 0.05, 0.05), big ? '#e05d5d' : '#2b2f36', 0.285 * side, 0, 0); cup.rotation.z = Math.PI / 2; }
    if (!big) { const boom = mesh(face, cylinder(0.008, 0.008, 0.2, 6), '#2b2f36', 0.22, -0.11, 0.1); boom.rotation.set(1.1, 0, 0.5); mesh(face, sphere(0.02, 8, 6), '#2b2f36', 0.17, -0.15, 0.18); }
  }

  // ---------- Properti di tangan ----------
  const props = {
    cup: (() => { const g = group(handR, 0, -0.06, 0.06); mesh(g, cylinder(0.04, 0.034, 0.09), '#ffffff', 0, 0, 0, { rough: 0.35 }); const handle = mesh(g, torus(0.025, 0.008), '#ffffff', 0.045, 0, 0); handle.rotation.y = Math.PI / 2; mesh(g, cylinder(0.035, 0.035, 0.005), '#6b4129', 0, 0.042, 0); return g; })(),
    phone: (() => { const g = group(handL, 0, -0.05, 0.05); mesh(g, box(0.06, 0.11, 0.012), '#22262e', 0, 0, 0, { rough: 0.3 }); mesh(g, box(0.052, 0.098, 0.002), '#7ec8e3', 0, 0, 0.007, { emissive: '#3a8fb0' }); return g; })(),
    book: (() => { const g = group(handL, -0.08, -0.06, 0.08); const cover = mesh(g, box(0.2, 0.26, 0.04), '#c0504d', 0, 0, 0); cover.rotation.x = -0.4; return g; })(),
    marker: (() => { const g = group(handR, 0, -0.06, 0.03); const pen = mesh(g, cylinder(0.012, 0.012, 0.12, 8), '#2f6fd1', 0, 0, 0); pen.rotation.x = Math.PI / 2; return g; })(),
    can: (() => { const g = group(handR, 0, -0.1, 0.05); mesh(g, box(0.12, 0.12, 0.08), '#5aa36a', 0, 0, 0); const spout = mesh(g, cylinder(0.01, 0.015, 0.16, 8), '#5aa36a', 0, 0.02, 0.1); spout.rotation.x = 1.0; return g; })(),
  };
  for (const prop of Object.values(props)) prop.visible = false;
  if (look.accessories.includes('coffee-cup')) props.cup.visible = true;

  root.traverse(child => { if (child instanceof THREE.Mesh) child.receiveShadow = false; });
  mergeStaticParts(kit, root, new Set<THREE.Object3D>([shadow, browL, browR, smile, mouthOpen, ...eyes, ...Object.values(props)]));
  return {
    root, body, hips, spine, chest, neck, head, shoulderL, shoulderR, elbowL, elbowR, handL, handR, thighL, thighR, kneeL, kneeR,
    eyes, browL, browR, smile, mouthOpen, props, shadow, appearance: look,
    state: { blinkIn: 2 + Math.random() * 3, blink: 0, walkPhase: Math.random() * 6, current: {}, talkPhase: 0 },
  };
}

/**
 * Gabungkan mesh statis yang menempel pada sendi yang sama menjadi satu mesh berwarna per vertex.
 * Mengurangi draw call karakter secara drastis; bagian yang dianimasikan/ditoggle (mata, alis, mulut,
 * properti, bayangan, pipi transparan) dibiarkan terpisah.
 */
function mergeStaticParts(kit: CharacterKit, root: THREE.Object3D, keep: Set<THREE.Object3D>) {
  const groups: THREE.Object3D[] = [];
  root.traverse(node => { if (!keep.has(node) && (node instanceof THREE.Group || node === root)) groups.push(node); });
  for (const group of groups) {
    const meshes = group.children.filter((child): child is THREE.Mesh => child instanceof THREE.Mesh && !keep.has(child)
      && child.material instanceof THREE.MeshStandardMaterial && !child.material.transparent && child.material.emissiveIntensity === 0);
    if (meshes.length < 2) continue;
    const parts = meshes.map(mesh => {
      mesh.updateMatrix();
      const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      geometry.applyMatrix4(mesh.matrix);
      const color = (mesh.material as THREE.MeshStandardMaterial).color; const count = geometry.attributes.position!.count; const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geometry;
    });
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) continue;
    merged.userData.owned = true;
    const mesh = new THREE.Mesh(merged, kit.bodyMaterial()); mesh.castShadow = true;
    for (const original of meshes) group.remove(original);
    group.add(mesh);
  }
}

/** Buang geometri hasil penggabungan milik satu karakter (geometri cache kit tidak ikut dibuang). */
export function disposeRig(rig: Rig) {
  rig.root.traverse(node => { if (node instanceof THREE.Mesh && node.geometry.userData.owned) node.geometry.dispose(); });
  (rig.shadow.material as THREE.Material).dispose();
}

type MeshFn = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, x?: number, y?: number, z?: number) => THREE.Mesh;
function buildHair(face: THREE.Group, look: Appearance, mesh: MeshFn, sphere: (r: number, w?: number, h?: number) => THREE.BufferGeometry, capsule: (r: number, l: number) => THREE.BufferGeometry, partial: (r: number, a: number, b: number, c: number, d: number) => THREE.BufferGeometry) {
  if (look.hairStyle === 'bald') return;
  const c = look.hair; const PI = Math.PI;
  // Tudung atas (berhenti di atas alis) + bagian belakang yang lebih panjang: wajah tetap terbuka.
  mesh(face, partial(0.292, 0, PI * 2, 0, PI * 0.36), c, 0, 0.012, -0.004);
  mesh(face, partial(0.289, PI, PI, PI * 0.3, PI * (look.hairStyle === 'short' || look.hairStyle === 'side-part' ? 0.36 : 0.46)), c, 0, 0.008, -0.004);
  for (const side of [1, -1]) { const burn = mesh(face, capsule(0.04, 0.08), c, 0.255 * side, 0.06, -0.03); burn.rotation.z = 0.1 * side; }
  switch (look.hairStyle) {
    case 'side-part': {
      // Poni menyapu ke samping, menempel ke dahi (tanpa "topi" di atas kepala).
      const swoop = mesh(face, sphere(0.12), c, -0.06, 0.19, 0.165); swoop.scale.set(1.75, 0.5, 0.62); swoop.rotation.z = 0.22;
      const lift = mesh(face, sphere(0.1), c, 0.1, 0.215, 0.12); lift.scale.set(1.2, 0.5, 0.8);
      break;
    }
    case 'short': { const fringe = mesh(face, sphere(0.12), c, 0, 0.19, 0.16); fringe.scale.set(1.7, 0.42, 0.6); break; }
    case 'bun': {
      const fringe = mesh(face, sphere(0.15), c, 0, 0.215, 0.12); fringe.scale.set(1.7, 0.42, 0.8);
      mesh(face, sphere(0.11), c, 0, 0.25, -0.2);
      const tie = mesh(face, sphere(0.06), '#e8c547', 0, 0.2, -0.17); tie.scale.set(1.3, 0.5, 1.3);
      break;
    }
    case 'curly': {
      const curls: Array<[number, number, number]> = [];
      for (let ring = 0; ring < 3; ring++) for (let i = 0; i < 9 + ring * 2; i++) {
        const a = (i / (9 + ring * 2)) * PI * 2; const elevation = 0.95 - ring * 0.32; const r = 0.29;
        const x = Math.cos(a) * Math.sin(elevation) * r, z = Math.sin(a) * Math.sin(elevation) * r, y = Math.cos(elevation) * r;
        if (z > 0.17 && y < 0.2) continue; // jangan tutup wajah
        curls.push([x, y + 0.02, z]);
      }
      curls.push([0, 0.3, 0]);
      for (const [x, y, z] of curls) mesh(face, sphere(0.072, 10, 8), c, x, y, z);
      break;
    }
    case 'long': case 'wavy': case 'ponytail': {
      const fringe = mesh(face, sphere(0.15), c, 0.02, 0.215, 0.12); fringe.scale.set(1.7, 0.45, 0.8);
      if (look.hairStyle === 'ponytail') {
        const tail = mesh(face, capsule(0.07, 0.28), c, 0, 0.0, -0.33); tail.rotation.x = 0.45;
        mesh(face, sphere(0.05), '#d9534f', 0, 0.12, -0.27);
      } else {
        const back = mesh(face, capsule(0.2, 0.3), c, 0, -0.2, -0.13); back.scale.set(1.2, 1, 0.55);
        for (const side of [1, -1]) {
          const strand = mesh(face, capsule(0.07, 0.3), c, 0.235 * side, -0.16, 0.0); strand.rotation.z = 0.08 * side;
          if (look.hairStyle === 'wavy') for (const y of [-0.06, -0.22, -0.36]) mesh(face, sphere(0.065, 10, 8), c, 0.25 * side, y, 0.03);
        }
      }
      break;
    }
  }
}

/** Mencerahkan/menggelapkan warna hex. */
export function shade(hex: string, amount: number) {
  const color = new THREE.Color(hex); const hsl = { h: 0, s: 0, l: 0 }; color.getHSL(hsl);
  color.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amount, 0, 1));
  return `#${color.getHexString()}`;
}

/* ===================================================================================== */
/*                                        Animasi                                         */
/* ===================================================================================== */

export interface AnimContext {
  /** Tinggi dudukan kursi (m) untuk pose duduk. */
  seatHeight: number;
  /** Fase bicara: >0 berbicara, <0 mendengarkan (untuk animasi ngobrol bergantian). */
  talk: number;
  /** Mood memengaruhi alis & mulut. */
  mood: 'happy' | 'neutral' | 'tired' | 'upset' | 'focus';
  moving: boolean;
  speed: number;
}

type Pose = Record<string, number>;
const J = ['hipsY', 'hipsX', 'hipsZ', 'spineX', 'spineY', 'chestX', 'neckX', 'headX', 'headY', 'headZ',
  'shLx', 'shLy', 'shLz', 'shRx', 'shRy', 'shRz', 'elL', 'elR', 'handLx', 'handRx',
  'thLx', 'thLz', 'thRx', 'thRz', 'knL', 'knR'] as const;

function base(): Pose {
  const pose: Pose = {}; for (const joint of J) pose[joint] = 0; pose.hipsY = HIP_HEIGHT; pose.shLz = 0.08; pose.shRz = -0.08; pose.elL = -0.12; pose.elR = -0.12; return pose;
}

/** Pose target untuk animasi pada waktu t. Fungsi murni: rig meng-interpolasi ke pose ini. */
export function targetPose(anim: Anim | 'walk', t: number, ctx: AnimContext, phase: number): { pose: Pose; props: Partial<Record<keyof Rig['props'], boolean>>; mouth: 'smile' | 'talk' | 'frown' | 'open' } {
  const p = base(); const s = Math.sin; let mouth: 'smile' | 'talk' | 'frown' | 'open' = 'smile';
  const props: Partial<Record<keyof Rig['props'], boolean>> = {};
  const breathe = s(t * 1.8 + phase) * 0.012;
  const sit = (lean = 0) => { p.hipsY = ctx.seatHeight / BASE_SCALE + 0.02; p.thLx = p.thRx = -1.52; p.knL = p.knR = 1.5; p.thLz = 0.06; p.thRz = -0.06; p.spineX = lean; };
  const talking = ctx.talk > 0 && s(t * 9 + phase) > -0.2;
  switch (anim) {
    case 'walk': {
      const stride = s(t); const lift = Math.max(0, s(t)), lift2 = Math.max(0, -s(t));
      p.thLx = stride * 0.55; p.thRx = -stride * 0.55; p.knL = lift2 * 0.9 + 0.05; p.knR = lift * 0.9 + 0.05;
      p.shLx = -stride * 0.5; p.shRx = stride * 0.5; p.elL = p.elR = -0.35; p.hipsY = HIP_HEIGHT - 0.02 + Math.abs(s(t)) * 0.035; p.spineY = stride * 0.08; p.spineX = 0.06; p.headY = -stride * 0.05;
      break;
    }
    case 'walk_in_place': {
      const w = t * 7; const stride = s(w);
      p.thLx = stride * 0.45; p.thRx = -stride * 0.45; p.knL = Math.max(0, -stride) * 0.8; p.knR = Math.max(0, stride) * 0.8;
      p.shLx = -stride * 0.45; p.shRx = stride * 0.45; p.elL = p.elR = -0.4; p.hipsY = HIP_HEIGHT + Math.abs(stride) * 0.03;
      break;
    }
    case 'sit_type': {
      sit(0.08); p.shLx = p.shRx = -0.72; p.shLz = -0.1; p.shRz = 0.1; p.elL = p.elR = -0.95;
      p.handLx = s(t * 14 + phase) * 0.18; p.handRx = s(t * 13 + 1.7 + phase) * 0.18; p.headX = 0.12 + s(t * 0.7) * 0.04; p.headY = s(t * 0.35 + phase) * 0.12;
      mouth = 'smile'; break;
    }
    case 'sit_talk': {
      sit(0.04); const gesture = s(t * 2.2 + phase);
      p.shLx = -0.7; p.shLz = -0.08; p.elL = -1.0; p.handLx = s(t * 12) * 0.15;
      p.shRx = -0.55 - gesture * 0.35; p.shRz = 0.25 + gesture * 0.15; p.elR = -1.25 - gesture * 0.3;
      p.headY = s(t * 0.9 + phase) * 0.18; p.headX = -0.04 + s(t * 2.6) * 0.05; mouth = s(t * 8) > 0 ? 'talk' : 'smile'; break;
    }
    case 'sit_phone': {
      sit(0.1); p.shLx = -0.95; p.shLz = -0.18; p.elL = -1.55; p.shRx = -0.75; p.shRz = 0.12; p.elR = -1.0; p.handRx = s(t * 12 + phase) * 0.2;
      p.headX = 0.22; p.headY = 0.08; props.phone = true; mouth = s(t * 0.8) > 0.6 ? 'talk' : 'smile'; break;
    }
    case 'sit_idle': {
      sit(-0.06); const look = s(t * 0.4 + phase);
      p.shLx = p.shRx = -0.35; p.elL = p.elR = -1.1; p.shLz = -0.06; p.shRz = 0.06; p.headY = look * 0.35; p.headX = s(t * 0.6) * 0.06;
      if (s(t * 0.21 + phase) > 0.55) { p.shRx = -0.9; p.elR = -2.2; p.headX = 0.1; } // sesekali menopang dagu
      break;
    }
    case 'sit_relax': {
      sit(-0.28); p.shLx = p.shRx = -0.15; p.shLz = 0.55; p.shRz = -0.55; p.elL = p.elR = -0.6; p.headX = -0.14; p.headY = s(t * 0.3 + phase) * 0.25;
      p.thLz = 0.18; p.thRz = -0.18; p.knL = p.knR = 1.25; mouth = 'smile'; break;
    }
    case 'sit_eat': {
      sit(0.05); const bite = Math.max(0, s(t * 1.6 + phase));
      p.shRx = -0.6 - bite * 0.55; p.elR = -1.2 - bite * 1.0; p.shLx = -0.7; p.elL = -0.9; p.headX = 0.05 - bite * 0.1; mouth = bite > 0.8 ? 'open' : 'smile'; break;
    }
    case 'drink': {
      const sip = Math.max(0, s(t * 0.9 + phase)) ** 3;
      p.shRx = -0.45 - sip * 0.65; p.shRz = -0.15; p.elR = -1.5 - sip * 0.85; p.headX = -sip * 0.22; p.shLz = 0.12; p.elL = -0.2;
      p.hipsZ = s(t * 0.5) * 0.02; props.cup = true; break;
    }
    case 'chat': {
      const g = s(t * 2.4 + phase);
      if (talking) { p.shRx = -0.5 - g * 0.3; p.shRz = -0.3 - g * 0.2; p.elR = -1.2; p.shLx = -0.3 + g * 0.25; p.shLz = 0.25; p.elL = -0.9; p.headY = g * 0.12; mouth = s(t * 10) > 0 ? 'talk' : 'smile'; }
      else { p.shLx = p.shRx = -0.6; p.shLz = -0.5; p.shRz = 0.5; p.elL = p.elR = -1.6; p.headX = s(t * 3.2) * 0.07; mouth = 'smile'; } // tangan bersedekap, mengangguk
      p.hipsZ = s(t * 0.6 + phase) * 0.03; break;
    }
    case 'write_board': {
      p.shRx = -2.25 + s(t * 3) * 0.12; p.shRz = -0.2 + s(t * 4.4) * 0.12; p.elR = -0.35; p.shLz = 0.1; p.elL = -0.3; p.headX = -0.2; props.marker = true; break;
    }
    case 'wait_printer': {
      p.shLx = p.shRx = -0.6; p.shLz = -0.5; p.shRz = 0.5; p.elL = p.elR = -1.6; p.headX = 0.32; p.thRx = -Math.max(0, s(t * 5)) * 0.12; break;
    }
    case 'read': {
      p.shLx = p.shRx = -0.85; p.shLz = -0.18; p.shRz = 0.18; p.elL = p.elR = -1.25; p.headX = 0.3; props.book = true; break;
    }
    case 'stretch': {
      const up = (s(t * 1.4 + phase) + 1) / 2;
      p.shLx = p.shRx = -2.6 * up - 0.2; p.shLz = 0.25; p.shRz = -0.25; p.elL = p.elR = -0.2; p.spineX = -0.12 * up; p.headX = -0.2 * up; p.hipsY = HIP_HEIGHT + up * 0.02; mouth = up > 0.8 ? 'open' : 'smile';
      break;
    }
    case 'look_window': {
      p.shLx = p.shRx = 0.35; p.elL = p.elR = -0.9; p.shLz = 0.05; p.shRz = -0.05; p.headY = s(t * 0.35 + phase) * 0.45; p.headX = -0.08; break;
    }
    case 'phone_call': {
      p.shRx = -0.4; p.shRz = -0.55; p.elR = -2.45; p.shLx = 0.1; p.shLz = 0.3; p.elL = -1.0; p.headZ = -0.12; p.headY = s(t * 0.5) * 0.15; props.phone = false;
      mouth = s(t * 7) > 0 ? 'talk' : 'smile'; p.hipsZ = s(t * 0.8) * 0.03; break;
    }
    case 'lie': {
      p.hipsY = 0.48 / BASE_SCALE; p.hipsX = -1.15; p.thLx = p.thRx = -0.42; p.knL = p.knR = 0.2; p.shLz = 0.3; p.shRz = -0.3; p.shLx = p.shRx = -0.2; p.elL = p.elR = -0.5;
      p.headX = 0.75; mouth = 'smile'; break;
    }
    case 'foosball': {
      const twist = s(t * 9 + phase);
      p.shLx = p.shRx = -0.55; p.elL = p.elR = -0.85; p.shLy = twist * 0.3; p.shRy = -twist * 0.3; p.spineX = 0.28; p.headX = 0.25; p.hipsY = HIP_HEIGHT - 0.04 + Math.abs(s(t * 4)) * 0.015;
      p.thLx = p.thRx = -0.18; p.knL = p.knR = 0.35; mouth = s(t * 0.9) > 0.5 ? 'open' : 'smile'; break;
    }
    case 'water_plant': {
      p.shRx = -1.0; p.elR = -0.5; p.handRx = 0.4 + s(t * 2) * 0.15; p.headX = 0.35; p.spineX = 0.12; props.can = true; break;
    }
    case 'cheer': {
      const jump = Math.abs(s(t * 6));
      p.shLx = p.shRx = -2.8 + s(t * 6) * 0.25; p.shLz = 0.35; p.shRz = -0.35; p.elL = p.elR = -0.15; p.hipsY = HIP_HEIGHT + jump * 0.08; p.headX = -0.2; mouth = 'open';
      if (ctx.seatHeight > 0 && !ctx.moving) { sit(-0.1); p.shLx = p.shRx = -2.7 + s(t * 6) * 0.25; p.shLz = 0.35; p.shRz = -0.35; }
      break;
    }
    case 'facepalm': {
      p.shRx = -1.2; p.shRz = 0.4; p.elR = -2.3; p.headX = 0.42; p.headZ = s(t * 2) * 0.08; p.shLz = 0.05; p.spineX = 0.12; mouth = 'frown';
      if (ctx.seatHeight > 0) { sit(0.15); p.shRx = -1.2; p.shRz = 0.4; p.elR = -2.3; p.headX = 0.42; }
      break;
    }
    case 'think': {
      p.shRx = -1.0; p.shRz = 0.35; p.elR = -2.25; p.shLx = -0.5; p.shLz = -0.45; p.elL = -1.5; p.headZ = 0.1; p.headX = -0.1; break;
    }
    case 'stand_idle': default: {
      const shift = s(t * 0.5 + phase);
      p.hipsZ = shift * 0.035; p.thLz = 0.03 + shift * 0.02; p.thRz = -0.03 + shift * 0.02; p.headY = s(t * 0.3 + phase) * 0.3; p.shLx = s(t * 0.9) * 0.05; p.shRx = -s(t * 0.9) * 0.05;
      break;
    }
  }
  p.spineX += breathe; p.chestX = breathe * 1.5;
  if (ctx.mood === 'upset') mouth = 'frown';
  return { pose: p, props, mouth };
}

/** Terapkan animasi ke rig dengan interpolasi eksponensial (transisi halus antar-pose). */
export function animateRig(rig: Rig, anim: Anim | 'walk', t: number, dt: number, ctx: AnimContext, phase: number) {
  const state = rig.state;
  if (anim === 'walk') state.walkPhase += dt * ctx.speed * 6.4;
  const { pose, props, mouth } = targetPose(anim, anim === 'walk' ? state.walkPhase : t, ctx, phase);
  const k = 1 - Math.exp(-dt * (anim === 'walk' ? 14 : 8));
  const cur = state.current;
  for (const joint of J) { const target = pose[joint] ?? 0; cur[joint] = cur[joint] === undefined ? target : cur[joint] + (target - cur[joint]) * k; }
  rig.hips.position.y = cur.hipsY; rig.hips.rotation.set(cur.hipsX, 0, cur.hipsZ);
  rig.spine.rotation.set(cur.spineX, cur.spineY, 0); rig.chest.rotation.x = cur.chestX; rig.neck.rotation.x = cur.neckX;
  rig.head.rotation.set(cur.headX, cur.headY, cur.headZ);
  rig.shoulderL.rotation.set(cur.shLx, cur.shLy, cur.shLz); rig.shoulderR.rotation.set(cur.shRx, cur.shRy, cur.shRz);
  rig.elbowL.rotation.x = cur.elL; rig.elbowR.rotation.x = cur.elR; rig.handL.rotation.x = cur.handLx; rig.handR.rotation.x = cur.handRx;
  rig.thighL.rotation.set(cur.thLx, 0, cur.thLz); rig.thighR.rotation.set(cur.thRx, 0, cur.thRz);
  rig.kneeL.rotation.x = cur.knL; rig.kneeR.rotation.x = cur.knR;
  const keepCup = rig.appearance.accessories.includes('coffee-cup');
  for (const [name, object] of Object.entries(rig.props) as [keyof Rig['props'], THREE.Object3D][]) object.visible = !!props[name] || (name === 'cup' && keepCup && !props.marker && !props.can);

  // Wajah: kedip acak, mulut, alis mengikuti mood.
  state.blinkIn -= dt;
  if (state.blinkIn <= 0) { state.blink = 0.14; state.blinkIn = 2 + Math.random() * 4; }
  state.blink = Math.max(0, state.blink - dt);
  const tired = ctx.mood === 'tired';
  const openness = state.blink > 0 ? 0.1 : tired ? 0.55 : anim === 'lie' ? 0.35 : 1;
  for (const eye of rig.eyes) eye.scale.y += (openness - eye.scale.y) * Math.min(1, dt * 30);
  rig.smile.visible = mouth === 'smile' || mouth === 'frown';
  rig.smile.rotation.z = mouth === 'frown' ? 0 : Math.PI;
  rig.smile.position.y = mouth === 'frown' ? -0.125 : -0.098;
  rig.mouthOpen.visible = mouth === 'talk' || mouth === 'open';
  rig.mouthOpen.scale.y = mouth === 'open' ? 0.95 : 0.55 + Math.abs(Math.sin(t * 14)) * 0.35;
  const brow = ctx.mood === 'upset' ? 0.32 : ctx.mood === 'happy' ? -0.12 : ctx.mood === 'focus' ? 0.12 : ctx.mood === 'tired' ? -0.25 : 0;
  rig.browL.rotation.z = brow; rig.browR.rotation.z = -brow;
  rig.browL.position.y = rig.browR.position.y = 0.112 + (ctx.mood === 'happy' ? 0.012 : 0);
}
