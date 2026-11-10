import type { FastifyInstance, FastifyRequest } from 'fastify';
import { constantTimeEqual, createSession, readSession, revokeSession } from '../application/auth-service';

import { isLoopbackHost } from '../../../bootstrap/config';

const allowedOrigins = new Set([
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://localhost:3000'
]);
const COOKIE = 'synectra_session';

function cookieValue(req: FastifyRequest) {
  const raw = req.headers.cookie ?? '';
  return raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
}

function originAllowed(req: FastifyRequest) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return isLoopbackHost(hostname);
  } catch {
    return false;
  }
}

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function sessionFrom(req: FastifyRequest) {
  return readSession(cookieValue(req));
}

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/auth/session', async (req, reply) => {
    if (!originAllowed(req)) return reply.code(403).send({ error: 'Forbidden origin' });
    const body = (req.body as { idToken?: unknown } | null) ?? {};
    if (typeof body.idToken !== 'string' || body.idToken.length < 20) return reply.code(422).send({ error: 'Invalid ID token' });
    try {
      const { token, session } = await createSession(body.idToken);
      reply.header('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
      return { userId: session.userId, email: session.email, csrfToken: session.csrfToken };
    } catch {
      return reply.code(401).send({ error: 'Invalid ID token' });
    }
  });

  app.get('/auth/me', async (req, reply) => {
    const session = sessionFrom(req);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    return { userId: session.userId, email: session.email, csrfToken: session.csrfToken };
  });

  app.post('/auth/logout', async (req, reply) => {
    const session = sessionFrom(req);
    if (session && !constantTimeEqual(headerValue(req.headers['x-csrf-token']), session.csrfToken)) return reply.code(403).send({ error: 'Invalid CSRF token' });
    revokeSession(cookieValue(req));
    reply.header('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
    return { ok: true };
  });

  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    if (req.url === '/api/health' || req.url.startsWith('/api/health/')) return; // public health endpoints for development UI & probes
    const session = sessionFrom(req);
    if (!session) return reply.code(401).send({ error: 'Unauthorized' });
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !constantTimeEqual(headerValue(req.headers['x-csrf-token']), session.csrfToken)) {
      return reply.code(403).send({ error: 'Invalid CSRF token' });
    }
    (req as FastifyRequest & { userId?: string }).userId = session.userId;
  });
}
