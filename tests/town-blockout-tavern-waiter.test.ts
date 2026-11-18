import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Scene, type InstancedMesh } from 'three';
import { buildTavernLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tavern.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc.ts';
import type { TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { tavernWaiterFloor, tavernWaiterHome, tavernWaiterLines, tavernWaiterStroll } from '../tools/voxel-tavern/town-blockout/tavern-waiter.ts';

test('the waiter line bank matches the twenty authored lines', () => {
  const manuscript = readFileSync(new URL('../docs/交流区/Muse/NPC补供稿-小二明信片生肖线索-v1.md', import.meta.url), 'utf8');
  const expected = [...manuscript.matchAll(/^- \[田小勤 · [^\]]+\] (.*?)$/gm)]
    .map(([, text]) => text.replace(/\[(可答|挡回)\]$/u, ''));
  assert.equal(expected.length, 20);
  assert.deepEqual(Object.values(tavernWaiterLines).flat(), expected);
});

test('the waiter joins the existing NPC batch and can stand at both tavern anchors', t => {
  if (!globalThis.document) {
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) } as unknown as Document;
    t.after(() => { Reflect.deleteProperty(globalThis, 'document'); });
  }
  const scene = new Scene();
  const npc = createTownNpcActivity({
    scene: scene as unknown as TownActivityContext['scene'],
    open: () => ({} as HTMLElement), announce() {}, sit() {}, face() {},
  }, () => 0);
  const mesh = scene.children[0] as InstancedMesh;
  assert.equal(scene.children.length, 1);
  assert.equal(mesh.name, 'town-npc-shared-skins');
  assert.equal(mesh.count, 259);
  const waiter = npc.spots.find(spot => spot.label === '和田小勤聊天');
  assert.deepEqual([waiter?.x, waiter?.n, waiter?.ground], [...tavernWaiterHome, tavernWaiterFloor]);
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  const tavern = buildTavernLandmark(plot);
  tavern.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders, floors } = readWalkGeometry(tavern);
  function overlaps(east: number, north: number, { min, max }: Box) {
    const dx = Math.max(min[0] - east, east - max[0], 0);
    const dz = Math.max(min[2] + north, -north - max[2], 0);
    return dx * dx + dz * dz < .27 ** 2;
  }
  for (const [east, north] of [tavernWaiterHome, tavernWaiterStroll]) {
    assert.ok(floors.some(box => Math.abs(box.max[1] - tavernWaiterFloor) < .025 && overlaps(east, north, box)));
    assert.ok([...colliders, ...floors].every(box => !(box.min[1] < tavernWaiterFloor + 1.775 &&
      box.max[1] > tavernWaiterFloor + .025 && overlaps(east, north, box))));
  }
});
