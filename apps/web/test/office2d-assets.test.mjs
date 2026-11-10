import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('isometric map and character pose, walk, and work sheets exist as PNG images', async () => {
  const names = ['map', ...['owner', 'hermes', 'admin', 'communication'].flatMap(name => [name, `${name}-walk`, `${name}-work`])];
  for (const name of names) {
    const buffer = await readFile(new URL(`../public/assets/office2d/${name}.png`, import.meta.url));
    assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    const width = buffer.readUInt32BE(16), height = buffer.readUInt32BE(20);
    assert.ok(width >= 1000 && height >= 600, `${name}: image too small`);
    if (name !== 'map') assert.equal(buffer[25], 6, `${name}: alpha channel missing`);
  }
});
