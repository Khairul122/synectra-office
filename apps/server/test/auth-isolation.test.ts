import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { buildApp } from '../src/bootstrap/app';
import {
  createExpiredSessionForTests,
  createSessionForTests,
  resetSessionsForTests
} from '../src/modules/auth/application/auth-service';
import { privateFilePath } from '../src/modules/auth/infrastructure/private-files';
import { resetBusinessDataForTests } from '../src/modules/business/application/business-service';
import {
  FIRESTORE_COLLECTIONS,
  SCHEMA_VERSION,
  migrateDocument,
  withSchema
} from '../src/infrastructure/firestore-schema';

test('rejects unauthenticated requests to protected /api/ endpoints', async () => {
  const app = buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/clients' });
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.json(), { error: 'Unauthorized' });
  await app.close();
});

test('rejects forbidden origin on auth routes', async () => {
  const app = buildApp();
  const res = await app.inject({
    method: 'POST',
    url: '/auth/session',
    headers: { origin: 'http://malicious-site.com' },
    body: { idToken: 'some-dummy-token-that-is-long-enough-for-length-check' }
  });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: 'Forbidden origin' });
  await app.close();
});

test('handles session lifecycle: /auth/me, expiration, and /auth/logout', async () => {
  resetSessionsForTests();
  const app = buildApp();

  const { token, session } = createSessionForTests('user-owner-1', 'owner1@example.com');
  const cookieHeader = `synectra_session=${token}`;

  // Valid session returns user info
  const meRes = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { cookie: cookieHeader }
  });
  assert.equal(meRes.statusCode, 200);
  assert.deepEqual(meRes.json(), {
    userId: 'user-owner-1',
    email: 'owner1@example.com',
    csrfToken: session.csrfToken
  });

  // Logout without CSRF is rejected
  const badLogout = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: { cookie: cookieHeader }
  });
  assert.equal(badLogout.statusCode, 403);

  // Logout with matching CSRF succeeds and clears session
  const logoutRes = await app.inject({
    method: 'POST',
    url: '/auth/logout',
    headers: {
      cookie: cookieHeader,
      'x-csrf-token': session.csrfToken
    }
  });
  assert.equal(logoutRes.statusCode, 200);
  assert.match(logoutRes.headers['set-cookie'] as string, /Max-Age=0/);

  // Subsequent check is unauthorized
  const postLogout = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { cookie: cookieHeader }
  });
  assert.equal(postLogout.statusCode, 401);

  // Expired session is rejected
  const { token: expiredToken } = createExpiredSessionForTests('user-owner-2');
  const expiredRes = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { cookie: `synectra_session=${expiredToken}` }
  });
  assert.equal(expiredRes.statusCode, 401);

  await app.close();
});

test('enforces CSRF on protected API mutations', async () => {
  resetSessionsForTests();
  resetBusinessDataForTests();
  const app = buildApp();

  const { token, session } = createSessionForTests('user-owner-1');
  const cookieHeader = `synectra_session=${token}`;

  // Mutation without CSRF token is forbidden
  const noCsrfRes = await app.inject({
    method: 'POST',
    url: '/api/clients',
    headers: { cookie: cookieHeader },
    body: { name: 'Klien A', phone: '081234567890' }
  });
  assert.equal(noCsrfRes.statusCode, 403);
  assert.deepEqual(noCsrfRes.json(), { error: 'Invalid CSRF token' });

  // Mutation with wrong CSRF token is forbidden
  const wrongCsrfRes = await app.inject({
    method: 'POST',
    url: '/api/clients',
    headers: { cookie: cookieHeader, 'x-csrf-token': 'wrong-token' },
    body: { name: 'Klien A', phone: '081234567890' }
  });
  assert.equal(wrongCsrfRes.statusCode, 403);

  // Mutation with valid CSRF token succeeds
  const validRes = await app.inject({
    method: 'POST',
    url: '/api/clients',
    headers: { cookie: cookieHeader, 'x-csrf-token': session.csrfToken },
    body: { name: 'Klien A', phone: '081234567890' }
  });
  assert.equal(validRes.statusCode, 201);
  assert.equal(validRes.json().client.name, 'Klien A');

  await app.close();
});

