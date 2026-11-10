import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { officeBusinessEventSchema, officeStatusEventSchema, officeStaffSnapshotSchema, type OfficeStaffSnapshot, type ServicesHealthResponse } from '@synectra/contracts';
import type { ActorId, ActorUiState, OfficeSceneManager, Pose, StaffId } from './scene-manager-3d';
import { LifeIcon, Portrait, SimPanel } from './LifeHud';
import type { Destination } from './office-navigation';
import { officeObjects, team, expansionRooms, type OfficeObjectId } from './office-data';
import { tabletApps } from './tablet-apps';
import type { OfficeStatus, OfficeStatusEvent, OfficeStatusSnapshot, PerformanceMetrics, WorkState, AvatarCustomization, AtmosphereCycle, AudioPreference, HairStyle, OutfitStyle, Accessory } from './types';
import { StatusStore } from './status-store';
import { eventStatus } from './event-status';
import { getStoredAvatar, setStoredAvatar, getStoredAtmosphere, setStoredAtmosphere, getStoredAudioPreference, setStoredAudioPreference, DEFAULT_AVATAR } from './avatar-storage';
import { OfficeAudioEngine } from './office-audio';
import './office.css';
import './redesign.css';
import './tablet-ui.css';
import './life-ui.css';

type IconName = 'home' | 'note' | 'board' | 'calendar' | 'plus' | 'minus' | 'reset' | 'sun' | 'moon' | 'sunset' | 'pause' | 'play' | 'expand' | 'close' | 'focus' | 'coffee' | 'sofa' | 'help' | 'settings' | 'arrow' | 'volume' | 'mute' | 'user' | 'waves' | 'grid' | 'signature' | 'payment';
function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7M5 9v11h14V9" /><path d="M9 20v-7h6v7" /></>,
    note: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6" /></>,
    board: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16M6 8v4M12 8v7M18 8v2" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 10h18M7 14h2M12 14h2M7 17h2" /></>,
    plus: <path d="M12 5v14M5 12h14" />, minus: <path d="M5 12h14" />,
    reset: <><path d="M4 10a8 8 0 1 1 1 8M4 4v6h6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
    sunset: <><path d="M12 10v4M4.93 10.93l2.83 2.83M19.07 10.93l-2.83 2.83M2 18h20" /><path d="M7 18a5 5 0 0 1 10 0" /></>,
    moon: <path d="M20 14A8.5 8.5 0 0 1 10 4 8.5 8.5 0 1 0 20 14Z" />,
    pause: <path d="M8 5v14M16 5v14" />, play: <path d="m8 4 11 8-11 8z" />,
    expand: <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    focus: <><circle cx="12" cy="12" r="5" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></>,
    coffee: <><path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 9h2a3 3 0 0 1 0 6h-2M7 3v2M12 3v2" /></>,
    sofa: <><path d="M5 12V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5M5 19v2M19 19v2" /><path d="M3 11h3v4h12v-4h3v8H3z" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01" /></>,
    settings: <><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    volume: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" /></>,
    mute: <><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    waves: <path d="M2 12c2.5-3 5.5-3 8 0 2.5 3 5.5 3 8 0M2 16c2.5-3 5.5-3 8 0 2.5 3 5.5 3 8 0" />,
    grid: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>,
    signature: <><path d="M4 20h16M5 16l2.5-.5L18 5l-2-2L5.5 13.5zM13.5 5.5l2 2" /></>,
    payment: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>,
  };
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function initialPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem('synectra.office.visuals') ?? '{}');
    return { quiet: value?.quiet === true, economy: value?.economy === true, daylight: value?.daylight === true };
  } catch { return { quiet: false, economy: false, daylight: false }; }
}

type OfficePanels = {
  boardPanel?: ReactNode;
  adminPanel?: ReactNode;
  printerPanel?: ReactNode;
  archivePanel?: ReactNode;
  communicationPanel?: ReactNode;
  hermesPanel?: ReactNode;
  calendarPanel?: ReactNode;
  signaturePanel?: ReactNode;
  dashboardPanel?: ReactNode;
  paymentPanel?: ReactNode;
};

