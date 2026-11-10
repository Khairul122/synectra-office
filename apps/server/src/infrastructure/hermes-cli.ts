import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';

export type HermesCliResult = { stdout: string; stderr: string; exitCode: number };

export type HermesCliRunner = (
  args: string[],
  options?: { timeout?: number }
) => Promise<HermesCliResult>;

export const HERMES_PROFILE = 'synectra-office';

/** Status panggilan CLI nyata terakhir, untuk health check pasif. */
export type HermesCliStatus = { reachable: boolean; at: string; reason?: 'not_found' | 'timeout' | 'spawn_error' };
let lastStatus: HermesCliStatus | undefined;

export function getHermesCliStatus(): HermesCliStatus | undefined {
  return lastStatus;
}

/**
 * Jalankan Hermes CLI tanpa shell. Binary dari HERMES_BIN (default `hermes` di PATH).
 * Runner tidak pernah throw: kegagalan dilaporkan lewat exitCode != 0, jadi pemanggil wajib cek exitCode.
 * Exit code non-nol dari CLI (mis. "no such task") tetap berarti CLI terjangkau.
 */
export const defaultHermesCliRunner: HermesCliRunner = (args, options) =>
  new Promise((resolve) => {
    execFile(
      process.env.HERMES_BIN || 'hermes',
      args,
      { timeout: options?.timeout ?? 35000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const at = new Date().toISOString();
        if (!error) {
          lastStatus = { reachable: true, at };
          return resolve({ stdout, stderr, exitCode: 0 });
        }
        const err = error as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
        if (err.code === 'ENOENT') lastStatus = { reachable: false, at, reason: 'not_found' };
        else if (err.killed) lastStatus = { reachable: false, at, reason: 'timeout' };
        else if (typeof err.code === 'string') lastStatus = { reachable: false, at, reason: 'spawn_error' };
        else lastStatus = { reachable: true, at };
        resolve({
          stdout: stdout ?? '',
          stderr: stderr || err.message,
          exitCode: typeof err.code === 'number' ? err.code : 1
        });
      }
    );
  });

/** Tenant Hermes per owner. Di-hash agar UID mentah tidak tersimpan di DB Hermes. */
export function hermesTenantFor(ownerId: string): string {
  return `owner-${createHash('sha256').update(ownerId).digest('hex').slice(0, 24)}`;
}

/** Hapus kode warna ANSI dari output CLI. */
export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}
