import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from 'react';
import {
  createKanbanTaskRequestSchema,
  kanbanBoardSnapshotSchema,
  linkTaskInvoiceRequestSchema,
  transitionKanbanTaskRequestSchema,
  type KanbanBoardSnapshot,
  type KanbanStatus,
  type KanbanTask,
  type TransitionKanbanTaskRequest
} from '@synectra/contracts';
import { transitionForDrop } from './kanban-actions';
import {
  DEFAULT_BOARD,
  KANBAN_PROFILES,
  getLockReason,
  getStoredSnapshot,
  isSnapshotStale,
  setStoredSnapshot
} from './kanban-storage';

type InvoiceOption = { id: string; number?: string; clientName?: string; total: number };

type Props = { csrfToken: string | null; invoices: InvoiceOption[] };

const statuses: KanbanStatus[] = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived'];
const statusLabels: Record<KanbanStatus, string> = {
  triage: 'Triage', todo: 'Todo', scheduled: 'Terjadwal', ready: 'Siap', running: 'Berjalan', blocked: 'Blocked', review: 'Review', done: 'Selesai', archived: 'Arsip'
};
const statusActions: Partial<Record<KanbanStatus, Array<TransitionKanbanTaskRequest['action']>>> = {
  triage: ['specify'], todo: ['schedule'], ready: ['claim', 'block'], blocked: ['unblock'], running: ['request_review'], review: ['complete'], done: ['archive']
};
const actionLabels: Record<TransitionKanbanTaskRequest['action'], string> = {
  claim: 'Ambil tugas', block: 'Block', unblock: 'Buka block', request_review: 'Minta review', complete: 'Selesaikan', schedule: 'Jadwalkan', specify: 'Pindah ke Todo', archive: 'Arsipkan'
};

function errorMessage(response: Response) {
  return response.ok ? '' : `Permintaan gagal (${response.status})`;
}

