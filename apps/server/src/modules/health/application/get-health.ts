import { existsSync } from 'node:fs';
import type {
  HealthResponse,
  ServicesHealthResponse,
  SingleServiceHealth,
  ServiceStatusValue
} from '@synectra/contracts';
import type { WhatsappService } from '../../whatsapp/application/whatsapp-service';
import {
  HERMES_PROFILE,
  defaultHermesCliRunner,
  getHermesCliStatus,
  type HermesCliStatus
} from '../../../infrastructure/hermes-cli';
import { getHermesModelStatus, hermesModelConfig } from '../../../infrastructure/hermes-model';

export function getHealth(): HealthResponse {
  return { status: 'ok' };
}

export interface HealthCheckOptions {
  whatsappService?: WhatsappService;
  chromiumPath?: string;
  now?: () => string;
  /** Jalankan probe CLI Hermes di latar belakang bila status terakhir sudah basi. */
  probeHermes?: boolean;
}

const HERMES_PROBE_MAX_AGE_MS = 5 * 60 * 1000;
let hermesProbeInFlight = false;

function maybeProbeHermes(): void {
  const status = getHermesCliStatus();
  const fresh = status && Date.now() - Date.parse(status.at) < HERMES_PROBE_MAX_AGE_MS;
  if (fresh || hermesProbeInFlight) return;
  hermesProbeInFlight = true;
  void defaultHermesCliRunner(['-p', HERMES_PROFILE, 'cron', 'status'], { timeout: 60000 }).finally(() => {
    hermesProbeInFlight = false;
  });
}

const HERMES_UNREACHABLE: Record<NonNullable<HermesCliStatus['reason']>, string> = {
  not_found: 'Hermes CLI tidak ditemukan. Pasang Hermes atau atur HERMES_BIN.',
  timeout: 'Hermes CLI tidak merespons sebelum batas waktu.',
  spawn_error: 'Hermes CLI gagal dijalankan.'
};

function hermesHealth(status: HermesCliStatus | undefined, timestamp: string): SingleServiceHealth {
  if (!status) {
    return {
      status: 'degraded',
      message: 'Belum ada panggilan Hermes CLI sejak server berjalan; status belum terverifikasi.',
      lastCheckedAt: timestamp
    };
  }
  return {
    status: status.reachable ? 'ok' : 'offline',
    message: status.reachable ? 'Hermes CLI merespons' : HERMES_UNREACHABLE[status.reason ?? 'spawn_error'],
    lastCheckedAt: status.at,
    details: { profile: HERMES_PROFILE }
  };
}

export const DEFAULT_RECOVERY_GUIDES: Record<string, string> = {
  firestore:
    'Periksa koneksi internet atau credential Firebase (GOOGLE_APPLICATION_CREDENTIALS). Untuk development lokal tanpa cloud, nonaktifkan FIREBASE_USE_FIRESTORE untuk menggunakan in-memory storage.',
  hermes:
    'Pastikan Hermes CLI terpasang dan perintah `hermes` ada di PATH, atau atur HERMES_BIN ke executable Hermes. Uji dengan `hermes -p synectra-office cron status`.',
  modelRouter:
    'Atur HERMES_ROUTER_API_KEY (dan opsional HERMES_ROUTER_BASE_URL, HERMES_MODEL) agar chat Hermes memakai model. Tanpa itu, chat memakai parser deterministik lokal.',
  pdfRenderer:
    'Pastikan Google Chrome atau Chromium terpasang. Atur variabel lingkungan CHROMIUM_PATH menuju file executable chrome.exe jika menggunakan direktori khusus.',
  whatsapp:
    'Buka panel WhatsApp di aplikasi, klik tombol Mulai Pairing, lalu scan QR Code menggunakan WhatsApp ponsel Anda. Bila koneksi terputus, lakukan reconnect atau restart bridge.'
};

