import { team, type OfficeObjectId } from './office-data';
import { destinations, routeBetween, type Destination, type Point } from './office-navigation';
import type { OfficeStatus, PerformanceMetrics, AvatarCustomization, AtmosphereCycle } from './types';
import { DEFAULT_AVATAR } from './avatar-storage';

export type Pose = 'idle' | 'walk' | 'sit' | 'drink' | 'rest';
export type StaffId = 'hermes' | 'admin' | 'communication';
type Callbacks = {
  onSelect: (id: OfficeObjectId) => void;
  onMetrics: (metrics: PerformanceMetrics) => void;
  onActivity: (activity: string, moving: boolean) => void;
  onStatus: (status: OfficeStatus) => void;
  onError: (message: string) => void;
};

const points: Record<OfficeObjectId, Point> = {
  hermes: [955, 500], admin: [615, 630], communication: [785, 630],
  reception: [490, 310], board: [1000, 215], calendar: [1380, 435],
  printer: [720, 550], archive: [1320, 465], coffee: [170, 460], lounge: [520, 795],
  terrace: [710, 910],
};
const names = ['hermes', 'admin', 'communication', 'owner'] as const;
const poses: Record<Pose, number> = { idle: 0, walk: 1, sit: 2, drink: 3, rest: 4 };

export class OfficeSceneManager {
  public readonly ready: Promise<void>;
  private readonly canvas = document.createElement('canvas');
  private readonly context: CanvasRenderingContext2D;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly labels = new Map<OfficeObjectId, HTMLElement>();
  private readonly observer: ResizeObserver;
  private frame = 0;
  private quietTimer?: number;
  private last = 0;
  private elapsed = 0;
  private width = 0;
  private height = 0;
  private ratio = 1;
  private scale = 1;
  private zoomLevel = 1;
  private center: Point = [768, 512];
  private selected?: OfficeObjectId;
  private quiet = false;
  private daylight = true;
  private atmosphere: AtmosphereCycle = 'day';
  private avatar: AvatarCustomization = { ...DEFAULT_AVATAR };
  private economy = false;
  private disposed = false;
  private loaded = false;
  private pointer?: Point;
  private dragged = false;
  private destination: Destination = 'office';
  private pending: Destination | null = null;
  private route: Point[] = [];
  private owner: Point = [...destinations.office];
  private ownerVisual: Point = [...destinations.office];
  private seating: { from: Point; to: Point; elapsed: number; entering: boolean } | null = null;
  private facingLeft = false;
  private ownerPose: Pose = 'idle';
  private readonly staffPoses: Record<StaffId, Pose> = { hermes: 'sit', admin: 'sit', communication: 'sit' };
  private idleTime = 0;
  private automaticIndex = 0;
  private loadTime = 0;
  private metricsTime = 0;
  private frames = 0;

  constructor(private readonly container: HTMLElement, private readonly callbacks: Callbacks) {
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D tidak tersedia.');
    this.context = context;
    this.canvas.setAttribute('aria-label', 'Kantor isometrik 2.5D interaktif. Gunakan tombol ruangan untuk navigasi keyboard.');
    this.canvas.setAttribute('role', 'img');
    container.prepend(this.canvas);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.canvas.addEventListener('pointerdown', this.pointerDown);
    this.canvas.addEventListener('pointermove', this.pointerMove);
    this.canvas.addEventListener('pointerup', this.pointerUp);
    this.canvas.addEventListener('pointercancel', this.pointerCancel);
    this.canvas.addEventListener('wheel', this.wheel, { passive: false });
    document.addEventListener('visibilitychange', this.visibility);
    this.resize();
    this.ready = this.load();
  }

