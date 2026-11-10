import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('login screen waits for Firebase and server session restoration', () => {
  assert.match(app, /useState\(Boolean\(auth\)\)/);
  assert.match(app, /onAuthStateChanged\(auth,[\s\S]*?if \(!user\)[\s\S]*?setAuthPending\(false\)/);
  assert.match(app, /restoreSession\(user\)[\s\S]*?finally\(\(\) => \{ if \(version === current\) setAuthPending\(false\)/);
  const loading = app.indexOf('if (authPending) return');
  const recovery = app.indexOf('if (!userEmail && savedUser) return');
  const login = app.indexOf('if (!userEmail) {', recovery);
  assert.ok(loading >= 0 && recovery > loading && login > recovery);
  assert.match(app.slice(recovery, login), /Coba lagi/);
});
