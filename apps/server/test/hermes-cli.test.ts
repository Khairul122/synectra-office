import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultHermesCliRunner, getHermesCliStatus, hermesTenantFor } from '../src/infrastructure/hermes-cli';
import { getServicesHealth } from '../src/modules/health/application/get-health';

test('hermes health is unverified before any CLI call, then offline when HERMES_BIN is missing', async () => {
  const before = await getServicesHealth();
  assert.equal(before.services.hermes.status, 'degraded');

  const previous = process.env.HERMES_BIN;
  process.env.HERMES_BIN = 'synectra-hermes-binary-that-does-not-exist';
  try {
    const res = await defaultHermesCliRunner(['--version']);
    assert.notEqual(res.exitCode, 0);
    assert.deepEqual(
      { reachable: getHermesCliStatus()?.reachable, reason: getHermesCliStatus()?.reason },
      { reachable: false, reason: 'not_found' }
    );
    const after = await getServicesHealth();
    assert.equal(after.services.hermes.status, 'offline');
    assert.match(after.services.hermes.message ?? '', /HERMES_BIN/);
  } finally {
    if (previous === undefined) delete process.env.HERMES_BIN;
    else process.env.HERMES_BIN = previous;
  }
});

test('hermes tenant is stable per owner, distinct across owners, and valid for Hermes', () => {
  assert.equal(hermesTenantFor('uid-A'), hermesTenantFor('uid-A'));
  assert.notEqual(hermesTenantFor('uid-A'), hermesTenantFor('uid-a'));
  assert.match(hermesTenantFor('uid-A'), /^owner-[0-9a-f]{24}$/);
});
