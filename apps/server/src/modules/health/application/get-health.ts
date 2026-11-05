import type { HealthResponse } from '@synectra/contracts';

export function getHealth(): HealthResponse {
  return { status: 'ok' };
}
