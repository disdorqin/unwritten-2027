import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrontRidgeVegetation } from '../tools/voxel-tavern/town-blockout/front-ridge-vegetation';
import { createFrontRidgeSwitchbackRoad } from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';

test('vegetation band: counts, altitude bands, corridor + cable clearance', () => {
  const road = createFrontRidgeSwitchbackRoad();
  const veg = createFrontRidgeVegetation(road);
  const { counts, placements } = veg;

  // A band, not a sprinkling: hundreds of placements, clustered kinds.
  assert.ok(counts.pine >= 120, `pines too few: ${counts.pine}`);
  assert.ok(counts.flagpine >= 40, `flag pines too few: ${counts.flagpine}`);
  assert.ok(counts.shrub >= 80, `shrubs too few: ${counts.shrub}`);
  assert.ok(counts.rock >= 50, `rocks too few: ${counts.rock}`);
  assert.ok(counts.snow >= 15, `snow patches too few: ${counts.snow}`);

  const line = [...road.centreline, ...road.entryCentreline];
  const cable: [number, number][] = [[526, 329], [440, 520], [336, 640]];
  const distSeg = (e: number, n: number, a: [number, number], b: [number, number]) => {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((e - a[0]) * vx + (n - a[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(e - (a[0] + vx * t), n - (a[1] + vy * t));
  };
  for (const p of placements) {
    // Corridor clearance >= 8 m from every centreline point.
    let minRoad = Infinity;
    for (const q of line) minRoad = Math.min(minRoad, Math.hypot(q.east - p.east, q.north - p.north));
    assert.ok(minRoad >= 8, `${p.kind} at (${p.east},${p.north}) only ${minRoad.toFixed(1)} m from corridor`);
    assert.ok(distSeg(p.east, p.north, cable[0]!, cable[1]!) >= 8, `${p.kind} crowds the cable line`);
    assert.ok(distSeg(p.east, p.north, cable[1]!, cable[2]!) >= 8, `${p.kind} crowds the cable line`);
    // Altitude band discipline (with the cluster bleed margins).
    if (p.kind === 'pine') assert.ok(p.height < 132, `pine too high: ${p.height}`);
    if (p.kind === 'flagpine') assert.ok(p.height >= 104 && p.height < 232, `flag pine out of band: ${p.height}`);
    if (p.kind === 'snow') assert.ok(p.height >= 215, `snow patch too low: ${p.height}`);
  }
  // South face (town side, north < 650) must carry the majority --
  // the band is read from town.
  const south = placements.filter(p => p.north < 650).length;
  assert.ok(south / placements.length > 0.55, `south share ${(south / placements.length).toFixed(2)}`);

  veg.setNight(true);
  veg.setNight(false);
  veg.dispose();
  road.dispose();
});
