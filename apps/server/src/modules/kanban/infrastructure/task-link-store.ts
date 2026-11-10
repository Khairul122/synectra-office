import { taskLinkSchema, type TaskLink } from '@synectra/contracts';
import { getAppFirestore } from '../../../infrastructure/firestore';
import { withSchema, FIRESTORE_COLLECTIONS } from '../../../infrastructure/firestore-schema';
import {
  createMemoryTaskLinkStore,
  type TaskLinkStore
} from '../application/kanban-service';

export type { TaskLinkStore };
export { createMemoryTaskLinkStore };

export class FirestoreTaskLinkStore implements TaskLinkStore {
  private collectionRef(ownerId: string) {
    const firestore = getAppFirestore();
    return firestore.collection(`${FIRESTORE_COLLECTIONS.OWNERS}/${ownerId}/task_links`);
  }

  async addLink(ownerId: string, link: TaskLink): Promise<TaskLink> {
    const parsed = taskLinkSchema.parse(link);
    await this.collectionRef(ownerId).doc(parsed.id).set(withSchema(parsed, ownerId));
    return parsed;
  }

  async listLinks(ownerId: string): Promise<TaskLink[]> {
    const snapshot = await this.collectionRef(ownerId).get();
    return snapshot.docs.map((doc) => taskLinkSchema.parse(doc.data()));
  }

  async getLinkByTaskId(ownerId: string, taskId: string): Promise<TaskLink | null> {
    const all = await this.listLinks(ownerId);
    return all.find((link) => link.taskId === taskId) ?? null;
  }

  resetForTests(): void {
    // No-op for Firestore store in tests
  }
}

export function createFirestoreTaskLinkStore(): TaskLinkStore {
  return new FirestoreTaskLinkStore();
}

export function createTaskLinkStore(): TaskLinkStore {
  return process.env.FIREBASE_USE_FIRESTORE === 'true'
    ? createFirestoreTaskLinkStore()
    : createMemoryTaskLinkStore();
}

export const taskLinkStore = createTaskLinkStore();
