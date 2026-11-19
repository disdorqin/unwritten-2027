import assert from 'node:assert/strict';
import { createMainSummitCable, summitCableSpec } from './voxel-tavern/town-blockout/main-summit-cable';

// The preview injects the independently reviewed P-1 terrain from its pinned commit.
const p1Fixture = './voxel-tavern/town-blockout/main-summit-block.ts';
const { createMainSummitBlock, mainSummitLayout } = await import(p1Fixture);
const land = createMainSummitBlock(mainSummitLayout, 347, 120);
const clock = createMainSummitCable(0, 10000, 347);
const edges = [-1, 0, 1];
let leastClearance = Infinity;
let leastInFlight = Infinity;
let probeCount = 0;
let passBy = Infinity;
const stations = [];
for (const [index, rope] of clock.ropes.entries()) {
  for (const station of ['cloud-deck', 'summit'] as const) {
    const { approach, board } = rope.dock(station);
    for (let i = 0; i <= 32; i++) {
      for (const clearance of [-0.35, 0, 0.35]) {
        const east = approach.east + (board.east - approach.east) * i / 32;
        const north = approach.north + (board.north - approach.north) * i / 32 + clearance;
        assert.equal(land.heightAt(east, north), board.height);
      }
    }
    stations.push({ index, station, approach, board });
  }
  for (let distance = 0; distance <= rope.totalMetres; distance += 0.25) {
    const point = rope.sample(distance);
    for (const lateral of edges) for (const along of edges) {
      const s = Math.sin(point.heading), c = Math.cos(point.heading);
      const offsetEast = lateral * summitCableSpec.cabinHalfWidth * c + along * summitCableSpec.cabinHalfLength * s;
      const offsetNorth = -lateral * summitCableSpec.cabinHalfWidth * s + along * summitCableSpec.cabinHalfLength * c;
      const ground = land.heightAt(point.east + offsetEast, point.north + offsetNorth);
      assert.notEqual(ground, undefined);
      const clearance = point.height - summitCableSpec.cabinFloorBelowRope - ground!;
      leastClearance = Math.min(leastClearance, clearance);
      if (distance > 10 && distance < rope.totalMetres - 10) leastInFlight = Math.min(leastInFlight, clearance);
      probeCount++;
    }
  }
}
for (let ms = 0; ms <= clock.rideMs; ms += 10) {
  const [a, b] = clock.cabinsAt(10000 + ms).map(car => car.ropePoint);
  passBy = Math.min(passBy, Math.hypot(a!.east - b!.east, a!.north - b!.north, a!.height - b!.height));
}
console.log(JSON.stringify({ ropeLength: clock.ropes.map(rope => rope.totalMetres), rideMs: clock.rideMs,
  passBy, stations, probeCount, leastClearance, leastInFlight }, null, 2));
assert.ok(leastClearance > -1e-9);
land.dispose();
