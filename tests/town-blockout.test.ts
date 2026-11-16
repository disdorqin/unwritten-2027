import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canEnter, createTerrainGrid, layout, riverX } from '../tools/voxel-tavern/town-blockout/terrain.ts';

const { heightAt } = createTerrainGrid();

test('town blockout roads and entrances are continuous on foot', () => {
  const approaches = layout.plots.map(plot => ({
    id: plot.id,
    points: [plot.connect, [...plot.door, plot.origin[2]]],
  }));
  for (const { id, points } of [...layout.roads, ...approaches]) {
    for (let i = 1; i < points.length; i++) {
      const [ax, an] = points[i - 1];
      const [bx, bn] = points[i];
      const steps = Math.ceil(Math.hypot(bx - ax, bn - an) / .25);
      let previous = heightAt(ax, an);
      for (let step = 0; step <= steps; step++) {
        const x = ax + (bx - ax) * step / steps;
        const n = an + (bn - an) * step / steps;
        const height = heightAt(x, n);
        assert.ok(canEnter(x, n), `${id} is blocked at ${x},${n}`);
        assert.ok(Math.abs(height - previous) < .18, `${id} has a height break at ${x},${n}`);
        previous = height;
      }
    }
  }
  for (const { id, origin: [x, n, y], door: [doorX, doorN] } of layout.plots) {
    assert.ok(Math.abs(heightAt(x, n) - y) < .1, `${id} plot elevation`);
    assert.ok(Math.abs(heightAt(doorX, doorN) - y) < .1, `${id} threshold elevation`);
  }
});

test('the plaza stays flat and each crossing uses its bridge deck', () => {
  const [west, south, east, north] = layout.plaza.bounds;
  for (let x = west; x <= east; x++) {
    for (let n = south; n <= north; n++) assert.equal(heightAt(x, n), layout.plaza.height);
  }
  for (const bridge of layout.bridges) {
    const { north, height } = bridge;
    assert.ok(canEnter(riverX(north), north), bridge.id);
    assert.equal(heightAt(riverX(north), north), height);
    assert.ok(!canEnter(riverX(north + 6), north + 6), bridge.id);
  }
});
