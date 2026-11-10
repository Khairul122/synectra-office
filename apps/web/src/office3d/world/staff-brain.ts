import { STAFF_DESK, STAFF_STAND, type SpotId } from './layout.ts';

/**
 * "Otak" karyawan ala game life-sim. Murni (tanpa three.js): memutuskan ke mana karyawan pergi dan
 * animasi apa yang dimainkan. Kerja NYATA (aktivitas dari server) selalu menang atas aktivitas
 * dekoratif; aktivitas dekoratif dipilih dari kebutuhan (energi, sosial, hiburan, kafein).
 */
export type StaffId = 'hermes' | 'admin' | 'communication';
export const STAFF_IDS: StaffId[] = ['hermes', 'admin', 'communication'];

export type Anim =
  | 'sit_type' | 'sit_idle' | 'sit_phone' | 'sit_talk' | 'sit_eat' | 'sit_relax'
  | 'stand_idle' | 'drink' | 'chat' | 'write_board' | 'wait_printer' | 'read' | 'stretch'
  | 'look_window' | 'phone_call' | 'lie' | 'foosball' | 'water_plant' | 'cheer' | 'facepalm' | 'think' | 'walk_in_place';

export type NeedId = 'energy' | 'social' | 'fun' | 'caffeine';
export type Needs = Record<NeedId, number>;
export type Mood = 'fokus' | 'senang' | 'ceria' | 'santai' | 'lelah' | 'kesepian' | 'bosan' | 'kesal';
export type Icon = 'work' | 'printer' | 'board' | 'chat' | 'phone' | 'coffee' | 'food' | 'sofa' | 'game' | 'plant' | 'book' | 'window' | 'stretch' | 'sun' | 'cheer' | 'sad' | 'think';

export interface Intent {
  spot: SpotId;
  anim: Anim;
  label: string;
  icon: Icon;
  /** true = mencerminkan operasi nyata di server; false = simulasi dekoratif. */
  real: boolean;
  /** Karyawan lain yang diajak berinteraksi (untuk arah hadap & animasi bergantian). */
  partner?: StaffId;
}

export interface StaffUiState { intent: Intent; mood: Mood; needs: Needs; queue: Array<{ label: string; icon: Icon }> }

interface ActivityDef {
  id: string;
  label: string;
  icon: Icon;
  anim: Anim;
  spots: SpotId[] | 'desk' | 'stand';
  duration: [number, number];
  restores: Partial<Needs>;
  /** Aktivitas berpasangan: butuh rekan yang sedang santai. */
  pair?: [SpotId, SpotId][];
  partnerAnim?: Anim;
}

const CATALOG: ActivityDef[] = [
  { id: 'desk-relax', label: 'Santai di meja', icon: 'think', anim: 'sit_idle', spots: 'desk', duration: [10, 18], restores: { energy: 0.3 } },
  { id: 'coffee', label: 'Menyeduh kopi', icon: 'coffee', anim: 'drink', spots: ['coffee'], duration: [9, 14], restores: { caffeine: 7, energy: 1.2 } },
  { id: 'snack', label: 'Ngemil di pantry', icon: 'food', anim: 'sit_eat', spots: ['pantry-seat-a', 'pantry-seat-b'], duration: [12, 18], restores: { energy: 3.2, fun: 0.8 } },
  { id: 'sofa', label: 'Rebahan di sofa', icon: 'sofa', anim: 'sit_relax', spots: ['sofa-a', 'sofa-b', 'armchair-a', 'armchair-b'], duration: [14, 22], restores: { energy: 2.6, fun: 1.4 } },
  { id: 'window', label: 'Menikmati pemandangan', icon: 'window', anim: 'look_window', spots: ['window', 'terrace-view'], duration: [8, 12], restores: { fun: 2.2, energy: 0.6 } },
  { id: 'stretch', label: 'Peregangan', icon: 'stretch', anim: 'stretch', spots: 'stand', duration: [5, 7], restores: { energy: 2.4 } },
  { id: 'read', label: 'Membaca buku', icon: 'book', anim: 'read', spots: ['bookshelf', 'archive'], duration: [10, 15], restores: { fun: 2.2 } },
  { id: 'plants', label: 'Menyiram tanaman', icon: 'plant', anim: 'water_plant', spots: ['plant-work', 'plant-lounge'], duration: [7, 10], restores: { fun: 1.8 } },
  { id: 'sunbathe', label: 'Berjemur di teras', icon: 'sun', anim: 'lie', spots: ['lounger-a', 'lounger-b'], duration: [16, 24], restores: { energy: 3.6, fun: 1.6 } },
  { id: 'phone', label: 'Menelepon keluarga', icon: 'phone', anim: 'phone_call', spots: ['terrace-view', 'window'], duration: [8, 12], restores: { social: 3.4 } },
  { id: 'chat', label: 'Ngobrol', icon: 'chat', anim: 'chat', spots: [], duration: [12, 18], restores: { social: 5, fun: 1.2 }, pair: [['chat-a', 'chat-b'], ['pantry-seat-a', 'pantry-seat-b'], ['sofa-a', 'sofa-b']] },
  { id: 'foosball', label: 'Main foosball', icon: 'game', anim: 'foosball', spots: [], duration: [12, 18], restores: { fun: 5.5, social: 2.4, energy: -0.4 }, pair: [['foosball-a', 'foosball-b']] },
];

