import type { Group, Object3D, Raycaster } from 'three';
import type { OfficeObjectId } from './office-data';

export function pickOfficeActor(raycaster: Raycaster, actors: ReadonlyMap<OfficeObjectId, { root: Group }>): OfficeObjectId | undefined {
  const roots = Array.from(actors.values(), actor => actor.root);
  let hit: Object3D | null = raycaster.intersectObjects(roots, true)[0]?.object ?? null;
  while (hit) {
    const match = Array.from(actors).find(([, actor]) => actor.root === hit);
    if (match) return match[0];
    hit = hit.parent;
  }
  return undefined;
}
