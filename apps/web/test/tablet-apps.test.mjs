import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tabletApps } from '../src/office3d/tablet-apps.ts';

test('tablet launcher exposes every office application once', () => {
  const ids = tabletApps.map(app => app.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(new Set(ids), new Set([
    'dashboard', 'payments', 'progress', 'admin', 'archive', 'board',
    'calendar', 'hermes', 'communication', 'printer', 'signature',
  ]));
  assert.ok(tabletApps.every(app => app.label && app.icon));
});
