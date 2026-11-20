import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, Matrix4, Scene } from 'three';
import type { SoulMayorView } from '../src/shared/soul-mayor.ts';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc.ts';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { soulMayorCapacity } from '../tools/voxel-tavern/town-blockout/town-soul-mayor.ts';

test('only an authorized mayor view adds an NPC batch tail and a voluntary invitation', async t => {
  let closed = false;
  class Element {
    children: Element[] = [];
    textContent = '';
    hidden = false;
    disabled = false;
    isConnected = true;
    onclick?: () => Promise<void>;
    append(...children: Element[]) { this.children.push(...children); }
    closest() { return { close() { closed = true; } }; }
  }
  const installed = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => new Element() } });
  t.after(() => {
    if (installed) Object.defineProperty(globalThis, 'document', installed);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  const actor = { layer: 'test-plaza', east: 220, north: 188, height: 12 };
  const talk = { ...actor, north: 187.1 };
  const offer = { site: { actor, talk }, invited: false, ringCount: 11 };
  let state: SoulMayorView | undefined;
  let requests = 0;
  const scene = new Scene();
  const panel = new Element();
  const npc = createTownNpcActivity({
    scene, open(title, description) { assert.equal(title, '镇长'); assert.equal(description.trim(), ''); return panel as unknown as HTMLElement; },
    announce() { assert.fail('the invitation has no forced guide'); }, face() {}, sit() {},
  }, () => 12, undefined, undefined, undefined, undefined,
    { now: () => 1_000, groundAt: () => 12, visible: () => true },
    {
      view: () => state,
      async receiveInvitation() {
        requests++;
        state = { ...offer, invited: true };
      },
    });
  const batch = scene.children.find(child => 'isInstancedMesh' in child) as InstancedMesh;
  assert.ok(batch);
  const atMayor = () => nearestTownActivity(npc.spots, talk.east, talk.north, talk.height);
  npc.update?.(0);
  const livingAndMascot = batch.count;
  assert.equal(atMayor(), undefined);
  state = offer;
  npc.update?.(0);
  assert.equal(batch.count, livingAndMascot + soulMayorCapacity);
  const shoulderBefore = new Matrix4();
  const shoulderAfter = new Matrix4();
  batch.getMatrixAt(batch.count - 1, shoulderBefore);
  npc.update?.(15);
  batch.getMatrixAt(batch.count - 1, shoulderAfter);
  assert.ok(shoulderBefore.equals(shoulderAfter), 'the ordinary shoulder snow persists without animation');
  const spot = atMayor();
  assert.ok(spot);
  spot.run();
  assert.equal(requests, 0, 'opening the conversation does not accept');
  const [heading, button] = panel.children;
  assert.equal(heading.textContent, '星石收集令');
  assert.equal(button.textContent, '接受邀请');
  await Promise.all([button.onclick?.(), button.onclick?.()]);
  assert.equal(requests, 1);
  assert.equal(heading.textContent, '星石收集令 · 11/12');
  assert.equal(button.hidden, true);

  npc.registerResident('樊樵', () => ({ actor: [234, 188, 12], talk: [234, 187, 12] }));
  npc.update?.(0);
  assert.ok(batch.count > livingAndMascot + soulMayorCapacity);
  const combined = batch.count;
  state = undefined;
  assert.equal(spot.available?.(), false);
  npc.update?.(0);
  assert.equal(batch.count, combined - soulMayorCapacity);
  assert.equal(closed, true);
  assert.equal(atMayor(), undefined);
  assert.equal(scene.children.length, 1);
});
