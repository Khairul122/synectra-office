import * as THREE from 'three';
import { DEFAULT_AVATAR } from './avatar-storage';
import { pickOfficeActor } from './pick-office-actor';
import type { Destination } from './office-navigation';
import type { OfficeObjectId } from './office-data';
import type { AtmosphereCycle, AvatarCustomization, OfficeStatus, PerformanceMetrics, WorkState } from './types';
import { PROP_POINTS, SPOTS, ZONES, zoneAt, type SpotId, type Vec2 } from './world/layout';
import { NavGrid } from './world/navigation';
import { StaffBrain, STAFF_IDS, type Anim, type ManualPose, type Mood, type StaffUiState } from './world/staff-brain';
import { CharacterKit, STAFF_APPEARANCE, animateRig, buildCharacter, disposeRig, type AnimContext, type Appearance, type Rig } from './world/characters';
import { buildOfficeWorld, type OfficeWorld } from './world/office-world';

export type Pose = 'idle' | 'walk' | 'sit' | 'drink' | 'rest';
export type StaffId = 'hermes' | 'admin' | 'communication';
export type ActorId = StaffId | 'reception';

/** Status per karakter untuk HUD (panel karakter ala game life-sim). */
export interface ActorUiState extends StaffUiState { zone: string; moving: boolean }

type Callbacks = {
  onSelect: (id: OfficeObjectId) => void;
  onMetrics: (metrics: PerformanceMetrics) => void;
  onActivity: (activity: string, moving: boolean) => void;
  onStatus: (status: OfficeStatus) => void;
  onError: (message: string) => void;
  onStaffState?: (states: Record<ActorId, ActorUiState>) => void;
  onPortraits?: (portraits: Partial<Record<ActorId, string>>) => void;
};

interface Actor {
  id: ActorId;
  rig: Rig;
  path: Vec2[];
  spot: SpotId | null;
  arrived: boolean;
  heading: number;
  phase: number;
}

/** Titik tujuan pemilik untuk tombol "Ambil kopi", "Lounge", dst. */
const OWNER_SPOTS: Record<Destination, SpotId> = { office: 'desk-owner', coffee: 'coffee', lounge: 'armchair-a', terrace: 'lounger-b' };
const DESTINATION_LABEL: Record<Destination, string> = { office: 'ruang pemilik', coffee: 'pantry', lounge: 'lounge', terrace: 'teras kolam' };
const PROP_HEIGHT: Partial<Record<OfficeObjectId, number>> = { board: 2.35, calendar: 2.25, printer: 1.25, archive: 2.15, coffee: 1.5, lounge: 1.35, terrace: 0.9 };
const DEFAULT_YAW = Math.PI / 4;
const DEFAULT_PITCH = 0.9;
const DEFAULT_DISTANCE = 25;

function seatHeight(spot: SpotId | null) {
  if (!spot || SPOTS[spot].kind !== 'sit') return 0;
  if (spot.startsWith('sofa')) return 0.47;
  if (spot.startsWith('armchair')) return 0.5;
  if (spot.startsWith('pantry')) return 0.47;
  return 0.5;
}

function animMood(mood: Mood | 'neutral'): AnimContext['mood'] {
  return mood === 'senang' || mood === 'ceria' ? 'happy' : mood === 'fokus' ? 'focus' : mood === 'lelah' ? 'tired' : mood === 'kesal' ? 'upset' : 'neutral';
}

/** Penampilan pemilik dari kustomisasi avatar. */
function ownerAppearance(avatar: AvatarCustomization): Appearance {
  const top = avatar.outfitStyle === 'formal' ? 'blazer' : avatar.outfitStyle === 'tech' ? 'hoodie' : avatar.outfitStyle === 'smart-casual' ? 'shirt' : 'tshirt';
  const accessories: Appearance['accessories'] = avatar.accessory === 'none' ? [] : [avatar.accessory];
  return {
    skin: '#d9a07a', hair: avatar.hairColor, hairStyle: avatar.hairStyle, eyes: '#3b2a1e', top, topColor: avatar.outfitColor,
    accent: top === 'blazer' || top === 'shirt' ? '#f7f5ef' : avatar.accentColor, pants: '#33415a', shoes: '#4a3328', accessories, height: 1.0, build: 1.0,
  };
}

