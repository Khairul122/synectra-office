import { getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let firestore: Firestore | undefined;

export function getAppFirestore(): Firestore {
  if (firestore) return firestore;
  const app = getApps()[0] ?? initializeApp({ credential: applicationDefault() });
  firestore = getFirestore(app, 'default');
  firestore.settings({ ignoreUndefinedProperties: true });
  return firestore;
}

export function resetFirestoreForTests() {
  firestore = undefined;
}
