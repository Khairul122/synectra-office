import { BUILDING, DECK, OBSTACLES, TERRACE_DOOR, WALLS, insideRect, type Vec2 } from './layout.ts';

/** Grid navigasi untuk karakter. Murni (tanpa three.js) agar bisa diuji. */
const CELL = 0.2;
const BODY_RADIUS = 0.24;
const MIN_X = -7.2, MAX_X = 7.2, MIN_Z = -5.2, MAX_Z = 9.4;
const COLS = Math.round((MAX_X - MIN_X) / CELL);
const ROWS = Math.round((MAX_Z - MIN_Z) / CELL);

function distanceToSegment(px: number, pz: number, a: Vec2, b: Vec2) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

export class NavGrid {
  readonly walkable = new Uint8Array(COLS * ROWS);

  constructor() {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const [x, z] = this.center(col, row);
        this.walkable[row * COLS + col] = this.isOpen(x, z) ? 1 : 0;
      }
    }
  }

  /** Lantai yang boleh diinjak: interior gedung atau dek teras, di luar dinding & furnitur. */
  isOpen(x: number, z: number) {
    const inBuilding = insideRect(BUILDING, x, z, -BODY_RADIUS);
    const inDeck = insideRect(DECK, x, z, -BODY_RADIUS);
    const inDoorway = x > TERRACE_DOOR.x0 + BODY_RADIUS && x < TERRACE_DOOR.x1 - BODY_RADIUS && z > BUILDING.z1 - 0.6 && z < DECK.z0 + 0.6;
    if (!inBuilding && !inDeck && !inDoorway) return false;
    for (const wall of WALLS) {
      if (inDoorway && wall.kind === 'cutaway' && wall.a[1] === BUILDING.z1 && wall.b[1] === BUILDING.z1) continue;
      if (distanceToSegment(x, z, wall.a, wall.b) < BODY_RADIUS + 0.06) return false;
    }
    return !OBSTACLES.some(rect => insideRect(rect, x, z, BODY_RADIUS));
  }

  center(col: number, row: number): [number, number] {
    return [MIN_X + (col + 0.5) * CELL, MIN_Z + (row + 0.5) * CELL];
  }

  cellOf(x: number, z: number): [number, number] {
    return [Math.max(0, Math.min(COLS - 1, Math.floor((x - MIN_X) / CELL))), Math.max(0, Math.min(ROWS - 1, Math.floor((z - MIN_Z) / CELL)))];
  }

  open(col: number, row: number) {
    return col >= 0 && row >= 0 && col < COLS && row < ROWS && this.walkable[row * COLS + col] === 1;
  }

  /** Sel terbuka terdekat (titik interaksi seperti kursi bisa berada di dalam footprint furnitur). */
  nearestOpen(x: number, z: number): [number, number] | null {
    const [c0, r0] = this.cellOf(x, z);
    if (this.open(c0, r0)) return [c0, r0];
    for (let radius = 1; radius < 14; radius++) {
      let best: [number, number] | null = null; let bestDistance = Infinity;
      for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius || !this.open(c0 + dc, r0 + dr)) continue;
        const [cx, cz] = this.center(c0 + dc, r0 + dr); const distance = Math.hypot(cx - x, cz - z);
        if (distance < bestDistance) { bestDistance = distance; best = [c0 + dc, r0 + dr]; }
      }
      if (best) return best;
    }
    return null;
  }

  private lineOfSight(a: [number, number], b: [number, number]) {
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2);
    for (let i = 1; i < steps; i++) {
      const col = Math.round(a[0] + (b[0] - a[0]) * i / steps), row = Math.round(a[1] + (b[1] - a[1]) * i / steps);
      if (!this.open(col, row)) return false;
    }
    return true;
  }

  /** A* 8 arah tanpa memotong sudut, lalu dihaluskan dengan line-of-sight. Titik akhir = tujuan persis. */
  findPath(from: Vec2, to: Vec2): Vec2[] {
    const start = this.nearestOpen(from[0], from[1]); const goal = this.nearestOpen(to[0], to[1]);
    if (!start || !goal) return [to];
    const key = (c: number, r: number) => r * COLS + c;
    const startKey = key(...start), goalKey = key(...goal);
    const g = new Float32Array(COLS * ROWS).fill(Infinity); const came = new Int32Array(COLS * ROWS).fill(-1);
    const closed = new Uint8Array(COLS * ROWS);
    const heuristic = (c: number, r: number) => { const dx = Math.abs(c - goal[0]), dz = Math.abs(r - goal[1]); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const open: Array<[number, number]> = [[heuristic(...start), startKey]]; g[startKey] = 0;
    const push = (item: [number, number]) => { // binary heap
      open.push(item); let i = open.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (open[p]![0] <= open[i]![0]) break; [open[p], open[i]] = [open[i]!, open[p]!]; i = p; }
    };
    const pop = () => {
      const top = open[0]!; const last = open.pop()!;
      if (open.length) { open[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < open.length && open[l]![0] < open[m]![0]) m = l; if (r < open.length && open[r]![0] < open[m]![0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i]!, open[m]!]; i = m; } }
      return top;
    };
    while (open.length) {
      const [, current] = pop();
      if (current === goalKey) break;
      if (closed[current]) continue; closed[current] = 1;
      const c = current % COLS, r = Math.floor(current / COLS);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (!this.open(nc, nr) || (dc && dr && (!this.open(c + dc, r) || !this.open(c, r + dr)))) continue;
        const next = key(nc, nr); const cost = g[current]! + (dc && dr ? Math.SQRT2 : 1);
        if (cost < g[next]!) { g[next] = cost; came[next] = current; push([cost + heuristic(nc, nr), next]); }
      }
    }
    if (came[goalKey] === -1 && goalKey !== startKey) return [to];
    const cells: Array<[number, number]> = [];
    for (let k = goalKey; k !== -1; k = came[k]!) { cells.push([k % COLS, Math.floor(k / COLS)]); if (k === startKey) break; }
    cells.reverse();
    const smooth: Array<[number, number]> = [cells[0]!];
    for (let i = 1; i < cells.length; i++) {
      if (i === cells.length - 1 || !this.lineOfSight(smooth[smooth.length - 1]!, cells[i + 1]!)) smooth.push(cells[i]!);
    }
    const points: Vec2[] = smooth.slice(1).map(([c, r]) => this.center(c, r));
    points.push(to);
    return points;
  }
}
