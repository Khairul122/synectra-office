import {
  kanbanBoardSnapshotSchema,
  kanbanTaskSchema,
  createKanbanTaskRequestSchema,
  transitionKanbanTaskRequestSchema,
  linkTaskInvoiceRequestSchema,
  taskLinkSchema,
  type KanbanBoardSnapshot,
  type KanbanTask,
  type TaskLink,
  type CreateKanbanTaskRequest,
  type TransitionKanbanTaskRequest,
  type LinkTaskInvoiceRequest
} from '@synectra/contracts';
import { getInvoice } from '../../invoice/application/invoice-service';
import { getClient } from '../../business/application/business-service';
import {
  HERMES_PROFILE,
  hermesTenantFor,
  type HermesCliRunner
} from '../../../infrastructure/hermes-cli';

export type { HermesCliRunner };

export const KANBAN_BOARD = 'synectra-office';

/**
 * Profil Hermes yang mengerjakan task tanpa assignee eksplisit. Dispatcher gateway Hermes melewati
 * task tanpa assignee (`skipped_unassigned`), jadi default ini yang membuat papan berjalan otomatis.
 * Sengaja di sisi app, bukan `kanban.default_assignee`, karena kunci itu berlaku untuk semua board.
 */
export function kanbanLeadAssignee(): string {
  return process.env.HERMES_KANBAN_LEAD?.trim() || HERMES_PROFILE;
}

export interface TaskLinkStore {
  addLink(ownerId: string, link: TaskLink): Promise<TaskLink>;
  listLinks(ownerId: string): Promise<TaskLink[]>;
  getLinkByTaskId(ownerId: string, taskId: string): Promise<TaskLink | null>;
  resetForTests(): void;
}

export function createMemoryTaskLinkStore(): TaskLinkStore {
  const memoryStore = new Map<string, TaskLink[]>();

  return {
    async addLink(ownerId: string, link: TaskLink): Promise<TaskLink> {
      const parsed = taskLinkSchema.parse(link);
      const existing = memoryStore.get(ownerId) ?? [];
      const index = existing.findIndex(
        (item) => item.id === parsed.id || (item.taskId === parsed.taskId && item.invoiceId === parsed.invoiceId)
      );
      if (index >= 0) {
        existing[index] = parsed;
      } else {
        existing.push(parsed);
      }
      memoryStore.set(ownerId, existing);
      return parsed;
    },

    async listLinks(ownerId: string): Promise<TaskLink[]> {
      return memoryStore.get(ownerId) ?? [];
    },

    async getLinkByTaskId(ownerId: string, taskId: string): Promise<TaskLink | null> {
      const all = memoryStore.get(ownerId) ?? [];
      return all.find((link) => link.taskId === taskId) ?? null;
    },

    resetForTests(): void {
      memoryStore.clear();
    }
  };
}

let activeRunner: HermesCliRunner | null = null;
let activeTaskLinkStore: TaskLinkStore = createMemoryTaskLinkStore();

export function setHermesCliRunner(runner: HermesCliRunner): void {
  activeRunner = runner;
}
export const setHermesCliRunnerForTests = setHermesCliRunner;

export function getHermesCliRunner(): HermesCliRunner | null {
  return activeRunner;
}

export function setTaskLinkStore(store: TaskLinkStore): void {
  activeTaskLinkStore = store;
}
export const setTaskLinkStoreForTests = setTaskLinkStore;

export function getTaskLinkStore(): TaskLinkStore {
  return activeTaskLinkStore;
}

// Snapshot terakhir per owner, dipakai saat Hermes offline.
const cachedTasks = new Map<string, KanbanTask[]>();

export function resetKanbanDataForTests(): void {
  activeRunner = null;
  cachedTasks.clear();
  activeTaskLinkStore = createMemoryTaskLinkStore();
}

function getRunner(): HermesCliRunner {
  if (!activeRunner) {
    return async () => ({
      stdout: '',
      stderr: 'Hermes CLI runner not initialized',
      exitCode: 1
    });
  }
  return activeRunner;
}

function httpError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Argumen kanban untuk board Synectra. Nilai dari user selalu masuk sebagai `--opt=value`
 * atau sesudah `--`, sehingga tidak bisa dibaca argparse sebagai flag.
 */
function kanbanArgs(subcommand: string, options: string[], positionals: string[] = []): string[] {
  const args = ['-p', HERMES_PROFILE, 'kanban', '--board', KANBAN_BOARD, subcommand, ...options];
  if (positionals.length > 0) args.push('--', ...positionals);
  return args;
}

