import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHotSpring } from '../tools/voxel-tavern/town-blockout/landmark-hot-spring.ts';
import { hotSpringPhotoStand, hotSpringTeaStand } from '../tools/voxel-tavern/town-blockout/hot-spring-details.ts';
import { createHotSpringSoak, hotSpringPools } from '../tools/voxel-tavern/town-blockout/hot-spring-soak.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { canEnter, createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity, type TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { extensionPlots } from '../tools/voxel-tavern/town-blockout/town-extension.ts';

function overlaps(x: number, n: number, { min, max }: Box) {
  const dx = Math.max(min[0] - x, x - max[0], 0);
  const dz = Math.max(min[2] + n, -n - max[2], 0);
  return dx * dx + dz * dz < .27 ** 2;
}

test('all four hot-spring treads, tea stall and snow-view spot are accessible from the west gate', t => {
  const group = buildHotSpring();
  const { origin: [east, north, base], footprint } = extensionPlots.find(item => item.id === 'hot-spring')!;
  group.position.set(east, base, -north);
  const { colliders, floors } = readWalkGeometry(group);
  const soak = createHotSpringSoak({ sit() {}, announce() {} });
  const spots = soak.spots(group);
  const terrain = createTerrainGrid();
  assert.equal(spots.length, 4);
  assert.deepEqual(spots.slice(0, 2).map(({ x, n, ground }) => [x, n, ground]), [
    [547.35, 164.165, 15.31], [560.08, 163.69, 15.31],
  ]);

  const gate = [-24, 0] as const;
  type Point = readonly [number, number];
  function walk(route: readonly Point[]) {
    let feet = base;
    let samples = 0;
    for (let leg = 1; leg < route.length; leg++) {
      const [fromX, fromZ] = route[leg - 1];
      const [toX, toZ] = route[leg];
      const steps = Math.ceil(Math.hypot(toX - fromX, toZ - fromZ) / .1);
      for (let i = 1; i <= steps; i++) {
        const x = east + fromX + (toX - fromX) * i / steps;
        const n = north - (fromZ + (toZ - fromZ) * i / steps);
        assert.ok(canEnter(x, n), `outside ground E${x} N${n}`);
        const maxStep = feet + .43;
        feet = floors.reduce((height, box) =>
          box.max[1] <= maxStep && overlaps(x, n, box) ? Math.max(height, box.max[1]) : height,
        terrain.heightAt(x, n));
        const obstacle = [...colliders, ...floors].find(box => overlaps(x, n, box) &&
          feet + .025 < box.max[1] && feet + 1.8 - .025 > box.min[1]);
        assert.equal(obstacle, undefined, `blocked at E${x.toFixed(2)} N${n.toFixed(2)} Y${feet.toFixed(2)}`);
        samples++;
      }
    }
    return { feet, samples };
  }

  let samples = 0;
  for (const [index, spot] of spots.entries()) {
    const localX = spot.x - east, localZ = north - spot.n;
    const route: Point[] = index === 2
      ? [gate, [-12.25, 0], [-12.25, -5.7], [localX, -5.7], [localX, localZ]]
      : [gate, [localX, 0], [localX, localZ]];
    const result = walk(route);
    samples += result.samples;
    assert.ok(Math.abs(result.feet - spot.ground) < 1e-9);
    assert.equal(nearestTownActivity(spots, spot.x, spot.n, result.feet), spot);
    t.diagnostic(`池沿 E${spot.x.toFixed(2)} N${spot.n.toFixed(3)} Y${result.feet.toFixed(2)} · ${result.samples} 点`);
  }
  samples += walk([gate, [hotSpringTeaStand[0], 0], [hotSpringTeaStand[0], hotSpringTeaStand[2]]]).samples;
  samples += walk([gate, [23.19, 0], [23.19, -11.75], [hotSpringPhotoStand[0], -11.75],
    [hotSpringPhotoStand[0], hotSpringPhotoStand[2]]]).samples;
  t.diagnostic(`四池、茶点、拍照通行共 ${samples} 点`);
  const interiors: Point[][] = [
    [gate, [-9.5, 0], [-9.5, 12.7]],
    [gate, [9.94, 0], [9.94, 7.35], [18.3, 7.35], [18.3, 8.5], [19.8, 8.5]],
    [gate, [9.94, 0], [9.94, 7.35], [18.3, 7.35], [18.3, 10.8], [19.8, 10.8]],
  ];
  const interiorSamples = interiors.reduce((count, route) => count + walk(route).samples, 0);
  t.diagnostic(`桑拿和两处更衣隔间通行共 ${interiorSamples} 点`);

  for (const box of [...colliders, ...floors]) {
    assert.ok(box.min[0] >= east - footprint[0] / 2 && box.max[0] <= east + footprint[0] / 2);
    assert.ok(box.min[2] >= -north - footprint[1] / 2 && box.max[2] <= -north + footprint[1] / 2);
  }
  assert.equal(group.userData.seats.length, 5);
  const boxes = group.children.reduce((count, child) =>
    count + ('count' in child && typeof child.count === 'number' ? child.count : 0), 0);
  assert.ok(boxes <= 2850, `instance count ${boxes}`);
  const steam = group.children.find(child => child.name === 'Bath steam');
  assert.ok(steam && 'geometry' in steam);
  if (!steam || !('geometry' in steam)) assert.fail('steam object missing');
  const buffer = (steam.geometry as { getAttribute(name: string): { count: number; version: number } }).getAttribute('position');
  assert.equal(buffer.count, 40);
  group.userData.updateSteam(.1, 49.9);
  assert.equal(steam.visible, true);
  const prior = buffer.version;
  group.userData.updateSteam(.1, 50);
  assert.equal(steam.visible, false);
  assert.equal(buffer.version, prior);
  t.diagnostic(`共 ${boxes} 实例盒，${buffer.count} 蒸汽点，50 米外缓冲不更新`);
});

