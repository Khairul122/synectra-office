import test from 'node:test';
import assert from 'node:assert/strict';
import { destinations, routeBetween } from '../src/office3d/office-navigation.ts';

// Footprints measured on the current illustrated map; clearance includes the avatar's feet.
const obstacles = [
  ['meja pemilik', 515, 175, 675, 295],
  ['meja karyawan', 495, 395, 1040, 650],
  ['lemari pantry', 85, 395, 300, 535],
  ['meja pantry', 205, 480, 330, 600],
  ['kulkas', 300, 340, 342, 455],
  ['sofa', 450, 710, 610, 840],
  ['kursi lounge', 375, 750, 445, 840],
  ['meja lounge', 450, 805, 530, 870],
  ['meja resepsionis', 900, 720, 1120, 900],
];
const floor = [[15, 464], [600, 33], [770, 140], [940, 33], [1520, 464], [1520, 560], [920, 980], [770, 875], [610, 990], [15, 560]];
const walls = [
  [[320, 260], [500, 355]],
  [[595, 315], [725, 250]],
];

function insideFloor(x, y) {
  let inside = false;
  for (let i = 0, j = floor.length - 1; i < floor.length; j = i++) {
    const [xi, yi] = floor[i], [xj, yj] = floor[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToWall(x, y, [[ax, ay], [bx, by]]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

test('all destination routes clear furniture with space for the avatar', () => {
  for (const from of Object.keys(destinations)) for (const to of Object.keys(destinations)) {
    const route = routeBetween(from, to);
    if (from === to) { assert.deepEqual(route, []); continue; }
    assert.deepEqual(route.at(-1), destinations[to]);
    let previous = destinations[from];
    for (const point of route) {
      const steps = Math.max(1, Math.ceil(Math.hypot(point[0] - previous[0], point[1] - previous[1]) / 2));
      for (let i = 0; i <= steps; i++) {
        const x = previous[0] + (point[0] - previous[0]) * i / steps;
        const y = previous[1] + (point[1] - previous[1]) * i / steps;
        assert.ok(insideFloor(x, y), `${from} → ${to} leaves the floor near ${Math.round(x)},${Math.round(y)}`);
        for (const wall of walls) assert.ok(distanceToWall(x, y, wall) > 18, `${from} → ${to} touches an office wall near ${Math.round(x)},${Math.round(y)}`);
        for (const [name, left, top, right, bottom] of obstacles) {
          assert.ok(x < left - 18 || x > right + 18 || y < top - 18 || y > bottom + 18,
            `${from} → ${to} intersects ${name} near ${Math.round(x)},${Math.round(y)}`);
        }
      }
      previous = point;
    }
  }
});