function normalizeHermesTask(raw: any): KanbanTask {
  return kanbanTaskSchema.parse({
    id: String(raw.id),
    title: String(raw.title),
    body: raw.body ?? null,
    status: raw.status,
    priority: typeof raw.priority === 'number' ? raw.priority : 0,
    assignee: raw.assignee ?? null,
    createdAt: Number(raw.createdAt ?? raw.created_at ?? Math.floor(Date.now() / 1000)),
    startedAt: raw.startedAt !== undefined ? raw.startedAt : (raw.started_at ?? null),
    completedAt: raw.completedAt !== undefined ? raw.completedAt : (raw.completed_at ?? null),
    result: raw.result ?? null,
    invoiceId: raw.invoiceId ?? null,
    invoiceNumber: raw.invoiceNumber ?? null,
    clientName: raw.clientName ?? null,
    total: raw.total !== undefined ? raw.total : null
  });
}

function actionToSubcommand(action: TransitionKanbanTaskRequest['action']): string {
  return action === 'request_review' ? 'request-review' : action;
}

/** Ambil task mentah dari Hermes; null bila tidak ada atau bukan milik owner (tenant berbeda). */
async function getOwnedRawTask(ownerId: string, taskId: string): Promise<any | null> {
  const res = await getRunner()(kanbanArgs('show', ['--json'], [taskId]));
  if (res.exitCode !== 0) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(res.stdout);
  } catch {
    return null;
  }
  const raw = parsed?.task ?? parsed;
  return raw?.tenant === hermesTenantFor(ownerId) ? raw : null;
}

/**
 * Pastikan task milik owner. Snapshot cache berasal dari `list --tenant=<owner>` (difilter Hermes),
 * jadi cukup sebagai bukti kepemilikan; `show` dipanggil hanya bila task belum ada di cache
 * karena tiap panggilan CLI Hermes memakan belasan detik.
 */
async function requireOwnedTask(ownerId: string, taskId: string): Promise<void> {
  if (cachedTasks.get(ownerId)?.some((task) => task.id === taskId)) return;
  if (!(await getOwnedRawTask(ownerId, taskId))) throw httpError('Task not found', 404);
}

async function withLink(ownerId: string, task: KanbanTask): Promise<KanbanTask> {
  const link = await activeTaskLinkStore.getLinkByTaskId(ownerId, task.id);
  if (link) {
    task.invoiceId = link.invoiceId;
    task.invoiceNumber = link.invoiceNumber;
    task.clientName = link.clientName;
    task.total = link.total;
  }
  return task;
}

export async function getBoardSnapshot(ownerId: string): Promise<KanbanBoardSnapshot> {
  let isOffline = false;
  const listArgs = kanbanArgs('list', [`--tenant=${hermesTenantFor(ownerId)}`, '--json']);

  try {
    const res = await getRunner()(listArgs);
    if (res.exitCode !== 0) {
      throw new Error(res.stderr || `Hermes CLI error ${res.exitCode}`);
    }
    const parsed = JSON.parse(res.stdout);
    if (Array.isArray(parsed)) {
      cachedTasks.set(ownerId, parsed.map(normalizeHermesTask));
    }
  } catch {
    isOffline = true;
  }

  const userLinks = await activeTaskLinkStore.listLinks(ownerId);
  const linkMap = new Map(userLinks.map((l) => [l.taskId, l]));

  const enrichedTasks = (cachedTasks.get(ownerId) ?? []).map((task) => {
    const link = linkMap.get(task.id);
    return {
      ...task,
      invoiceId: link?.invoiceId ?? null,
      invoiceNumber: link?.invoiceNumber ?? null,
      clientName: link?.clientName ?? null,
      total: link?.total !== undefined ? link.total : null
    };
  });

  return kanbanBoardSnapshotSchema.parse({
    board: KANBAN_BOARD,
    tasks: enrichedTasks,
    links: userLinks,
    isOffline,
    lastSyncAt: new Date().toISOString()
  });
}

