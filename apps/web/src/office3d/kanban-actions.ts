import type { KanbanStatus, TransitionKanbanTaskRequest } from '@synectra/contracts';

const dropActions: Partial<Record<KanbanStatus, Partial<Record<KanbanStatus, TransitionKanbanTaskRequest['action']>>>> = {
  triage: { todo: 'specify' },
  todo: { scheduled: 'schedule' },
  ready: { blocked: 'block' },
  blocked: { ready: 'unblock' },
  running: { review: 'request_review' },
  review: { done: 'complete' },
  done: { archived: 'archive' }
};

export function transitionForDrop(from: KanbanStatus, to: KanbanStatus): TransitionKanbanTaskRequest['action'] | null {
  return dropActions[from]?.[to] ?? null;
}
