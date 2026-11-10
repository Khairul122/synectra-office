import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import { pickOfficeActor } from '../src/office3d/pick-office-actor.ts';

test('clicking a character mesh selects its owner, including nested parts', () => {
  const root = new Group();
  const head = new Group(); head.position.set(0, 2, 0); root.add(head);
  head.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  root.updateMatrixWorld(true);
  const ray = new Raycaster(new Vector3(0, 2, 5), new Vector3(0, 0, -1));
  assert.equal(pickOfficeActor(ray, new Map([['admin', { root }]])), 'admin');
  ray.set(new Vector3(3, 2, 5), new Vector3(0, 0, -1));
  assert.equal(pickOfficeActor(ray, new Map([['admin', { root }]])), undefined);
});
