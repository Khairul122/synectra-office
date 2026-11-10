import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { getApps, initializeApp, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

export type AuthSession = { userId: string; email?: string; expiresAt: number; csrfToken: string };

type SessionRecord = AuthSession & { tokenHash: string };

export type SessionStore = Pick<Map<string, SessionRecord>, 'set' | 'get' | 'delete'>;

const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map<string, SessionRecord>();
let firebaseAuth: Auth | undefined;

function getFirebaseAuth(): Auth {
  if (firebaseAuth) return firebaseAuth;
  let app: App;
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const credentials = JSON.parse(json) as { projectId: string; clientEmail: string; privateKey: string };
    app = getApps()[0] ?? initializeApp({ credential: cert(credentials) });
  } else {
    app = getApps()[0] ?? initializeApp();
  }
  firebaseAuth = getAuth(app);
  return firebaseAuth;
}

function hash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function createSession(idToken: string): Promise<{ token: string; session: AuthSession }> {
  const decoded = await getFirebaseAuth().verifyIdToken(idToken);
  const token = randomBytes(32).toString('base64url');
  const record: SessionRecord = {
    userId: decoded.uid,
    email: decoded.email,
    expiresAt: Date.now() + SESSION_TTL_MS,
    csrfToken: randomBytes(24).toString('base64url'),
    tokenHash: hash(token)
  };
  sessions.set(record.tokenHash, record);
  return { token, session: record };
}

export function readSession(token: string | undefined): AuthSession | undefined {
  if (!token) return undefined;
  const record = sessions.get(hash(token));
  if (!record || record.expiresAt <= Date.now()) {
    if (record) sessions.delete(record.tokenHash);
    return undefined;
  }
  return record;
}

export function revokeSession(token: string | undefined) {
  if (token) sessions.delete(hash(token));
}

export function constantTimeEqual(left: string | undefined, right: string | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function resetSessionsForTests() {
  sessions.clear();
  firebaseAuth = undefined;
}

export function createSessionForTests(userId: string, email?: string): { token: string; session: AuthSession } {
  const token = randomBytes(32).toString('base64url');
  const record: SessionRecord = {
    userId,
    email,
    expiresAt: Date.now() + SESSION_TTL_MS,
    csrfToken: randomBytes(24).toString('base64url'),
    tokenHash: hash(token)
  };
  sessions.set(record.tokenHash, record);
  return { token, session: record };
}

export function createExpiredSessionForTests(userId: string): { token: string; session: AuthSession } {
  const token = randomBytes(32).toString('base64url');
  const record: SessionRecord = {
    userId,
    expiresAt: Date.now() - 1000,
    csrfToken: randomBytes(24).toString('base64url'),
    tokenHash: hash(token)
  };
  sessions.set(record.tokenHash, record);
  return { token, session: record };
}
