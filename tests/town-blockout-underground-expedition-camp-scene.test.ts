import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, PointLight } from 'three';
import { mountUndergroundExpeditionCampScene, expeditionCampWords } from
  '../tools/voxel-tavern/town-blockout/underground-expedition-camp-scene.js';

type Camp = ReturnType<Parameters<typeof mountUndergroundExpeditionCampScene>[0]['readCamps']>[number];
const site = { layer: 'mine', east: 12, north: 8, height: -90 };
const camp: Camp = { id: 'camp/one', at: site, founderId: 'miner',
  fire: { fuel: 5, atMs: 1_000, phase: 'burning' as const } };
function fixture() {
  const parent = new Group();
  let sites: Camp[] = [];
  let lightBudget = 2;
  let supported = true;
  let canReach = true;
  let viewer: { id: string; layer: string; foot: typeof site } | undefined;
  const intents: unknown[] = [];
  const host: Parameters<typeof mountUndergroundExpeditionCampScene>[0] = {
    parent,
    readCamps: () => sites,
    readRevision: () => 42,
    supportsCamp: () => supported,
    readLightBudget: () => lightBudget,
    readViewer: () => viewer,
    canReach: () => canReach,
    dispatch: intent => intents.push(intent),
    supportsBuildFoot: () => supported,
  };
  return { parent, host, intents,
    setSites(next: Camp[]) { sites = next; },
    setBudget(budget: number) { lightBudget = budget; },
    setSupported(value: boolean) { supported = value; },
    setReach(value: boolean) { canReach = value; },
    setViewer(next: typeof viewer) { viewer = next; },
  };
}

test('U-18 round 1 empty full-server camp list creates no phantom fire or point lights', () => {
  const f = fixture();
  const scene = mountUndergroundExpeditionCampScene(f.host);
  assert.equal(f.parent.children.length, 1);
  assert.equal(scene.group.children.length, 0);
  assert.equal(scene.prompt(), undefined);
  assert.equal(scene.pressStoke('camp/one'), false);
  assert.equal(scene.chooseBuild(site), false);
  scene.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-18 round 2/3 constructs a dense ash, firewood, bench and lantern camp at accepted ENY coordinates', () => {
  const f = fixture();
  f.setSites([camp]);
  const scene = mountUndergroundExpeditionCampScene(f.host);
  assert.equal(scene.group.children.length, 1);
  const root = scene.group.getObjectByName('u18-expedition-camp/camp/one');
  assert.ok(root);
  assert.deepEqual(root.position.toArray(), [site.east, site.height, -site.north]);
  const batches = root.children.filter(object =>
    'isInstancedMesh' in object && object.isInstancedMesh === true) as InstancedMesh[];
  assert.ok(batches.length >= 5, 'real color/material families instead of a single fireplace box');
  assert.ok(batches.reduce((total, batch) => total + batch.count, 0) >= 100,
    'camp furniture, tools, kindling, stones, memorial ash and fire ring');
  assert.ok(root.getObjectByName('u18-old-expedition-ash'));
  assert.ok(root.getObjectByName('u18-flame-stack'));
  assert.ok(root.getObjectByName('u18-shared-authority-fire-light'));
  assert.equal(scene.words.marker, expeditionCampWords.marker);
  assert.ok(scene.words.remains.length > 16);
  scene.dispose();
  assert.equal(f.parent.children.length, 0);
});

test('U-18 round 4 visual fire and exactly allocated light follow shared server phases, not client time', () => {
  const f = fixture();
  f.setSites([camp]);
  const scene = mountUndergroundExpeditionCampScene(f.host);
  const model = scene.group.getObjectByName('u18-expedition-camp/camp/one');
  assert.ok(model);
  const light = model.getObjectByName('u18-shared-authority-fire-light') as PointLight;
  const flames = model.getObjectByName('u18-flame-stack');
  assert.ok(light?.isPointLight && flames);
  assert.equal(light.visible, true);
  assert.equal(flames.visible, true);
  f.setSites([{ ...camp, fire: { ...camp.fire, phase: 'weak', fuel: 1 } }]);
  scene.sync();
  assert.equal(flames.visible, true);
  assert.ok(flames.scale.x < 1);
  f.setBudget(0);
  scene.sync();
  assert.equal(light.visible, false);
  f.setSites([{ ...camp, fire: { ...camp.fire, phase: 'out', fuel: 0 } }]);
  f.setBudget(2);
  scene.sync();
  assert.equal(light.visible, false);
  assert.equal(flames.visible, false);
  f.setSites([{ ...camp, fire: { ...camp.fire, phase: 'burning', fuel: 5 } }]);
  scene.sync();
  assert.equal(light.visible, true);
  assert.equal(flames.visible, true);
  scene.dispose();
});

