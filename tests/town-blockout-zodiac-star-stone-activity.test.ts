import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { nearestTownActivity } from '../tools/voxel-tavern/town-blockout/town-activity';
import {
  createZodiacStarStoneActivity,
  type ZodiacStarStonePoint,
  type ZodiacStarStoneRequest,
  type ZodiacStarStoneView,
} from '../tools/voxel-tavern/town-blockout/zodiac-star-stone-activity';

const origin = { area: 'test-town', east: 12.5, north: 40, height: 3.75 };
const lower = { ...origin, area: 'test-lower' };
const altar = { area: 'test-town', east: 19, north: 48, height: 3.75 };
const approach = { ...altar, north: 49.25 };
const ring = { position: altar, approach };
const carried = { id: 'mouse', revision: 2 };

function setup() {
  const scene = new Scene();
  const submitted: ZodiacStarStoneRequest[] = [];
  let now = 6_000;
  const activity = createZodiacStarStoneActivity(scene, {
    range: 1.2,
    serverNow: () => now,
    submit: request => submitted.push(request),
  });
  const paint = (stones: ZodiacStarStoneView['progress']['stones'] = [], options: {
    area?: string;
    ringCount?: number;
    carrying?: ZodiacStarStoneView['carriedStones'];
    altar?: ZodiacStarStoneView['ring'];
  } = {}) => activity.sync({
    area: options.area ?? 'test-town',
    progress: { ringCount: options.ringCount ?? 0, stones },
    carriedStones: options.carrying ?? [],
    ring: options.altar,
  });
  const near = (point: ZodiacStarStonePoint) => nearestTownActivity(activity.spots, point.east, point.north, point.height);
  return { scene, submitted, activity, paint, near, time: (value: number) => { now = value; } };
}

test('paints twelve empty ring positions at the injected world anchor, without making up stone spots', () => {
  const { scene, activity, paint } = setup();
  paint([], { altar: ring });
  const altarGroup = scene.getObjectByName('star-stone-ring');
  assert.deepEqual(altarGroup?.position.toArray(), [altar.east, altar.height, -altar.north]);
  assert.equal(altarGroup?.children.filter(child => child.name === 'star-stone-ring-empty').length, 12);
  assert.equal(activity.spots.length, 0);
  paint([], { ringCount: 11 });
  assert.equal(scene.getObjectByName('star-stone-ring'), undefined);
  assert.equal(activity.ringCount(), 11);
});

test('the native activity query reaches the occupied stone on its floor and submits its authority revision', () => {
  const { scene, activity, paint, submitted, near } = setup();
  paint([{ id: 'mouse', revision: 1, phase: 'origin', origin }]);
  const placed = scene.getObjectByName('star-stone-occupied-seat');
  assert.deepEqual(placed?.position.toArray(), [12.5, 3.75, -40]);
  assert.equal(near({ ...origin, east: 13.71 }), undefined);
  assert.equal(near({ ...origin, height: 4.31 }), undefined);
  const spot = near({ ...origin, east: 13.5 });
  assert.equal(spot?.label, '拾取星石');
  spot?.run();
  assert.deepEqual(submitted, [{ kind: 'pickup', stoneId: 'mouse', revision: 1 }]);
  assert.equal(activity.spots.length, 1);
  assert.ok(scene.getObjectByName('star-stone-occupied-seat'));
});

test('a held stone exposes only the empty authorized base and stale spot callbacks cannot issue actions', () => {
  const { scene, paint, near, activity, submitted } = setup();
  const stations = activity.spots;
  paint([{ id: 'mouse', revision: 1, phase: 'origin', origin }, { id: 'unplaced', revision: 0, phase: 'origin' }]);
  const stale = near(origin);
  paint([{ ...carried, phase: 'held', origin }, { id: 'other-floor', revision: 3, phase: 'origin', origin: lower }]);
  assert.equal(activity.spots, stations);
  assert.equal(scene.getObjectByName('star-stone-empty-seat')?.children.length, 3);
  assert.equal(scene.getObjectByName('star-stone-occupied-seat'), undefined);
  assert.equal(near(origin), undefined);
  stale?.run();
  assert.deepEqual(submitted, []);
});

test('drop lock uses synchronized time and its scene stays separate from an equally positioned origin', () => {
  const { scene, submitted, paint, near, time } = setup();
  const dropped = { id: 'mouse', revision: 3, phase: 'dropped', origin, dropPosition: lower, pickupLockedUntilMs: 9_000 } as const;
  paint([dropped]);
  assert.ok(scene.getObjectByName('star-stone-empty-seat'));
  assert.equal(scene.getObjectByName('star-stone-dropped'), undefined);
  paint([dropped], { area: lower.area });
  assert.equal(scene.getObjectByName('star-stone-empty-seat'), undefined);
  assert.deepEqual(scene.getObjectByName('star-stone-dropped')?.position.toArray(), [12.5, 3.75, -40]);
  time(8_999);
  assert.equal(near(lower), undefined);
  time(9_000);
  near(lower)?.run();
  assert.deepEqual(submitted, [{ kind: 'pickup', stoneId: 'mouse', revision: 3 }]);
  paint([{ id: 'mouse', revision: 4, phase: 'origin', origin }]);
  assert.ok(scene.getObjectByName('star-stone-occupied-seat'));
  assert.equal(scene.getObjectByName('star-stone-dropped'), undefined);
});

test('the deposit action uses the host approach and own carrier IDs while ring fills wait for server progress', () => {
  const { scene, paint, near, submitted, activity } = setup();
  const held = [{ ...carried, phase: 'held', origin }] as const;
  paint(held, { altar: ring, ringCount: 10 });
  assert.equal(near(approach), undefined);
  paint(held, { altar: { position: altar, approach: { ...approach, area: lower.area } }, carrying: [carried] });
  assert.equal(near(approach), undefined);
  paint(held, { altar: ring, ringCount: 10, carrying: [carried] });
  assert.equal(near(altar), undefined);
  near(approach)?.run();
  assert.deepEqual(submitted, [{ kind: 'deposit', stoneId: 'mouse', revision: 2 }]);
  assert.equal(activity.ringCount(), 10);
  paint([{ id: 'mouse', revision: 3, phase: 'ring', origin }], { altar: ring, ringCount: 11 });
  const slots = scene.getObjectByName('star-stone-ring')?.children ?? [];
  assert.equal(slots.filter(child => child.name === 'star-stone-ring-filled').length, 11);
  assert.equal(slots.filter(child => child.name === 'star-stone-ring-empty').length, 1);
  assert.ok(scene.getObjectByName('star-stone-empty-seat'));
  assert.equal(near(approach), undefined);
});

test('an identical authorized snapshot keeps hooks stable and disposing clears their scene, geometry and actions', () => {
  const { scene, activity, paint, near, submitted } = setup();
  const visible = [{ id: 'mouse', revision: 1, phase: 'origin', origin }] as const;
  paint(visible);
  const original = scene.getObjectByName('star-stone-occupied-seat');
  const stale = near(origin);
  paint(visible);
  assert.equal(scene.getObjectByName('star-stone-occupied-seat'), original);
  assert.equal(near(origin), stale);
  activity.dispose();
  activity.dispose();
  paint(visible);
  stale?.run();
  assert.equal(activity.spots.length, 0);
  assert.equal(scene.getObjectByName('zodiac-star-stones'), undefined);
  assert.deepEqual(submitted, []);
});