/** Kebutuhan berkurang per detik; kerja nyata lebih menguras. */
const DECAY: Needs = { energy: 0.22, social: 0.3, fun: 0.26, caffeine: 0.32 };
const WORK_DECAY_FACTOR = 1.6;
/** Operasi nyata yang sangat singkat tetap terlihat: minimal sekian detik di tempat kerja sebelum selesai. */
const MIN_VISIBLE_WORK = 3;

/** Rencana kerja nyata dari teks aktivitas server. Langkah terakhir diulang selama aktif. */
export function workPlan(id: StaffId, activity: string): Array<{ spot: SpotId; anim: Anim; icon: Icon; duration: number; label: string }> {
  const desk = STAFF_DESK[id];
  const label = `Bekerja · ${activity}`;
  if (id === 'admin' && /pdf|cetak|nota/i.test(activity)) {
    return [
      { spot: desk, anim: 'sit_type', icon: 'work', duration: 4, label },
      { spot: 'printer', anim: 'wait_printer', icon: 'printer', duration: 5, label: `${label} · mengambil cetakan` },
      { spot: desk, anim: 'sit_type', icon: 'work', duration: Infinity, label },
    ];
  }
  if (id === 'communication' && /whatsapp|kirim|pesan|pengiriman/i.test(activity)) {
    return [{ spot: desk, anim: 'sit_phone', icon: 'phone', duration: Infinity, label }];
  }
  if (id === 'hermes' && /percakapan|chat|tanggap/i.test(activity)) {
    return [{ spot: desk, anim: 'sit_talk', icon: 'chat', duration: Infinity, label }];
  }
  if (id === 'hermes') {
    return [
      { spot: 'board', anim: 'write_board', icon: 'board', duration: 6, label: `${label} · menyusun di papan` },
      { spot: desk, anim: 'sit_type', icon: 'work', duration: Infinity, label },
    ];
  }
  return [{ spot: desk, anim: 'sit_type', icon: 'work', duration: Infinity, label }];
}

export type ManualPose = 'idle' | 'walk' | 'drink' | 'rest';

interface Mind {
  needs: Needs;
  intent: Intent;
  activityId: string;
  remaining: number;
  arrived: boolean;
  restores: Partial<Needs>;
  realActivity: string | null;
  plan: ReturnType<typeof workPlan>;
  planStep: number;
  reaction: { kind: 'success' | 'fail'; remaining: number } | null;
  manual: ManualPose | null;
  /** Teks operasi yang sudah selesai di server tapi sedang dituntaskan secara visual. */
  finishing: string | null;
  /** Detik berada di tempat kerja selama operasi nyata. */
  workTime: number;
}

