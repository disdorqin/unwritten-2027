import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, Raycaster, Scene, Vector3 } from 'three';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { buildMuseumLandmark } from '../tools/voxel-tavern/town-blockout/landmark-museum.ts';
import { buildTavernLandmark } from '../tools/voxel-tavern/town-blockout/landmark-tavern.ts';
import { createTerrainGrid, layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity, type TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { addTownWindow, createWindowActivity } from '../tools/voxel-tavern/town-blockout/town-window.ts';
import { createZodiacProgress } from '../tools/voxel-tavern/town-blockout/town-zodiac.ts';
import { createTavernRoosterCharm } from '../tools/voxel-tavern/town-blockout/town-zodiac-rooster.ts';

const terrain = createTerrainGrid();
// The app and the voxel preview have independent Three.js versions.
const context: TownActivityContext = {
  scene: new Scene() as unknown as TownActivityContext['scene'],
  open: () => ({} as HTMLElement), announce() {}, sit() {}, face() {},
};

function overlapsBody(east: number, north: number, { min, max }: Box) {
  const z = -north;
  const dx = Math.max(min[0] - east, east - max[0], 0);
  const dz = Math.max(min[2] - z, z - max[2], 0);
  return dx * dx + dz * dz < .27 ** 2;
}

test('window placement tests each outward 0.15-metre step through 0.90 m and discards still-blocked spots', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const root = new Group() as unknown as Parameters<typeof addTownWindow>[0];
  root.scale.set(2, 1, 3);
  root.rotation.y = Math.PI / 2;
  root.position.set(10, 1, -20);
  for (const ground of [0, 1]) {
    addTownWindow(root, { x: 0, y: 2 + ground, z: 0, width: 1, height: 1, yaw: 0, ground, style: 'tavern' });
  }
  const samples: number[][] = [];
  const activity = createWindowActivity(context, new Map([['fixture', root]]), (east, north, feet) => {
    samples.push([Number(east.toFixed(2)), Number(north.toFixed(2)), feet]);
    return feet > 1 || east > 4.91;
  });
  assert.deepEqual(samples, [1, 2].flatMap(feet =>
    [5.8, 5.65, 5.5, 5.35, 5.2, 5.05, 4.9].map(east => [east, 20, feet])));
  assert.equal(activity.spots.length, 1);
  assert.ok(Math.abs(activity.spots[0].x - 4.90) < 1e-10);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(warn.mock.calls[0].arguments[0], /fixture window 2/);
});

test('each audited tavern and memorial window has an unobstructed stand on a walkable surface', t => {
  const museum = buildMuseumLandmark();
  // Tavern builds canvas textures for its voxel materials. Stand placement uses only walk geometry.
  const previousDocument = globalThis.document;
  if (!previousDocument) {
    globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }) } as unknown as Document;
    t.after(() => { Reflect.deleteProperty(globalThis, 'document'); });
  }
  const tavernPlot = layout.plots.find(({ id }) => id === 'tavern')!;
  const museumPlot = layout.plots.find(({ id }) => id === 'memorial')!;
  const fixtures = [
    { plot: tavernPlot, build: () => buildTavernLandmark(tavernPlot), count: 14, audited: [1, 3, 5, 6, 10, 11, 14] },
    { plot: museumPlot, build: () => museum, count: 59, audited: [20, 22, 30, 33, 34, 53] },
  ];
  for (const { plot, build, count, audited } of fixtures) {
    const root = build();
    const [east, north, ground] = plot.origin;
    root.position.set(east, ground, -north);
    const { colliders, floors } = readWalkGeometry(root);
    const obstacles = [...colliders, ...floors];
    // Match the player cylinder and vertical clearance used by obstructed().
    const blocked = (x: number, n: number, feet: number) => obstacles.some(box =>
      feet + .025 < box.max[1] && feet + 1.8 - .025 > box.min[1] && overlapsBody(x, n, box));
    const windows = createWindowActivity(context, new Map([[plot.id, root]]), blocked);
    const { spots } = windows;
    assert.equal(spots.length, count, `${plot.id} retained all window interactions`);
    for (const window of audited) {
      const spot = spots[window - 1];
      const label = `${plot.id} window ${window}`;
      assert.equal(blocked(spot.x, spot.n, spot.ground), false, label);
      const floor = floors.reduce((height, box) =>
        box.max[1] <= spot.ground + .025 && overlapsBody(spot.x, spot.n, box) ? Math.max(height, box.max[1]) : height,
        terrain.heightAt(spot.x, spot.n));
      assert.ok(Math.abs(floor - spot.ground) <= .025, `${label} is on floor ${floor}`);
      assert.equal(nearestTownActivity(spots, spot.x, spot.n, floor), spot, label);
    }
    if (plot.id !== 'tavern') continue;
    const zodiac = createZodiacProgress(['rooster']);
    let celebrations = 0;
    const rooster = createTavernRoosterCharm(root, windows, zodiac,
      (x, n, ground) => !blocked(x, n, ground), () => celebrations++);
    assert.ok(rooster);
    assert.ok(floors.some(box => box.max[1] === rooster.ground && overlapsBody(rooster.x, rooster.n, box)));
    const window = spots.find(spot => spot.x === rooster.x && spot.ground === rooster.ground &&
      spot.n > rooster.n && spot.n - rooster.n < .60);
    assert.ok(window);
    assert.equal(nearestTownActivity([...spots, rooster], rooster.x, rooster.n, rooster.ground), window);
    rooster.run();
    assert.equal(zodiac.count(), 0);
    context.scene.add(root);
    window.run();
    windows.update(1);
    assert.equal(nearestTownActivity([...spots, rooster], rooster.x, rooster.n, rooster.ground), rooster);
    const charm = root.getObjectByName('生肖寻宝 · 鸡挂牌')!;
    root.updateWorldMatrix(true, true);
    const eye = new Vector3(rooster.x, rooster.ground + 1.65, -rooster.n);
    const target = new Vector3(charm.position.x + .04, charm.position.y + .13, charm.position.z)
      .add(root.position as unknown as Vector3);
    const look = new Raycaster(eye, target.sub(eye).normalize());
    assert.equal(look.intersectObject(root as unknown as Group)[0]?.object, charm, 'existing open window reveals the outer sill');
    assert.equal(blocked(rooster.x, rooster.n - .5, rooster.ground), true, 'wall stops a step outside');
    rooster.run();
    assert.equal(celebrations, 1);
    assert.equal(charm.visible, false);
    assert.equal(nearestTownActivity([...spots, rooster], window.x, window.n, window.ground), window);
    window.run();
    assert.equal(window.label, '打开窗户');
  }
});
