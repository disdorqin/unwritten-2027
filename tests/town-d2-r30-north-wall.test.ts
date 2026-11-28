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

test('D2-R3 landmark bodies block the player but the climb itself stays traversable', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const spec = townD2R30NorthWallSpec;
  const at = (east: number, north: number) => sampleTownD2R30Height(east, north)!;
  assert.ok(wall.stats().collisionBoxes >= 10, `too few solid bodies: ${wall.stats().collisionBoxes}`);

  // The obelisk, mast and lookout rails are solid at standing height.
  assert.equal(wall.blocked(spec.monument.east, spec.monument.north,
    at(spec.monument.east, spec.monument.north), .27, 1.7), true, 'player walks through the monument');
  assert.equal(wall.blocked(spec.flag.east, spec.flag.north,
    at(spec.flag.east, spec.flag.north), .27, 1.7), true, 'player walks through the flag mast');
  const railEast = spec.lookout.east + spec.lookout.width / 2;
  const railNorth = spec.lookout.north;
  const deck = at(spec.lookout.east, spec.lookout.north) + 2.6;
  assert.equal(wall.blocked(railEast, railNorth, deck + .2, .27, 1.7), true, 'lookout rail is phantom');

  // A climber on the real rung line must not be rejected by the landmark
  // bodies, and an open summit point must remain passable.
  for (const anchor of wall.climbAnchors) {
    assert.equal(wall.blocked(anchor.east, anchor.north, anchor.ground, .27, 1.7), false,
      `climb anchor ${anchor.id} is falsely blocked`);
  }
  assert.equal(wall.blocked(0, 1000, at(0, 1000), .27, 1.7), false, 'open summit falsely blocked');
  assert.throws(() => wall.blocked(NaN, 1000, 800, .27, 1.7), RangeError);
  wall.dispose();
  assert.throws(() => wall.blocked(0, 1000, 800, .27, 1.7), Error);
});

test('D2-R5 rock ledges rest every 15-20m of vertical rise and stay non-solid', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const stats = wall.stats();
  assert.ok(stats.climbLedges >= 10, `too few rock ledges: ${stats.climbLedges}`);
  // The module emits a ledge when the accumulated rise enters 15-20 m and
  // interpolates on the climb line when one anchor step would overshoot the
  // band. Check the published ladder directly instead of re-deriving a rule:
  // every interior gap must sit inside the reference band.
  const ledges = [...wall.climbLedges];
  assert.equal(ledges.length, stats.climbLedges, 'stats must count the published ledges');
  let inBand = 0;
  for (let i = 1; i < ledges.length - 1; i++) {
    const gap = ledges[i]!.ground - ledges[i - 1]!.ground;
    assert.ok(gap > 0, `ledge ${i} does not rise`);
    assert.ok(gap >= 15 && gap <= 20, `ledge ${i} rise ${gap.toFixed(1)} m is outside 15-20 m`);
    inBand++;
  }
  assert.ok(inBand >= 10, `only ${inBand} interior ledges in band`);
  // The final pitch lands on the summit anchor and only has to be a real step.
  const finalGap = ledges.at(-1)!.ground - ledges.at(-2)!.ground;
  assert.ok(finalGap > 0 && finalGap <= 20, `final pitch ${finalGap.toFixed(1)} m`);

  // Every ledge is a real rock slab instance on the climb line, and the
  // ledges never add collision: the climb surface stays traversable.
  const names = new Set<string>();
  wall.group.traverse((object: Object3D) => { if (object.name) names.add(object.name); });
  for (const required of [
    'town-d2-r30-climb-ledges', 'town-d2-r30-climb-ledge-pads',
    'town-d2-r30-climb-ledge-rock', 'town-d2-r30-climb-guides',
    'town-d2-r30-climb-rung-brackets',
  ]) assert.ok(names.has(required), `missing climb structure ${required}`);
  for (const anchor of wall.climbAnchors) {
    assert.equal(wall.blocked(anchor.east, anchor.north, anchor.ground, .27, 1.7), false,
      `climb anchor ${anchor.id} is falsely blocked by ledges`);
  }
});

test('D2-R5 summit landmarks carry real structural detail', context => {
  const wall = cleanup(context, createTownD2R30NorthWall());
  const names = new Set<string>();
  wall.group.traverse((object: Object3D) => { if (object.name) names.add(object.name); });
  for (const required of [
    'town-d2-r30-monument-apron-0', 'town-d2-r30-monument-step',
    'town-d2-r30-monument-band', 'town-d2-r30-great-flag-rod',
    'town-d2-r30-great-flag-rigging', 'town-d2-r30-lookout-kerb-side-1',
    'town-d2-r30-lookout-kerb-end-1', 'town-d2-r30-lookout-post-1-1',
    'town-d2-r30-lookout-plank-1',
  ]) assert.ok(names.has(required), `missing landmark detail ${required}`);
  // The structural additions stay grounded: the flag rigging anchors are
  // real summit rock, and the lookout kerb/posts sit on the deck.
  const spec = townD2R30NorthWallSpec;
  for (const [east, north] of [[spec.flag.east - 5, spec.flag.north + 4],
    [spec.flag.east + 5, spec.flag.north + 4]] as const) {
    assert.ok(Number.isFinite(sampleTownD2R30Height(east, north)!), `flag rigging anchor E${east}/N${north} unsupported`);
  }
  assert.ok(wall.stats().collisionBoxes >= 14, `landmark detail lost solid bodies: ${wall.stats().collisionBoxes}`);
});

test('D2-R3 production host consumes R30 terrain and landmark collision', context => {
  const assembly = createTownD2R30Assembly({ includeNorthWall: true });
  context.after(() => assembly.dispose());
  assert.ok(assembly.northWall, 'production assembly did not expose the north-wall bodies');
  const spec = townD2R30NorthWallSpec;
  const ground = sampleTownD2R30Height(spec.monument.east, spec.monument.north)!;
  // Unit-level body check plus the host-level slope gate it wraps.
  assert.equal(assembly.northWall.blocked(spec.monument.east, spec.monument.north, ground, .27, 1.7), true);
  assert.equal(assembly.northWall.blocked(0, 1000, sampleTownD2R30Height(0, 1000)!, .27, 1.7), false);
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
