import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  calendarOverviewSchema,
  type CalendarOverview,
  type CalendarSchedule,
  type CalendarRunRecord,
  type ScheduleType,
  type ScheduleActor,
  type MissedRunPolicy
} from '@synectra/contracts';

type Props = {
  csrfToken: string | null;
};

function formatWib(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(d) + ' WIB';
  } catch {
    return isoString;
  }
}

type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warn' | 'danger';

function typeBadge(type: ScheduleType): { label: string; tone: Tone } {
  switch (type) {
    case 'hermes_cron':
      return { label: 'Hermes Agent', tone: 'accent' };
    case 'outbox_delivery':
      return { label: 'Pengiriman Outbox', tone: 'info' };
    case 'app_job':
      return { label: 'Job Internal', tone: 'success' };
    default:
      return { label: type, tone: 'neutral' };
  }
}

function statusBadge(status: string): { label: string; tone: Tone } {
  switch (status) {
    case 'active':
      return { label: 'Aktif', tone: 'success' };
    case 'success':
      return { label: 'Sukses', tone: 'success' };
    case 'paused':
      return { label: 'Dijeda', tone: 'warn' };
    case 'running':
      return { label: 'Berjalan', tone: 'info' };
    case 'failed':
      return { label: 'Gagal', tone: 'danger' };
    case 'review':
    case 'missed':
      return { label: 'Perlu review', tone: 'warn' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function CalendarSchedulePanel({ csrfToken }: Props) {
  const [overview, setOverview] = useState<CalendarOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [pauseReasonInput, setPauseReasonInput] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [scheduleType, setScheduleType] = useState<'hermes_cron' | 'app_job'>('hermes_cron');
  const [actor, setActor] = useState<ScheduleActor>('hermes');
  const [scheduleRule, setScheduleRule] = useState('daily 09:00');
  const [prompt, setPrompt] = useState('');
  const [effects, setEffects] = useState('');
  const [budget, setBudget] = useState('50000');
  const [estimatedCost, setEstimatedCost] = useState('1500');
  const [timeoutMs, setTimeoutMs] = useState('30000');
  const [maxConcurrency, setMaxConcurrency] = useState('1');
  const [missedRunPolicy, setMissedRunPolicy] = useState<MissedRunPolicy>('review');

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) {
        throw new Error(`Gagal memuat jadwal (${res.status})`);
      }
      const data = await res.json();
      const parsed = calendarOverviewSchema.parse(data);
      setOverview(parsed);
      if (!selectedScheduleId && parsed.schedules.length > 0) {
        setSelectedScheduleId(parsed.schedules[0].id);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kesalahan jaringan memuat kalender');
    } finally {
      setLoading(false);
    }
  }, [selectedScheduleId]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  const handleCreateSchedule = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !effects.trim() || !scheduleRule.trim()) {
      setError('Nama, aturan jadwal, dan efek samping wajib diisi');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setActionMessage(null);

    try {
      const bodyPayload = {
        name: name.trim(),
        type: scheduleType,
        actor,
        schedule: scheduleRule.trim(),
        timezone: 'Asia/Jakarta',
        prompt: prompt.trim() || undefined,
        effects: effects.trim(),
        budget: budget ? parseInt(budget, 10) : undefined,
        estimatedCost: estimatedCost ? parseFloat(estimatedCost) : 0,
        timeoutMs: timeoutMs ? parseInt(timeoutMs, 10) : 30000,
        maxConcurrency: maxConcurrency ? parseInt(maxConcurrency, 10) : 1,
        missedRunPolicy
      };

      const res = await fetch('/api/calendar/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        },
        body: JSON.stringify(bodyPayload)
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal membuat jadwal (${res.status})`);
      }

      setIsCreating(false);
      setName('');
      setPrompt('');
      setEffects('');
      setActionMessage('Jadwal baru berhasil disimpan!');
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal membuat jadwal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePause = async (id: string) => {
    setIsProcessing(true);
    setError(null);
    setActionMessage(null);
    try {
      const reason = pauseReasonInput[id] || 'Dijeda manual oleh pemilik';
      const res = await fetch(`/api/calendar/schedules/${id}/pause`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        },
        body: JSON.stringify({ reason })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal menunda jadwal (${res.status})`);
      }
      setActionMessage('Jadwal berhasil dijeda');
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menunda jadwal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResume = async (id: string) => {
    setIsProcessing(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/calendar/schedules/${id}/resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal melanjutkan jadwal (${res.status})`);
      }
      setActionMessage('Jadwal aktif kembali');
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal melanjutkan jadwal');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRunNow = async (id: string) => {
    setIsProcessing(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/calendar/schedules/${id}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal memicu eksekusi (${res.status})`);
      }
      const data = await res.json();
      setActionMessage(`Eksekusi selesai: ${data.run?.status ?? 'selesai'} (${data.run?.summary ?? ''})`);
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memicu eksekusi');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckMissed = async () => {
    setIsProcessing(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch('/api/calendar/missed-runs/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        }
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal memeriksa missed runs (${res.status})`);
      }
      const data = await res.json();
      const processed = data.processed ?? data.checked ?? 0;
      const caughtUp = data.caughtUp ?? 0;
      const skipped = data.skipped ?? 0;
      const reviewed = data.reviewed ?? data.needsReview ?? 0;
      setActionMessage(
        `Pengecekan missed runs selesai: ${processed} diproses, ${caughtUp} dijalankan, ${skipped} dilewati, ${reviewed} perlu review.`
      );
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengevaluasi missed runs');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleResolveMissed = async (id: string, action: 'run' | 'skip') => {
    setIsProcessing(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/calendar/schedules/${id}/resolve-missed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'x-csrf-token': csrfToken } : {})
        },
        body: JSON.stringify({ action })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal menyelesaikan review (${res.status})`);
      }
      setActionMessage(`Missed run diselesaikan dengan aksi: ${action}`);
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyelesaikan review missed run');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (schedule: CalendarSchedule) => {
    if (!window.confirm(`Hapus jadwal "${schedule.name}"? Job Hermes terkait ikut dihapus.`)) return;
    setIsProcessing(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/calendar/schedules/${schedule.id}`, {
        method: 'DELETE',
        headers: csrfToken ? { 'x-csrf-token': csrfToken } : {}
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Gagal menghapus jadwal (${res.status})`);
      }
      if (selectedScheduleId === schedule.id) setSelectedScheduleId(null);
      setActionMessage('Jadwal dihapus');
      await fetchOverview();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus jadwal');
    } finally {
      setIsProcessing(false);
    }
  };

  const schedules = overview?.schedules ?? [];
  const filteredSchedules = schedules.filter((s) => {
    if (filterType === 'all') return true;
    return s.type === filterType;
  });

  const selectedSchedule = schedules.find((s) => s.id === selectedScheduleId);

  return (
    <div className="calendar-schedule-panel">
      <div className="ui-toolbar">
        <div>
          <span className="ui-overline">Zona waktu Asia/Jakarta (WIB)</span>
          <p className="ui-meta">Waktu server: {formatWib(overview?.currentTimeUtc ?? new Date().toISOString())}</p>
        </div>
        <div className="ui-actions">
          <button type="button" className="secondary-button" onClick={() => void fetchOverview()} disabled={loading || isProcessing}>
            Muat ulang
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => void handleCheckMissed()}
            disabled={loading || isProcessing}
            title="Cek keterlambatan run akibat server/laptop sempat mati"
          >
            Cek run terlewat
          </button>
        </div>
      </div>

      {overview && overview.pendingReviewCount > 0 && (
        <div className="ui-alert ui-alert--warn" role="status">
          <strong>Perhatian:</strong> {overview.pendingReviewCount} jadwal terlambat menunggu persetujuan review.
        </div>
      )}
      {error && <div className="ui-alert ui-alert--danger" role="alert">{error}</div>}
      {actionMessage && <div className="ui-alert ui-alert--success" role="status">{actionMessage}</div>}

      <div className="ui-tabs" role="toolbar" aria-label="Filter jenis jadwal">
        {[
          { id: 'all', label: 'Semua' },
          { id: 'hermes_cron', label: 'Hermes Agent' },
          { id: 'outbox_delivery', label: 'Pengiriman Outbox' },
          { id: 'app_job', label: 'Job Internal' }
        ].map((tab) => (
          <button key={tab.id} type="button" className="ui-tab" aria-pressed={filterType === tab.id} onClick={() => setFilterType(tab.id)}>
            {tab.label}
          </button>
        ))}
        <button type="button" className="secondary-button ui-tabs-end" aria-expanded={isCreating} onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? 'Tutup form' : '+ Tambah jadwal'}
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateSchedule} className="ui-card ui-form">
          <h4 className="ui-card-title">Jadwal otomasi baru</h4>
          <div className="ui-field-grid">
            <label>
              Nama jadwal
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="cth: Briefing pagi Hermes" required />
            </label>
            <label>
              Tipe jadwal
              <select
                value={scheduleType}
                onChange={(e) => {
                  const val = e.target.value as 'hermes_cron' | 'app_job';
                  setScheduleType(val);
                  if (val === 'app_job') setActor('system');
                  else setActor('hermes');
                }}
              >
                <option value="hermes_cron">Hermes Agent (cron)</option>
                <option value="app_job">App Internal Job</option>
              </select>
            </label>
            <label>
              Aktor pelaksana
              <select value={actor} onChange={(e) => setActor(e.target.value as ScheduleActor)}>
                <option value="hermes">hermes (AI Agent)</option>
                <option value="admin">admin (Staf Administrasi)</option>
                <option value="communication">communication (WhatsApp/Outbox)</option>
                <option value="system">system (Automated worker)</option>
              </select>
            </label>
            <label>
              Aturan jadwal (WIB)
              <input type="text" value={scheduleRule} onChange={(e) => setScheduleRule(e.target.value)} placeholder="daily 09:00 atau every 1h" required />
            </label>
            {scheduleType === 'hermes_cron' && (
              <label className="ui-span-all">
                Instruksi untuk Hermes
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Prompt yang dieksekusi Hermes pada tiap putaran jadwal..." rows={3} />
              </label>
            )}
            <label className="ui-span-all">
              Efek samping
              <input type="text" value={effects} onChange={(e) => setEffects(e.target.value)} placeholder="cth: Kirim rekapitulasi ke WhatsApp owner" required />
            </label>
            <label>
              Batas budget (IDR)
              <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </label>
            <label>
              Estimasi biaya per run
              <input type="number" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
            </label>
            <label className="ui-span-all">
              Jika run terlewat
              <select value={missedRunPolicy} onChange={(e) => setMissedRunPolicy(e.target.value as MissedRunPolicy)}>
                <option value="review">Review (minta persetujuan)</option>
                <option value="skip">Skip (lewati ke jadwal berikutnya)</option>
                <option value="catch_up">Catch up (jalankan langsung)</option>
              </select>
            </label>
          </div>
          <div className="ui-actions ui-actions--end">
            <button type="button" className="secondary-button" onClick={() => setIsCreating(false)}>Batal</button>
            <button type="submit" className="primary-button" disabled={isProcessing}>{isProcessing ? 'Menyimpan…' : 'Simpan jadwal'}</button>
          </div>
        </form>
      )}

      <section className="ui-stack" aria-labelledby="cal-schedules-title">
        <h4 id="cal-schedules-title" className="ui-section-label">Daftar jadwal <span>{filteredSchedules.length}</span></h4>
        {loading && <p className="ui-meta" role="status">Memuat daftar jadwal…</p>}
        {!loading && filteredSchedules.length === 0 && <p className="ui-empty">Belum ada jadwal pada kategori ini.</p>}

        {filteredSchedules.map((schedule) => {
          const typeInfo = typeBadge(schedule.type);
          const statInfo = statusBadge(schedule.status);
          const isSelected = selectedScheduleId === schedule.id;
          return (
            <article key={schedule.id} className={`ui-card cal-card${isSelected ? ' is-selected' : ''}`}>
              <button type="button" className="cal-card-head" aria-expanded={isSelected} onClick={() => setSelectedScheduleId(isSelected ? null : schedule.id)}>
                <span className="cal-card-title">
                  <strong>{schedule.name}</strong>
                  <span className={`ui-badge ui-badge--${typeInfo.tone}`}>{typeInfo.label}</span>
                  <span className="ui-badge">Aktor: {schedule.actor}</span>
                </span>
                <span className={`ui-badge ui-badge--${statInfo.tone}`}>{statInfo.label}</span>
                <span className="ui-meta cal-card-sub">
                  Pola <code>{schedule.schedule}</code> · Berikutnya {formatWib(schedule.nextRunAt)}
                </span>
              </button>
              <div className="ui-meta cal-card-meta">
                <span>Efek: {schedule.effects}</span>
                <span>
                  Estimasi Rp {schedule.estimatedCost.toLocaleString('id-ID')}
                  {schedule.budget ? ` / maks Rp ${schedule.budget.toLocaleString('id-ID')}` : ''}
                </span>
              </div>
              {schedule.status === 'paused' && schedule.pausedReason && (
                <div className="ui-alert ui-alert--warn ui-alert--compact">Alasan jeda: {schedule.pausedReason}</div>
              )}
              <div className="ui-actions">
                {schedule.status === 'review' ? (
                  <>
                    <button type="button" className="primary-button" disabled={isProcessing} onClick={() => void handleResolveMissed(schedule.id, 'run')}>
                      Jalankan sekarang
                    </button>
                    <button type="button" className="secondary-button" disabled={isProcessing} onClick={() => void handleResolveMissed(schedule.id, 'skip')}>
                      Lewati
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="secondary-button" disabled={isProcessing} onClick={() => void handleRunNow(schedule.id)} title="Paksa jalankan sekarang">
                      Jalankan sekarang
                    </button>
                    {schedule.status === 'active' ? (
                      <span className="cal-pause">
                        <input
                          type="text"
                          aria-label={`Alasan jeda ${schedule.name}`}
                          placeholder="Alasan jeda…"
                          value={pauseReasonInput[schedule.id] ?? ''}
                          onChange={(e) => setPauseReasonInput({ ...pauseReasonInput, [schedule.id]: e.target.value })}
                        />
                        <button type="button" className="secondary-button" disabled={isProcessing} onClick={() => void handlePause(schedule.id)}>
                          Jeda
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="secondary-button" disabled={isProcessing} onClick={() => void handleResume(schedule.id)}>
                        Lanjutkan
                      </button>
                    )}
                  </>
                )}
                <button type="button" className="text-button ui-danger-text" disabled={isProcessing} onClick={() => void handleDelete(schedule)}>
                  Hapus
                </button>
              </div>
              {isSelected && (
                <dl className="cal-detail">
                  <div><dt>ID</dt><dd><code>{schedule.id}</code></dd></div>
                  <div><dt>Jika terlewat</dt><dd>{schedule.missedRunPolicy}</dd></div>
                  <div><dt>Batas concurrency</dt><dd>{schedule.maxConcurrency}</dd></div>
                  <div><dt>Timeout</dt><dd>{schedule.timeoutMs / 1000} detik</dd></div>
                  <div><dt>Terakhir dijalankan</dt><dd>{formatWib(schedule.lastRunAt)}</dd></div>
                  <div><dt>Diperbarui</dt><dd>{formatWib(schedule.updatedAt)}</dd></div>
                  {schedule.prompt && <div className="ui-span-all"><dt>Prompt</dt><dd><pre className="ui-code">{schedule.prompt}</pre></dd></div>}
                </dl>
              )}
            </article>
          );
        })}
      </section>

      <section className="ui-stack" aria-labelledby="cal-runs-title">
        <h4 id="cal-runs-title" className="ui-section-label">Riwayat eksekusi terbaru <span>{overview?.recentRuns.length ?? 0}</span></h4>
        {(!overview || overview.recentRuns.length === 0) && <p className="ui-empty">Belum ada catatan eksekusi run.</p>}
        {overview?.recentRuns.map((run: CalendarRunRecord) => {
          const statInfo = statusBadge(run.status);
          return (
            <article key={run.id} className="ui-card ui-card--compact">
              <div className="ui-row">
                <strong>{run.scheduleName}</strong>
                <span className={`ui-badge ui-badge--${statInfo.tone}`}>{statInfo.label}</span>
              </div>
              <div className="ui-row ui-meta">
                <span>Mulai {formatWib(run.startedAt)}</span>
                <span>Durasi {run.durationMs} ms</span>
              </div>
              <p className="cal-run-summary">{run.summary}</p>
              {run.errorReason && <div className="ui-alert ui-alert--danger ui-alert--compact">Alasan gagal: {run.errorReason}</div>}
              {run.fencingToken && <small className="ui-meta">Token: {run.fencingToken}</small>}
            </article>
          );
        })}
      </section>
    </div>
  );
}
