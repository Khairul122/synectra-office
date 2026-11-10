import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../src/office3d/CalendarSchedulePanel.tsx', import.meta.url), 'utf8');

test('missed-runs check sends a bodyless POST without JSON content type', () => {
  const handler = source.split('const handleCheckMissed = async () => {')[1]?.split('const handleResolveMissed =')[0];
  assert.ok(handler, 'missed-runs handler exists');
  assert.match(handler, /fetch\('\/api\/calendar\/missed-runs\/check',\s*\{[\s\S]*?method: 'POST'/);
  assert.doesNotMatch(handler, /'Content-Type': 'application\/json'/);
  assert.match(handler, /'x-csrf-token': csrfToken/);
});
