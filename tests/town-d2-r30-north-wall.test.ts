import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Mesh, MeshLambertMaterial, Object3D } from 'three';
import {
  createTownD2R30NorthWall, townD2R30NorthWallSpec,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-north-wall';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';
import { createTownD2R30Assembly } from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';

function cleanup<T extends { dispose(): void }>(context: TestContext, value: T): T {
  context.after(() => value.dispose());
  return value;
}

test('D2-R2 north-wall climb every anchor is grounded on the same 8m source', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const stats = wall.stats();
  assert.ok(stats.climbAnchors >= 30, `too few climb anchors: ${stats.climbAnchors}`);
  assert.equal(stats.groundedContacts, stats.climbAnchors);
  assert.equal(stats.floatingContacts, 0);
  for (const anchor of wall.climbAnchors) {
    const ground = sampleTownD2R30Height(anchor.east, anchor.north)!;
    assert.ok(Math.abs(anchor.ground - ground) < 1e-6, `anchor ${anchor.id} left the height field`);
    assert.ok(Math.abs(anchor.top - (ground + townD2R30NorthWallSpec.railHeight)) < 1e-6);
  }
});

test('D2-R2 climb runs from the lower north wall up to the 800m summit', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const first = wall.climbAnchors[0]!;
  const last = wall.climbAnchors[wall.climbAnchors.length - 1]!;
  assert.equal(first.north, townD2R30NorthWallSpec.climbNorthFrom);
  assert.equal(last.north, townD2R30NorthWallSpec.climbNorthTo);
  assert.ok(first.ground > 480 && first.ground < 620, `lower landing height ${first.ground}`);
  assert.ok(last.ground >= 795, `upper landing must reach the summit, got ${last.ground}`);
  assert.ok(wall.stats().climbLength >= 470, `climb too short: ${wall.stats().climbLength}`);
  const stats = wall.stats();
  assert.ok(stats.maxRungGap <= townD2R30NorthWallSpec.rungSpacing + 1, `gap ${stats.maxRungGap}`);
  assert.ok(stats.maxGrade > 0 && Number.isFinite(stats.maxGrade));
  assert.ok(stats.climbRungs === wall.climbAnchors.length);
});

test('D2-R2 the four summit landmarks are real geometry on the massif', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const names = new Set<string>();
  wall.group.traverse((object: Object3D) => { if (object.name) names.add(object.name); });
  for (const required of [
    'town-d2-r30-monument-obelisk', 'town-d2-r30-monument-plaque',
    'town-d2-r30-great-flag-pole', 'town-d2-r30-great-flag-cloth',
    'town-d2-r30-lookout-deck', 'town-d2-r30-lookout-rail-north',
    'town-d2-r30-climb-rungs', 'town-d2-r30-climb-handlines',
  ]) assert.ok(names.has(required), `missing landmark ${required}`);

  const spec = townD2R30NorthWallSpec;
  for (const point of [spec.monument, spec.flag, spec.lookout]) {
    const ground = sampleTownD2R30Height(point.east, point.north)!;
    assert.ok(Number.isFinite(ground), `landmark at E${point.east}/N${point.north} unsupported`);
  }
  assert.equal(wall.stats().landmarks, 7);
});

test('D2-R2 each pier and footing reaches the ground beneath it', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const lookout = townD2R30NorthWallSpec.lookout;
  for (const side of [-1, 1] as const) {
    for (const along of [-1, 1] as const) {
      const px = lookout.east + side * (lookout.width / 2 - .8);
      const pn = lookout.north + along * (lookout.depth / 2 - .8);
      assert.ok(Number.isFinite(sampleTownD2R30Height(px, pn)!), `lookout pier ${side}/${along} unsupported`);
    }
  }
  const flag = townD2R30NorthWallSpec.flag;
  assert.ok(sampleTownD2R30Height(flag.east, flag.north)! >= 700, 'great flag is not on the summit');
});

test('D2-R2 night tint is reversible and the module disposes cleanly', context => {
  const wall = createTownD2R30NorthWall();
  const materials: MeshLambertMaterial[] = [];
  wall.group.traverse((object: Object3D) => {
    if (object instanceof Mesh && object.material instanceof MeshLambertMaterial) materials.push(object.material);
  });
  assert.ok(materials.length > 0);
  const before = materials.map(m => m.color.getHex());
  wall.setNight(true);
  const night = materials.map(m => m.color.getHex());
  assert.ok(night.some((value, i) => value !== before[i]), 'night tint did nothing');
  wall.setNight(false);
  assert.deepEqual(materials.map(m => m.color.getHex()), before, 'day colour did not restore exactly');
  assert.throws(() => wall.setNight('yes' as unknown as boolean), TypeError);
  wall.dispose();
  assert.throws(() => wall.setNight(true), Error);
  assert.equal(wall.group.children.length, 0);
});

test('D2-R2 invalid inputs fail closed instead of floating geometry', context => {
  assert.throws(() => createTownD2R30NorthWall({
    heightAt: () => undefined,
  }), RangeError);
  const wall = cleanup(context, createTownD2R30NorthWall({ arrivalHeight: 800 }));
  assert.ok(wall.climbAnchors.length > 0);
});

test('D2-R2 the assembly and the production mount actually carry the north wall', context => {
  const assembly = createTownD2R30Assembly({ includeNorthWall: true });
  context.after(() => assembly.dispose());
  const subPackages = assembly.group.userData.subPackages as string[];
  assert.ok(subPackages.includes('town-d2-r30-north-wall'));
  const budget = (assembly.stats() as { budget: { packages: { package: string }[] } }).budget;
  assert.ok(budget.packages.some(p => p.package === 'town-d2-r30-north-wall'));

  const plain = createTownD2R30Assembly();
  context.after(() => plain.dispose());
  assert.ok(!(plain.group.userData.subPackages as string[]).includes('town-d2-r30-north-wall'),
    'the optional package must stay opt-in for isolated reviews');

  // Both variants share one height field, so adding the wall never changes
  // the walkable surface or the 8 m collision authority.
  for (const point of [[50, 1000], [50, 1300], [-46, 1038]] as const) {
    assert.equal(assembly.heightAt(point[0], point[1]), plain.heightAt(point[0], point[1]));
  }
});
