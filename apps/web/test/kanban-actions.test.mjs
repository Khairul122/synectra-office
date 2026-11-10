import assert from 'node:assert/strict';
import { transitionForDrop } from '../src/office3d/kanban-actions.ts';
import { kanbanStatusSchema, transitionKanbanTaskRequestSchema } from '../../../packages/contracts/src/index.ts';
import { test } from 'node:test';

test('drop maps only supported lifecycle changes to native actions', () => {
  const cases = [
    ['triage', 'todo', 'specify'],
    ['todo', 'scheduled', 'schedule'],
    ['ready', 'blocked', 'block'],
    ['blocked', 'ready', 'unblock'],
    ['running', 'review', 'request_review'],
    ['review', 'done', 'complete'],
    ['done', 'archived', 'archive']
  ];
  for (const [from, to, action] of cases) {
    kanbanStatusSchema.parse(from);
    kanbanStatusSchema.parse(to);
    assert.equal(transitionForDrop(from, to), action);
    transitionKanbanTaskRequestSchema.parse({ action });
  }
  assert.equal(transitionForDrop('ready', 'running'), null);
  assert.equal(transitionForDrop('triage', 'done'), null);
  assert.equal(transitionForDrop('done', 'done'), null);
});
