import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PerspectiveCamera, Vector3 } from 'three';
import { createMainSummitBlock, mainSummitLayout } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createMainSummitCable, summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { createMainSummitCableTravel } from '../tools/voxel-tavern/town-blockout/main-summit-cable-travel';
import { mainSummitCloudSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cloud-layer';
import { createSkyCityRevealEffects } from '../tools/voxel-tavern/town-blockout/sky-city-reveal-effects';
import { createSkyCityRevealSightline } from '../tools/voxel-tavern/town-blockout/sky-city-reveal-sightline';
import { createSkyCityReveal } from '../tools/voxel-tavern/town-blockout/sky-city-reveal';
import { createSkyCitySite } from '../tools/voxel-tavern/town-blockout/sky-city-site';

test('both existing cable ropes clear the P-8 cloud top before the cue', t => {
  const dwell = 10_000;
  const cable = createMainSummitCable(0, dwell, 347);
  const crossings: number[] = [];
  for (const index of [0, 1] as const) {
    const reveal = createSkyCityReveal();
    for (let ms = 100_000; ms < 150_000; ms++) {
      const frame = cable.cabinsAt(ms + dwell + index * cable.legMs)[index];
      const height = frame.ropePoint.height - summitCableSpec.cabinFloorBelowRope;
      if (reveal.sample({ source: 'mountain', height, inView: true, whiteout: frame.phase === 'whiteout' })) {
        assert.ok(height >= mainSummitCloudSpec.top);
        assert.ok(ms > summitCableSpec.emergeMs);
        crossings.push(ms);
      }
    }
    assert.equal(reveal.seen(), true);
  }
  assert.equal(crossings.length, 2);
  t.diagnostic(JSON.stringify(crossings));
});

test('the sightline uses a parented camera world pose and rejects terrain and off-screen targets', () => {
  const carrier = new Group();
  carrier.position.set(10, 50, -20);
  const camera = new PerspectiveCamera(60, 1, .1, 100);
  camera.position.set(1, 2, 3);
  carrier.add(camera);
  const center = new Vector3(11, 52, -37);
  let ridge: number | undefined;
  const visible = createSkyCityRevealSightline((east, north) => east === 11 && north === 27 ? ridge : undefined);

  assert.equal(visible(camera, center), true);
  ridge = 51.99;
  assert.equal(visible(camera, center), true);
  ridge = 52;
  assert.equal(visible(camera, center), false);
  assert.equal(visible(camera, new Vector3(31, 52, -37)), false);
  assert.equal(visible(camera, new Vector3(11, 52, -17.05)), false);
  assert.equal(visible(camera, new Vector3(11, 52, -120)), false);
  assert.equal(visible(camera, new Vector3(11, 52, 3)), false);
  carrier.rotateY(Math.PI);
  assert.equal(visible(camera, center), false);
});

test('both boarded cabins require a visible island after leaving the cloud', () => {
  const dwell = 10_000;
  const cable = createMainSummitCable(0, dwell, 347);
  const travel = createMainSummitCableTravel(cable);
  const summit = createMainSummitBlock(mainSummitLayout, 347, 48);
  const visible = createSkyCityRevealSightline(summit.heightAt);
  const camera = new PerspectiveCamera(61, 800 / 520, .07, 3_200);
  // Reuse the isolated review site. A production host supplies its own site.
  const reviewSite = createSkyCitySite({ east: -420, north: 832, height: 689 });
  const centerAt = reviewSite.toWorld({ x: 0, y: 3, z: 0 });
  const center = new Vector3(centerAt.east, centerAt.height, -centerAt.north);
  const lookTarget = new Vector3();
  try {
    for (const index of [0, 1] as const) {
      const stationTime = index * cable.legMs;
      const ride = travel.attemptBoard(stationTime, index, cable.ropes[index].dock('cloud-deck').approach);
      assert.ok(ride);
      const reveal = createSkyCityReveal();
      const sample = (elapsed: number, towardsIsland: boolean) => {
        const { feet, whiteout } = travel.ridePose(stationTime + dwell + elapsed, ride);
        camera.position.set(feet.east, feet.height + 1.65, -feet.north);
        camera.lookAt(towardsIsland ? center : lookTarget.copy(camera.position).multiplyScalar(2).sub(center));
        return reveal.sample({ source: 'mountain', height: feet.height, whiteout, inView: visible(camera, center) });
      };
      assert.equal(sample(summitCableSpec.whiteoutMs, true), false);
      assert.equal(sample(138_000, false), false);
      assert.equal(reveal.seen(), false);
      assert.equal(sample(140_000, true), true);
      assert.equal(sample(142_000, true), false);
    }
  } finally {
    summit.dispose();
  }
});

test('joins above the cloud, descending, transfer from ground, and replay stay quiet; looking back can reveal', () => {
  const reveal = createSkyCityReveal();
  const mountain = (height: number, inView = true, whiteout = false) =>
    reveal.sample({ source: 'mountain', height, inView, whiteout });
  assert.equal(mountain(796), false);
  assert.equal(mountain(559), false);
  assert.equal(reveal.sample({ source: 'ground', height: 559, inView: true, whiteout: false }), false);
  assert.equal(mountain(580), false);
  assert.equal(mountain(555), false);
  assert.equal(mountain(560, false), false);
  assert.equal(mountain(561, true, true), false);
  assert.equal(mountain(562, true), true);
  assert.equal(mountain(563), false);
  assert.equal(mountain(555), false);
  assert.equal(mountain(563), false);
  const resumed = createSkyCityReveal(reveal.seen());
  assert.equal(resumed.sample({ source: 'mountain', height: 541, whiteout: true, inView: true }), false);
  assert.equal(resumed.sample({ source: 'mountain', height: 581, whiteout: false, inView: true }), false);
});

test('stores only a sighting and restores it across controllers for the same profile', () => {
  const writes: string[] = [];
  const openProfile = (profile: string) => createSkyCityReveal(false, {
    hasSeen: () => writes.includes(profile),
    markSeen: () => { writes.push(profile); },
  });
  const { top } = mainSummitCloudSpec;
  const rising = { source: 'mountain', height: top - 1, whiteout: false, inView: true } as const;
  const emerged = { ...rising, height: top + 1 };

  const first = openProfile('first');
  assert.equal(first.sample({ ...rising, source: 'ground' }), false);
  assert.equal(first.sample(rising), false);
  assert.equal(first.sample({ ...emerged, inView: false }), false);
  assert.deepEqual(writes, []);
  assert.equal(first.sample(emerged), true);
  assert.equal(first.sample(emerged), false);

  const returning = openProfile('first');
  assert.equal(returning.seen(), true);
  assert.equal(returning.sample(rising), false);
  assert.equal(returning.sample(emerged), false);
  assert.deepEqual(writes, ['first']);

  const second = openProfile('second');
  assert.equal(second.seen(), false);
  assert.equal(second.sample(rising), false);
  assert.equal(second.sample(emerged), true);
  assert.deepEqual(writes, ['first', 'second']);
});

test('storage failures still allow the cue once and preserve memory across scene resets', () => {
  let reads = 0;
  let writes = 0;
  const unavailable = {
    hasSeen() { reads++; throw new Error('unavailable'); },
    markSeen() { writes++; throw new Error('unavailable'); },
  };
  const { top } = mainSummitCloudSpec;
  const rising = { source: 'mountain', height: top - 1, whiteout: false, inView: true } as const;
  const emerged = { ...rising, height: top + 1 };
  const first = createSkyCityReveal(false, unavailable);
  assert.equal(first.sample(rising), false);
  assert.equal(first.sample(emerged), true);
  assert.equal(first.sample(emerged), false);

  const reset = createSkyCityReveal(first.seen(), unavailable);
  assert.equal(reset.seen(), true);
  assert.equal(reset.sample(rising), false);
  assert.equal(reset.sample(emerged), false);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
});

test('the light rises gradually even when sound is unavailable and releases cleanly', async () => {
  const observed: number[] = [];
  const effect = createSkyCityRevealEffects({ audioContext: () => undefined, onGlow: value => observed.push(value) });
  assert.equal(await effect.unlockAudio(), false);
  assert.equal(effect.reveal(10), true);
  assert.equal(effect.update(10), 0);
  const rising = effect.update(10.35);
  assert.ok(rising > .45 && rising < .55);
  assert.equal(effect.update(10.75), 1);
  assert.equal(effect.reveal(11), false);
  assert.equal(effect.update(13), 0);
  assert.equal(observed.length, 3);
  effect.dispose();
  effect.dispose();
  assert.equal(effect.reveal(14), false);
});