test('U-18 only prompts reachable same-layer shared camps, and forwards E with source revision', () => {
  const f = fixture();
  f.setSites([camp]);
  const scene = mountUndergroundExpeditionCampScene(f.host);
  f.setViewer({ id: 'helper', layer: 'mine', foot: site });
  assert.equal(scene.prompt()?.campId, 'camp/one');
  assert.equal(scene.pressStoke('camp/one'), true);
  assert.deepEqual(f.intents, [{ playerId: 'helper', revision: 42, campId: 'camp/one', role: 'stoke' }]);
  assert.equal(scene.pressStoke('camp/other'), false);
  f.setReach(false);
  assert.equal(scene.prompt(), undefined);
  f.setReach(true);
  f.setViewer({ id: 'helper', layer: 'town', foot: site });
  assert.equal(scene.prompt(), undefined);
  f.setViewer({ id: 'helper', layer: 'mine', foot: { ...site, east: site.east + 100 } });
  assert.equal(scene.prompt(), undefined);
  scene.dispose();
});

test('U-18 second interactions: bench rest and old-ash memorial require their own host-accepted feet', () => {
  const f = fixture();
  f.setSites([camp]);
  const scene = mountUndergroundExpeditionCampScene(f.host);
  f.setViewer({ id: 'miner', layer: 'mine', foot: { ...site, east: site.east + 1.55 } });
  assert.equal(scene.prompt('sit')?.role, 'sit');
  assert.equal(scene.pressRole('sit', camp.id), true);
  assert.deepEqual(f.intents[0], { playerId: 'miner', revision: 42, campId: camp.id, role: 'sit' });
  f.setViewer({ id: 'miner', layer: 'mine', foot: { ...site, east: site.east + 2.17,
    north: site.north + 1.57 } });
  assert.equal(scene.prompt('read-ashes')?.role, 'read-ashes');
  assert.equal(scene.pressRole('read-ashes', camp.id), true);
  assert.deepEqual(f.intents[1], { playerId: 'miner', revision: 42, campId: camp.id, role: 'read-ashes' });
  assert.equal(scene.pressRole('sit', camp.id), false, 'the ash station is not the same foot as the bench');
  f.setReach(false);
  assert.equal(scene.pressRole('read-ashes', camp.id), false);
  f.setReach(true);
  f.setViewer({ id: 'miner', layer: 'town', foot: site });
  assert.equal(scene.pressRole('sit', camp.id), false);
  scene.dispose();
});

test('U-18 site construction forwards only live support-accepted foot and removes unsupported migrated camp', () => {
  const f = fixture();
  f.setSites([camp]);
  const scene = mountUndergroundExpeditionCampScene(f.host);
  f.setViewer({ id: 'miner', layer: 'mine', foot: site });
  assert.equal(scene.chooseBuild({ ...site, east: site.east + .3 }), true);
  assert.deepEqual(f.intents[0], { playerId: 'miner', revision: 42, role: 'build',
    chosen: { ...site, east: site.east + .3 } });
  f.setSupported(false);
  scene.sync();
  assert.equal(scene.group.children.length, 0);
  assert.equal(scene.prompt(), undefined);
  assert.equal(scene.chooseBuild(site), false);
  f.setSupported(true);
  f.setSites([{ ...camp, at: { ...camp.at, north: camp.at.north + 6 } }]);
  scene.sync();
  const relocated = scene.group.getObjectByName('u18-expedition-camp/camp/one');
  assert.ok(relocated);
  assert.equal(relocated.position.z, -site.north - 6);
  scene.dispose();
  scene.dispose();
  assert.equal(f.parent.children.length, 0);
});
