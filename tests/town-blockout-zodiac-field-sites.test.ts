import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Vector3 } from 'three';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity';
import { createZodiacProgress } from '../tools/voxel-tavern/town-blockout/town-zodiac';
import { createTownZodiacSites, type CharmSite } from '../tools/voxel-tavern/town-blockout/town-zodiac-atlas';

test('three field charms share an instanced atlas and independently collect once', () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
  };
  const ids = ['ox', 'tiger', 'dog'] as const;
  const progress = createZodiacProgress([], storage);
  assert.ok(ids.every(id => !progress.canCollect(id)));
  assert.ok(ids.every(id => progress.rows().find(row => row.id === id)?.clue === '尚未现身'));
  const collected: string[] = [];
  const atlas = createTownZodiacSites(progress, label => collected.push(label));
  const roots = ids.map((_, i) => {
    const group = new Group();
    group.position.set(i * 60, 10 + i, -30);
    return group;
  });
  const site = { stand: [1, 0, 2], object: [1.4, .18, 2], yaw: 0, range: .3 } satisfies Omit<CharmSite, 'id'>;
  const spots = ids.map((id, i) => atlas.mount(roots[i], { ...site, id }));
  assert.equal(atlas.mesh.geometry.index?.count, 52 * 3);
  assert.equal(atlas.mesh.instanceMatrix.count, 8);
  for (const [index, spot] of spots.entries()) {
    const at = roots[index].localToWorld(new Vector3(...site.stand));
    atlas.update(at, true);
    assert.equal(atlas.mesh.count, 1);
    assert.equal(nearestTownActivity(spots, spot.x, spot.n, spot.ground - .56), undefined);
    assert.equal(nearestTownActivity(spots, at.x, -at.z, at.y), spot);
    spot.run();
    spot.run();
    atlas.update(at, true);
    assert.equal(atlas.mesh.count, 0);
  }
  assert.deepEqual(collected, ['牛', '虎', '狗']);
  assert.equal(createZodiacProgress(ids, storage).count(), 3);
});