export function KanbanBoardPanel({ csrfToken, invoices }: Props) {
  const [board, setBoard] = useState<string>(DEFAULT_BOARD);
  const [snapshot, setSnapshot] = useState<KanbanBoardSnapshot | null>(() => getStoredSnapshot(DEFAULT_BOARD));
  const [selectedId, setSelectedId] = useState<string | null>(() => snapshot?.tasks[0]?.id ?? null);
  const [loading, setLoading] = useState(!snapshot);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('0');
  const [assignee, setAssignee] = useState('');
  const [createStatus, setCreateStatus] = useState<KanbanStatus>('ready');
  const [createInvoiceId, setCreateInvoiceId] = useState('');
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionSummary, setTransitionSummary] = useState('');
  const [linkInvoiceId, setLinkInvoiceId] = useState('');

  const fetchBoard = useCallback(async (targetBoard = board, signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/kanban?board=${encodeURIComponent(targetBoard)}`, { signal });
      if (!response.ok) throw new Error(errorMessage(response));
      const next = kanbanBoardSnapshotSchema.parse(await response.json());
      setSnapshot(next);
      setStoredSnapshot(targetBoard, next);
      setSelectedId(current => current && next.tasks.some(task => task.id === current) ? current : next.tasks[0]?.id ?? null);
      setError(null);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      const cached = getStoredSnapshot(targetBoard);
      if (cached) {
        const offlineSnapshot: KanbanBoardSnapshot = { ...cached, isOffline: true };
        setSnapshot(offlineSnapshot);
        setSelectedId(current => current && offlineSnapshot.tasks.some(task => task.id === current) ? current : offlineSnapshot.tasks[0]?.id ?? null);
        const reason = cause instanceof Error ? cause.message : 'Koneksi gagal';
        setError(`${reason} - menggunakan snapshot offline`);
      } else {
        setError(cause instanceof Error ? cause.message : 'Papan gagal dimuat');
      }
    } finally {
      setLoading(false);
    }
  }, [board]);

  const handleBoardChange = (nextBoard: string) => {
    setBoard(nextBoard);
    const cached = getStoredSnapshot(nextBoard);
    if (cached) {
      setSnapshot(cached);
      setSelectedId(cached.tasks[0]?.id ?? null);
    } else {
      setSnapshot(null);
      setSelectedId(null);
      setLoading(true);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    void fetchBoard(board, controller.signal);
    const interval = window.setInterval(() => { if (!document.hidden) void fetchBoard(board); }, 30000);
    const onVisible = () => { if (!document.hidden) void fetchBoard(board); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchBoard, board]);

  const stale = useMemo(() => isSnapshotStale(snapshot), [snapshot]);
  const locked = stale || mutating || !csrfToken;
  const lockReason = useMemo(() => getLockReason({
    hasSnapshot: Boolean(snapshot),
    stale,
    isOffline: snapshot?.isOffline,
    mutating,
    csrfToken
  }), [snapshot, stale, mutating, csrfToken]);
  const selected = snapshot?.tasks.find(task => task.id === selectedId) ?? null;
  const linksForSelected = snapshot?.links.filter(link => link.taskId === selectedId) ?? [];

  const request = async (url: string, bodyValue: unknown) => {
    if (locked) return;
    setMutating(true);
    setError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken },
        body: JSON.stringify(bodyValue)
      });
      if (!response.ok) throw new Error(errorMessage(response));
      await fetchBoard(board);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Perubahan gagal disimpan');
    } finally {
      setMutating(false);
    }
  };

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = createKanbanTaskRequestSchema.safeParse({ title, body: body || undefined, priority: Number(priority), assignee: assignee || undefined, status: createStatus, invoiceId: createInvoiceId || undefined });
    if (!parsed.success) { setError('Detail tugas tidak valid'); return; }
    await request(`/api/kanban/tasks?board=${encodeURIComponent(board)}`, parsed.data);
    setTitle(''); setBody(''); setAssignee(''); setCreateInvoiceId('');
  };

  const transition = async (task: KanbanTask, action: TransitionKanbanTaskRequest['action']) => {
    const parsed = transitionKanbanTaskRequestSchema.safeParse({ action, reason: transitionReason || undefined, summary: transitionSummary || undefined, assignee: assignee || undefined });
    if (!parsed.success) { setError('Transisi tidak valid'); return; }
    await request(`/api/kanban/tasks/${encodeURIComponent(task.id)}/transition?board=${encodeURIComponent(board)}`, parsed.data);
    setTransitionReason(''); setTransitionSummary('');
  };

  const linkInvoice = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) return;
    const parsed = linkTaskInvoiceRequestSchema.safeParse({ taskId: selected.id, invoiceId: linkInvoiceId });
    if (!parsed.success) { setError('Pilih nota valid'); return; }
    await request(`/api/kanban/links?board=${encodeURIComponent(board)}`, parsed.data);
    setLinkInvoiceId('');
  };

  const drop = (event: DragEvent<HTMLElement>, status: KanbanStatus) => {
    event.preventDefault();
    const task = snapshot?.tasks.find(item => item.id === event.dataTransfer.getData('text/kanban-task'));
    if (!task) return;
    const action = transitionForDrop(task.status, status);
    if (action) void transition(task, action);
    else if (task.status !== status) setError('Perpindahan tidak didukung lifecycle native');
  };

  return <section className="kanban-panel" aria-labelledby="kanban-title">
    <div className="kanban-toolbar">
      <div>
        <span className="eyebrow">Papan native Hermes</span>
        <h3 id="kanban-title">Pekerjaan</h3>
      </div>
      <div className="kanban-controls">
        <label className="kanban-board-select">
          <span>Profil / Board</span>
          <select
            value={board}
            onChange={event => handleBoardChange(event.target.value)}
            disabled={mutating}
            aria-label="Pilih board kanban"
          >
            {KANBAN_PROFILES.map(profile => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </select>
        </label>
        <button className="text-button" type="button" onClick={() => void fetchBoard(board)} disabled={loading || mutating}>Muat ulang</button>
      </div>
    </div>
    <div className="kanban-status-bar">
      {snapshot && (
        <p className={mutating ? 'kanban-sync mutating' : stale ? 'kanban-sync stale' : 'kanban-sync'} role="status">
          {mutating
            ? 'Menyimpan perubahan...'
            : snapshot.isOffline
            ? `Offline (snapshot lokal) · ${new Date(snapshot.lastSyncAt).toLocaleString('id-ID')}`
            : stale
            ? `Snapshot stale · Sinkron terakhir ${new Date(snapshot.lastSyncAt).toLocaleString('id-ID')}`
            : `Sinkron ${new Date(snapshot.lastSyncAt).toLocaleString('id-ID')}`}
        </p>
      )}
      {locked && lockReason && (
        <p className="kanban-lock-status" role="status">
          Perubahan dikunci: {lockReason}
        </p>
      )}
    </div>
    {error && <p className="kanban-error" role="alert">{error}</p>}
    <details className="kanban-create-disclosure"><summary>+ Buat tugas baru</summary><form className="kanban-create" onSubmit={createTask}>
      <h4>Buat tugas</h4>
      <label>Judul<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} /></label>
      <label>Deskripsi<textarea maxLength={4000} value={body} onChange={event => setBody(event.target.value)} /></label>
      <div className="kanban-form-grid"><label>Prioritas<input type="number" min="0" max="10" step="1" value={priority} onChange={event => setPriority(event.target.value)} /></label><label>Ditangani oleh<input maxLength={100} placeholder="Lead Hermes (synectra-office)" value={assignee} onChange={event => setAssignee(event.target.value)} /></label></div>
      <div className="kanban-form-grid"><label>Status<select value={createStatus} onChange={event => setCreateStatus(event.target.value as KanbanStatus)}>{(['ready', 'triage', 'blocked'] as KanbanStatus[]).map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label>Relasi nota<select value={createInvoiceId} onChange={event => setCreateInvoiceId(event.target.value)}><option value="">Tanpa nota</option>{invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number ?? invoice.id} · {invoice.clientName ?? 'Klien'}</option>)}</select></label></div>
      <button className="primary-button" type="submit" disabled={locked}>Tambah tugas</button>
    </form></details>
    {loading && !snapshot && <p role="status">Memuat papan...</p>}
    {snapshot && <div className="kanban-columns">{statuses.map(status => {
      const columnTasks = snapshot.tasks.filter(task => task.status === status);
      return <section className="kanban-column" key={status} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, status)} aria-labelledby={`kanban-${status}`}>
        <h4 id={`kanban-${status}`}>{statusLabels[status]} <span>{columnTasks.length}</span></h4>
        {columnTasks.length === 0 ? (
          <p className="kanban-empty-col">Belum ada tugas</p>
        ) : (
          columnTasks.map(task => <button className={`kanban-card${selectedId === task.id ? ' selected' : ''}`} draggable={!locked} type="button" key={task.id} onClick={() => setSelectedId(task.id)} onDragStart={event => event.dataTransfer.setData('text/kanban-task', task.id)}><strong>{task.title}</strong><small>P{task.priority} · {task.assignee ?? 'Belum ada assignee'}</small>{task.invoiceNumber && <small>Nota {task.invoiceNumber} · {task.clientName ?? 'Klien'}</small>}</button>)
        )}
      </section>;
    })}</div>}
    {selected && <section className="kanban-detail" aria-labelledby="kanban-detail-title"><span className="eyebrow">Detail tugas</span><h4 id="kanban-detail-title">{selected.title}</h4><p>{selected.body || 'Tidak ada deskripsi.'}</p><dl><div><dt>Status</dt><dd>{statusLabels[selected.status]}</dd></div><div><dt>Assignee</dt><dd>{selected.assignee ?? 'Belum ditetapkan'}</dd></div><div><dt>Review / hasil</dt><dd>{selected.result ?? 'Belum ada ringkasan hasil'}</dd></div><div><dt>Alasan blocked</dt><dd>{selected.status === 'blocked' ? 'Tidak tersedia pada kontrak task' : '-'}</dd></div><div><dt>Dependencies</dt><dd>Tidak tersedia pada kontrak task</dd></div><div><dt>Artefak</dt><dd>Tidak tersedia pada kontrak task</dd></div></dl><div className="kanban-actions">{(statusActions[selected.status] ?? []).map(action => <button className="secondary-button" type="button" key={action} disabled={locked} onClick={() => void transition(selected, action)}>{actionLabels[action]}</button>)}</div><label>Alasan transisi<input maxLength={500} value={transitionReason} onChange={event => setTransitionReason(event.target.value)} /></label><label>Ringkasan hasil<textarea maxLength={2000} value={transitionSummary} onChange={event => setTransitionSummary(event.target.value)} /></label><form className="kanban-link" onSubmit={linkInvoice}><label>Hubungkan nota<select required value={linkInvoiceId} onChange={event => setLinkInvoiceId(event.target.value)}><option value="">Pilih nota</option>{invoices.map(invoice => <option key={invoice.id} value={invoice.id}>{invoice.number ?? invoice.id} · {invoice.clientName ?? 'Klien'}</option>)}</select></label><button className="secondary-button" type="submit" disabled={locked}>Simpan relasi</button></form>{linksForSelected.length > 0 && <ul className="kanban-links">{linksForSelected.map(link => <li key={link.id}>{link.invoiceNumber} · {link.clientName} · Rp{link.total.toLocaleString('id-ID')}</li>)}</ul>}</section>}
  </section>;
}
