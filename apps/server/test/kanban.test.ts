import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildApp } from '../src/bootstrap/app';
import { createSessionForTests, resetSessionsForTests } from '../src/modules/auth/application/auth-service';
import { createClient, resetBusinessDataForTests } from '../src/modules/business/application/business-service';
import { createInvoice, resetInvoiceDataForTests } from '../src/modules/invoice/application/invoice-service';
import {
  setHermesCliRunnerForTests,
  resetKanbanDataForTests,
  type HermesCliRunner
} from '../src/modules/kanban/application/kanban-service';
import { hermesTenantFor } from '../src/infrastructure/hermes-cli';

function createMockRunner(seedOwnerId?: string) {
  const calls: Array<{ args: string[]; options?: Record<string, unknown> }> = [];
  let tasks: Array<Record<string, unknown>> = [
    {
      id: 't_mock_1',
      title: 'Task Awal',
      body: 'Deskripsi awal',
      assignee: null,
      status: 'ready',
      priority: 0,
      tenant: seedOwnerId ? hermesTenantFor(seedOwnerId) : null,
      created_by: 'user',
      created_at: 1794100000,
      started_at: null,
      completed_at: null,
      result: null
    }
  ];
  let throwOffline = false;
  let claimConflict = false;

  const runner: HermesCliRunner = async (args, options) => {
    calls.push({ args, options });
    if (throwOffline) {
      throw new Error('Hermes daemon unreachable / offline');
    }

    // Bentuk argumen: -p <profile> kanban --board <board> <subcmd> [--opt=value...] -- <positional...>
    const kanbanIdx = args.indexOf('kanban');
    let subcmdIdx = kanbanIdx + 1;
    if (args[subcmdIdx] === '--board') {
      subcmdIdx += 2;
    }
    const command = args[subcmdIdx];
    const sep = args.indexOf('--');
    const positionals = sep >= 0 ? args.slice(sep + 1) : [];
    const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
    const taskId = positionals[0];
    const target = tasks.find((t) => t.id === taskId);

    if (command === 'list') {
      const tenant = option('tenant');
      return { stdout: JSON.stringify(tasks.filter((t) => !tenant || t.tenant === tenant)), stderr: '', exitCode: 0 };
    }

    if (command === 'show') {
      if (!target) {
        return { stdout: '', stderr: `no such task: ${taskId}`, exitCode: 1 };
      }
      return { stdout: JSON.stringify({ task: target, latest_summary: null }), stderr: '', exitCode: 0 };
    }

    if (command === 'create') {
      const newId = `t_mock_${tasks.length + 1}`;
      let status = 'ready';
      if (args.includes('--triage')) status = 'triage';
      if (option('initial-status') === 'blocked') status = 'blocked';
      tasks.push({
        id: newId,
        title: positionals[0],
        body: option('body') ?? null,
        assignee: null,
        status,
        priority: 0,
        tenant: option('tenant') ?? null,
        created_by: 'user',
        created_at: Math.floor(Date.now() / 1000),
        started_at: null,
        completed_at: null,
        result: null
      });
      return { stdout: `Created ${newId}`, stderr: '', exitCode: 0 };
    }

    if (command === 'claim') {
      if (claimConflict) {
        return { stdout: '', stderr: 'cannot claim t_mock_1: status=running lock=another-worker-uuid', exitCode: 1 };
      }
      if (target) {
        target.status = 'running';
        target.started_at = Math.floor(Date.now() / 1000);
      }
      return { stdout: `Claimed ${taskId}`, stderr: '', exitCode: 0 };
    }

    if (command === 'request-review') {
      if (!target || target.status !== 'running') {
        return { stdout: '', stderr: `cannot review ${taskId}: task must be claimed and running first`, exitCode: 1 };
      }
      target.status = 'review';
      return { stdout: `Requested review for ${taskId}`, stderr: '', exitCode: 0 };
    }

    if (command === 'complete') {
      if (target) {
        target.status = 'done';
        target.completed_at = Math.floor(Date.now() / 1000);
      }
      return { stdout: `Completed ${taskId}`, stderr: '', exitCode: 0 };
    }

    if (command === 'block') {
      if (target) target.status = 'blocked';
      return { stdout: `Blocked ${taskId}`, stderr: '', exitCode: 0 };
    }

    if (command === 'unblock') {
      if (target) target.status = 'ready';
      return { stdout: `Unblocked ${taskId}`, stderr: '', exitCode: 0 };
    }

    return { stdout: '', stderr: `mock unhandled command: ${command}`, exitCode: 0 };
  };

  return {
    runner,
    calls,
    setOffline: (v: boolean) => {
      throwOffline = v;
    },
    setClaimConflict: (v: boolean) => {
      claimConflict = v;
    },
    getTasks: () => tasks
  };
}