export class OfficeSceneManager {
  public readonly ready: Promise<void>;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.5, 220);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly observer: ResizeObserver;
  private readonly kit = new CharacterKit();
  private readonly world: OfficeWorld;
  private readonly nav = new NavGrid();
  private readonly brain = new StaffBrain();
  private readonly labels = new Map<OfficeObjectId, HTMLElement>();
  private readonly actors = new Map<ActorId, Actor>();
  private readonly realActivities = new Map<StaffId, string | null>();
  private readonly raycaster = new THREE.Raycaster();
  private readonly ring: THREE.Mesh;
  private readonly target = new THREE.Vector3(0, 0, 1.2);
  private readonly desiredTarget = new THREE.Vector3(0, 0, 1.2);
  private yaw = DEFAULT_YAW; private desiredYaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH; private desiredPitch = DEFAULT_PITCH;
  private distance = DEFAULT_DISTANCE; private desiredDistance = DEFAULT_DISTANCE;
  private following: ActorId | null = null;
  private ownerDestination: Destination = 'office';
  private pending: Destination | null = null;
  private ownerWorkState: WorkState = 'available';
  private avatar: AvatarCustomization = { ...DEFAULT_AVATAR };
  private selected?: OfficeObjectId;
  private pointer?: { x: number; y: number; button: number };
  private dragged = false;
  private hoverAt = 0;
  private quiet = false;
  private economy = false;
  private ratio = 1;
  /** Pengali resolusi adaptif: turun otomatis bila FPS rendah (GPU terintegrasi), naik lagi bila pulih. */
  private adaptive = 1;
  private disposed = false;
  private elapsed = 0;
  private last = 0;
  private frames = 0;
  private metricsTime = 0;
  private uiTime = 0;
  private frame = 0;
  private quietTimer?: number;
  private loadTime = 0;

  constructor(private readonly container: HTMLElement, private readonly callbacks: Callbacks) {
    const started = performance.now();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Kantor 3D interaktif. Panah atau WASD menggeser kamera, Q dan E memutar, plus dan minus untuk zoom.');
    canvas.setAttribute('role', 'application');
    canvas.tabIndex = 0;
    container.prepend(canvas);

    this.world = buildOfficeWorld();
    this.scene.add(this.world.group);
    this.scene.background = new THREE.Color('#a9d8ee');
    this.scene.fog = new THREE.Fog('#a9d8ee', 55, 140);

    for (const id of STAFF_IDS) this.addActor(id, STAFF_APPEARANCE[id], SPOTS[`desk-${id}`].pos);
    this.addActor('reception', ownerAppearance(this.avatar), SPOTS['desk-owner'].pos);
    this.actors.get('reception')!.spot = 'desk-owner';

    const ringGeometry = new THREE.RingGeometry(0.42, 0.55, 40);
    this.ring = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ color: '#43d17a', transparent: true, opacity: 0.85, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.visible = false; this.ring.renderOrder = 3; this.scene.add(this.ring);

    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('pointercancel', this.pointerCancel);
    canvas.addEventListener('contextmenu', this.preventMenu);
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    canvas.addEventListener('keydown', this.keydown);
    document.addEventListener('visibilitychange', this.visibility);
    this.resize();
    this.renderPortraits();
    this.loadTime = Math.round(performance.now() - started);
    this.ready = Promise.resolve();
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.animate);
  }

  private addActor(id: ActorId, look: Appearance, at: Vec2) {
    const rig = buildCharacter(this.kit, look);
    rig.root.position.set(at[0], 0, at[1]);
    this.scene.add(rig.root);
    const old = this.actors.get(id);
    this.actors.set(id, { id, rig, path: old?.path ?? [], spot: old?.spot ?? null, arrived: old?.arrived ?? false, heading: old?.heading ?? 0, phase: STAFF_IDS.indexOf(id as StaffId) * 1.7 + 0.5 });
    rig.root.rotation.y = old?.heading ?? 0;
  }

  /* ----------------------------- API publik ----------------------------- */
  public attachLabel(id: OfficeObjectId, element: HTMLElement | null) { if (element) this.labels.set(id, element); else this.labels.delete(id); }
  public select(id?: OfficeObjectId) { this.selected = id; }
  public focus(id: OfficeObjectId) {
    const actor = this.actors.get(id as ActorId);
    const point = actor ? actor.rig.root.position : this.propPoint(id);
    this.desiredTarget.set(point.x, 0, point.z); this.desiredDistance = 12; this.following = actor ? (id as ActorId) : null;
  }
  /** Kamera mengikuti karakter sampai pengguna menggeser kamera. */
  public follow(id: ActorId | null) { this.following = id; if (id) this.desiredDistance = Math.min(this.desiredDistance, 14); }
  public resetView() { this.desiredTarget.set(0, 0, 1.2); this.desiredDistance = DEFAULT_DISTANCE; this.desiredYaw = DEFAULT_YAW; this.desiredPitch = DEFAULT_PITCH; this.following = null; }
  public zoom(factor: number) { this.desiredDistance = THREE.MathUtils.clamp(this.desiredDistance / factor, 7, 42); }
  /** Putar kamera 45° (seperti kontrol kamera di game life-sim). */
  public rotate(direction: 1 | -1) { this.desiredYaw += direction * Math.PI / 4; }
  public setQuiet(value: boolean) { this.quiet = value; }
  public setQuality(value: boolean) { this.economy = value; this.world.sun.castShadow = !value; this.resize(); }
  public setDaylight(value: boolean) { this.setAtmosphere(value ? 'day' : 'sunset'); }
  public setAtmosphere(cycle: AtmosphereCycle) {
    this.world.setAtmosphere(cycle);
    const sky = cycle === 'night' ? '#1b2747' : cycle === 'sunset' ? '#f2b38f' : '#a9d8ee';
    (this.scene.background as THREE.Color).set(sky); this.scene.fog?.color.set(sky);
    this.renderer.toneMappingExposure = cycle === 'night' ? 1.25 : 1.05;
  }
  public setAvatar(avatar: AvatarCustomization) {
    this.avatar = { ...avatar };
    const old = this.actors.get('reception'); if (!old) return;
    const at: Vec2 = [old.rig.root.position.x, old.rig.root.position.z];
    this.scene.remove(old.rig.root); disposeRig(old.rig);
    // Warna & gaya dari kustomisasi: this.avatar.hairStyle, this.avatar.hairColor, this.avatar.outfitStyle, this.avatar.accessory, this.avatar.accentColor.
    this.addActor('reception', ownerAppearance(this.avatar), at);
    this.renderPortraits(['reception']);
  }
  public reactToEvent(id: StaffId, outcome: 'success' | 'fail' = 'success') { this.brain.react(id, outcome); }
  /** Kompatibilitas lama: hanya status aktif tanpa teks. */
  public setStaffActive(id: StaffId, active: boolean) { this.setStaffActivity(id, active ? (this.realActivities.get(id) ?? 'Menjalankan tugas') : null); }
  /** Aktivitas nyata dari server; menggerakkan karyawan ke tempat kerja yang sesuai. */
  public setStaffActivity(id: StaffId, activity: string | null) { this.realActivities.set(id, activity); this.brain.setActivity(id, activity); }
  public setStaffPose(id: StaffId, pose: Pose) { this.brain.setManual(id, pose === 'sit' ? null : pose as ManualPose); }
  public setWorkState(state: WorkState) { this.ownerWorkState = state; }
  public visit(destination: Destination): boolean {
    if (this.quiet || this.pending || destination === this.ownerDestination) return false;
    this.pending = destination; this.goTo(this.actors.get('reception')!, OWNER_SPOTS[destination]);
    this.callbacks.onActivity(`Berjalan ke ${DESTINATION_LABEL[destination]}`, true); return true;
  }

  /* ----------------------------- Simulasi ----------------------------- */
  private propPoint(id: OfficeObjectId) {
    const point = (PROP_POINTS as Record<string, Vec2>)[id] ?? [0, 0];
    return new THREE.Vector3(point[0], PROP_HEIGHT[id] ?? 1.2, point[1]);
  }

  private goTo(actor: Actor, spot: SpotId) {
    actor.spot = spot; actor.arrived = false;
    const from = actor.rig.root.position;
    actor.path = this.nav.findPath([from.x, from.z], SPOTS[spot].pos);
  }

  private update(delta: number) {
    this.brain.setReserved([OWNER_SPOTS[this.pending ?? this.ownerDestination]]);
    this.brain.tick(delta);
    for (const actor of this.actors.values()) {
      const isOwner = actor.id === 'reception';
      const intent = isOwner ? null : this.brain.intent(actor.id as StaffId);
      if (intent && intent.spot !== actor.spot) { this.goTo(actor, intent.spot); this.brain.setArrived(actor.id as StaffId, false); }
      const moving = this.step(actor, delta);
      if (!isOwner && !moving && !actor.arrived) { actor.arrived = true; this.brain.setArrived(actor.id as StaffId, true); }
      if (isOwner && !moving && !actor.arrived) {
        actor.arrived = true;
        if (this.pending) {
          this.ownerDestination = this.pending; this.pending = null;
          this.callbacks.onActivity(this.ownerDestination === 'coffee' ? 'Menikmati kopi' : this.ownerDestination === 'lounge' ? 'Beristirahat di lounge' : this.ownerDestination === 'terrace' ? 'Bersantai di teras kolam' : 'Berada di ruang pemilik', false);
        }
      }
      // Arah hadap saat diam: ke arah titik, atau ke rekan saat mengobrol.
      if (!moving && actor.spot) {
        let facing = SPOTS[actor.spot].facing;
        const partner = intent?.partner ? this.actors.get(intent.partner) : undefined;
        if (partner && SPOTS[actor.spot].kind === 'stand') { const p = partner.rig.root.position, me = actor.rig.root.position; facing = Math.atan2(p.x - me.x, p.z - me.z); }
        actor.heading = turnToward(actor.heading, facing, delta * 6);
        actor.rig.root.rotation.y = actor.heading;
      }
      const anim: Anim | 'walk' = moving ? 'walk' : isOwner ? this.ownerAnim() : intent!.anim;
      const mood = isOwner ? (this.ownerWorkState === 'working' ? 'fokus' : 'santai') : this.brain.mood(actor.id as StaffId);
      const talk = intent?.partner ? Math.sin(this.elapsed * 0.9 + (actor.id < intent.partner ? 0 : Math.PI)) : 0;
      animateRig(actor.rig, anim, this.elapsed, delta, { seatHeight: moving ? 0 : seatHeight(actor.spot), talk, mood: animMood(mood), moving, speed: 1.3 }, actor.phase);
    }
    // Layar monitor menyala saat kerja nyata di meja; printer bekerja saat Administrasi menunggu cetakan.
    for (const id of STAFF_IDS) {
      const actor = this.actors.get(id)!; const intent = this.brain.intent(id);
      this.world.setScreenActive(`desk-${id}`, intent.real && actor.arrived && actor.spot === `desk-${id}`);
    }
    const admin = this.actors.get('admin')!; const adminIntent = this.brain.intent('admin');
    this.world.setPrinting(adminIntent.anim === 'wait_printer' && admin.arrived);
    this.world.setScreenActive('desk-owner', this.ownerWorkState === 'working' && this.ownerDestination === 'office' && !this.pending);
  }

  private ownerAnim(): Anim {
    if (this.pending) return 'stand_idle';
    return this.ownerDestination === 'coffee' ? 'drink' : this.ownerDestination === 'lounge' ? 'sit_relax' : this.ownerDestination === 'terrace' ? 'lie' : this.ownerWorkState === 'working' ? 'sit_type' : 'sit_idle';
  }

  /** Gerakkan karakter sepanjang jalur; mengembalikan true bila masih berjalan. */
  private step(actor: Actor, delta: number) {
    const position = actor.rig.root.position;
    let budget = delta * 1.3;
    while (actor.path.length && budget > 0) {
      const [tx, tz] = actor.path[0]!; const dx = tx - position.x, dz = tz - position.z; const distance = Math.hypot(dx, dz);
      if (distance < 0.02) { actor.path.shift(); continue; }
      const move = Math.min(distance, budget); position.x += dx / distance * move; position.z += dz / distance * move; budget -= move;
      actor.heading = turnToward(actor.heading, Math.atan2(dx, dz), delta * 10); actor.rig.root.rotation.y = actor.heading;
      if (move >= distance) actor.path.shift();
    }
    return actor.path.length > 0;
  }

  private emitUi() {
    if (!this.callbacks.onStaffState) return;
    const states = {} as Record<ActorId, ActorUiState>;
    for (const id of STAFF_IDS) {
      const actor = this.actors.get(id)!; const p = actor.rig.root.position; const zone = zoneAt(p.x, p.z);
      states[id] = { ...this.brain.ui(id), zone: zone ? ZONES[zone].name : 'Kantor', moving: actor.path.length > 0 };
    }
    const owner = this.actors.get('reception')!; const op = owner.rig.root.position; const ownerZone = zoneAt(op.x, op.z);
    const working = this.ownerWorkState === 'working';
    const ownerLabel = this.pending ? `Berjalan ke ${DESTINATION_LABEL[this.pending]}` : this.ownerDestination === 'office' ? (working ? 'Bekerja di meja pemilik' : 'Bersantai di ruang pemilik') : this.ownerDestination === 'coffee' ? 'Menikmati kopi' : this.ownerDestination === 'lounge' ? 'Beristirahat di lounge' : 'Berjemur di teras kolam';
    states.reception = {
      intent: { spot: owner.spot ?? 'desk-owner', anim: this.ownerAnim(), label: ownerLabel, icon: working && this.ownerDestination === 'office' ? 'work' : this.ownerDestination === 'coffee' ? 'coffee' : this.ownerDestination === 'terrace' ? 'sun' : 'sofa', real: working && this.ownerDestination === 'office' },
      mood: working ? 'fokus' : 'santai', needs: { energy: 80, social: 70, fun: 70, caffeine: 70 }, queue: [], zone: ownerZone ? ZONES[ownerZone].name : 'Kantor', moving: owner.path.length > 0,
    };
    this.callbacks.onStaffState(states);
  }

  /* ----------------------------- Potret ----------------------------- */
  private renderPortraits(ids: ActorId[] = ['hermes', 'admin', 'communication', 'reception']) {
    if (!this.callbacks.onPortraits) return;
    try {
      const size = 160; const target = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
      target.texture.colorSpace = THREE.SRGBColorSpace;
      const studio = new THREE.Scene(); studio.background = new THREE.Color('#dff3fb');
      studio.add(new THREE.HemisphereLight('#ffffff', '#b9c7d6', 2.4)); const key = new THREE.DirectionalLight('#fff4e6', 2.2); key.position.set(1.5, 2.5, 3); studio.add(key);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 10);
      const pixels = new Uint8Array(size * size * 4); const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d')!; const image = ctx.createImageData(size, size);
      const result: Partial<Record<ActorId, string>> = {};
      for (const id of ids) {
        const look = id === 'reception' ? ownerAppearance(this.avatar) : STAFF_APPEARANCE[id];
        const rig = buildCharacter(this.kit, look); rig.shadow.visible = false;
        animateRig(rig, 'stand_idle', 0, 1, { seatHeight: 0, talk: 0, mood: 'happy', moving: false, speed: 0 }, 0);
        rig.head.rotation.set(0.05, 0.25, 0); studio.add(rig.root); rig.root.updateMatrixWorld(true);
        const head = new THREE.Vector3(); rig.head.getWorldPosition(head); head.y += 0.2 * look.height;
        camera.position.set(head.x + 0.35, head.y + 0.08, head.z + 1.55); camera.lookAt(head.x, head.y - 0.02, head.z);
        this.renderer.setRenderTarget(target); this.renderer.render(studio, camera);
        this.renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        for (let y = 0; y < size; y++) image.data.set(pixels.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
        ctx.putImageData(image, 0, 0); result[id] = canvas.toDataURL('image/png');
        studio.remove(rig.root); disposeRig(rig);
      }
      this.renderer.setRenderTarget(null); target.dispose();
      this.callbacks.onPortraits(result);
    } catch { this.renderer.setRenderTarget(null); }
  }

  /* ----------------------------- Render & kamera ----------------------------- */
  private resize = () => {
    const width = Math.max(1, this.container.clientWidth), height = Math.max(1, this.container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    this.ratio = this.economy ? Math.min(1, dpr) : Math.min(1.5, dpr);
    this.renderer.setPixelRatio(this.ratio * this.adaptive); this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.render();
  };

  private updateCamera(delta: number) {
    if (this.following) { const p = this.actors.get(this.following)?.rig.root.position; if (p) this.desiredTarget.set(p.x, 0, p.z); }
    this.desiredTarget.x = THREE.MathUtils.clamp(this.desiredTarget.x, -14, 14); this.desiredTarget.z = THREE.MathUtils.clamp(this.desiredTarget.z, -9, 16);
    const k = 1 - Math.exp(-delta * 7);
    this.target.lerp(this.desiredTarget, k);
    this.yaw += (this.desiredYaw - this.yaw) * k; this.pitch += (this.desiredPitch - this.pitch) * k; this.distance += (this.desiredDistance - this.distance) * k;
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.camera.position.set(this.target.x + Math.sin(this.yaw) * horizontal, this.target.y + Math.sin(this.pitch) * this.distance, this.target.z + Math.cos(this.yaw) * horizontal);
    this.camera.lookAt(this.target.x, 0.6, this.target.z);
    this.world.setCutaway(this.yaw);
  }

  private render() {
    if (this.disposed) return;
    const selectedActor = this.selected ? this.actors.get(this.selected as ActorId) : undefined;
    this.ring.visible = !!this.selected;
    if (this.selected) {
      const p = selectedActor ? selectedActor.rig.root.position : this.propPoint(this.selected);
      this.ring.position.set(p.x, 0.03, p.z); this.ring.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.06);
    }
    this.renderer.render(this.scene, this.camera);
    const width = this.container.clientWidth, height = this.container.clientHeight; const point = new THREE.Vector3();
    for (const [id, element] of this.labels) {
      const actor = this.actors.get(id as ActorId);
      if (actor) { actor.rig.head.getWorldPosition(point); point.y += 0.62 * actor.rig.appearance.height; } else point.copy(this.propPoint(id));
      point.project(this.camera);
      const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2;
      element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      element.style.visibility = point.z > 1 || x < 20 || x > width - 20 || y < 20 || y > height - 10 ? 'hidden' : 'visible';
      element.style.zIndex = String(Math.round((1 - point.z) * 1000));
    }
  }

  private animate = (now: number) => {
    if (this.disposed || document.hidden) return;
    const delta = Math.min(0.1, Math.max(0, (now - this.last) / 1000)); this.last = now;
    if (!this.quiet) { this.elapsed += delta; this.update(delta); this.world.update(this.elapsed, delta); }
    this.updateCamera(delta);
    this.render();
    this.uiTime += delta; if (this.uiTime >= 0.25) { this.uiTime = 0; this.emitUi(); }
    this.metricsTime += delta; this.frames++;
    if (this.metricsTime >= 1) {
      const info = this.renderer.info;
      const fps = this.frames / this.metricsTime;
      if (!this.quiet && fps < 24 && this.adaptive > 0.55) { this.adaptive = Math.max(0.55, this.adaptive - 0.15); this.resize(); }
      else if (fps > 50 && this.adaptive < 1) { this.adaptive = Math.min(1, this.adaptive + 0.1); this.resize(); }
      this.callbacks.onMetrics({ fps: Math.round(fps), drawCalls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, resolution: `${this.renderer.domElement.width}x${this.renderer.domElement.height}`, dpr: this.renderer.getPixelRatio(), gpuRenderer: 'WebGL · three.js 3D', loadTimeMs: this.loadTime });
      this.frames = 0; this.metricsTime = 0;
    }
    if (this.quiet) this.quietTimer = window.setTimeout(() => { if (!this.disposed && !document.hidden) this.frame = requestAnimationFrame(this.animate); }, 100);
    else this.frame = requestAnimationFrame(this.animate);
  };

  /* ----------------------------- Input ----------------------------- */
  private contextLost = (event: Event) => { event.preventDefault(); this.callbacks.onError('Konteks WebGL terputus. Muat ulang tampilan kantor.'); };
  private visibility = () => { if (this.quietTimer) clearTimeout(this.quietTimer); cancelAnimationFrame(this.frame); if (!document.hidden && !this.disposed) { this.last = performance.now(); this.frame = requestAnimationFrame(this.animate); } };
  private preventMenu = (event: Event) => event.preventDefault();
  private pointerDown = (event: PointerEvent) => { this.pointer = { x: event.clientX, y: event.clientY, button: event.button }; this.dragged = false; this.renderer.domElement.setPointerCapture(event.pointerId); };
  private pointerMove = (event: PointerEvent) => {
    if (!this.pointer) { this.hover(event); return; }
    const dx = event.clientX - this.pointer.x, dy = event.clientY - this.pointer.y;
    if (!this.dragged && Math.hypot(dx, dy) < 4) return;
    this.dragged = true;
    if (this.pointer.button === 2 || event.shiftKey) { // putar & miringkan kamera
      this.desiredYaw -= dx * 0.008; this.desiredPitch = THREE.MathUtils.clamp(this.desiredPitch + dy * 0.005, 0.45, 1.3);
    } else { // geser kamera di bidang lantai
      const scale = this.distance / this.container.clientHeight * 1.15;
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.desiredTarget.addScaledVector(right, -dx * scale).addScaledVector(forward, dy * scale * 1.4);
      this.following = null;
    }
    this.pointer.x = event.clientX; this.pointer.y = event.clientY;
  };
  private pointerCancel = () => { this.pointer = undefined; };
  private pointerUp = (event: PointerEvent) => {
    if (!this.dragged && this.pointer?.button === 0) {
      this.setRay(event);
      const actor = pickOfficeActor(this.raycaster, new Map(Array.from(this.actors, ([id, a]) => [id as OfficeObjectId, { root: a.rig.root }])));
      if (actor) this.callbacks.onSelect(actor);
      else {
        const ground = new THREE.Vector3();
        if (this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ground)) {
          const nearest = (Object.keys(PROP_POINTS) as OfficeObjectId[]).map(id => { const p = this.propPoint(id); return { id, distance: Math.hypot(ground.x - p.x, ground.z - p.z) }; }).sort((a, b) => a.distance - b.distance)[0];
          if (nearest && nearest.distance < 1.3) this.callbacks.onSelect(nearest.id);
        }
      }
    }
    this.pointer = undefined;
  };
  private setRay(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
  }
  private hover(event: PointerEvent) {
    const now = performance.now(); if (now - this.hoverAt < 120) return; this.hoverAt = now;
    this.setRay(event);
    const hit = pickOfficeActor(this.raycaster, new Map(Array.from(this.actors, ([id, a]) => [id as OfficeObjectId, { root: a.rig.root }])));
    this.renderer.domElement.style.cursor = hit ? 'pointer' : 'grab';
  }
  private wheel = (event: WheelEvent) => { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.12 : 1 / 1.12); };
  private keydown = (event: KeyboardEvent) => {
    const step = this.distance * 0.06; const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const key = event.key.toLowerCase(); let handled = true;
    if (key === 'arrowleft' || key === 'a') this.desiredTarget.addScaledVector(right, -step);
    else if (key === 'arrowright' || key === 'd') this.desiredTarget.addScaledVector(right, step);
    else if (key === 'arrowup' || key === 'w') this.desiredTarget.addScaledVector(forward, step);
    else if (key === 'arrowdown' || key === 's') this.desiredTarget.addScaledVector(forward, -step);
    else if (key === 'q') this.rotate(-1);
    else if (key === 'e') this.rotate(1);
    else if (key === '+' || key === '=') this.zoom(1.15);
    else if (key === '-' || key === '_') this.zoom(1 / 1.15);
    else handled = false;
    if (handled) { event.preventDefault(); if (!['q', 'e', '+', '=', '-', '_'].includes(key)) this.following = null; }
  };

  public dispose() {
    this.disposed = true; if (this.quietTimer) clearTimeout(this.quietTimer); cancelAnimationFrame(this.frame); this.observer.disconnect(); document.removeEventListener('visibilitychange', this.visibility);
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.contextLost); canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointermove', this.pointerMove); canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('pointercancel', this.pointerCancel); canvas.removeEventListener('contextmenu', this.preventMenu); canvas.removeEventListener('wheel', this.wheel); canvas.removeEventListener('keydown', this.keydown);
    this.world.dispose(); this.kit.dispose(); this.ring.geometry.dispose(); (this.ring.material as THREE.Material).dispose();
    for (const actor of this.actors.values()) disposeRig(actor.rig);
    this.renderer.dispose(); canvas.remove(); this.labels.clear();
  }
}

/** Belok halus menuju sudut target (memilih arah putar terpendek). */
function turnToward(current: number, target: number, amount: number) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  diff = THREE.MathUtils.clamp(diff, -amount, amount);
  return current + diff;
}