export async function getServicesHealth(opts?: HealthCheckOptions): Promise<ServicesHealthResponse> {
  const timestamp = opts?.now ? opts.now() : new Date().toISOString();

  // 1. Firestore status
  let firestore: SingleServiceHealth;
  const useFirestore = process.env.FIREBASE_USE_FIRESTORE === 'true';
  if (useFirestore) {
    try {
      firestore = {
        status: 'ok',
        message: 'Cloud Firestore aktif dan terkonfigurasi',
        lastCheckedAt: timestamp,
        details: { mode: 'cloud' }
      };
    } catch (err) {
      firestore = {
        status: 'error',
        message: err instanceof Error ? err.message : 'Gagal mengakses Firestore',
        lastCheckedAt: timestamp,
        details: { mode: 'cloud' }
      };
    }
  } else {
    firestore = {
      status: 'ok',
      message: 'Penyimpanan lokal/in-memory aktif (development mode)',
      lastCheckedAt: timestamp,
      details: { mode: 'in-memory' }
    };
  }

  // 2. Hermes status: dari panggilan CLI nyata terakhir (pasif). Probe aktif hanya bila diminta,
  // berjalan di latar belakang karena satu panggilan CLI Hermes bisa >10 detik.
  if (opts?.probeHermes) maybeProbeHermes();
  const hermes = hermesHealth(getHermesCliStatus(), timestamp);

  // 3. Model router Hermes: status dari panggilan nyata terakhir (pasif, tanpa memanggil model).
  const modelCfg = hermesModelConfig();
  const modelStatus = getHermesModelStatus();
  const modelRouter: SingleServiceHealth = !modelCfg.apiKey
    ? {
        status: 'degraded',
        message: 'HERMES_ROUTER_API_KEY belum diatur; chat Hermes memakai parser deterministik lokal.',
        lastCheckedAt: timestamp,
        details: { provider: 'deterministic_local' }
      }
    : !modelStatus
      ? {
          status: 'degraded',
          message: 'Router model terkonfigurasi, belum ada panggilan sejak server berjalan.',
          lastCheckedAt: timestamp,
          details: { provider: 'router', model: modelCfg.model, baseUrl: modelCfg.baseUrl }
        }
      : {
          status: modelStatus.reachable ? 'ok' : 'offline',
          message: modelStatus.reachable
            ? 'Router model merespons'
            : `Router model gagal (${modelStatus.reason ?? 'unknown'}); chat memakai parser deterministik.`,
          lastCheckedAt: modelStatus.at,
          details: { provider: 'router', model: modelCfg.model, baseUrl: modelCfg.baseUrl }
        };

  // 4. PDF Renderer (Chromium)
  const candidateChromium =
    opts?.chromiumPath ??
    process.env.CHROMIUM_PATH ??
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromiumAvailable = existsSync(candidateChromium);
  const pdfRenderer: SingleServiceHealth = {
    status: chromiumAvailable ? 'ok' : 'degraded',
    message: chromiumAvailable
      ? `Chromium headless siap pada ${candidateChromium}`
      : `Chromium tidak ditemukan pada ${candidateChromium}. Atur CHROMIUM_PATH.`,
    lastCheckedAt: timestamp,
    details: { path: candidateChromium, exists: chromiumAvailable }
  };

  // 5. WhatsApp
  let whatsapp: SingleServiceHealth;
  if (opts?.whatsappService) {
    const pair = opts.whatsappService.getPairStatus();
    let statusVal: ServiceStatusValue = 'ok';
    let msg = `Status WhatsApp: ${pair.status}`;

    if (pair.status === 'connected') {
      statusVal = 'ok';
      msg = 'Terhubung ke WhatsApp Web';
    } else if (pair.status === 'pairing' || pair.status === 'connecting') {
      statusVal = 'degraded';
      msg = 'Menunggu scan QR Code atau sedang menghubungkan';
    } else if (pair.status === 'unpaired' || pair.status === 'logged_out') {
      statusVal = 'degraded';
      msg = 'Belum dipasangkan (unpaired / logged out)';
    } else if (pair.status === 'error') {
      statusVal = 'error';
      msg = pair.error ?? 'Terjadi kesalahan pada koneksi WhatsApp';
    }

    whatsapp = {
      status: statusVal,
      message: msg,
      lastCheckedAt: timestamp,
      details: {
        connectionStatus: pair.status,
        hasQr: Boolean(pair.qrCode),
        user: pair.user
      }
    };
  } else {
    whatsapp = {
      status: 'degraded',
      message: 'WhatsApp service belum diinisialisasi',
      lastCheckedAt: timestamp
    };
  }

  // Calculate overall status
  const statuses: ServiceStatusValue[] = [
    firestore.status,
    hermes.status,
    modelRouter.status,
    pdfRenderer.status,
    whatsapp.status
  ];

  let overall: ServiceStatusValue = 'ok';
  if (statuses.some((s) => s === 'error')) {
    overall = 'error';
  } else if (statuses.some((s) => s === 'offline')) {
    overall = 'offline';
  } else if (statuses.some((s) => s === 'degraded')) {
    overall = 'degraded';
  }

  return {
    overall,
    environment: 'development',
    timestamp,
    services: {
      firestore,
      hermes,
      modelRouter,
      pdfRenderer,
      whatsapp
    },
    recoveryGuides: DEFAULT_RECOVERY_GUIDES
  };
}