test('rejects unauthenticated requests on Kanban endpoints', async () => {
  const app = buildApp();
  const getRes = await app.inject({ method: 'GET', url: '/api/kanban' });
  assert.equal(getRes.statusCode, 401);

  const postTask = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks',
    body: { title: 'Test Tanpa Auth' }
  });
  assert.equal(postTask.statusCode, 401);
  await app.close();
});

test('enforces CSRF token on Kanban mutations', async () => {
  resetSessionsForTests();
  const app = buildApp();
  const { token } = createSessionForTests('user-kanban-csrf');
  const cookie = `synectra_session=${token}`;

  const res = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks',
    headers: { cookie },
    body: { title: 'Test Missing CSRF' }
  });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.json(), { error: 'Invalid CSRF token' });
  await app.close();
});

test('creates task with safe initial status and uses explicit synectra-office profile and board', async () => {
  resetSessionsForTests();
  resetKanbanDataForTests();
  const mock = createMockRunner();
  setHermesCliRunnerForTests(mock.runner);

  const app = buildApp();
  const { token, session } = createSessionForTests('owner-kanban-1');
  const headers = { cookie: `synectra_session=${token}`, 'x-csrf-token': session.csrfToken };

  const res = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks',
    headers,
    body: {
      title: 'Tugas Desain Logo',
      body: 'Deskripsi lengkap',
      priority: 2,
      status: 'ready'
    }
  });

  assert.equal(res.statusCode, 201);
  const data = res.json();
  assert.equal(data.task.title, 'Tugas Desain Logo');
  assert.equal(data.task.status, 'ready');

  // Verify Hermes CLI arguments contain explicit profile and board
  const lastCall = mock.calls[0];
  assert.ok(lastCall.args.includes('-p'));
  assert.equal(lastCall.args[lastCall.args.indexOf('-p') + 1], 'synectra-office');
  assert.ok(lastCall.args.includes('--board'));
  assert.equal(lastCall.args[lastCall.args.indexOf('--board') + 1], 'synectra-office');
  assert.ok(!lastCall.args.includes('running'), 'must not default to running to bypass claim');
  assert.ok(lastCall.args.includes(`--tenant=${hermesTenantFor('owner-kanban-1')}`), 'task must be tenant-scoped');
  assert.deepEqual(lastCall.args.slice(lastCall.args.indexOf('--') + 1), ['Tugas Desain Logo']);

  await app.close();
});

test('handles transition lifecycle and returns HTTP 409 on claim conflict', async () => {
  resetSessionsForTests();
  resetKanbanDataForTests();
  const mock = createMockRunner('owner-kanban-lifecycle');
  setHermesCliRunnerForTests(mock.runner);

  const app = buildApp();
  const { token, session } = createSessionForTests('owner-kanban-lifecycle');
  const headers = { cookie: `synectra_session=${token}`, 'x-csrf-token': session.csrfToken };

  // 1. Success claim
  const claimRes = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks/t_mock_1/transition',
    headers,
    body: { action: 'claim' }
  });
  assert.equal(claimRes.statusCode, 200);
  assert.equal(claimRes.json().task.status, 'running');

  // 2. Request review after claim
  const reviewRes = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks/t_mock_1/transition',
    headers,
    body: { action: 'request_review', summary: 'Siap direview tim' }
  });
  assert.equal(reviewRes.statusCode, 200);
  assert.equal(reviewRes.json().task.status, 'review');

  // 3. Complete review -> done
  const doneRes = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks/t_mock_1/transition',
    headers,
    body: { action: 'complete', summary: 'Hasil telah disetujui' }
  });
  assert.equal(doneRes.statusCode, 200);
  assert.equal(doneRes.json().task.status, 'done');

  // 4. Claim conflict returns 409
  mock.setClaimConflict(true);
  const conflictRes = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks/t_mock_1/transition',
    headers,
    body: { action: 'claim' }
  });
  assert.equal(conflictRes.statusCode, 409);
  assert.match(conflictRes.json().error, /Conflict/i);

  await app.close();
});

