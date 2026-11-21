import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitHutFurnishings } from '../tools/voxel-tavern/town-blockout/main-summit-hut-furnishings';

test('summit hut furnishings complete the §3.9 checklist', context => {
  const furnishings = createMainSummitHutFurnishings();
  context.after(() => furnishings.dispose());
  const names = new Set<string>();
  furnishings.group.traverse(object => { if (object.name) names.add(object.name); });
  for (const expected of [
    'hut-bed-frame', 'hut-bed-blanket', 'stove-firebox', 'stove-ember-glow', 'stove-wood-pile',
    'hut-shelf-board', 'shelf-food-sack', 'shelf-rope-coil', 'shelf-lamp-glow',
    'summit-logbook', 'hut-window-landmark-light', 'hut-interior-lamp',
    'summit-stone-circle', 'survey-station-m7-marker',
  ]) assert.ok(names.has(expected), `missing ${expected}`);
  assert.equal(furnishings.circle.east, 62.5);
  // The door-to-desk corridor stays walkable; bed and shelf collide.
  assert.equal(furnishings.blocked(62.5, 1011, 800, .27, 1.8), false);
  assert.equal(furnishings.blocked(57.02, 1009.4, 800, .27, 1.8), true);
  assert.equal(furnishings.blocked(68.35, 1016.2, 800, .27, 1.8), true);
});
