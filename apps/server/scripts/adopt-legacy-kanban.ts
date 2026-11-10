/**
 * Pindahkan task board Hermes tanpa tenant (dibuat sebelum scoping per owner, atau langsung lewat CLI Hermes)
 * ke tenant milik satu owner: buat ulang task dengan tenant owner, lalu archive task lama.
 *
 *   pnpm --filter @synectra/server exec tsx scripts/adopt-legacy-kanban.ts --owner=<uid>          # dry run
 *   pnpm --filter @synectra/server exec tsx scripts/adopt-legacy-kanban.ts --owner=<uid> --apply  # eksekusi
 */
import { defaultHermesCliRunner, HERMES_PROFILE, hermesTenantFor } from '../src/infrastructure/hermes-cli';
import { KANBAN_BOARD } from '../src/modules/kanban/application/kanban-service';

type RawTask = { id: string; title: string; body: string | null; assignee: string | null; priority: number | null; tenant: string | null; status: string };

const ownerId = process.argv.find((a) => a.startsWith('--owner='))?.slice('--owner='.length);
const apply = process.argv.includes('--apply');
if (!ownerId) {
  console.error('Wajib: --owner=<uid>');
  process.exit(2);
}

async function kanban(sub: string, options: string[], positionals: string[] = []) {
  const args = ['-p', HERMES_PROFILE, 'kanban', '--board', KANBAN_BOARD, sub, ...options];
  if (positionals.length > 0) args.push('--', ...positionals);
  const res = await defaultHermesCliRunner(args, { timeout: 120000 });
  if (res.exitCode !== 0) throw new Error(`kanban ${sub} gagal (exit ${res.exitCode}): ${res.stderr.slice(0, 300)}`);
  return res.stdout;
}

const tenant = hermesTenantFor(ownerId);
const tasks = (JSON.parse(await kanban('list', ['--json'])) as RawTask[]).filter((t) => !t.tenant && t.status !== 'archived');
console.log(`${tasks.length} task tanpa tenant di board ${KANBAN_BOARD}; tenant tujuan ${tenant}${apply ? '' : ' (dry run)'}`);

for (const task of tasks) {
  if (!apply) {
    console.log(`- ${task.id} "${task.title}" [${task.status}]`);
    continue;
  }
  const options = [`--tenant=${tenant}`, '--json'];
  if (task.body) options.push(`--body=${task.body}`);
  if (task.assignee) options.push(`--assignee=${task.assignee}`);
  if (task.priority) options.push(`--priority=${task.priority}`);
  const created = JSON.parse(await kanban('create', options, [task.title])) as { id: string };
  await kanban('archive', [], [task.id]);
  console.log(`- ${task.id} -> ${created.id} "${task.title}"`);
}
