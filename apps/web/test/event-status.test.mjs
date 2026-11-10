import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventStatus } from '../src/office3d/event-status.ts';

test('scheduled job status uses the office snapshot, not the job outcome', () => {
  const status = { workState: 'away', heartbeatAt: 100, activity: 'Gagal' };
  assert.deepEqual(eventStatus({ type: 'app_job_completed', status: 'failed', statusSnapshot: status }), status);
  assert.deepEqual(eventStatus({ type: 'pdf_generated', status }), status);
  assert.deepEqual(eventStatus({ status }), status);
});
