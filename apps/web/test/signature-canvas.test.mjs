import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resizeSignatureCanvas } from '../src/office3d/signature-canvas.ts';

test('signature resize preserves stroke position and ignores hidden or unchanged canvas', () => {
  let bounds = { width: 400, height: 200 };
  let transform;
  const canvas = { getBoundingClientRect: () => bounds, getContext: () => ({ setTransform: (...args) => { transform = args; } }) };
  const strokes = [{ points: [{ x: 100, y: 50 }] }];
  let redraws = 0;
  const pad = { toData: () => strokes, fromData: data => { assert.equal(data, strokes); redraws += 1; } };
  const previous = { width: 0, height: 0 };
  resizeSignatureCanvas(canvas, pad, previous, 2);
  assert.equal(canvas.width, 800);
  assert.deepEqual(transform, [2, 0, 0, 2, 0, 0]);
  bounds = { width: 200, height: 100 };
  resizeSignatureCanvas(canvas, pad, previous, 2);
  assert.deepEqual(strokes[0].points[0], { x: 50, y: 25 });
  resizeSignatureCanvas(canvas, pad, previous, 2);
  bounds = { width: 0, height: 0 };
  resizeSignatureCanvas(canvas, pad, previous, 2);
  assert.equal(redraws, 2);
});