test('isolates business data strictly between owners through API', async () => {
  resetSessionsForTests();
  resetBusinessDataForTests();
  const app = buildApp();

  const userA = createSessionForTests('owner-alice');
  const userB = createSessionForTests('owner-bob');

  // Alice creates client
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/clients',
    headers: {
      cookie: `synectra_session=${userA.token}`,
      'x-csrf-token': userA.session.csrfToken
    },
    body: { name: 'Alice Client', phone: '08111111111' }
  });
  assert.equal(createRes.statusCode, 201);
  const clientId = createRes.json().client.id;

  // Alice sees her client
  const aliceList = await app.inject({
    method: 'GET',
    url: '/api/clients',
    headers: { cookie: `synectra_session=${userA.token}` }
  });
  assert.equal(aliceList.json().clients.length, 1);
  assert.equal(aliceList.json().clients[0].id, clientId);

  // Bob sees empty list
  const bobList = await app.inject({
    method: 'GET',
    url: '/api/clients',
    headers: { cookie: `synectra_session=${userB.token}` }
  });
  assert.equal(bobList.json().clients.length, 0);

  // Bob cannot update Alice's client
  const bobUpdate = await app.inject({
    method: 'PUT',
    url: `/api/clients/${clientId}`,
    headers: {
      cookie: `synectra_session=${userB.token}`,
      'x-csrf-token': userB.session.csrfToken
    },
    body: { name: 'Hacked', phone: '08222222222' }
  });
  assert.equal(bobUpdate.statusCode, 404);

  // Bob cannot delete Alice's client
  const bobDelete = await app.inject({
    method: 'DELETE',
    url: `/api/clients/${clientId}`,
    headers: {
      cookie: `synectra_session=${userB.token}`,
      'x-csrf-token': userB.session.csrfToken
    }
  });
  assert.equal(bobDelete.statusCode, 404);

  // Alice client remains untouched
  const aliceVerify = await app.inject({
    method: 'GET',
    url: '/api/clients',
    headers: { cookie: `synectra_session=${userA.token}` }
  });
  assert.equal(aliceVerify.json().clients[0].name, 'Alice Client');

  await app.close();
});

test('prevents path traversal in private files', () => {
  // Allowed subpath inside owner root
  const validPath = privateFilePath('owner-123', 'signatures/v1.png');
  assert.match(validPath, /owner-123/);

  // Directory traversal attempts outside owner root must throw
  assert.throws(() => privateFilePath('owner-123', '../other-owner/secret.key'), /Invalid private file path/);
  assert.throws(() => privateFilePath('owner-123', '..\\other-owner\\secret.key'), /Invalid private file path/);
  assert.throws(() => privateFilePath('owner-123', '../../etc/passwd'), /Invalid private file path/);
});

test('verifies firestore schema versioning and collections', () => {
  assert.equal(SCHEMA_VERSION, 1);
  assert.equal(FIRESTORE_COLLECTIONS.OWNERS, 'owners');

  const stamped = withSchema({ businessName: 'Test Corp' }, 'owner-99');
  assert.equal(stamped.schema_version, 1);
  assert.equal(stamped.owner_id, 'owner-99');
  assert.equal(stamped.businessName, 'Test Corp');

  // Idempotent migration
  const currentDoc = { schema_version: 1, name: 'Sample' };
  const untouched = migrateDocument(currentDoc, (d) => ({ ...d, migrated: true }));
  assert.deepEqual(untouched, currentDoc);

  const legacyDoc = { schema_version: 0, name: 'Old' };
  const upgraded = migrateDocument(legacyDoc, (d) => ({ ...d, schema_version: 1, name: `${d.name} Upgraded` }));
  assert.equal(upgraded.schema_version, 1);
  assert.equal(upgraded.name, 'Old Upgraded');
});

test('verifies firestore.rules blocks direct client access', () => {
  const rootDir = resolve(process.cwd(), process.cwd().endsWith('apps\\server') || process.cwd().endsWith('apps/server') ? '../..' : '.');
  const rules = readFileSync(resolve(rootDir, 'firestore.rules'), 'utf8');
  assert.match(rules, /rules_version\s*=\s*'2'/);
  assert.match(rules, /allow\s+read,\s*write:\s*if\s+false;/);
});
