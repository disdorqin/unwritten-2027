import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHotSpring } from '../tools/voxel-tavern/town-blockout/landmark-hot-spring.ts';
import { createHotSpringSoak } from '../tools/voxel-tavern/town-blockout/hot-spring-soak.ts';
import { readWalkGeometry, type Box } from '../tools/voxel-tavern/town-blockout/landmark-kit.ts';
import { canEnter, createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { nearestTownActivity, type TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { extensionPlots } from '../tools/voxel-tavern/town-blockout/town-extension.ts';

test('both hot-spring spots have reachable dry treads and clear the soak effect on exit', t => {
  const group = buildHotSpring();
  const effects = new Set<{ className: string }>();
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        const element = { className: '', setAttribute() {}, remove() { effects.delete(element); } };
        return element;
      },
      body: { append: (element: { className: string }) => effects.add(element) },
    },
  });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  const { origin: [east, north, base] } = extensionPlots.find(item => item.id === 'hot-spring')!;
  group.position.set(east, base, -north);
  const { colliders, floors } = readWalkGeometry(group);
  const views: TownSeat[] = [];
  const messages: string[] = [];
  const soak = createHotSpringSoak({
    sit: seat => views.push(seat),
    announce: message => messages.push(message),
  });
  const spots = soak.spots(group);
  assert.equal(spots.length, 2);

  function overlaps(x: number, n: number, { min, max }: Box) {
    const dx = Math.max(min[0] - x, x - max[0], 0);
    const dz = Math.max(min[2] + n, -n - max[2], 0);
    return dx * dx + dz * dz < .27 ** 2;
  }
  const terrain = createTerrainGrid();
  for (const spot of spots) {
    let feet = 15.18;
    // Approach from the dry walkway toward the center of the outer tread.
    for (let i = 18; i >= 0; i--) {
      const n = spot.n - i * .1;
      assert.ok(canEnter(spot.x, n));
      feet = floors.reduce((height, box) =>
        box.max[1] <= feet + .43 && overlaps(spot.x, n, box) ? Math.max(height, box.max[1]) : height,
      terrain.heightAt(spot.x, n));
      assert.equal([...colliders, ...floors].some(box => overlaps(spot.x, n, box) &&
        feet + .025 < box.max[1] && feet + 1.8 - .025 > box.min[1]), false);
    }
    assert.ok(Math.abs(feet - spot.ground) < 1e-9);
    assert.equal(nearestTownActivity(spots, spot.x, spot.n, feet), spot);
    assert.equal(soak.active(), false);
    spot.run();
    spot.run();
    assert.equal(soak.active(), true);
    assert.equal(effects.size, 1);
    assert.equal([...effects][0].className, 'hot-spring-soak');
    const view = views.at(-1)!;
    assert.equal(view.x, spot.x);
    assert.ok(view.n - spot.n >= 2 && view.n - spot.n < 3);
    assert.ok(Math.abs(view.eyeY - 16.28) < 1e-9);
    soak.leave();
    assert.equal(soak.active(), false);
    assert.equal(effects.size, 0);
    assert.match(messages.at(-1) ?? '', /起身上岸/);
    t.diagnostic(`池沿 E${spot.x.toFixed(2)} N${spot.n.toFixed(3)} Y${feet.toFixed(2)}；坐姿 E${view.x.toFixed(2)} N${view.n.toFixed(2)} Y${view.eyeY.toFixed(2)}`);
  }
  assert.equal(views.length, 2);
});
