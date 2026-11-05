import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildApp } from '../src/bootstrap/app';
import { readConfig } from '../src/bootstrap/config';

test('health returns the shared response', async () => {
  const app = buildApp();
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok' });
  await app.close();
});

test('required configuration reports names without values', () => {
  assert.throws(() => readConfig({}), /APP_HOST.*APP_PORT/);
  assert.throws(() => readConfig({ APP_HOST: '127.0.0.1', APP_PORT: 'invalid-secret' }), error => error instanceof Error && error.message.includes('APP_PORT') && !error.message.includes('invalid-secret'));
});

test('logger redacts known credential fields', () => {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', "import { buildApp } from './src/bootstrap/app.ts'; const app = buildApp(); app.log.info({ secret: 'hidden-value', HERMES_API_KEY: 'hidden-value', req: { headers: { authorization: 'Bearer hidden-value' } } }); await app.close();"], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /\[Redacted\]/);
  assert.doesNotMatch(result.stdout, /hidden-value/);
});
