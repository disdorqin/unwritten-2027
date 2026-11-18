import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, PerspectiveCamera, Scene, type InstancedMesh, type Points, type ShaderMaterial } from 'three';
import { createFestival, makePlayerFireworksTable } from '../tools/voxel-tavern/town-blockout/festival.ts';
import { createSnowfall } from '../tools/voxel-tavern/town-blockout/snowfall.ts';
import { createTownLights } from '../tools/voxel-tavern/town-blockout/town-lights.ts';
import { createTownFireworksActivity } from '../tools/voxel-tavern/town-blockout/town-fireworks-activity.ts';
import { canEnter, createTerrainGrid, isWater } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { fireworksCooldownMs, fireworksShowMs, fireworksSiteRangeMetres, isFireworksSeed, isFireworksTheme, publicFireworksStand } from '../src/presence/firework-sites.ts';

test('the workshop reward uses the plaza particles without starting or interrupting the main show', () => {
  const scene = new Scene();
  const messages: string[] = [];
  let shows = 0;
  const festival = createFestival(scene, message => messages.push(message), () => shows++);
  const particles = scene.children[0] as Points;

  assert.ok(particles.isPoints);
  assert.equal(scene.children.length, 1);
  assert.equal(festival.launchWorkshopBurst(116.25, 15.4, -115), true);
  assert.equal(festival.launchWorkshopBurst(116.25, 15.4, -115), false);
  festival.update(.4);
  assert.equal(festival.active(), false);
  assert.equal(particles.visible, true);
  assert.ok(particles.geometry.drawRange.count > 0 && particles.geometry.drawRange.count <= 108);
  assert.deepEqual(messages, []);

  assert.equal(festival.start(), true);
  festival.update(.4);
  assert.equal(particles.visible, true);
  assert.equal(festival.active(), true);
  assert.equal(messages.at(-1), '3');
  festival.update(3);
  assert.equal(messages.at(-1), '新年快乐！');
  festival.update(16);
  assert.equal(shows, 1);
  assert.equal(festival.active(), false);
  assert.equal(particles.visible, false);
  assert.equal(scene.children.length, 1);
});

test('ceremony fireworks use one pooled Points at the plaza, lake and memorial without starting rehearsal', () => {
  const scene = new Scene();
  let announcements = 0;
  let previews = 0;
  const festival = createFestival(scene, () => announcements++, () => previews++);
  const particles = scene.children[0] as Points;
  const positions = particles.geometry.attributes.position;

  assert.equal(festival.launchCeremony('fireworks-main', 500), false);
  assert.equal(festival.launchCeremony('fireworks-main'), true);
  assert.equal(festival.launchCeremony('fireworks-main'), false);
  festival.update(.4);
  assert.ok(particles.geometry.drawRange.count > 0);
  assert.ok(positions.getX(0) > 200 && positions.getX(0) < 250);

  assert.equal(festival.launchCeremony('fireworks-far'), true);
  festival.update(.2);
  const zs = Array.from({ length: particles.geometry.drawRange.count }, (_, index) => positions.getZ(index));
  assert.ok(zs.some(z => z > -100), 'lake rockets should use the lake launch position');
  assert.ok(zs.some(z => z < -250), 'memorial rockets should use the memorial launch position');
  assert.equal(festival.launchCeremony('fireworks-finale'), true);
  festival.update(1.4);
  assert.ok(particles.geometry.drawRange.count > 0);
  assert.ok(particles.geometry.drawRange.count <= positions.count);
  assert.equal(festival.active(), false);
  assert.equal(scene.children.length, 1);
  assert.deepEqual([announcements, previews], [0, 0]);

  festival.update(20);
  assert.equal(particles.visible, false);
  assert.equal(particles.geometry.drawRange.count, 0);
});

test('ceremony snow increases density and drift in the original Points and returns to baseline indoors', () => {
  const scene = new Scene();
  const snow = createSnowfall(scene);
  const flakes = scene.children[0] as Points;
  const uniforms = (flakes.material as ShaderMaterial).uniforms;
  const camera = new PerspectiveCamera();
  assert.equal(flakes.geometry.drawRange.count, 1580);
  snow.update(camera, 1, true);
  assert.equal(uniforms.time.value, 1);

  snow.setIntensity(2.5);
  assert.equal(uniforms.storm.value, .5);
  assert.equal(uniforms.time.value, 1, 'changing intensity must preserve positions at the same instant');
  const mildCount = flakes.geometry.drawRange.count;
  assert.ok(mildCount > 1580 && mildCount < 3160);
  snow.setIntensity(4);
  snow.update(camera, 1, true, true);
  assert.equal(flakes.geometry.drawRange.count, 3160);
  assert.ok(uniforms.time.value > 2);
  assert.equal(flakes.visible, false);
  assert.equal(scene.children.length, 1);

  snow.setIntensity(1);
  snow.update(camera, 0, true);
  assert.equal(flakes.geometry.drawRange.count, 1580);
  assert.equal(flakes.visible, true);
});

