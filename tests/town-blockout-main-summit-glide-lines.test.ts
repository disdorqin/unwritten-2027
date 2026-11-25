import assert from 'node:assert/strict';
import test from 'node:test';
import { Group } from 'three';
import { mountMainSummitAssembly } from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mountMainSummitExtras } from '../tools/voxel-tavern/town-blockout/main-summit-extras';
import { createGlideRingEntities } from '../tools/voxel-tavern/town-blockout/main-summit-glide-ring-entities';

test('dual-line registry: high line and low line both survey nine rings clear', context => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, Date.UTC(2026, 0, 1));
  const extras = mountMainSummitExtras(assembly);
  context.after(() => { extras.dispose(); assembly.dispose(); });
  assert.equal(extras.glideRings.length, 3, 'canonical scoring line untouched');
  assert.equal(extras.glideLines.high.length, 9, 'high line: nine rings at 55 m targets');
  assert.equal(extras.glideLines.low.length, 9, 'low line: nine rings pressed 6 m down');
  for (let i = 0; i < 9; i++) {
    const high = extras.glideLines.high[i]!, low = extras.glideLines.low[i]!;
    assert.ok(high.height > low.height, `ring ${i}: high line above low line`);
  }
});

test('ring entities: streamers and bells dress every canonical ring', context => {
  const owner = new Group();
  const assembly = mountMainSummitAssembly(owner, Date.UTC(2026, 0, 1));
  const extras = mountMainSummitExtras(assembly);
  context.after(() => { extras.dispose(); assembly.dispose(); });
  const entities = createGlideRingEntities(extras.glideRings, assembly.block.heightAt);
  context.after(() => entities.dispose());
  let streamers = 0, bells = 0;
  entities.group.traverse(object => {
    if (object.name === 'glide-ring-streamer') streamers++;
    if (object.name === 'glide-ring-bell') bells++;
  });
  assert.equal(streamers, extras.glideRings.length * 2, 'two streamers per ring');
  assert.equal(bells, extras.glideRings.length * 2, 'two bells per ring');
  assert.ok(entities.poles >= 1, 'the low first ring stands on a pole (m12)');
  entities.update(3.25);
});