test('valid soaking requires three uninterrupted seconds and same-pool names can pick different seats', t => {
  const group = buildHotSpring();
  const overlays = new Set<{ className: string; textContent: string }>();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        const element = { className: '', textContent: '', setAttribute() {}, remove() { overlays.delete(element); } };
        return element;
      },
      body: { append: (...elements: { className: string; textContent: string }[]) => elements.forEach(el => overlays.add(el)) },
    },
  });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  let now = 0;
  let name = '验收A';
  t.mock.method(performance, 'now', () => now);
  t.mock.timers.enable({ apis: ['setInterval'] });
  function pass(ms: number) { now += ms; t.mock.timers.tick(ms); }

  const views: TownSeat[] = [];
  const messages: string[] = [];
  const valid: string[] = [];
  const warmth: boolean[] = [];
  const soak = createHotSpringSoak(
    { sit: seat => views.push(seat), announce: message => messages.push(message) },
    active => warmth.push(active),
    { playerName: () => name, onValidSoak: id => valid.push(id) },
  );
  const spots = soak.spots(group);
  const east = spots[1];
  east.run();
  east.run();
  assert.deepEqual(warmth, [true]);
  assert.equal(views.length, 1);
  assert.equal(overlays.size, 2);
  pass(2000);
  assert.equal([...overlays].find(el => el.className === 'hot-spring-progress')?.textContent, '已泡 2 秒');
  assert.equal(valid.length, 0);
  soak.leave();
  assert.equal(overlays.size, 0);
  assert.equal(soak.active(), false);
  assert.equal(valid.length, 0);

  name = '验收B';
  east.run();
  pass(3000);
  assert.deepEqual(valid, ['east']);
  assert.equal(messages.at(-1), '泡汤达成 · 暖意入身');
  pass(2000);
  soak.leave();
  assert.deepEqual(valid, ['east']);
  assert.equal(overlays.size, 0);
  assert.notEqual(views[0].x, views[1].x);
  assert.equal(views[0].n, views[1].n);
  assert.equal(views[0].eyeY, views[1].eyeY);
  assert.deepEqual(warmth, [true, false, true, false]);

  for (const [index, spot] of spots.entries()) {
    spot.run();
    const pose = views.at(-1)!;
    assert.ok(Math.abs(pose.eyeY - 1.28) < 1e-9);
    assert.ok(Math.abs(pose.n - spot.n - (hotSpringPools[index].depth / 2 + .06)) < 1e-9);
    if (index === 3) assert.equal(pose.x, spot.x);
    soak.leave();
  }
});
