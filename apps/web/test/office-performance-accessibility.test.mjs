import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../src/office3d/office.css');
const spikeViewPath = resolve(__dirname, '../src/office3d/OfficeSpikeView.tsx');
const sceneManagerPath = resolve(__dirname, '../src/office3d/scene-manager-2d.ts');

test('DPR clamping formula enforces maximum 1.5 in normal mode and 1.0 in economy mode', () => {
  function computeRatio(dpr, economy) {
    return economy ? Math.min(1, dpr) : Math.min(1.5, dpr);
  }

  // Normal mode: clamp to <= 1.5
  assert.equal(computeRatio(1.0, false), 1.0);
  assert.equal(computeRatio(1.25, false), 1.25);
  assert.equal(computeRatio(1.5, false), 1.5);
  assert.equal(computeRatio(2.0, false), 1.5);
  assert.equal(computeRatio(3.0, false), 1.5);
  assert.equal(computeRatio(0.75, false), 0.75);

  // Economy mode: clamp to <= 1.0
  assert.equal(computeRatio(1.0, true), 1.0);
  assert.equal(computeRatio(1.25, true), 1.0);
  assert.equal(computeRatio(1.5, true), 1.0);
  assert.equal(computeRatio(2.0, true), 1.0);
  assert.equal(computeRatio(3.0, true), 1.0);
  assert.equal(computeRatio(0.75, true), 0.75);

  // Canvas buffer dimension calculation test
  const width = 1200;
  const height = 800;
  const normalRatio = computeRatio(2.0, false);
  const economyRatio = computeRatio(2.0, true);

  assert.equal(Math.max(1, Math.round(width * normalRatio)), 1800);
  assert.equal(Math.max(1, Math.round(height * normalRatio)), 1200);
  assert.equal(Math.max(1, Math.round(width * economyRatio)), 1200);
  assert.equal(Math.max(1, Math.round(height * economyRatio)), 800);
});

test('scene manager code implements DPR clamp, quiet mode pacing, and visibility listener', () => {
  const code = readFileSync(sceneManagerPath, 'utf8');

  // DPR clamping in resize method
  assert.match(code, /this\.ratio\s*=\s*this\.economy\s*\?\s*Math\.min\(1,\s*dpr\)\s*:\s*Math\.min\(1\.5,\s*dpr\)/);

  // Quiet mode frame pacing with setTimeout 100ms (~10 FPS)
  assert.match(code, /this\.quietTimer\s*=\s*window\.setTimeout\([\s\S]*?100\)/);

  // Pausing on hidden document and cleanup on visibilitychange
  assert.match(code, /document\.addEventListener\(['"]visibilitychange['"],\s*this\.visibility\)/);
  assert.match(code, /if\s*\(this\.disposed\s*\|\|\s*document\.hidden\)\s*return;/);
  assert.match(code, /if\s*\(this\.quietTimer\)\s*clearTimeout\(this\.quietTimer\);/);
});

test('mobile drawer uses available space and remains scrollable', () => {
  const css = readFileSync(resolve(__dirname, '../src/office3d/redesign.css'), 'utf8');
  assert.match(css, /@media\s*\(max-width:\s*760px\)/);
  assert.match(css, /\.office-drawer,\s*\.office-drawer-wide\s*\{[^}]*inset:\s*102px 0 66px;[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.office-app\s*\{\s*height:\s*100dvh;\s*min-height:\s*0/s);
});

test('accessibility rules enforce reduced motion and WCAG contrast focus styles', () => {
  const css = readFileSync(cssPath, 'utf8');

  // Reduced motion media query disables animations and transitions
  assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\s*\{[\s\S]*?animation:none!important/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)\s*\{[\s\S]*?transition:none!important/);

  // Focus visible styles
  assert.match(css, /button:focus-visible/);
  assert.match(css, /outline/);
});

test('OfficeSpikeView provides accessible modal drawer with focus trap and Escape handler', () => {
  const code = readFileSync(spikeViewPath, 'utf8');

  // Drawer modal attribute
  assert.match(code, /<aside[^>]*ref=\{drawerRef\}[^>]*role="dialog"[^>]*aria-modal="true"/);

  // Escape key handler
  assert.match(code, /event\.key\s*===\s*['"]Escape['"]/);

  // Focus trap cycling Tab / Shift+Tab
  assert.match(code, /event\.key\s*===\s*['"]Tab['"]\s*&&\s*drawerRef\.current/);
  assert.match(code, /drawerRef\.current\.querySelectorAll/);
  assert.match(code, /event\.shiftKey/);
});

test('OfficeSpikeView fallback panel provides direct business actions and operational status', () => {
  const code = readFileSync(spikeViewPath, 'utf8');

  // Fallback panel markup exists
  assert.match(code, /className="scene-message fallback-panel"/);

  // Direct business actions
  assert.ok(code.includes("select('admin')"), 'Nota & Transaksi shortcut exists');
  assert.ok(code.includes("select('board')"), 'Papan Kanban shortcut exists');
  assert.ok(code.includes("select('communication')"), 'WhatsApp shortcut exists');
  assert.ok(code.includes("select('calendar')"), 'Jadwal & Cron shortcut exists');
  assert.ok(code.includes("select('archive')"), 'Arsip shortcut exists');
  assert.ok(code.includes("select('printer')"), 'Printer shortcut exists');

  // Operational status items
  assert.ok(code.includes('Server aktif'));
  assert.ok(code.includes('WhatsApp'));
  assert.ok(code.includes('workStateLabel'));

  // Canvas visual reload button
  assert.ok(code.includes('Muat ulang kanvas visual'));

  // Fallback room list
  assert.match(code, /className="fallback-rooms"/);
});
