import { hermesMessageSchema, hermesSessionSchema, type HermesMessage } from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { FIRESTORE_COLLECTIONS, withSchema } from '../../../infrastructure/firestore-schema';
import {
  createMemoryHermesStore,
  newHermesSession,
  type HermesAuditRecord,
  type HermesStore
} from '../application/hermes-service';

const MAX_JSON_CHARS = 20_000;
/** Pesan chat dihapus otomatis oleh TTL policy Firestore pada field `expireAt` (collection group hermes_messages). */
export const HERMES_MESSAGE_TTL_DAYS = 180;

function ownerRef(ownerId: string) {
  return getAppFirestore().collection(FIRESTORE_COLLECTIONS.OWNERS).doc(ownerId);
}

// `result`/`input` bebas bentuk (bisa berisi array bersarang yang ditolak Firestore), jadi disimpan sebagai JSON.
function toJson(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const json = JSON.stringify(value) ?? 'null';
  return json.length > MAX_JSON_CHARS ? JSON.stringify({ truncated: true, preview: json.slice(0, 2000) }) : json;
}

function fromJson(json: unknown): unknown {
  if (typeof json !== 'string') return undefined;
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

export function createFirestoreHermesStore(): HermesStore {
  const sessionRef = (ownerId: string) => ownerRef(ownerId).collection('hermes_state').doc('session');
  const messagesRef = (ownerId: string) => ownerRef(ownerId).collection('hermes_messages');
  const auditRef = (ownerId: string) => ownerRef(ownerId).collection('hermes_audit');

  return {
    async getSession(ownerId) {
      const snap = await sessionRef(ownerId).get();
      const parsed = snap.exists ? hermesSessionSchema.safeParse(snap.data()) : undefined;
      return parsed?.success ? parsed.data : newHermesSession(ownerId);
    },

    async appendTurn(ownerId, turn) {
      // Transaksi: giliran paralel milik owner yang sama tidak saling menimpa messageCount/seq.
      return getAppFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef(ownerId));
        const parsed = snap.exists ? hermesSessionSchema.safeParse(snap.data()) : undefined;
        const current = parsed?.success ? parsed.data : newHermesSession(ownerId);
        turn.forEach((message, index) => {
          const { result, ...rest } = message;
          tx.set(
            messagesRef(ownerId).doc(message.id),
            withSchema(
              {
                ...rest,
                resultJson: toJson(result),
                seq: current.messageCount + index + 1,
                expireAt: new Date(Date.parse(message.createdAt) + HERMES_MESSAGE_TTL_DAYS * 86_400_000)
              },
              ownerId
            )
          );
        });
        const session = {
          ...current,
          messageCount: current.messageCount + turn.length,
          lastActivityAt: turn.at(-1)?.createdAt ?? current.lastActivityAt
        };
        tx.set(sessionRef(ownerId), withSchema(session, ownerId));
        return session;
      });
    },

    async listMessages(ownerId, limit) {
      const snapshot = await messagesRef(ownerId).orderBy('seq', 'desc').limit(limit).get();
      const list: HermesMessage[] = [];
      for (const doc of snapshot.docs) {
        const data = doc.data();
        const parsed = hermesMessageSchema.safeParse({ ...data, result: fromJson(data.resultJson) });
        if (parsed.success) list.push(parsed.data);
      }
      return list.reverse();
    },

    async addAudit(record) {
      const { input, ...rest } = record;
      await auditRef(record.ownerId).doc(record.id).set(withSchema({ ...rest, inputJson: toJson(input) }, record.ownerId));
    },

    async listAudits(ownerId) {
      const snapshot = await auditRef(ownerId).orderBy('at').get();
      return snapshot.docs.map((doc) => {
        const { inputJson, schema_version: _v, owner_id: _o, ...rest } = doc.data();
        return { ...rest, input: fromJson(inputJson) } as HermesAuditRecord;
      });
    }
  };
}

export function createHermesStore(): HermesStore {
  return process.env.FIREBASE_USE_FIRESTORE === 'true' ? createFirestoreHermesStore() : createMemoryHermesStore();
}
