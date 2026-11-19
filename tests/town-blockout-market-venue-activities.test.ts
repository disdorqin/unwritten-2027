import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import { readWalkGeometry } from '../tools/voxel-tavern/town-blockout/landmark-kit';
import { buildMarketLandmark } from '../tools/voxel-tavern/town-blockout/landmark-market';
import { createMarketVenueActivities } from '../tools/voxel-tavern/town-blockout/market-venue-activities';
import { canEnter, createTerrainGrid, isWater, layout } from '../tools/voxel-tavern/town-blockout/terrain';
import type { TownSeat } from '../tools/voxel-tavern/town-blockout/town-activity';

const plot = layout.plots.find(({ id }) => id === 'market-stalls')!;
const grid = createTerrainGrid();

function actions() {
  const seats: TownSeat[] = [];
  const photos: [number, number, number | undefined, string][] = [];
  let aim: [number, number, number | undefined] | undefined;
  return {
    seats, photos,
    context: {
      sit(seat: TownSeat) { seats.push(seat); },
      face(east: number, north: number, height?: number) { aim = [east, north, height]; },
    },
    save(filename: string) {
      assert.ok(aim);
      photos.push([...aim, filename]);
    },
  };
}

test('the generated market registers eight supported bench places and two dry photo positions', t => {
  const previousDocument = globalThis.document;
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillText() {}, fillRect() {}, strokeRect() {}, drawImage() {},
        createLinearGradient: () => ({ addColorStop() {} }),
      }),
    }),
  } as unknown as Document;
  t.after(() => {
    if (previousDocument) globalThis.document = previousDocument;
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const group = buildMarketLandmark(plot);
  group.position.set(plot.origin[0], plot.origin[2], -plot.origin[1]);
  const { colliders, floors } = readWalkGeometry(group);
  function dryGround(x: number, n: number, hint?: number) {
    if (!canEnter(x, n) || isWater(x, n)) return undefined;
    const matching = [...colliders, ...floors].filter(({ min, max }) =>
      Math.hypot(Math.max(min[0] - x, x - max[0], 0), Math.max(min[2] + n, -n - max[2], 0)) < .27);
    const surface = grid.heightAt(x, n);
    const feet = Math.max(surface, ...matching.map(box => box.max[1]).filter(y => y <= (hint ?? surface) + .025));
    return matching.some(({ min, max }) => min[1] < feet + 1.775 && max[1] > feet + .025) ? undefined : feet;
  }
  const { context, save, seats, photos } = actions();
  const spots = createMarketVenueActivities(group, context, dryGround, save);
  assert.equal(spots.length, 10);
  for (const spot of spots) {
    assert.equal(spot.ground, dryGround(spot.x, spot.n));
    spot.run();
  }
  assert.equal(seats.length, 8);
  assert.equal(new Set(seats.map(({ x, n }) => `${x}:${n}`)).size, 8);
  for (const seat of seats) {
    const benchY = seat.eyeY - .98;
    assert.ok(Math.abs(dryGround(seat.x, seat.n, benchY)! - benchY) < 1e-8);
    assert.ok(Math.abs(Math.sin(seat.yaw)) < .28, 'the seat faces its dining table');
  }
  const nearPole = seats.find(seat => Math.abs(seat.n - 87.83) < .001 && seat.x < 159);
  assert.ok(nearPole && Math.abs(nearPole.x - 158.82) < .001);
  assert.equal(photos.length, 2);
  assert.deepEqual(photos[0], [154, 93.5, 12.45, 'UNWRITTEN-2027-market-gate.png']);
  assert.equal(photos[1][3], 'UNWRITTEN-2027-market-lantern-tables.png');
});

test('missing venue geometry, wrong bench heights and blocked approaches never register activities', () => {
  const group = new Group();
  const { context, save } = actions();
  assert.deepEqual(createMarketVenueActivities(undefined, context, () => 10, save), []);
  assert.deepEqual(createMarketVenueActivities(group, context, () => 10, save), []);
  group.userData.marketDiningTables = [{ x: 4.6, z: 17.2, base: 9.2951 }];
  group.userData.marketGate = { x: 0, z: 11.5, base: 9.9 };
  assert.deepEqual(createMarketVenueActivities(group, context, () => undefined, save), []);
  const spots = createMarketVenueActivities(group, context, (_x, _n, hint) => hint === undefined ? 9 : hint - .05, save);
  assert.equal(spots.length, 2);
  assert.ok(spots.every(spot => spot.label.startsWith('保存')));
});
