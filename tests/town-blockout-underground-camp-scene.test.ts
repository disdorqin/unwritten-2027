import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, type PointLight } from 'three';
import { mountUndergroundCampScene } from '../tools/voxel-tavern/town-blockout/underground-camp-scene.ts';
import type { UndergroundCampPickaxeResult } from '../src/shared/underground-camp-pickaxe.js';

type Foot = readonly [number, number, number];

test('camp scene composes accepted passage, sight-bound original tool, and domain-safe lights', async t => {
  const parent = new Group();
  let foot: Foot | undefined;
  let aiming = false;
  let grant: UndergroundCampPickaxeResult = 'rejected';
  let notices = 0;
  let claims = 0;
  const lights = new Set(['memorial/niche-2', 'memorial/niche-4', 'memorial/niche-6']);
  const audio: boolean[] = [];
  const camp = mountUndergroundCampScene({
    parent,
    camp: { side: 'right', length: 10, extension: 5 },
    walker: { radius: .27, standingHeight: 1.8 },
    mine: {
      route: [
        { zone: 'camp', from: [0, -91, 35], to: [0, -91, 40] },
        { zone: 'camp', from: [0, -91, 40], to: [2.5, -91, 40] },
      ],
      anchors: { campRecovery: { position: [2.5, -91, 40] } },
      queryPassage(x, z, radius, bodyHeight) {
        if (x - radius < -2 || x + radius > 7 || z - radius < 30 || z + radius > 45 || bodyHeight > 3.5) return;
        return { zone: z < 35 ? 'gallery' : 'camp', floor: -91, clearance: 3.5 };
      },
    },
    actions: {
      readFooting: () => foot, promptRange: 1.15, restAfterMs: 2500, now: () => 0,
      sit: () => true, stand: () => true, setSeatedAmbience: active => audio.push(active),
      lookAtBowl: () => true, recordRelic: () => 'recorded',
    },
    readLights: () => ({ litNicheIds: lights, extraCampLightCount: 2, remainingBudget: 4 }),
    pickaxe: {
      available: () => true,
      aimedAt: () => aiming,
      async claim() { claims++; return grant; },
      showPickupNotice() { notices++; },
    },
  });
  t.after(camp.dispose);
  function visibleLights() {
    let visible = 0;
    parent.traverse(object => { if ((object as PointLight).isPointLight && object.visible) visible++; });
    return visible;
  }
  assert.equal(parent.children.length, 1);
  assert.equal(visibleLights(), 0);
  assert.equal(camp.queryPassage(0, 32, .27, 1.8)?.zone, 'gallery');
  assert.equal(camp.queryPassage(.89, 38, .27, 1.8), undefined);

  const { id, aim, approach } = camp.pickaxeSite;
  assert.equal(camp.queryPassage(approach[0], approach[2], .27, 1.8)?.floor, approach[1]);
  assert.ok(aim[1] > approach[1]);
  foot = approach;
  camp.update();
  assert.equal(visibleLights(), 4);
  assert.equal(camp.prompt(), undefined);
  aiming = true;
  assert.equal(camp.prompt()?.id, id);
  aiming = false;
  assert.equal(await camp.press(id), 'unavailable');
  assert.equal(claims, 0);
  aiming = true;
  assert.equal(await camp.press(id), 'rejected');
  assert.equal(camp.camp.group.getObjectByName(id)?.visible, true);
  grant = 'granted';
  assert.equal(await camp.press(id), 'granted');
  assert.equal(camp.camp.group.getObjectByName(id)?.visible, false);
  assert.equal(notices, 1);
  assert.equal(await camp.press(id), 'unavailable');
  assert.equal(claims, 2);

  foot = camp.camp.rooms[0].approach;
  assert.equal(await camp.press(camp.prompt()?.id ?? ''), 'sat');
  foot = undefined;
  camp.update();
  assert.deepEqual(audio, [true, false]);
  assert.equal(visibleLights(), 0);
  assert.equal(camp.prompt(), undefined);
  camp.dispose();
  assert.equal(parent.children.length, 0);
});
