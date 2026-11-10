import { z } from 'zod';

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') {
    return true;
  }
  if (normalized.startsWith('127.')) {
    return true;
  }
  return false;
}

const schema = z.object({
  APP_HOST: z.string().min(1),
  APP_PORT: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(65535)),
  WHATSAPP_OWNER_KEY: z.string().min(16)
});

export function readConfig(env: NodeJS.ProcessEnv) {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`);
  }
  return { host: result.data.APP_HOST, port: result.data.APP_PORT, whatsappOwnerKey: result.data.WHATSAPP_OWNER_KEY };
}