  private async load() {
    const start = performance.now();
    await Promise.all(['map', ...names, ...names.map(name => `${name}-walk`), ...names.map(name => `${name}-work`)].map(async name => {
      const image = new Image();
      image.src = `/assets/office2d/${name}.png?v=3`;
      await image.decode();
      this.images.set(name, image);
    }));
    if (this.disposed) return;
    this.loadTime = Math.round(performance.now() - start);
    this.loaded = true;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.animate);
  }

  public attachLabel(id: OfficeObjectId, element: HTMLElement | null) {
    if (element) this.labels.set(id, element); else this.labels.delete(id);
  }
  public select(id?: OfficeObjectId) { this.selected = id; if (this.quiet) this.render(); }
  public focus(id: OfficeObjectId) { this.center = [...(id === 'reception' ? this.ownerVisual : points[id])]; this.zoomLevel = 1.7; if (this.quiet) this.render(); }
  public resetView() { this.center = [768, 512]; this.zoomLevel = 1; if (this.quiet) this.render(); }
  public zoom(factor: number) { this.zoomLevel = Math.max(0.65, Math.min(3, this.zoomLevel * factor)); if (this.quiet) this.render(); }
  public setQuiet(value: boolean) {
    const prev = this.quiet;
    this.quiet = value;
    if (prev && !value && this.loaded && !this.disposed && !document.hidden) {
      if (this.quietTimer) clearTimeout(this.quietTimer);
      cancelAnimationFrame(this.frame);
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.animate);
    } else if (value) {
      this.render();
    }
  }
  public setQuality(value: boolean) { this.economy = value; this.resize(); if (this.quiet) this.render(); }
  public setDaylight(value: boolean) { this.daylight = value; this.atmosphere = value ? 'day' : 'sunset'; if (this.quiet) this.render(); }
  public setAtmosphere(cycle: AtmosphereCycle) { this.atmosphere = cycle; this.daylight = cycle === 'day'; if (this.quiet) this.render(); }
  public setAvatar(avatar: AvatarCustomization) { this.avatar = { ...avatar }; if (this.quiet) this.render(); }
  public setStaffPose(id: StaffId, pose: Pose) { this.staffPoses[id] = pose; if (this.quiet) this.render(); }

  public visit(destination: Destination): boolean {
    if (!this.loaded || this.quiet || this.pending || this.seating || this.destination === destination) return false;
    this.route = routeBetween(this.destination, destination);
    this.pending = destination;
    if (this.destination === 'lounge') {
      this.seating = { from: [...this.ownerVisual], to: [...this.owner], elapsed: 0, entering: false };
    } else this.ownerPose = 'walk';
    this.idleTime = 0;
    const activity = `Berjalan ke ${destination === 'coffee' ? 'pantry' : destination === 'lounge' ? 'lounge' : destination === 'terrace' ? 'teras kolam' : 'ruang pemilik'}`;
    this.callbacks.onActivity(activity, true);
    this.callbacks.onStatus({ workState: 'away', heartbeatAt: Date.now(), activity });
    return true;
  }

  private update(delta: number) {
    if (this.seating) {
      this.seating.elapsed = Math.min(this.seating.elapsed + delta, 0.5);
      const t = this.seating.elapsed / 0.5;
      this.ownerVisual = [this.seating.from[0] + (this.seating.to[0] - this.seating.from[0]) * t,
        this.seating.from[1] + (this.seating.to[1] - this.seating.from[1]) * t];
      if (t === 1) {
        const entering = this.seating.entering;
        this.seating = null;
        if (entering) this.reportArrival(); else this.ownerPose = 'walk';
      }
      return;
    }
    const next = this.route[0];
    if (next && this.pending) {
      const dx = next[0] - this.owner[0], dy = next[1] - this.owner[1];
      const distance = Math.hypot(dx, dy);
      const step = delta * 110;
      if (Math.abs(dx) > 1) this.facingLeft = dx < 0;
      if (distance <= step) { this.owner = [...next]; this.route.shift(); }
      else { this.owner = [this.owner[0] + dx / distance * step, this.owner[1] + dy / distance * step]; }
      this.ownerVisual = [...this.owner];
      if (!this.route.length) {
        this.destination = this.pending;
        this.pending = null;
        this.ownerPose = this.destination === 'coffee' ? 'drink' : this.destination === 'lounge' ? 'rest' : this.destination === 'terrace' ? 'rest' : 'idle';
        if (this.destination === 'lounge') {
          // The walking endpoint stays outside the sofa; the sitting pose moves onto its cushion.
          this.facingLeft = false;
          this.seating = { from: [...this.owner], to: [540, 800], elapsed: 0, entering: true };
        } else this.reportArrival();
      }
    } else if ((this.idleTime += delta) > 26) {
      const sequence: Destination[] = ['coffee', 'lounge', 'terrace', 'office'];
      this.visit(sequence[this.automaticIndex++ % sequence.length]);
      this.idleTime = 0;
    }
  }

  private reportArrival() {
    const activity = this.destination === 'coffee' ? 'Menikmati kopi' : this.destination === 'lounge' ? 'Beristirahat di lounge' : this.destination === 'terrace' ? 'Bersantai di teras kolam' : 'Berada di ruang pemilik';
    this.callbacks.onActivity(activity, false);
    this.callbacks.onStatus({ workState: this.destination === 'office' ? 'available' : 'away', heartbeatAt: Date.now(), activity });
  }

  private transform(point: Point): Point {
    return [(point[0] - this.center[0]) * this.scale + this.width / 2, (point[1] - this.center[1]) * this.scale + this.height / 2];
  }
  private resize = () => {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    const dpr = window.devicePixelRatio || 1; this.ratio = this.economy ? Math.min(1, dpr) : Math.min(1.5, dpr);
    this.canvas.width = Math.max(1, Math.round(this.width * this.ratio));
    this.canvas.height = Math.max(1, Math.round(this.height * this.ratio));
  };
  private render() {
    if (!this.loaded || this.disposed) return;
    const ctx = this.context;
    this.scale = Math.min(this.width / 1536, this.height / 1024) * this.zoomLevel;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    const [left, top] = this.transform([0, 0]);
    ctx.drawImage(this.images.get('map')!, left, top, 1536 * this.scale, 1024 * this.scale);

    // Teras kolam renang outdoor dengan air turquoise #388DA7
    const [tx, ty] = this.transform(points.terrace);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(tx, ty + 12 * this.scale, 76 * this.scale, 36 * this.scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#CBD5E1';
    ctx.fill();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 2 * this.scale;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(tx, ty + 12 * this.scale, 70 * this.scale, 31 * this.scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#388DA7';
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(tx - 12 * this.scale, ty + 8 * this.scale, 36 * this.scale, 14 * this.scale, 0, 0.2, Math.PI * 0.9);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2 * this.scale;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(tx + 14 * this.scale, ty + 16 * this.scale, 28 * this.scale, 10 * this.scale, 0, Math.PI * 1.1, Math.PI * 1.8);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1.5 * this.scale;
    ctx.stroke();
    ctx.restore();

    if (this.selected) {
      const [x, y] = this.transform(this.selected === 'reception' ? this.ownerVisual : points[this.selected]);
      ctx.beginPath(); ctx.ellipse(x, y, 34 * this.scale, 11 * this.scale, 0, 0, Math.PI * 2);
      ctx.strokeStyle = '#f8d895'; ctx.lineWidth = 3 * this.scale; ctx.stroke();
    }
    const actors: { name: typeof names[number]; point: Point; pose: Pose; flip: boolean }[] = [
      { name: 'hermes', point: points.hermes, pose: this.staffPoses.hermes, flip: false },
      { name: 'admin', point: points.admin, pose: this.staffPoses.admin, flip: false },
      { name: 'communication', point: points.communication, pose: this.staffPoses.communication, flip: false },
      { name: 'owner', point: this.ownerVisual, pose: this.ownerPose, flip: this.facingLeft },
    ];
    actors.sort((a, b) => a.point[1] - b.point[1]);
    for (const actor of actors) {
      const animated = actor.pose === 'walk' || actor.pose === 'sit';
      const image = this.images.get(actor.pose === 'walk' ? `${actor.name}-walk` : actor.pose === 'sit' ? `${actor.name}-work` : actor.name)!;
      const count = animated ? 4 : 5;
      const index = animated ? Math.floor(this.elapsed * (actor.pose === 'walk' ? 6 : 3)) % 4 : poses[actor.pose];
      const cellWidth = image.width / count;
      const h = (actor.pose === 'sit' ? 90 : 105) * this.scale, w = h * cellWidth / image.height;
      const [x, y] = this.transform(actor.point);
      const bob = this.quiet ? 0 : Math.sin(this.elapsed * (actor.pose === 'walk' ? 12 : 2.5)) * (actor.pose === 'walk' ? 1.8 : 0.5) * this.scale;
      ctx.save(); ctx.translate(x, y + bob); if (actor.flip) ctx.scale(-1, 1);
      ctx.drawImage(image, index * cellWidth, 0, cellWidth, image.height, -w / 2, -h, w, h);
      if (actor.name === 'owner') {
        const hScale = this.scale;
        const accent = this.avatar.accentColor || '#388DA7';
        if (this.avatar.outfitStyle === 'formal') {
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.moveTo(-1.5 * hScale, -h * 0.66); ctx.lineTo(1.5 * hScale, -h * 0.66);
          ctx.lineTo(2 * hScale, -h * 0.52); ctx.lineTo(0, -h * 0.48); ctx.lineTo(-2 * hScale, -h * 0.52);
          ctx.closePath(); ctx.fill();
        } else if (this.avatar.outfitStyle === 'tech') {
          ctx.strokeStyle = accent; ctx.lineWidth = 1.6 * hScale;
          ctx.beginPath(); ctx.moveTo(-6 * hScale, -h * 0.64); ctx.lineTo(-6 * hScale, -h * 0.46); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(6 * hScale, -h * 0.64); ctx.lineTo(6 * hScale, -h * 0.46); ctx.stroke();
        } else if (this.avatar.outfitStyle === 'casual') {
          ctx.strokeStyle = this.avatar.outfitColor || '#2563EB'; ctx.lineWidth = 1.8 * hScale;
          ctx.beginPath(); ctx.arc(0, -h * 0.66, 4 * hScale, 0.2, Math.PI - 0.2); ctx.stroke();
        } else {
          ctx.strokeStyle = accent; ctx.lineWidth = 1.8 * hScale;
          ctx.beginPath(); ctx.moveTo(-5 * hScale, -h * 0.66); ctx.lineTo(-2 * hScale, -h * 0.48); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(5 * hScale, -h * 0.66); ctx.lineTo(2 * hScale, -h * 0.48); ctx.stroke();
        }
        ctx.fillStyle = this.avatar.hairColor || '#2C221E';
        if (this.avatar.hairStyle === 'short') {
          ctx.beginPath(); ctx.arc(0, -h * 0.88, 7 * hScale, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
        } else if (this.avatar.hairStyle === 'long') {
          ctx.beginPath(); ctx.arc(0, -h * 0.88, 7.5 * hScale, Math.PI * 0.8, Math.PI * 2.2); ctx.fill();
          ctx.fillRect(-7.5 * hScale, -h * 0.88, 2.5 * hScale, 12 * hScale);
          ctx.fillRect(5 * hScale, -h * 0.88, 2.5 * hScale, 12 * hScale);
        } else if (this.avatar.hairStyle === 'wavy') {
          ctx.beginPath(); ctx.arc(0, -h * 0.88, 8 * hScale, Math.PI * 0.75, Math.PI * 2.25); ctx.fill();
          ctx.beginPath(); ctx.arc(-7 * hScale, -h * 0.82, 3 * hScale, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(7 * hScale, -h * 0.82, 3 * hScale, 0, Math.PI * 2); ctx.fill();
        } else if (this.avatar.hairStyle === 'ponytail') {
          ctx.beginPath(); ctx.arc(0, -h * 0.88, 7 * hScale, Math.PI * 0.85, Math.PI * 2.15); ctx.fill();
          ctx.beginPath(); ctx.ellipse(-7 * hScale, -h * 0.82, 3.5 * hScale, 6 * hScale, -0.4, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = accent;
          ctx.fillRect(-6 * hScale, -h * 0.85, 2 * hScale, 2 * hScale);
        } else if (this.avatar.hairStyle === 'bald') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath(); ctx.ellipse(2 * hScale, -h * 0.90, 2 * hScale, 1 * hScale, 0.3, 0, Math.PI * 2); ctx.fill();
        }
        if (this.avatar.accessory === 'glasses') {
          ctx.strokeStyle = accent; ctx.lineWidth = 1.2 * hScale;
          ctx.strokeRect(-6 * hScale, -h * 0.82, 4.5 * hScale, 3 * hScale);
          ctx.strokeRect(1.5 * hScale, -h * 0.82, 4.5 * hScale, 3 * hScale);
          ctx.beginPath(); ctx.moveTo(-1.5 * hScale, -h * 0.80); ctx.lineTo(1.5 * hScale, -h * 0.80); ctx.stroke();
        } else if (this.avatar.accessory === 'badge') {
          ctx.strokeStyle = accent; ctx.lineWidth = 1 * hScale;
          ctx.beginPath(); ctx.moveTo(-3 * hScale, -h * 0.68); ctx.lineTo(0, -h * 0.58); ctx.lineTo(3 * hScale, -h * 0.68); ctx.stroke();
          ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-2 * hScale, -h * 0.58, 4 * hScale, 5 * hScale);
          ctx.fillStyle = accent; ctx.fillRect(-1.5 * hScale, -h * 0.55, 3 * hScale, 1.2 * hScale);
        } else if (this.avatar.accessory === 'headphones' || (this.avatar.accessory as string) === 'headset') {
          ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.6 * hScale;
          ctx.beginPath(); ctx.arc(0, -h * 0.88, 8 * hScale, Math.PI, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = accent;
          ctx.fillRect(-8.5 * hScale, -h * 0.84, 2 * hScale, 4 * hScale);
          ctx.fillRect(6.5 * hScale, -h * 0.84, 2 * hScale, 4 * hScale);
          ctx.beginPath(); ctx.moveTo(7 * hScale, -h * 0.82); ctx.lineTo(4 * hScale, -h * 0.77); ctx.stroke();
        } else if (this.avatar.accessory === 'coffee-cup') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(6 * hScale, -h * 0.52, 4.5 * hScale, 5.5 * hScale);
          ctx.fillStyle = accent;
          ctx.fillRect(6 * hScale, -h * 0.50, 4.5 * hScale, 2.5 * hScale);
        }
      }
      ctx.restore();
      if (actor.name !== 'owner' && actor.pose === 'sit') {
        // The chair back is part of the flat map, so redraw it in front of the seated torso.
        ctx.save(); ctx.translate(x, y); ctx.scale(this.scale, this.scale);
        ctx.beginPath();
        ctx.moveTo(-16, -49);
        ctx.bezierCurveTo(-21, -49, -22, -44, -22, -39);
        ctx.bezierCurveTo(-26, -45, -25, -32, -23, -27);
        ctx.bezierCurveTo(-21, -18, -17, -16, -8, -15);
        ctx.bezierCurveTo(1, -13, 17, -15, 20, -21);
        ctx.bezierCurveTo(23, -26, 25, -40, 22, -42);
        ctx.lineTo(21, -39);
        ctx.bezierCurveTo(21, -46, 19, -49, 15, -49);
        ctx.closePath(); ctx.clip();
        ctx.drawImage(this.images.get('map')!, actor.point[0] - 27, actor.point[1] - 51, 54, 39, -27, -51, 54, 39);
        ctx.restore();
      }
    }
    if (this.atmosphere === 'sunset') {
      ctx.fillStyle = 'rgba(251, 146, 60, 0.14)';
      ctx.fillRect(0, 0, this.width, this.height);
    } else if (this.atmosphere === 'night') {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
      ctx.fillRect(0, 0, this.width, this.height);
    } else if (!this.daylight) {
      ctx.fillStyle = 'rgba(255, 205, 135, 0.06)';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    for (const [id, element] of this.labels) {
      const anchor = id === 'reception' ? this.ownerVisual : points[id];
      const [x, y] = this.transform([anchor[0], anchor[1] - (team.some(member => member.id === id) ? 88 : 25)]);
      element.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
      element.style.visibility = x < 30 || x > this.width - 30 || y < 15 || y > this.height - 30 ? 'hidden' : 'visible';
    }
  }
  private animate = (now: number) => {
    if (this.disposed || document.hidden) return;
    const delta = Math.max(0, Math.min((now - this.last) / 1000, 0.1));
    this.last = now;
    if (!this.quiet) { this.elapsed += delta; this.update(delta); }
    this.render();
    this.metricsTime += delta; this.frames++;
    if (this.metricsTime >= 1) {
      this.callbacks.onMetrics({ fps: Math.round(this.frames / this.metricsTime), drawCalls: 5, triangles: 0, geometries: 0,
        textures: this.images.size, resolution: `${this.canvas.width}x${this.canvas.height}`, dpr: this.ratio,
        gpuRenderer: 'Canvas 2D', loadTimeMs: this.loadTime });
      this.metricsTime = this.frames = 0;
    }
    if (this.quiet) {
      this.quietTimer = window.setTimeout(() => {
        if (!this.disposed && !document.hidden) {
          this.frame = requestAnimationFrame(this.animate);
        }
      }, 100);
    } else {
      this.frame = requestAnimationFrame(this.animate);
    }
  };
  private visibility = () => {
    if (this.quietTimer) clearTimeout(this.quietTimer);
    cancelAnimationFrame(this.frame);
    if (!document.hidden && this.loaded && !this.disposed) { this.last = performance.now(); this.frame = requestAnimationFrame(this.animate); }
  };
  private pointerDown = (event: PointerEvent) => { this.pointer = [event.clientX, event.clientY]; this.dragged = false; this.canvas.setPointerCapture(event.pointerId); };
  private pointerMove = (event: PointerEvent) => {
    if (!this.pointer) return;
    const dx = event.clientX - this.pointer[0], dy = event.clientY - this.pointer[1];
    if (Math.hypot(dx, dy) > 1) { this.center = [this.center[0] - dx / this.scale, this.center[1] - dy / this.scale]; this.dragged = true; }
    this.pointer = [event.clientX, event.clientY];
  };
  private pointerCancel = () => { this.pointer = undefined; };
  private pointerUp = (event: PointerEvent) => {
    if (!this.dragged) {
      const rect = this.canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left - this.width / 2) / this.scale + this.center[0];
      const y = (event.clientY - rect.top - this.height / 2) / this.scale + this.center[1];
      const candidates = (Object.entries(points) as [OfficeObjectId, Point][]).map(([id, point]) => ({ id, distance: Math.hypot(x - (id === 'reception' ? this.ownerVisual[0] : point[0]), y - (id === 'reception' ? this.ownerVisual[1] : point[1])) }));
      candidates.sort((a, b) => a.distance - b.distance);
      if (candidates[0].distance < 75) this.callbacks.onSelect(candidates[0].id);
    }
    this.pointer = undefined;
  };
  private wheel = (event: WheelEvent) => { event.preventDefault(); this.zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1); };
  public dispose() {
    this.disposed = true;
    if (this.quietTimer) clearTimeout(this.quietTimer);
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility);
    this.canvas.removeEventListener('pointerdown', this.pointerDown);
    this.canvas.removeEventListener('pointermove', this.pointerMove);
    this.canvas.removeEventListener('pointerup', this.pointerUp);
    this.canvas.removeEventListener('pointercancel', this.pointerCancel);
    this.canvas.removeEventListener('wheel', this.wheel);
    this.canvas.remove();
    this.labels.clear(); this.images.clear();
  }
}