test('links verified owner invoice and isolates links between owners', async () => {
  resetSessionsForTests();
  resetKanbanDataForTests();
  resetBusinessDataForTests();
  resetInvoiceDataForTests();

  const mock = createMockRunner('owner-link-a');
  setHermesCliRunnerForTests(mock.runner);

  const app = buildApp();
  const ownerA = 'owner-link-a';
  const ownerB = 'owner-link-b';

  const userA = createSessionForTests(ownerA);
  const userB = createSessionForTests(ownerB);

  const clientA = await createClient(ownerA, { name: 'Klien A', phone: '081234567891' });
  const invoiceA = await createInvoice(ownerA, {
    clientId: clientA.id,
    items: [{ description: 'Project Setup', quantity: 1, unitPrice: 750000 }]
  });

  // User B tries to link User A's invoice -> 404 / 403 denied
  const unauthLinkRes = await app.inject({
    method: 'POST',
    url: '/api/kanban/links',
    headers: {
      cookie: `synectra_session=${userB.token}`,
      'x-csrf-token': userB.session.csrfToken
    },
    body: { taskId: 't_mock_1', invoiceId: invoiceA.id }
  });
  assert.equal(unauthLinkRes.statusCode, 404);

  // User A links their own invoice -> succeeds
  const linkRes = await app.inject({
    method: 'POST',
    url: '/api/kanban/links',
    headers: {
      cookie: `synectra_session=${userA.token}`,
      'x-csrf-token': userA.session.csrfToken
    },
    body: { taskId: 't_mock_1', invoiceId: invoiceA.id }
  });
  assert.equal(linkRes.statusCode, 201);
  const linkData = linkRes.json().link;
  assert.equal(linkData.invoiceId, invoiceA.id);
  assert.equal(linkData.clientName, 'Klien A');
  assert.equal(linkData.total, 750000);

  // Snapshot for User A includes link and enriched task
  const snapshotA = await app.inject({
    method: 'GET',
    url: '/api/kanban',
    headers: { cookie: `synectra_session=${userA.token}` }
  });
  assert.equal(snapshotA.statusCode, 200);
  const bodyA = snapshotA.json();
  assert.equal(bodyA.links.length, 1);
  const taskWithLink = bodyA.tasks.find((t: { id: string }) => t.id === 't_mock_1');
  assert.equal(taskWithLink.invoiceId, invoiceA.id);
  assert.equal(taskWithLink.clientName, 'Klien A');

  // Snapshot for User B does NOT see User A's private link
  const snapshotB = await app.inject({
    method: 'GET',
    url: '/api/kanban',
    headers: { cookie: `synectra_session=${userB.token}` }
  });
  assert.equal(snapshotB.statusCode, 200);
  const bodyB = snapshotB.json();
  assert.equal(bodyB.links.length, 0);
  const taskForB = bodyB.tasks.find((t: { id: string }) => t.id === 't_mock_1');
  assert.equal(taskForB, undefined, 'owner B must not see owner A task');

  await app.close();
});

test('returns stale snapshot with isOffline=true when Hermes CLI fails or is offline', async () => {
  resetSessionsForTests();
  resetKanbanDataForTests();
  const mock = createMockRunner('owner-offline-test');
  setHermesCliRunnerForTests(mock.runner);

  const app = buildApp();
  const { token } = createSessionForTests('owner-offline-test');
  const headers = { cookie: `synectra_session=${token}` };

  // First fetch primes cache
  const firstRes = await app.inject({ method: 'GET', url: '/api/kanban', headers });
  assert.equal(firstRes.statusCode, 200);
  assert.equal(firstRes.json().isOffline, false);

  // Now simulate Hermes offline
  mock.setOffline(true);
  const offlineRes = await app.inject({ method: 'GET', url: '/api/kanban', headers });
  assert.equal(offlineRes.statusCode, 200);
  const data = offlineRes.json();
  assert.equal(data.isOffline, true);
  assert.ok(data.tasks.length > 0, 'should return cached stale tasks');

  await app.close();
});