export function OfficeSpikeView({ serverHealth, whatsappStatus, businessActivity, boardPanel, adminPanel, printerPanel, archivePanel, communicationPanel, hermesPanel, calendarPanel, signaturePanel, dashboardPanel, paymentPanel, userEmail, onLogout }: { serverHealth: string; whatsappStatus: string; businessActivity?: string; userEmail?: string; onLogout?: () => void } & OfficePanels) {
  const containerRef = useRef<HTMLDivElement>(null);
  const managerRef = useRef<OfficeSceneManager | null>(null);
  const labelRefs = useRef(new Map<OfficeObjectId, HTMLButtonElement>());
  const drawerTitle = useRef<HTMLHeadingElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const helpRef = useRef<HTMLDialogElement>(null);
  const healthDialogRef = useRef<HTMLDialogElement>(null);
  const avatarDialogRef = useRef<HTMLDialogElement>(null);
  const expansionDialogRef = useRef<HTMLDialogElement>(null);
  const audioEngineRef = useRef<OfficeAudioEngine | null>(null);

  const [servicesHealth, setServicesHealth] = useState<ServicesHealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [selected, setSelected] = useState<OfficeObjectId | 'signature' | 'dashboard' | 'payments' | 'home' | null>(null);
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [avatar, setAvatar] = useState<AvatarCustomization>(() => getStoredAvatar());
  const [atmosphere, setAtmosphere] = useState<AtmosphereCycle>(() => getStoredAtmosphere());
  const [audioPref, setAudioPref] = useState<AudioPreference>(() => getStoredAudioPreference());
  const [activity, setActivity] = useState<string | null>(null);
  const [decorativeActivity, setDecorativeActivity] = useState('Berada di ruang pemilik');
  const [workState, setWorkState] = useState<WorkState>('available');
  const [heartbeatAt, setHeartbeatAt] = useState(0);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [roomFilter, setRoomFilter] = useState('all');
  const [staffPoses, setStaffPoses] = useState<Record<StaffId, Pose>>({ hermes: 'sit', admin: 'sit', communication: 'sit' });
  const [staffEvents, setStaffEvents] = useState<Partial<Record<StaffId, string>>>({});
  const [staffSnapshot, setStaffSnapshot] = useState<OfficeStaffSnapshot | null>(null);
  const [actorStates, setActorStates] = useState<Record<ActorId, ActorUiState> | null>(null);
  const [portraits, setPortraits] = useState<Partial<Record<ActorId, string>>>({});
  const [focusedActor, setFocusedActor] = useState<ActorId | null>(null);
  const [following, setFollowing] = useState(false);
  const [feed, setFeed] = useState<Array<{ id: string; text: string; tone: 'success' | 'fail'; who: StaffId; at: number }>>([]);
  const worldSelect = useRef<(id: OfficeObjectId) => void>(() => undefined);
  const staffEventTimers = useRef<Partial<Record<StaffId, number>>>({});
  const [now, setNow] = useState(() => new Date());
  const statusStoreRef = useRef(new StatusStore());
  const quiet = reducedMotion || preferences.quiet;
  const stale = now.getTime() - heartbeatAt >= 120000;
  const displayedWorkState: WorkState = serverHealth === 'Tidak tersedia' ? 'offline' : stale ? 'stale' : workState;
  const workStateLabel: Record<WorkState, string> = { working: 'Bekerja', available: 'Tersedia', away: 'Jeda', stale: 'Tidak diperbarui', offline: 'Offline' };
  const visibleActivity = serverHealth === 'Tidak tersedia' ? 'Server tidak tersedia' : businessActivity ?? activity ?? decorativeActivity;
  const whatsappLabel = whatsappStatus === 'connected' ? 'terhubung' : whatsappStatus === 'checking' ? 'sedang diperiksa' : whatsappStatus === 'unavailable' || whatsappStatus === 'error' ? 'status tidak tersedia' : whatsappStatus === 'connecting' || whatsappStatus === 'reconnecting' ? 'menghubungkan' : whatsappStatus === 'pairing' ? 'menunggu pemindaian' : 'belum terhubung';

  const select = useCallback((id: OfficeObjectId | 'signature' | 'dashboard' | 'payments' | 'home') => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && !active.closest('.office-drawer')) returnFocus.current = active;
    setSelected(id);
    managerRef.current?.select(id === 'signature' || id === 'dashboard' || id === 'payments' || id === 'home' ? undefined : id);
  }, []);
  const close = useCallback(() => {
    setSelected(null);
    managerRef.current?.select();
    returnFocus.current?.focus();
  }, []);

  const fetchServicesHealth = useCallback(() => {
    setHealthLoading(true);
    fetch('/health/services')
      .then(async (res) => {
        if (!res.ok) throw new Error('Gagal memuat status layanan');
        return res.json() as Promise<ServicesHealthResponse>;
      })
      .then((data) => setServicesHealth(data))
      .catch(() => {
        // jika gagal, pertahankan status sebelumnya atau biarkan null
      })
      .finally(() => setHealthLoading(false));
  }, []);

  useEffect(() => {
    fetchServicesHealth();
    const timer = setInterval(fetchServicesHealth, 30000);
    return () => clearInterval(timer);
  }, [fetchServicesHealth]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    let cancelled = false;
    let manager: OfficeSceneManager | undefined;
    setError(null);
    setLoaded(false);
    void import('./scene-manager-3d').then(async ({ OfficeSceneManager }) => {
      if (cancelled) return;
      manager = new OfficeSceneManager(container, {
        onSelect: id => worldSelect.current(id), onMetrics: setMetrics,
        onStaffState: setActorStates,
        onPortraits: next => setPortraits(current => ({ ...current, ...next })),
        onActivity: (message, isMoving) => { setDecorativeActivity(message); setMoving(isMoving); },
        onStatus: (status: OfficeStatus) => setDecorativeActivity(status.activity),
        onError: setError,
      });
      managerRef.current = manager;
      for (const [id, element] of labelRefs.current) manager.attachLabel(id, element);
      await manager.ready;
      if (!cancelled) {
        manager.setQuiet(quiet);
        manager.setQuality(preferences.economy);
        manager.setAtmosphere(atmosphere);
        manager.setAvatar(avatar);
        setLoaded(true);
      }
    }).catch(() => {
      manager?.dispose();
      if (!cancelled) setError('Tampilan kantor tidak dapat dimuat. Menu ruangan dan panel tetap dapat digunakan.');
    });
    return () => { cancelled = true; manager?.dispose(); managerRef.current = null; };
  }, [generation, select]);

  useEffect(() => {
    let source: EventSource | undefined;
    let reconnectTimer: number | undefined;
    let closed = false;
    let latestSequence = -1;
    let staffRevision = -1;
    const applySnapshotStatus = (snapshots: OfficeStatusSnapshot[]) => {
      const latest = snapshots.reduce<OfficeStatusSnapshot | null>((best, item) => !best || item.sequence > best.sequence ? item : best, null);
      if (!latest || latest.sequence < latestSequence) return;
      latestSequence = latest.sequence;
      statusStoreRef.current.applySnapshot(latest);
      setWorkState(latest.status.workState);
      setHeartbeatAt(latest.status.heartbeatAt);
      setActivity(latest.status.activity);
    };
    const fetchSnapshot = () => fetch('/api/office/snapshot').then(response => response.ok ? response.json() : null).then(payload => {
      applySnapshotStatus((payload?.snapshots ?? []) as OfficeStatusSnapshot[]);
    }).catch(() => undefined);
    const apply = (event: MessageEvent<string>) => {
      try {
        const raw: unknown = JSON.parse(event.data);
        const business = officeBusinessEventSchema.safeParse(raw);
        const ordinary = officeStatusEventSchema.safeParse(raw);
        if (!business.success && !ordinary.success) return;
        const record = business.success ? business.data : ordinary.success ? ordinary.data : null;
        if (!record) return;
        const status = eventStatus(record);
        const value: OfficeStatusEvent = { ownerId: record.ownerId, eventId: record.eventId, sequence: record.sequence, occurredAt: record.occurredAt, status };
        if (!statusStoreRef.current.applyEvent(value)) return;
        latestSequence = Math.max(latestSequence, value.sequence);
        setWorkState(status.workState);
        setHeartbeatAt(status.heartbeatAt);
        setActivity(status.activity);
        if (business.success) {
          const id: StaffId | null = business.data.type === 'pdf_generated' ? 'admin' : business.data.type === 'delivery_sent' || business.data.type === 'delivery_failed' || business.data.type === 'delivery_receipt' ? 'communication' : business.data.type === 'app_job_completed' ? 'hermes' : null;
          if (id) {
            const outcome: 'success' | 'fail' = business.data.type === 'delivery_failed' ? 'fail' : 'success';
            managerRef.current?.reactToEvent(id, outcome);
            setFeed(current => [{ id: record.eventId, text: status.activity, tone: outcome, who: id, at: Date.now() }, ...current].slice(0, 4));
            setStaffEvents(current => ({ ...current, [id]: status.activity }));
            clearTimeout(staffEventTimers.current[id]);
            staffEventTimers.current[id] = window.setTimeout(() => setStaffEvents(current => ({ ...current, [id]: undefined })), 8000);
          }
        }
      } catch { /* Ignore malformed stream records. */ }
    };
    const connect = () => {
      if (closed) return;
      source = new EventSource('/api/office/events');
      source.onopen = () => { staffRevision = -1; void fetchSnapshot(); };
      source.onmessage = apply;
      source.addEventListener('staff', (event: MessageEvent<string>) => {
        try {
          const parsed = officeStaffSnapshotSchema.safeParse(JSON.parse(event.data));
          if (!parsed.success || parsed.data.revision < staffRevision) return;
          staffRevision = parsed.data.revision;
          setStaffSnapshot(parsed.data);
          setStaffPoses(current => {
            const next = { ...current };
            for (const id of ['hermes', 'admin', 'communication'] as StaffId[]) if (parsed.data.staff[id].active) next[id] = 'sit';
            return next;
          });
        } catch { /* Ignore malformed activity records. */ }
      });
      source.addEventListener('heartbeat', (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data);
          if (typeof data.heartbeatAt === 'number') setHeartbeatAt(data.heartbeatAt);
        } catch { /* Ignore malformed heartbeat. */ }
      });
      source.onerror = () => {
        setStaffSnapshot(null);
        source?.close();
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        void fetchSnapshot().finally(() => {
          if (!closed) reconnectTimer = window.setTimeout(connect, 3000);
        });
      };
    };
    const onVisible = () => {
      if (!document.hidden) void fetchSnapshot();
    };
    void fetchSnapshot();
    connect();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      source?.close();
      document.removeEventListener('visibilitychange', onVisible);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      Object.values(staffEventTimers.current).forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReducedMotion(query.matches);
    query.addEventListener('change', change);
    const interval = window.setInterval(() => setNow(new Date()), 30000);
    return () => { query.removeEventListener('change', change); clearInterval(interval); };
  }, []);
  useEffect(() => { managerRef.current?.setQuiet(quiet); }, [quiet, loaded, generation]);
  useEffect(() => {
    for (const id of ['hermes', 'admin', 'communication'] as StaffId[]) { const staff = staffSnapshot?.staff[id]; managerRef.current?.setStaffActivity(id, staff?.active ? staff.activity : null); }
  }, [staffSnapshot, loaded, generation]);
  useEffect(() => { managerRef.current?.setWorkState(displayedWorkState); }, [displayedWorkState, loaded, generation]);
  useEffect(() => { managerRef.current?.setQuality(preferences.economy); }, [preferences.economy, loaded, generation]);
  useEffect(() => { managerRef.current?.setDaylight(preferences.daylight); }, [preferences.daylight, loaded, generation]);
  useEffect(() => {
    managerRef.current?.setAtmosphere(atmosphere);
    setStoredAtmosphere(atmosphere);
  }, [atmosphere, loaded, generation]);
  useEffect(() => {
    managerRef.current?.setAvatar(avatar);
    setStoredAvatar(avatar);
  }, [avatar, loaded, generation]);
  useEffect(() => {
    const engine = new OfficeAudioEngine(audioPref);
    audioEngineRef.current = engine;
    return () => {
      engine.dispose();
      audioEngineRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (audioEngineRef.current) {
      audioEngineRef.current.setEnabled(audioPref.enabled);
      audioEngineRef.current.setQuiet(quiet);
      audioEngineRef.current.setAtmosphere(atmosphere);
    }
  }, [audioPref.enabled, quiet, atmosphere]);
  useEffect(() => {
    for (const [id, pose] of Object.entries(staffPoses) as [StaffId, Pose][]) managerRef.current?.setStaffPose(id, pose);
  }, [staffPoses, loaded, generation]);
  useEffect(() => {
    if (!feed.length) return;
    const timer = window.setTimeout(() => setFeed(current => current.filter(item => Date.now() - item.at < 12000)), 12500);
    return () => clearTimeout(timer);
  }, [feed]);
  useEffect(() => {
    try { localStorage.setItem('synectra.office.visuals', JSON.stringify(preferences)); } catch { /* Storage may be unavailable in private browser sessions. */ }
  }, [preferences]);
  useEffect(() => {
    if (selected) return;
    const openTablet = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
      if (document.querySelector('dialog[open]')) return;
      const target = event.target;
      if (target !== document.body && !(target instanceof HTMLCanvasElement && containerRef.current?.contains(target))) return;
      event.preventDefault();
      select('home');
    };
    window.addEventListener('keydown', openTablet);
    return () => window.removeEventListener('keydown', openTablet);
  }, [selected, select]);
  useEffect(() => {
    if (!selected) return;
    drawerTitle.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first || !drawerRef.current.contains(document.activeElement)) {
            last.focus();
            event.preventDefault();
          }
        } else {
          if (document.activeElement === last || !drawerRef.current.contains(document.activeElement)) {
            first.focus();
            event.preventDefault();
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selected, close]);

  const focusRoom = (id: string) => {
    setRoomFilter(id);
    if (id === 'all') managerRef.current?.resetView();
    else managerRef.current?.focus(id as OfficeObjectId);
  };
  const visit = (destination: Destination) => { managerRef.current?.visit(destination); };
  const cycleAtmosphere = () => {
    setAtmosphere(prev => {
      const next: AtmosphereCycle = prev === 'day' ? 'sunset' : prev === 'sunset' ? 'night' : 'day';
      setPreferences(p => ({ ...p, daylight: next === 'day' }));
      return next;
    });
  };
  const toggleAudio = () => {
    setAudioPref(prev => {
      const next = { ...prev, enabled: !prev.enabled };
      setStoredAudioPreference(next);
      if (audioEngineRef.current) {
        audioEngineRef.current.setEnabled(next.enabled);
        if (next.enabled) audioEngineRef.current.playClick();
      }
      return next;
    });
  };
  const setStaffPose = (id: StaffId, pose: Pose) => {
    managerRef.current?.setStaffPose(id, pose);
    setStaffPoses(value => ({ ...value, [id]: pose }));
  };
  const fullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { setDecorativeActivity('Layar penuh browser tidak tersedia; kantor tetap memenuhi halaman.'); }
  };
  const activeNav = selected === 'admin' || selected === 'printer' || selected === 'archive' || selected === 'signature' || selected === 'dashboard' || selected === 'payments' ? 'Nota' : selected === 'board' ? 'Kanban' : selected === 'calendar' ? 'Jadwal' : 'Kantor';
  const activeApp = tabletApps.find(app => app.id === selected);
  const detail = selected === 'home' ? { name: 'Layar utama', role: 'Synectra Office', description: '' } : selected === 'signature' ? { name: 'Tanda tangan', role: 'Dokumen & PDF', description: 'Buat dan simpan tanda tangan untuk nota PDF.' } : selected === 'dashboard' ? { name: 'Dashboard', role: 'Keuangan', description: 'Pantau tagihan dan pembayaran klien.' } : selected === 'payments' ? { name: 'Pembayaran', role: 'Keuangan', description: 'Kelola tagihan, DP, termin, dan pelunasan.' } : selected ? officeObjects[selected] : null;
  const memberIndex = team.findIndex(member => member.id === selected);
  const focusActor = (id: ActorId | null) => {
    setFocusedActor(id); managerRef.current?.select(id ?? undefined);
    if (!id) { setFollowing(false); managerRef.current?.follow(null); } else managerRef.current?.focus(id);
  };
  // Klik karakter membuka panel karakter (seperti game life-sim); klik objek langsung membuka tablet.
  worldSelect.current = (id: OfficeObjectId) => { if (team.some(member => member.id === id)) focusActor(id as ActorId); else select(id); };

  return <main className="office-app">
    <div className={`office-workspace${selected ? ' has-drawer' : ''}`}>
      <section className="office-stage" aria-label="Kantor interaktif">
        <header className="hud-lot" aria-label="Info kantor">
          <div className="hud-lot-main">
            <span className="hud-lot-name"><span className="status-dot" />Synectra Office</span>
            <span className="hud-clock">{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false }).format(now).replace('.', ':')}<small>WIB</small></span>
            <span className="hud-date">{new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'short' }).format(now)}</span>
          </div>
          <div className="hud-lot-status">
            <span className={`hud-chip state-${displayedWorkState}`} title="Status kerja pemilik dari server"><i aria-hidden="true" />{workStateLabel[displayedWorkState]}</span>
            <span className="hud-chip"><Icon name={atmosphere === 'day' ? 'sun' : atmosphere === 'sunset' ? 'sunset' : 'moon'} />{atmosphere === 'day' ? 'Siang' : atmosphere === 'sunset' ? 'Sore' : 'Malam'}</span>
          </div>
          <p className="hud-lot-activity" role="status">{quiet ? 'Mode tenang · animasi dijeda' : visibleActivity}</p>
        </header>
        {/* Office viewport */}
        <div className="office-canvas" ref={containerRef}>
          {loaded && !error && (Object.entries(officeObjects) as [OfficeObjectId, typeof officeObjects[OfficeObjectId]][]).map(([id, object]) => {
            const member = team.findIndex(person => person.id === id);
            const staffStatus = member >= 0 && id !== 'reception' ? staffSnapshot?.staff[id as StaffId] : undefined;
            const statusText = staffStatus ? staffStatus.active ? `Bekerja: ${staffStatus.activity}` : 'Idle' : 'Status belum tersedia';
            const life = member >= 0 ? actorStates?.[id as ActorId] : undefined;
            return <button key={id} ref={element => {
              if (element) labelRefs.current.set(id, element); else labelRefs.current.delete(id);
              managerRef.current?.attachLabel(id, element);
            }} className={`object-label ${member >= 0 ? 'person-label' : 'prop-label'}${life?.intent.real || staffStatus?.active ? ' is-working' : ''}${selected === id || focusedActor === id ? ' selected' : ''}`} onClick={() => worldSelect.current(id)} aria-label={`Buka ${object.name}${member >= 0 && id !== 'reception' ? `, ${statusText}` : ''}`} title={object.name}>
              {member >= 0 ? <><span className="label-bubble" aria-hidden="true">{life ? <LifeIcon name={life.moving ? 'stretch' : life.intent.icon} /> : null}<span>{staffStatus ? statusText : life ? (life.moving ? `Menuju: ${life.intent.label}` : life.intent.label) : member === 3 ? decorativeActivity : statusText}</span></span><Portrait index={member} src={portraits[id as ActorId]} /><span>{object.name}</span><span className="label-dot" /></> : <><Icon name={id === 'coffee' ? 'coffee' : id === 'lounge' ? 'sofa' : id === 'board' ? 'board' : id === 'calendar' ? 'calendar' : id === 'terrace' ? 'waves' : 'note'} /><span>{object.name}</span></>}
            </button>;
          })}
        </div>
        {!loaded && !error && <div className="scene-message" role="status"><span className="loader" />Menyiapkan kantor Anda…</div>}
        {error && (
          <div className="scene-message fallback-panel" role="alert">
            <Icon name="home" />
            <h2>Kantor tetap terbuka</h2>
            <p>{error}</p>
            <div className="fallback-status">
              <span>{serverHealth === 'Aktif' ? 'Server aktif' : 'Server tidak tersedia'}</span>
              <span>WhatsApp {whatsappLabel}</span>
              <span>{workStateLabel[displayedWorkState]}</span>
              <span>{visibleActivity}</span>
            </div>
            <div className="fallback-actions" aria-label="Aksi bisnis langsung">
              <button type="button" className="secondary-button" onClick={() => select('admin')}>
                <Icon name="note" />Nota &amp; Transaksi
              </button>
              <button type="button" className="secondary-button" onClick={() => select('board')}>
                <Icon name="board" />Papan Kanban
              </button>
              <button type="button" className="secondary-button" onClick={() => select('communication')}>
                <Icon name="arrow" />WhatsApp &amp; Chat
              </button>
              <button type="button" className="secondary-button" onClick={() => select('calendar')}>
                <Icon name="calendar" />Jadwal &amp; Cron
              </button>
              <button type="button" className="secondary-button" onClick={() => select('archive')}>
                <Icon name="home" />Arsip Nota
              </button>
              <button type="button" className="secondary-button" onClick={() => select('printer')}>
                <Icon name="note" />Antrean Cetak
              </button>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setGeneration(value => value + 1);
                setMoving(false);
                setDecorativeActivity('Berada di ruang pemilik');
              }}
            >
              <Icon name="reset" />Muat ulang kanvas visual
            </button>
            <div className="fallback-rooms" aria-label="Daftar ruangan">
              {(Object.keys(officeObjects) as OfficeObjectId[]).map(id => (
                <button key={id} type="button" onClick={() => select(id)}>
                  {officeObjects[id].name}
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="button" className="open-tablet" onClick={() => select('home')}><Icon name="grid" />Buka tablet</button>

        <nav className="hud-toolbar" aria-label="Kontrol kantor">
          <button type="button" className="hud-round" onClick={cycleAtmosphere} aria-label={`Ganti suasana (${atmosphere === 'day' ? 'Siang' : atmosphere === 'sunset' ? 'Sore' : 'Malam'})`} title={`Suasana: ${atmosphere === 'day' ? 'Siang' : atmosphere === 'sunset' ? 'Sore' : 'Malam'}`}><Icon name={atmosphere === 'day' ? 'sun' : atmosphere === 'sunset' ? 'sunset' : 'moon'} /></button>
          <button type="button" className={`hud-round${audioPref.enabled ? ' active' : ''}`} onClick={toggleAudio} aria-label={audioPref.enabled ? 'Matikan audio kantor' : 'Aktifkan audio kantor (Web Audio)'} aria-pressed={audioPref.enabled} title={audioPref.enabled ? 'Audio sintetis aktif' : 'Audio sintetis senyap'}><Icon name={audioPref.enabled ? 'volume' : 'mute'} /></button>
          <button type="button" className="hud-round" onClick={() => avatarDialogRef.current?.showModal()} aria-label="Kustomisasi avatar pemilik" title="Kustomisasi avatar"><Icon name="user" /></button>
          <button type="button" className="hud-round" onClick={() => expansionDialogRef.current?.showModal()} aria-label="Katalog ekspansi ruangan" title="Katalog ekspansi ruangan"><Icon name="grid" /></button>
          <button type="button" className={`hud-round${quiet ? ' active' : ''}`} disabled={reducedMotion} onClick={() => setPreferences(value => ({ ...value, quiet: !value.quiet }))} aria-label={quiet ? 'Lanjutkan animasi' : 'Aktifkan mode tenang'} aria-pressed={quiet} title={reducedMotion ? 'Mengikuti pengaturan reduced motion perangkat' : 'Mode tenang'}><Icon name={quiet ? 'play' : 'pause'} /></button>
          <button type="button" className="hud-round" onClick={fullscreen} aria-label="Layar penuh" title="Layar penuh"><Icon name="expand" /></button>
          <button type="button" className="hud-round" onClick={() => helpRef.current?.showModal()} aria-label="Panduan kontrol" title="Panduan kontrol"><Icon name="help" /></button>
        </nav>

        <div className="hud-camera" aria-label="Kamera">
          <button type="button" className="hud-round" aria-label="Putar kamera ke kiri" title="Putar kiri (Q)" disabled={!loaded || !!error} onClick={() => managerRef.current?.rotate(-1)}><Icon name="reset" /></button>
          <button type="button" className="hud-round mirror" aria-label="Putar kamera ke kanan" title="Putar kanan (E)" disabled={!loaded || !!error} onClick={() => managerRef.current?.rotate(1)}><Icon name="reset" /></button>
          <span className="hud-divider" />
          <button type="button" className="hud-round" aria-label="Perbesar" title="Perbesar (+)" disabled={!loaded || !!error} onClick={() => managerRef.current?.zoom(1.2)}><Icon name="plus" /></button>
          <button type="button" className="hud-round" aria-label="Perkecil" title="Perkecil (−)" disabled={!loaded || !!error} onClick={() => managerRef.current?.zoom(1 / 1.2)}><Icon name="minus" /></button>
          <button type="button" className="hud-round" aria-label="Reset kamera" title="Reset kamera" disabled={!loaded || !!error} onClick={() => focusRoom('all')}><Icon name="focus" /></button>
          <label className="hud-jump"><span className="sr-only">Lompat ke ruangan</span>
            <select aria-label="Lompat ke ruangan" value={roomFilter} disabled={!loaded || !!error} onChange={event => focusRoom(event.target.value)}>
              {[['all', 'Seluruh lot'], ['reception', 'Ruang pemilik'], ['admin', 'Area kerja'], ['board', 'Ruang rapat'], ['coffee', 'Pantry'], ['lounge', 'Lounge'], ['terrace', 'Teras kolam']].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
        </div>

        <section className="hud-household" aria-label="Penghuni kantor">
          {team.map((member, index) => {
            const life = actorStates?.[member.id as ActorId];
            return <button key={member.id} type="button" className={`hud-member${focusedActor === member.id ? ' active' : ''}${life?.intent.real ? ' is-real' : ''}`} onClick={() => focusActor(focusedActor === member.id ? null : member.id as ActorId)} aria-pressed={focusedActor === member.id} aria-label={`${member.name}: ${life?.intent.label ?? member.role}`} title={`${member.name} · ${life?.intent.label ?? member.role}`}>
              <Portrait index={index} src={portraits[member.id as ActorId]} />
              <span className="hud-member-name">{member.name}</span>
            </button>;
          })}
        </section>

        {focusedActor && (() => {
          const index = team.findIndex(member => member.id === focusedActor);
          const member = team[index]!;
          const staff = focusedActor === 'reception' ? undefined : staffSnapshot?.staff[focusedActor];
          const realStatus = focusedActor === 'reception' ? `Status kerja: ${workStateLabel[displayedWorkState]}` : staff ? staff.active ? `Bekerja: ${staff.activity}` : actorStates?.[focusedActor]?.intent.real ? 'Operasi baru saja selesai di server' : 'Idle: tidak ada operasi berjalan' : 'Status operasi belum tersedia';
          return <SimPanel id={focusedActor} index={index} name={member.name} role={member.role} portrait={portraits[focusedActor]} state={actorStates?.[focusedActor]} realStatus={realStatus} work={staff}
            lastEvent={focusedActor === 'reception' ? undefined : staffEvents[focusedActor]} following={following}
            onClose={() => focusActor(null)} onOpen={() => select(focusedActor === 'reception' ? 'home' : focusedActor)}
            onFollow={() => { const next = !following; setFollowing(next); managerRef.current?.follow(next ? focusedActor : null); }}>
            {focusedActor === 'reception' ? <div className="sim-interactions" aria-label="Interaksi pemilik">
              <button type="button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('coffee')}><Icon name="coffee" />Ambil kopi</button>
              <button type="button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('lounge')}><Icon name="sofa" />Duduk di lounge</button>
              <button type="button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('terrace')}><Icon name="waves" />Ke teras kolam</button>
              <button type="button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('office')}><Icon name="home" />Kembali ke meja</button>
            </div> : <div className="sim-interactions" aria-label={`Interaksi ${member.name}`}>
              {([['drink', 'coffee', 'Istirahat kopi'], ['rest', 'sofa', 'Duduk di sofa'], ['sit', 'reset', 'Kembali otomatis']] as const).map(([pose, icon, label]) => <button key={pose} type="button" disabled={!loaded || !!error || staff?.active === true} aria-pressed={staffPoses[focusedActor] === pose} onClick={() => setStaffPose(focusedActor, pose)}><Icon name={icon} />{label}</button>)}
            </div>}
          </SimPanel>;
        })()}

        {feed.length > 0 && <ol className="hud-feed" aria-label="Notifikasi kantor" aria-live="polite">
          {feed.map(item => {
            const index = team.findIndex(member => member.id === item.who);
            return <li key={item.id} className={`feed-${item.tone}`}>
              <Portrait index={index} src={portraits[item.who]} />
              <div><strong>{team[index]?.name}</strong><span>{item.text}</span></div>
              <button type="button" aria-label="Tutup notifikasi" onClick={() => setFeed(current => current.filter(entry => entry.id !== item.id))}>×</button>
            </li>;
          })}
        </ol>}
      </section>

      {detail && selected && <aside ref={drawerRef} className="office-drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className={`tablet-screen${selected === 'home' ? ' is-home' : ''}`} data-app={activeApp?.id}>
        <div className="tablet-status"><span>{new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now).replace('.', ':')}</span><span>Synectra Office</span><button type="button" onClick={close} aria-label="Tutup tablet" title="Tutup tablet"><Icon name="close" /></button></div>
        <div className="tablet-content" key={selected}>
        {selected === 'home' ? <div className="tablet-home">
          <div className="tablet-home-widgets"><div className="tablet-clock"><h2 id="drawer-title" ref={drawerTitle} tabIndex={-1} aria-label="Layar utama">{new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now).replace('.', ':')}</h2><p>{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long' }).format(now)}</p></div><div className="tablet-status-widget"><strong>Kantor Anda</strong><span>{serverHealth === 'Aktif' ? 'Server aktif' : 'Server tidak tersedia'}</span><span>WhatsApp {whatsappLabel}</span></div></div>
          <div className="tablet-app-grid" aria-label="Aplikasi kantor">{tabletApps.map(item => <button key={item.id} type="button" onClick={() => select(item.id)}><span className={`tablet-app-icon app-${item.id}`}><Icon name={item.icon} /></span><span>{item.label}</span></button>)}</div>
        </div> : <>
        <div className="drawer-identity">{activeApp ? <span className={`tablet-app-icon app-${activeApp.id}`} aria-hidden="true"><Icon name={activeApp.icon} /></span> : memberIndex >= 0 ? <span className={`portrait portrait-large portrait-${memberIndex}`} /> : <div className="object-emblem"><Icon name={selected === 'coffee' ? 'coffee' : selected === 'lounge' ? 'sofa' : selected === 'calendar' ? 'calendar' : selected === 'board' ? 'board' : 'note'} /></div>}<span>{detail.role}</span><h2 id="drawer-title" ref={drawerTitle} tabIndex={-1}>{detail.name}</h2><p>{detail.description}</p></div>
        {selected === 'admin' && <div className="drawer-shortcuts" aria-label="Akses dokumen"><button type="button" onClick={() => select('dashboard')}>Dashboard <Icon name="arrow" /></button><button type="button" onClick={() => select('payments')}>Pembayaran <Icon name="arrow" /></button><button type="button" onClick={() => select('archive')}>Klien &amp; arsip <Icon name="arrow" /></button><button type="button" onClick={() => select('printer')}>Printer PDF <Icon name="arrow" /></button><button type="button" onClick={() => select('signature')}>Tanda tangan <Icon name="arrow" /></button></div>}
        {selected !== 'signature' && selected !== 'dashboard' && selected !== 'payments' && <button className="secondary-button focus-room-button" disabled={!loaded || !!error} onClick={() => { managerRef.current?.focus(selected); setRoomFilter(selected); }}><Icon name="focus" />Fokus ke ruangan</button>}
        {(selected === 'hermes' || selected === 'admin' || selected === 'communication') && <details className="drawer-section"><summary>Animasi karakter</summary><p className="small-note">Animasi otomatis mengikuti operasi terpantau. Pilihan manual tersedia saat tidak ada operasi aktif.</p><div className="visit-actions">{([['idle', 'Diam'], ['walk', 'Berjalan di tempat'], ['sit', 'Otomatis'], ['drink', 'Minum'], ['rest', 'Istirahat']] as const).map(([pose, label]) => <button key={pose} className="secondary-button" type="button" disabled={!loaded || !!error || staffSnapshot?.staff[selected].active === true} aria-pressed={staffPoses[selected] === pose} onClick={() => setStaffPose(selected, pose)}>{label}</button>)}</div></details>}
        {selected === 'dashboard' ? <div className="drawer-section">{dashboardPanel}</div> : selected === 'payments' ? <div className="drawer-section">{paymentPanel}</div> : selected === 'signature' ? <div className="drawer-section">{signaturePanel}</div> : selected === 'communication' ? <div className="communications-panel">{communicationPanel}</div> : selected === 'admin' ? <div className="drawer-section">{userEmail && <div className="drawer-account"><span>{userEmail}</span>{onLogout && <button className="text-button" onClick={onLogout}>Keluar</button>}</div>}{adminPanel}</div> : selected === 'printer' ? <div className="drawer-section">{printerPanel}</div> : selected === 'archive' ? <div className="drawer-section">{archivePanel}</div> : selected === 'coffee' || selected === 'lounge' || selected === 'reception' ? <div className="drawer-section"><span className="eyebrow">Jeda kecil, ide baru</span><h3>Nikmati suasananya</h3><p>Gerakan pemilik hanya aktivitas visual dan tidak menjalankan pekerjaan bisnis.</p><div className="visit-actions"><button className="secondary-button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('coffee')}><Icon name="coffee" />Ambil kopi<Icon name="arrow" /></button><button className="secondary-button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('lounge')}><Icon name="sofa" />Duduk di lounge<Icon name="arrow" /></button><button className="secondary-button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('terrace')}><Icon name="waves" />Ke teras kolam<Icon name="arrow" /></button><button className="text-button" disabled={moving || quiet || !loaded || !!error} onClick={() => visit('office')}>Kembali ke ruang pemilik</button></div><p className="small-note">{quiet ? 'Lanjutkan animasi untuk mengajak pemilik berjalan.' : moving ? 'Pemilik sedang berjalan. Tunggu hingga tiba.' : decorativeActivity}</p></div> : selected === 'hermes' ? <div className="drawer-section hermes-section">{hermesPanel ?? <><h3>Ruang berpikir bersama</h3><p>Percakapan dan status kerja Hermes belum terhubung ke kantor.</p></>}</div> : selected === 'board' ? <div className="drawer-section kanban-drawer-section">{boardPanel}</div> : selected === 'calendar' ? <div className="drawer-section calendar-drawer-section">{calendarPanel ?? <><h3>Kalender kerja & cron</h3><p>Jadwal belum terhubung ke kantor.</p></>}</div> : <div className="drawer-section"><span className="availability">Belum aktif</span><h3>Ruang untuk rencana Anda</h3><p>Layanan ini menunggu task berikutnya.</p></div>}
        <div className="drawer-footer"><span className="status-dot muted" />Simulasi visual · data bisnis terpisah</div>
        </>}
        </div><nav className="tablet-nav" aria-label="Navigasi tablet">
          <button type="button" className={selected === 'home' ? 'active tablet-home-button' : 'tablet-home-button'} aria-label="Layar utama" aria-current={selected === 'home' ? 'page' : undefined} title="Layar utama" onClick={() => select('home')}><Icon name="home" /></button>
          {tabletApps.map(item => <button key={item.id} type="button" className={selected === item.id ? 'active' : ''} aria-label={item.label} aria-current={selected === item.id ? 'page' : undefined} title={item.label} onClick={() => select(item.id)}><span className={`tablet-app-icon app-${item.id}`}><Icon name={item.icon} /></span></button>)}
        </nav></div>
      </aside>}
    </div>

    <footer className="office-footer"><details className="office-footer-menu"><summary><Icon name="settings" /><span>Menu &amp; status</span></summary><div className="office-footer-content">
      <nav aria-label="Navigasi utama">
        {([{ title: 'Kantor', icon: 'home', id: null }, { title: 'Nota', icon: 'note', id: 'admin' }, { title: 'Kanban', icon: 'board', id: 'board' }, { title: 'Jadwal', icon: 'calendar', id: 'calendar' }] as const).map(item =>
          <button key={item.title} className={activeNav === item.title ? 'nav-item active' : 'nav-item'} aria-current={activeNav === item.title ? 'page' : undefined} onClick={() => item.id ? select(item.id) : close()}><Icon name={item.icon} /><span>{item.title}</span></button>)}
      </nav>
      <button
        type="button"
        className="footer-status"
        onClick={() => {
          fetchServicesHealth();
          healthDialogRef.current?.showModal();
        }}
        title="Klik untuk melihat detail kesehatan semua layanan"
      >
        <span title={`Server API: ${serverHealth}`}>
          <i className={`status-dot ${serverHealth === 'Aktif' ? '' : 'muted'}`} />
          {serverHealth === 'Aktif' ? 'Server aktif' : 'Server tidak tersedia'}
        </span>
        <span title={`WhatsApp: ${whatsappStatus}`}>WhatsApp {whatsappLabel}</span>
      </button>
      {/* Benchmark & Telemetry Details Card */}
      <details className="performance-settings"><summary aria-label="Pengaturan tampilan"><Icon name="settings" /><span>Tampilan</span></summary><div className="settings-popover"><h3>Pengaturan tampilan</h3><label><input type="checkbox" aria-label="Mode hemat grafis" checked={preferences.economy} onChange={event => setPreferences(value => ({ ...value, economy: event.target.checked }))} />Mode hemat grafis (DPR 1)</label><p>{quiet ? 'Animasi dijeda' : `${metrics?.fps ?? '—'} FPS`} · DPR {metrics?.dpr ?? '—'}</p><p>{metrics?.textures ?? '—'} aset gambar</p><p>{metrics?.resolution} · Muat {metrics?.loadTimeMs ?? '—'} ms</p><small>{metrics?.gpuRenderer}</small></div></details>
      <label className="object-picker"><span className="sr-only">Buka objek kantor</span><select aria-label="Buka objek kantor" value="" onChange={event => { if (event.target.value) select(event.target.value as OfficeObjectId); }}><option value="">Jelajahi objek</option>{(Object.entries(officeObjects) as [OfficeObjectId, typeof officeObjects[OfficeObjectId]][]).map(([id, item]) => <option key={id} value={id}>{item.name}</option>)}</select></label>
    </div></details></footer>
    <dialog ref={helpRef} className="help-dialog"><div className="drawer-top"><h2>Panduan kantor</h2><button className="icon-button" aria-label="Tutup panduan" onClick={() => helpRef.current?.close()}><Icon name="close" /></button></div><p>Klik karakter atau objek untuk membuka detailnya.</p><dl><dt>Geser tampilan</dt><dd>Tarik dengan tombol kiri atau satu jari</dd><dt>Perbesar / perkecil</dt><dd>Scroll atau tombol + / −</dd><dt>Navigasi keyboard</dt><dd>Tekan Tab pada kantor untuk membuka tablet. Di dalam tablet, gunakan Tab untuk berpindah kontrol dan Escape untuk menutup.</dd></dl><p className="small-note">Mode tenang menjeda karakter. Animasi berhenti saat tab tidak terlihat. Balon aktivitas adalah simulasi dekoratif.</p></dialog>

    <dialog ref={healthDialogRef} className="health-dialog" aria-labelledby="health-dialog-title">
      <div className="drawer-top">
        <h2 id="health-dialog-title">Status Layanan &amp; Pemulihan</h2>
        <button className="icon-button" aria-label="Tutup status layanan" onClick={() => healthDialogRef.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <p style={{ margin: '8px 0 16px', fontSize: '12px', color: '#60786a' }}>
        Lingkungan pengembangan lokal (development). Periksa keandalan modul sebelum transaksi bisnis.
      </p>

      <div className="health-grid">
        {[
          {
            key: 'firestore' as const,
            name: 'Cloud Database (Firestore)',
            desc: 'Penyimpanan invoice, klien, dan audit transaksi.',
            fallbackRecovery: 'Pastikan FIREBASE_PROJECT_ID atau kredensial gcloud/ADC aktif untuk sinkronisasi ke cloud.',
          },
          {
            key: 'hermes' as const,
            name: 'Hermes AI Service',
            desc: 'Ekstraksi dokumen nota dan asisten percakapan cerdas.',
            fallbackRecovery: 'Jalankan server Hermes di localhost atau pastikan URL port sesuai konfigurasi environment.',
          },
          {
            key: 'modelRouter' as const,
            name: 'AI Model Router',
            desc: 'Penentu rute eksekusi LLM dan pengalih fallback model.',
            fallbackRecovery: 'Periksa ketersediaan kuota API token dan kredensial model cadangan.',
          },
          {
            key: 'pdfRenderer' as const,
            name: 'PDF Renderer (Chromium)',
            desc: 'Generator file PDF nota resmi dan invoice bisnis.',
            fallbackRecovery: 'Pastikan Chromium terpasang lokal (jalankan: npx puppeteer browsers install chrome).',
          },
          {
            key: 'whatsapp' as const,
            name: 'WhatsApp Bridge (Baileys)',
            desc: 'Penyampai pesan dan dokumen ke pelanggan via WhatsApp Web.',
            fallbackRecovery: 'Buka panel WhatsApp untuk memindai ulang QR code atau hubungkan kembali sesi.',
          },
        ].map((service) => {
          const sData = servicesHealth?.services[service.key];
          const status = sData?.status ?? 'unknown';
          const recovery = servicesHealth?.recoveryGuides?.[service.key] || service.fallbackRecovery;
          return (
            <div key={service.key} className="health-card">
              <div className="health-card-head">
                <span className="health-card-title">{service.name}</span>
                <span className={`health-pill ${status}`}>{status}</span>
              </div>
              <p className="health-card-desc">{service.desc}</p>
              {sData?.message && (
                <div style={{ fontSize: '11px', marginBottom: '4px', color: '#447d61' }}>
                  Detail: {sData.message}
                </div>
              )}
              <div className="health-recovery">
                <strong>Panduan Pemulihan:</strong> {recovery}
              </div>
            </div>
          );
        })}
      </div>

      <div className="health-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={fetchServicesHealth}
          disabled={healthLoading}
        >
          {healthLoading ? 'Memeriksa...' : 'Segarkan Status'}
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => healthDialogRef.current?.close()}
        >
          Tutup
        </button>
      </div>
    </dialog>

    <dialog ref={avatarDialogRef} className="avatar-dialog" aria-labelledby="avatar-dialog-title">
      <div className="drawer-top">
        <h2 id="avatar-dialog-title">Kustomisasi Avatar Pemilik</h2>
        <button className="icon-button" aria-label="Tutup kustomisasi avatar" onClick={() => avatarDialogRef.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <p style={{ margin: '8px 0 16px', fontSize: '12px', color: '#60786a' }}>
        Personalisasikan penampilan avatar 3D pemilik. Preferensi tersimpan otomatis di browser lokal.
      </p>

      <div className="avatar-customizer-form">
        <div className="customizer-group">
          <label className="customizer-label">Gaya Rambut</label>
          <div className="option-chips">
            {(['short', 'long', 'wavy', 'ponytail', 'bald'] as HairStyle[]).map(style => (
              <button
                key={style}
                type="button"
                className={`chip-button${avatar.hairStyle === style ? ' active' : ''}`}
                onClick={() => setAvatar(a => ({ ...a, hairStyle: style }))}
              >
                {style === 'short' ? 'Pendek' : style === 'long' ? 'Panjang' : style === 'wavy' ? 'Bergelombang' : style === 'ponytail' ? 'Kuncir' : 'Botak'}
              </button>
            ))}
          </div>
        </div>

        <div className="customizer-group">
          <label className="customizer-label">Gaya Pakaian</label>
          <div className="option-chips">
            {(['formal', 'casual', 'tech', 'smart-casual'] as OutfitStyle[]).map(style => (
              <button
                key={style}
                type="button"
                className={`chip-button${avatar.outfitStyle === style ? ' active' : ''}`}
                onClick={() => setAvatar(a => ({ ...a, outfitStyle: style }))}
              >
                {style === 'formal' ? 'Jas Formal' : style === 'casual' ? 'Kasual' : style === 'tech' ? 'Tech Minimal' : 'Smart Casual'}
              </button>
            ))}
          </div>
        </div>

        <div className="customizer-group">
          <label className="customizer-label">Aksesori</label>
          <div className="option-chips">
            {(['none', 'glasses', 'badge', 'headphones', 'coffee-cup'] as Accessory[]).map(item => (
              <button
                key={item}
                type="button"
                className={`chip-button${avatar.accessory === item ? ' active' : ''}`}
                onClick={() => setAvatar(a => ({ ...a, accessory: item }))}
              >
                {item === 'none' ? 'Tanpa Aksesori' : item === 'glasses' ? 'Kacamata' : item === 'badge' ? 'ID Badge' : item === 'headphones' ? 'Headphones' : 'Cangkir Kopi'}
              </button>
            ))}
          </div>
        </div>

        <div className="customizer-row">
          <div className="color-field">
            <label className="customizer-label">Warna Rambut</label>
            <div className="color-picker-wrap">
              <input
                type="color"
                aria-label="Warna rambut"
                value={avatar.hairColor}
                onChange={e => setAvatar(a => ({ ...a, hairColor: e.target.value }))}
              />
              <span>{avatar.hairColor}</span>
            </div>
          </div>

          <div className="color-field">
            <label className="customizer-label">Warna Pakaian</label>
            <div className="color-picker-wrap">
              <input
                type="color"
                aria-label="Warna pakaian"
                value={avatar.outfitColor}
                onChange={e => setAvatar(a => ({ ...a, outfitColor: e.target.value }))}
              />
              <span>{avatar.outfitColor}</span>
            </div>
          </div>

          <div className="color-field">
            <label className="customizer-label">Warna Aksen</label>
            <div className="color-picker-wrap">
              <input
                type="color"
                aria-label="Warna aksen"
                value={avatar.accentColor}
                onChange={e => setAvatar(a => ({ ...a, accentColor: e.target.value }))}
              />
              <span>{avatar.accentColor}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="avatar-actions">
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setAvatar(DEFAULT_AVATAR);
            setStoredAvatar(DEFAULT_AVATAR);
            managerRef.current?.setAvatar(DEFAULT_AVATAR);
          }}
        >
          Reset Default
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={() => {
            setStoredAvatar(avatar);
            managerRef.current?.setAvatar(avatar);
            avatarDialogRef.current?.close();
          }}
        >
          Simpan &amp; Terapkan
        </button>
      </div>
    </dialog>

    <dialog ref={expansionDialogRef} className="expansion-dialog" aria-labelledby="expansion-dialog-title">
      <div className="drawer-top">
        <h2 id="expansion-dialog-title">Katalog Ekspansi Ruangan</h2>
        <button className="icon-button" aria-label="Tutup katalog ekspansi" onClick={() => expansionDialogRef.current?.close()}>
          <Icon name="close" />
        </button>
      </div>
      <p style={{ margin: '8px 0 16px', fontSize: '12px', color: '#60786a' }}>
        Rencana tata ruang kantor masa depan. Menambah zona santai dan kolaborasi dengan alokasi komputasi terkontrol.
      </p>

      <div className="expansion-grid">
        {Object.values(expansionRooms).map(room => (
          <div key={room.id} className="expansion-card" style={{ borderTop: `3px solid ${room.accentColor}` }}>
            <div className="expansion-card-header">
              <span className="expansion-name">{room.name}</span>
              <span className={`expansion-status-pill ${room.status}`}>
                {room.status === 'active' ? 'Aktif' : 'Konsep'}
              </span>
            </div>
            <p className="expansion-desc">{room.description}</p>
            <div className="expansion-budget">
              <small>Anggaran &amp; Kinerja:</small>
              <p>{room.budgetNotes}</p>
            </div>
            {room.status === 'active' && room.id === 'terrace' && (
              <button
                type="button"
                className="secondary-button"
                style={{ marginTop: '12px', width: '100%' }}
                onClick={() => {
                  expansionDialogRef.current?.close();
                  visit('terrace');
                }}
              >
                <Icon name="waves" />Kunjungi Teras Kolam
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="expansion-actions" style={{ marginTop: '20px', textAlign: 'right' }}>
        <button
          type="button"
          className="primary-button"
          onClick={() => expansionDialogRef.current?.close()}
        >
          Tutup
        </button>
      </div>
    </dialog>
  </main>;
}