test('ceremony glow waves and dimming leave the collecting progress and storage untouched', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let storage = '["forest"]';
  let writes = 0;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => storage, setItem(_: string, value: string) { storage = value; writes++; } },
  });
  try {
    const scene = new Scene();
    const lights = createTownLights({
      scene, open() { throw new Error('This test does not open the activity card'); },
      announce() {}, sit() {}, face() {},
    }, { heightAt: () => 12 });
    const fixtures = scene.children[0] as InstancedMesh;
    const color = new Color();
    function pane(index: number) {
      fixtures.getColorAt(index * 15 + 5, color);
      return color.getHexString();
    }

    const initial = [pane(0), pane(1), pane(3), pane(6)];
    lights.setCeremonyBand(0);
    assert.notEqual(pane(0), initial[0]);
    assert.equal(pane(3), initial[2]);
    lights.setCeremonyBand(1);
    assert.notEqual(pane(3), initial[2]);
    assert.equal(pane(6), initial[3]);
    lights.setCeremonyBand(3);
    assert.notEqual(pane(6), initial[3]);
    assert.equal(pane(1), initial[1]);
    lights.setCeremonyDim(.3);
    assert.notEqual(pane(1), initial[1]);
    assert.deepEqual(lights.litIds(), ['forest']);
    assert.equal(writes, 0);

    lights.setCeremonyDim(1);
    lights.setCeremonyBand(-1);
    assert.deepEqual([pane(0), pane(1), pane(3), pane(6)], initial);
    assert.equal(lights.activate('plaza'), true);
    assert.deepEqual(JSON.parse(storage), ['plaza', 'forest']);
    assert.equal(writes, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('three themed player shows reproduce 15 seeded bursts at the same shared stage', () => {
  assert.equal(isFireworksTheme('toString'), false);
  assert.equal(isFireworksTheme('ice-blue'), true);
  assert.equal(isFireworksSeed(0x100000000), false);
  assert.equal(isFireworksSeed(0xffffffff), true);

  const seed = 0x83745fa7;
  const gold = makePlayerFireworksTable(seed, 'gold-red');
  for (const theme of ['gold-red', 'ice-blue', 'pink-glow'] as const) {
    const table = makePlayerFireworksTable(seed, theme);
    assert.deepEqual(table, makePlayerFireworksTable(seed, theme));
    assert.notDeepEqual(table, makePlayerFireworksTable(seed + 1, theme));
    assert.equal(table.duration, fireworksShowMs / 1_000);
    assert.equal(table.bursts.length, 15);
    assert.ok(table.bursts.every(burst => burst.y >= 38 && burst.y <= 55 && burst.radius >= 10 && burst.radius <= 15));
    assert.deepEqual(table.bursts.map(({ time, shape }) => [time, shape]), gold.bursts.map(({ time, shape }) => [time, shape]));
    if (theme !== 'gold-red') assert.notEqual(table.bursts[0].outer, gold.bursts[0].outer);
  }
  const scene = new Scene();
  const festival = createFestival(scene);
  const particles = scene.children[0] as Points;
  assert.equal(festival.launchPublicFireworks(seed, 'gold-red', 20), false);
  assert.equal(festival.launchPublicFireworks(seed, 'gold-red', -.25), true);
  assert.equal(festival.launchPublicFireworks(seed + 1, 'ice-blue'), false);
  assert.equal(festival.start(), false);
  assert.equal(festival.active(), false);
  assert.equal(festival.showActive(), true);
  festival.update(.2);
  assert.equal(particles.visible, false);
  festival.update(.2);
  assert.equal(particles.visible, true);
  assert.equal(scene.children.length, 1);
  festival.update(20);
  assert.equal(festival.showActive(), false);
  assert.equal(particles.visible, false);
});

test('startShow honors authored launch points, burst count, duration and color', () => {
  const scene = new Scene();
  const festival = createFestival(scene);
  const sparks = scene.children[0] as Points;
  assert.equal(festival.startShow({
    duration: 1.4,
    launchPoints: [{ id: 'left', x: 110, z: -200 }, { id: 'right', x: 330, z: -390 }],
    bursts: [
      { time: .85, x: 117, y: 40, z: -200, radius: 9, shape: 'ring', outer: '#00ff00', inner: '#0000ff', launchId: 'left' },
      { time: .85, x: 340, y: 40, z: -392, radius: 9, shape: 'ring', outer: '#ffff00', inner: '#ff00ff', launchId: 'right' },
    ],
  }), true);
  festival.update(.25);
  const positions = sparks.geometry.getAttribute('position');
  assert.equal(sparks.geometry.drawRange.count, 12);
  assert.ok(positions.getX(0) < 117 && positions.getX(6) > 330);
  festival.update(.7);
  const colors = sparks.geometry.getAttribute('sparkColor');
  assert.deepEqual([colors.getX(0), colors.getY(0), colors.getZ(0)], [0, 0, 1]);
  assert.deepEqual([colors.getX(3), colors.getY(3), colors.getZ(3)], [0, 1, 0]);
  festival.update(.5);
  assert.equal(sparks.geometry.drawRange.count, 0);
});

test('the southern plaza has one public spot and its accepted request starts the personal cooldown', () => {
  const grid = createTerrainGrid();
  let time = 100;
  const notices: string[] = [];
  let busy = true;
  const fireworks = createTownFireworksActivity({
    announce: notice => notices.push(notice),
    open() { throw new Error('The cooldown or lock must prevent opening the theme menu'); },
  }, grid, () => assert.fail('The locked platform must not request a show'), () => busy, () => time);
  assert.equal(fireworks.spots.length, 1);
  const [spot] = fireworks.spots;
  assert.equal(canEnter(spot.x, spot.n), true);
  assert.equal(isWater(spot.x, spot.n), false);
  assert.deepEqual([spot.x, spot.n, spot.range], [publicFireworksStand.east, publicFireworksStand.north, fireworksSiteRangeMetres]);
  assert.equal(spot.label, '点放一场烟花');
  spot.run();
  assert.match(notices.at(-1) ?? '', /已有一场/);
  busy = false;
  fireworks.markStarted(500);
  spot.run();
  assert.match(notices.at(-1) ?? '', /烟花师傅在装填.*90 秒/);
  time += fireworksCooldownMs - 2000;
  spot.run();
  assert.match(notices.at(-1) ?? '', /烟花师傅在装填.*2 秒/);
});
