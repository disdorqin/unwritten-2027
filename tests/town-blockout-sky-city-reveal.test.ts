import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMainSummitCable, summitCableSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cable';
import { mainSummitCloudSpec } from '../tools/voxel-tavern/town-blockout/main-summit-cloud-layer';
import { createSkyCityRevealEffects } from '../tools/voxel-tavern/town-blockout/sky-city-reveal-effects';
import { createSkyCityReveal } from '../tools/voxel-tavern/town-blockout/sky-city-reveal';

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
