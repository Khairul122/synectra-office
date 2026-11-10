/**
 * Klien model Hermes via router OpenAI-compatible (default: router lokal profil synectra-office).
 * Dipanggil TANPA tools: model hanya mengembalikan teks; semua aksi tetap lewat dispatcher allowlist.
 */
export type HermesChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type HermesModelClient = (messages: HermesChatMessage[]) => Promise<string>;

export type HermesModelStatus = { reachable: boolean; at: string; reason?: string };
let lastStatus: HermesModelStatus | undefined;

export function getHermesModelStatus(): HermesModelStatus | undefined {
  return lastStatus;
}

export function hermesModelConfig() {
  return {
    baseUrl: (process.env.HERMES_ROUTER_BASE_URL || 'http://127.0.0.1:20128/v1').replace(/\/+$/, ''),
    apiKey: process.env.HERMES_ROUTER_API_KEY || '',
    model: process.env.HERMES_MODEL || 'ComboHermes',
    timeoutMs: Number(process.env.HERMES_MODEL_TIMEOUT_MS) || 30000
  };
}

/** null bila router belum dikonfigurasi (tanpa HERMES_ROUTER_API_KEY) -> chat memakai parser deterministik. */
export function createRouterModelClient(): HermesModelClient | null {
  const config = hermesModelConfig();
  if (!config.apiKey) return null;
  return async (messages) => {
    const at = () => new Date().toISOString();
    let res: Response;
    try {
      res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.model, temperature: 0, stream: false, messages }),
        signal: AbortSignal.timeout(config.timeoutMs)
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'unreachable';
      lastStatus = { reachable: false, at: at(), reason };
      throw new Error(`Router model ${reason}`);
    }
    if (!res.ok) {
      lastStatus = { reachable: false, at: at(), reason: `http_${res.status}` };
      throw new Error(`Router model HTTP ${res.status}`);
    }
    const body = (await res.json().catch(() => null)) as { choices?: Array<{ message?: { content?: unknown } }> } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      lastStatus = { reachable: false, at: at(), reason: 'invalid_response' };
      throw new Error('Router model mengembalikan respons tidak valid');
    }
    lastStatus = { reachable: true, at: at() };
    return content;
  };
}
