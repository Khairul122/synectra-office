import type { ReactNode } from 'react';
import type { ActorId, ActorUiState } from './scene-manager-3d';
import type { Icon as IntentIcon, Mood, NeedId } from './world/staff-brain';

/** Ikon aksi untuk gelembung & panel karakter (gaya HUD game life-sim, digambar sendiri). */
export function LifeIcon({ name }: { name: IntentIcon }) {
  const paths: Record<IntentIcon, ReactNode> = {
    work: <><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></>,
    printer: <><path d="M7 8V3h10v5M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="7" y="14" width="10" height="7" /></>,
    board: <><rect x="3" y="4" width="18" height="13" rx="1" /><path d="M7 21l3-4M17 21l-3-4M7 9h4M7 12h7" /></>,
    chat: <path d="M4 5h16v10H9l-5 4z" />,
    phone: <><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></>,
    coffee: <><path d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a3 3 0 0 1 0 6h-2M8 2v3M12 2v3" /></>,
    food: <><path d="M5 11h14a7 7 0 0 1-14 0zM9 4c0 2 2 2 2 4M14 4c0 2 2 2 2 4" /></>,
    sofa: <><path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" /><path d="M3 11h3v3h12v-3h3v7H3zM6 18v2M18 18v2" /></>,
    game: <><rect x="2" y="7" width="20" height="10" rx="5" /><path d="M7 10v4M5 12h4M16 11h.01M18 13h.01" /></>,
    plant: <><path d="M12 21V11M12 11c0-4 3-6 7-6 0 4-3 6-7 6zM12 13c0-3-2-5-6-5 0 3 2 5 6 5z" /><path d="M8 21h8" /></>,
    book: <><path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-6a3 3 0 0 0-3 3" /><path d="M20 4v14h-7" /></>,
    window: <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18M4 12h16" /></>,
    stretch: <><circle cx="12" cy="4" r="2" /><path d="M5 8l7 2 7-2M12 10v5l-3 6M12 15l3 6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></>,
    cheer: <><circle cx="12" cy="12" r="9" /><path d="M8 14a4 4 0 0 0 8 0M9 9h.01M15 9h.01" /></>,
    sad: <><circle cx="12" cy="12" r="9" /><path d="M8 16a4 4 0 0 1 8 0M9 9h.01M15 9h.01" /></>,
    think: <><circle cx="12" cy="10" r="6" /><circle cx="7" cy="19" r="1.5" /><circle cx="4.5" cy="22" r="1" /></>,
  };
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

/** Potret 3D yang dirender dari karakter; fallback ke inisial berwarna. */
export function Portrait({ index, src, size = 'small' }: { index: number; src?: string; size?: 'small' | 'large' }) {
  return <span className={`portrait portrait-${index}${size === 'large' ? ' portrait-large' : ''}`} data-photo={src ? '' : undefined} style={src ? { backgroundImage: `url(${src})` } : undefined} />;
}

export const MOOD_LABEL: Record<Mood, string> = { fokus: 'Fokus', senang: 'Senang', ceria: 'Ceria', santai: 'Santai', lelah: 'Lelah', kesepian: 'Kesepian', bosan: 'Bosan', kesal: 'Kesal' };
const MOOD_HINT: Record<Mood, string> = {
  fokus: 'Sedang mengerjakan operasi nyata.', senang: 'Baru saja menyelesaikan tugas.', ceria: 'Kebutuhan sosial & hiburan terpenuhi.', santai: 'Tidak ada operasi yang berjalan.',
  lelah: 'Energi rendah, butuh istirahat.', kesepian: 'Butuh mengobrol dengan rekan.', bosan: 'Butuh hiburan sejenak.', kesal: 'Ada pengiriman yang gagal.',
};
const NEEDS: Array<[NeedId, string]> = [['energy', 'Energi'], ['social', 'Sosial'], ['fun', 'Hiburan'], ['caffeine', 'Kafein']];

export interface SimPanelProps {
  id: ActorId;
  index: number;
  name: string;
  role: string;
  portrait?: string;
  state?: ActorUiState;
  /** Status operasi nyata dari server (teks) bila ada. */
  realStatus: string;
  lastEvent?: string;
  following: boolean;
  onClose: () => void;
  onOpen: () => void;
  onFollow: () => void;
  children?: ReactNode;
}

/** Panel karakter terpilih: potret, mood, aksi saat ini, antrean, dan bilah kebutuhan. */
export function SimPanel({ id, index, name, role, portrait, state, realStatus, lastEvent, following, onClose, onOpen, onFollow, children }: SimPanelProps) {
  const intent = state?.intent;
  const mood = state?.mood ?? 'santai';
  return <section className="hud-sim-panel" aria-labelledby={`sim-${id}-name`}>
    <div className="sim-head">
      <Portrait index={index} src={portrait} size="large" />
      <div className="sim-title">
        <h2 id={`sim-${id}-name`}>{name}</h2>
        <span>{role} · {state?.zone ?? 'Kantor'}</span>
        <span className={`sim-mood mood-${mood}`} title={MOOD_HINT[mood]}><i aria-hidden="true" />{MOOD_LABEL[mood]}</span>
      </div>
      <button type="button" className="sim-close" onClick={onClose} aria-label={`Tutup panel ${name}`}>×</button>
    </div>
    <div className={`sim-action${intent?.real ? ' is-real' : ''}`}>
      <span className="sim-action-icon">{intent ? <LifeIcon name={state?.moving ? 'stretch' : intent.icon} /> : null}</span>
      <div>
        <strong>{state?.moving ? `Menuju: ${intent?.label ?? '…'}` : intent?.label ?? 'Menunggu adegan'}</strong>
        <span className="sim-badge">{intent?.real ? 'Operasi nyata' : 'Simulasi dekoratif'}</span>
      </div>
    </div>
    {state && state.queue.length > 0 && <ol className="sim-queue" aria-label="Antrean aksi">{state.queue.map((item, i) => <li key={i} title={item.label}><LifeIcon name={item.icon} /><span>{item.label}</span></li>)}</ol>}
    {id !== 'reception' && state && <div className="sim-needs" aria-label="Kebutuhan karakter (simulasi)">
      {NEEDS.map(([need, label]) => { const value = Math.round(state.needs[need]); return <div key={need} className="sim-need"><span>{label}</span><meter min={0} max={100} low={30} high={65} optimum={100} value={value} aria-label={`${label} ${value}%`} /></div>; })}
    </div>}
    <p className="sim-real" role="status">{realStatus}{lastEvent ? ` · Terakhir: ${lastEvent}` : ''}</p>
    {children}
    <div className="sim-buttons">
      <button type="button" className="sim-primary" onClick={onOpen}>{id === 'reception' ? 'Buka tablet' : 'Buka meja kerja'}</button>
      <button type="button" className={following ? 'is-on' : ''} aria-pressed={following} onClick={onFollow}>Ikuti kamera</button>
    </div>
  </section>;
}