export async function createTask(ownerId: string, input: CreateKanbanTaskRequest): Promise<KanbanTask> {
  const parsed = createKanbanTaskRequestSchema.parse(input);
  const status = parsed.status ?? 'ready';

  // Validasi invoice sebelum task dibuat agar tidak ada task yatim bila invoice bukan milik owner.
  if (parsed.invoiceId && !(await getInvoice(ownerId, parsed.invoiceId))) {
    throw httpError('Invoice not found', 404);
  }

  const options = [`--tenant=${hermesTenantFor(ownerId)}`];
  if (status === 'triage') options.push('--triage');
  else if (status === 'blocked') options.push('--initial-status=blocked');
  if (parsed.body) options.push(`--body=${parsed.body}`);
  const assignee = parsed.assignee?.trim() || kanbanLeadAssignee();
  options.push(`--assignee=${assignee}`);
  if (typeof parsed.priority === 'number') options.push(`--priority=${parsed.priority}`);
  options.push('--json');

  const res = await getRunner()(kanbanArgs('create', options, [parsed.title]));
  if (res.exitCode !== 0) {
    throw httpError(res.stderr || `Failed to create task with exitCode ${res.exitCode}`, 400);
  }

  let createdTaskId: string | null = null;
  let rawTask: any;
  const match = res.stdout.match(/Created\s+([^\s]+)/i);
  if (match) {
    createdTaskId = match[1];
  } else {
    try {
      const json = JSON.parse(res.stdout);
      createdTaskId = json.id ?? json.task_id ?? json.task?.id;
      rawTask = json.task ?? json;
    } catch {}
  }

  if (createdTaskId && !rawTask) {
    rawTask = await getOwnedRawTask(ownerId, createdTaskId);
  }

  if (!rawTask) {
    rawTask = {
      id: createdTaskId ?? `task_${Date.now()}`,
      title: parsed.title,
      body: parsed.body ?? null,
      status,
      priority: parsed.priority ?? 0,
      assignee,
      created_at: Math.floor(Date.now() / 1000)
    };
  }

  const task = normalizeHermesTask(rawTask);
  if (parsed.invoiceId) {
    await linkTaskInvoice(ownerId, { taskId: task.id, invoiceId: parsed.invoiceId });
  }
  return withLink(ownerId, task);
}

export async function transitionTask(
  ownerId: string,
  taskId: string,
  input: TransitionKanbanTaskRequest
): Promise<KanbanTask> {
  const parsed = transitionKanbanTaskRequestSchema.parse(input);
  await requireOwnedTask(ownerId, taskId);

  const options: string[] = [];
  const positionals = [taskId];
  if (parsed.action === 'request_review') {
    if (parsed.summary) options.push(`--summary=${parsed.summary}`);
    if (parsed.assignee) options.push(`--reviewer=${parsed.assignee}`);
  } else if (parsed.action === 'complete') {
    if (parsed.summary) options.push(`--result=${parsed.summary}`);
  } else if (parsed.action === 'block') {
    if (parsed.reason) positionals.push(parsed.reason);
  }

  const res = await getRunner()(kanbanArgs(actionToSubcommand(parsed.action), options, positionals));
  if (res.exitCode !== 0) {
    const combinedOutput = `${res.stderr} ${res.stdout}`;
    const isConflict =
      parsed.action === 'claim' &&
      (combinedOutput.includes('cannot claim') ||
        combinedOutput.includes('status=running') ||
        combinedOutput.includes('lock=') ||
        /conflict/i.test(combinedOutput));

    if (isConflict) {
      throw httpError('Conflict: Task is locked or claimed by another worker', 409);
    }
    throw httpError(res.stderr || `Transition ${parsed.action} failed with exitCode ${res.exitCode}`, 400);
  }

  const rawTask = (await getOwnedRawTask(ownerId, taskId)) ?? { id: taskId, title: taskId, status: 'ready' };
  return withLink(ownerId, normalizeHermesTask(rawTask));
}

export async function linkTaskInvoice(
  ownerId: string,
  input: LinkTaskInvoiceRequest
): Promise<TaskLink> {
  const parsed = linkTaskInvoiceRequestSchema.parse(input);
  const invoice = await getInvoice(ownerId, parsed.invoiceId);
  if (!invoice) throw httpError('Invoice not found', 404);
  await requireOwnedTask(ownerId, parsed.taskId);

  let clientName = 'Klien';
  if (invoice.clientId) {
    const client = await getClient(ownerId, invoice.clientId);
    if (client?.name) {
      clientName = client.name;
    }
  }

  const linkData: TaskLink = {
    id: `link_${parsed.taskId}_${parsed.invoiceId}`,
    ownerId,
    taskId: parsed.taskId,
    invoiceId: parsed.invoiceId,
    invoiceNumber: invoice.number || invoice.id,
    clientName,
    total: invoice.total,
    linkedAt: new Date().toISOString(),
    linkedBy: ownerId
  };

  return activeTaskLinkStore.addLink(ownerId, linkData);
}