test('isolates Hermes tasks per owner: list filter, transition, and link return 404 for foreign task', async () => {
  resetSessionsForTests();
  resetKanbanDataForTests();
  resetBusinessDataForTests();
  resetInvoiceDataForTests();
  const mock = createMockRunner('owner-iso-a');
  setHermesCliRunnerForTests(mock.runner);

  const app = buildApp();
  const userB = createSessionForTests('owner-iso-b');
  const headersB = { cookie: `synectra_session=${userB.token}`, 'x-csrf-token': userB.session.csrfToken };

  const snapshotB = await app.inject({ method: 'GET', url: '/api/kanban', headers: { cookie: headersB.cookie } });
  assert.equal(snapshotB.statusCode, 200);
  assert.equal(snapshotB.json().tasks.length, 0);
  const listCall = mock.calls.find((c) => c.args.includes('list'));
  assert.ok(listCall?.args.includes(`--tenant=${hermesTenantFor('owner-iso-b')}`));

  const transition = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks/t_mock_1/transition',
    headers: headersB,
    body: { action: 'complete', summary: 'ambil alih' }
  });
  assert.equal(transition.statusCode, 404);
  assert.equal(mock.getTasks()[0].status, 'ready', 'foreign task must stay untouched');
  assert.ok(!mock.calls.some((c) => c.args.includes('complete')), 'complete must never reach Hermes');

  const clientB = await createClient('owner-iso-b', { name: 'Klien B', phone: '081234567899' });
  const invoiceB = await createInvoice('owner-iso-b', {
    clientId: clientB.id,
    items: [{ description: 'Jasa', quantity: 1, unitPrice: 100000 }]
  });
  const link = await app.inject({
    method: 'POST',
    url: '/api/kanban/links',
    headers: headersB,
    body: { taskId: 't_mock_1', invoiceId: invoiceB.id }
  });
  assert.equal(link.statusCode, 404);

  await app.close();
});

test('passes flag-like user input as positional and maps blocked status to --initial-status', async () => {
  resetSessionsForTests();
  resetKanbanDataForTests();
  const mock = createMockRunner();
  setHermesCliRunnerForTests(mock.runner);

  const app = buildApp();
  const { token, session } = createSessionForTests('owner-flags');
  const headers = { cookie: `synectra_session=${token}`, 'x-csrf-token': session.csrfToken };

  const res = await app.inject({
    method: 'POST',
    url: '/api/kanban/tasks',
    headers,
    body: { title: '--help', body: '--json', status: 'blocked' }
  });
  assert.equal(res.statusCode, 201);
  const args = mock.calls[0].args;
  assert.deepEqual(args.slice(args.indexOf('--') + 1), ['--help']);
  assert.ok(args.includes('--body=--json'));
  assert.ok(args.includes('--initial-status=blocked'));
  assert.ok(!args.includes('--blocked'));
  assert.equal(res.json().task.status, 'blocked');
  // Tanpa assignee eksplisit, task ditugaskan ke Lead Hermes agar dispatcher gateway mengerjakannya.
  assert.ok(args.includes('--assignee=synectra-office'));

  const explicit = await app.inject({ method: 'POST', url: '/api/kanban/tasks', headers, body: { title: 'Tagih klien', assignee: 'fvh-collections-officer' } });
  assert.equal(explicit.statusCode, 201);
  const explicitArgs = mock.calls.filter((c) => c.args.includes('create')).at(-1)!.args;
  assert.ok(explicitArgs.includes('--assignee=fvh-collections-officer'));
  assert.ok(!explicitArgs.includes('--assignee=synectra-office'));

  await app.close();
});