export class StaffBrain {
  private readonly minds = new Map<StaffId, Mind>();
  private readonly reserved = new Set<SpotId>();
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    STAFF_IDS.forEach((id, index) => {
      const desk = STAFF_DESK[id];
      this.minds.set(id, {
        needs: { energy: 72 + index * 6, social: 55 + index * 9, fun: 60 - index * 5, caffeine: 64 - index * 8 },
        intent: { spot: desk, anim: 'sit_idle', label: 'Santai di meja', icon: 'think', real: false },
        activityId: 'desk-relax', remaining: 4 + index * 3, arrived: false, restores: { energy: 0.3 },
        realActivity: null, plan: [], planStep: 0, reaction: null, manual: null, finishing: null, workTime: 0,
      });
    });
  }

  private mind(id: StaffId) { return this.minds.get(id)!; }

  /** Aktivitas nyata dari server (null = tidak ada operasi). Menyela aktivitas dekoratif seketika. */
  setActivity(id: StaffId, activity: string | null) {
    const mind = this.mind(id);
    if (mind.realActivity === activity) return;
    const previous = mind.realActivity;
    mind.realActivity = activity;
    if (activity) {
      this.releasePartner(id);
      mind.plan = workPlan(id, activity); mind.planStep = 0; mind.manual = null; mind.finishing = null; mind.workTime = 0;
      this.applyPlanStep(id);
    } else if (previous) {
      if (mind.workTime >= MIN_VISIBLE_WORK) this.endWork(id);
      else { mind.finishing = previous; mind.intent = { ...mind.intent, label: `Menyelesaikan · ${previous}` }; }
    }
  }

  private endWork(id: StaffId) {
    const mind = this.mind(id);
    mind.plan = []; mind.planStep = 0; mind.finishing = null; mind.workTime = 0;
    this.assign(id, { id: 'after-work', label: 'Selesai bekerja · peregangan', icon: 'stretch', anim: 'stretch', spots: 'stand', duration: [4, 5], restores: { energy: 1 } });
  }

  /** Reaksi atas event bisnis nyata (PDF selesai, pesan terkirim/gagal). */
  react(id: StaffId, kind: 'success' | 'fail') {
    this.mind(id).reaction = { kind, remaining: kind === 'success' ? 3 : 3.5 };
  }

  /** Pose manual dari UI (hanya berlaku saat tidak ada kerja nyata). null = kembali otomatis. */
  setManual(id: StaffId, pose: ManualPose | null) {
    const mind = this.mind(id);
    if (mind.realActivity || mind.finishing) return;
    mind.manual = pose;
    this.releasePartner(id);
    if (!pose) { mind.remaining = 0; return; }
    const def: ActivityDef = pose === 'drink'
      ? { id: 'manual-drink', label: 'Istirahat kopi', icon: 'coffee', anim: 'drink', spots: ['coffee'], duration: [Infinity, Infinity], restores: { caffeine: 5 } }
      : pose === 'rest'
        ? { id: 'manual-rest', label: 'Istirahat di sofa', icon: 'sofa', anim: 'sit_relax', spots: ['sofa-a', 'sofa-b', 'armchair-a', 'armchair-b'], duration: [Infinity, Infinity], restores: { energy: 2.5 } }
        : pose === 'walk'
          ? { id: 'manual-walk', label: 'Berjalan di tempat', icon: 'stretch', anim: 'walk_in_place', spots: 'stand', duration: [Infinity, Infinity], restores: {} }
          : { id: 'manual-idle', label: 'Berdiri santai', icon: 'think', anim: 'stand_idle', spots: 'stand', duration: [Infinity, Infinity], restores: {} };
    this.assign(id, def);
  }

  /** Titik yang sedang dipakai pihak lain (mis. pemilik) agar tidak dipilih karyawan. */
  setReserved(spots: SpotId[]) { this.reserved.clear(); for (const spot of spots) this.reserved.add(spot); }

  /** Dipanggil adegan saat karyawan tiba di / meninggalkan titik tujuannya. */
  setArrived(id: StaffId, arrived: boolean) { this.mind(id).arrived = arrived; }

  intent(id: StaffId): Intent {
    const mind = this.mind(id);
    if (mind.reaction) {
      return { ...mind.intent, anim: mind.reaction.kind === 'success' ? 'cheer' : 'facepalm', icon: mind.reaction.kind === 'success' ? 'cheer' : 'sad', label: mind.reaction.kind === 'success' ? 'Berhasil! Tugas selesai' : 'Gagal kirim, perlu dicek', real: true };
    }
    return mind.intent;
  }

  ui(id: StaffId): StaffUiState {
    const mind = this.mind(id);
    const queue: StaffUiState['queue'] = [];
    if (mind.realActivity && mind.planStep < mind.plan.length - 1) {
      for (const step of mind.plan.slice(mind.planStep + 1, mind.planStep + 3)) queue.push({ label: step.label, icon: step.icon });
    }
    return { intent: this.intent(id), mood: this.mood(id), needs: { ...mind.needs }, queue };
  }

  mood(id: StaffId): Mood {
    const mind = this.mind(id);
    if (mind.reaction) return mind.reaction.kind === 'success' ? 'senang' : 'kesal';
    if (mind.realActivity || mind.finishing) return 'fokus';
    const { energy, social, fun } = mind.needs;
    if (energy < 25) return 'lelah';
    if (social < 25) return 'kesepian';
    if (fun < 25) return 'bosan';
    if (fun > 70 && social > 70) return 'ceria';
    return 'santai';
  }

  tick(dt: number) {
    for (const id of STAFF_IDS) {
      const mind = this.mind(id);
      const factor = mind.realActivity ? WORK_DECAY_FACTOR : 1;
      for (const need of Object.keys(DECAY) as NeedId[]) {
        const gain = mind.arrived ? (mind.restores[need] ?? 0) : 0;
        mind.needs[need] = Math.max(0, Math.min(100, mind.needs[need] - DECAY[need] * factor * dt + gain * dt));
      }
      if (mind.reaction) { mind.reaction.remaining -= dt; if (mind.reaction.remaining <= 0) mind.reaction = null; }
      if (!mind.arrived) continue;
      if (mind.realActivity || mind.finishing) mind.workTime += dt;
      if (mind.finishing) { if (mind.workTime >= MIN_VISIBLE_WORK) this.endWork(id); continue; }
      mind.remaining -= dt;
      if (mind.remaining > 0) continue;
      if (mind.realActivity) {
        if (mind.planStep < mind.plan.length - 1) { mind.planStep++; this.applyPlanStep(id); }
        continue;
      }
      if (mind.manual) continue;
      this.chooseNext(id);
    }
  }

  private applyPlanStep(id: StaffId) {
    const mind = this.mind(id); const step = mind.plan[mind.planStep]!;
    mind.intent = { spot: step.spot, anim: step.anim, label: step.label, icon: step.icon, real: true };
    mind.activityId = 'work'; mind.remaining = step.duration; mind.restores = {}; mind.arrived = false;
  }

  private occupiedSpots(except: StaffId) {
    const spots = new Set<SpotId>(this.reserved);
    for (const id of STAFF_IDS) if (id !== except) spots.add(this.mind(id).intent.spot);
    return spots;
  }

  private assign(id: StaffId, def: ActivityDef, spot?: SpotId, partner?: StaffId) {
    const mind = this.mind(id);
    const taken = this.occupiedSpots(id);
    const options = def.spots === 'desk' ? [STAFF_DESK[id]] : def.spots === 'stand' ? [STAFF_STAND[id]] : def.spots.filter(s => !taken.has(s));
    const chosen = spot ?? options[Math.floor(this.random() * options.length)] ?? STAFF_DESK[id];
    const [min, max] = def.duration;
    mind.intent = { spot: chosen, anim: def.anim, label: partner ? `${def.label} dengan ${STAFF_NAMES[partner]}` : def.label, icon: def.icon, real: false, partner };
    mind.activityId = def.id; mind.remaining = min + (max - min) * this.random(); mind.restores = def.restores; mind.arrived = false;
  }

  private releasePartner(id: StaffId) {
    for (const other of STAFF_IDS) {
      const mind = this.mind(other);
      if (other !== id && mind.intent.partner === id && !mind.realActivity) { mind.intent = { ...mind.intent, partner: undefined }; mind.remaining = Math.min(mind.remaining, 1.5); }
    }
    const own = this.mind(id); if (own.intent.partner) own.intent = { ...own.intent, partner: undefined };
  }

  private free(id: StaffId) {
    const mind = this.mind(id);
    return !mind.realActivity && !mind.finishing && !mind.manual && !mind.intent.partner && !mind.reaction;
  }

  /** Skor aktivitas = pemulihan × urgensi kebutuhan, ditambah sedikit acak agar tidak monoton. */
  private chooseNext(id: StaffId) {
    const mind = this.mind(id);
    const urgency = (need: NeedId) => ((100 - mind.needs[need]) / 100) ** 2;
    const taken = this.occupiedSpots(id);
    let best: { def: ActivityDef; score: number; partner?: StaffId; spots?: [SpotId, SpotId] } | null = null;
    for (const def of CATALOG) {
      if (def.id === mind.activityId) continue;
      let score = (Object.entries(def.restores) as [NeedId, number][]).reduce((sum, [need, value]) => sum + Math.max(0, value) * urgency(need), 0);
      score += this.random() * 0.9 + (def.id === 'desk-relax' ? 0.35 : 0);
      let partner: StaffId | undefined; let spots: [SpotId, SpotId] | undefined;
      if (def.pair) {
        const candidates = STAFF_IDS.filter(other => other !== id && this.free(other) && this.mind(other).arrived);
        const pair = def.pair.find(([a, b]) => !taken.has(a) && !taken.has(b));
        if (!candidates.length || !pair) continue;
        partner = candidates.sort((a, b) => this.mind(a).needs.social - this.mind(b).needs.social)[0];
        spots = pair; score += 0.4;
      } else if (Array.isArray(def.spots) && def.spots.every(s => taken.has(s))) continue;
      if (!best || score > best.score) best = { def, score, partner, spots };
    }
    const choice: { def: ActivityDef; partner?: StaffId; spots?: [SpotId, SpotId] } = best ?? { def: CATALOG[0]! };
    if (choice.partner && choice.spots) {
      this.assign(id, choice.def, choice.spots[0], choice.partner);
      this.assign(choice.partner, choice.def, choice.spots[1], id);
      const partnerMind = this.mind(choice.partner);
      partnerMind.remaining = mind.remaining; // berakhir bersamaan
    } else this.assign(id, choice.def);
  }
}

export const STAFF_NAMES: Record<StaffId, string> = { hermes: 'Hermes', admin: 'Administrasi', communication: 'Komunikasi' };
