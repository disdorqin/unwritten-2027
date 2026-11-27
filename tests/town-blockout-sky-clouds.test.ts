import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InstancedMesh, ShaderMaterial } from 'three';
import { townNightWeatherAt } from '../src/shared/town-night-weather-cycle';
import { createTownSkyClouds, townSkyCloudSpec } from '../tools/voxel-tavern/town-blockout/town-sky-clouds';
import type { TownOutdoorWeatherState } from '../src/shared/town-outdoor-weather';

const weather = (kind: TownOutdoorWeatherState['weather'], windStrength = .5): TownOutdoorWeatherState => ({
  weather: kind, startedAt: 0, nextChangeAt: 600_000, windEast: .6, windNorth: .8, windStrength,
});

function drive(clouds: ReturnType<typeof createTownSkyClouds>, input: { weather?: TownOutdoorWeatherState; night: boolean }, seconds = 200) {
  let state = clouds.state();
  for (let t = 5_000; t <= seconds * 1000; t += 5_000) state = clouds.update(t, input);
  return state;
}

test('batch-67 spec: five designed clusters inside the altitude band, two smoke blobs over the crater industry', () => {
  const [low, high] = townSkyCloudSpec.altitudeBand;
  assert.equal(townSkyCloudSpec.clusters.length, 5);
  for (const cluster of townSkyCloudSpec.clusters) {
    assert.ok(cluster.puffs >= 5 && cluster.puffs <= 9, `${cluster.id} puff count in 5..9`);
    assert.ok(cluster.altitude >= low && cluster.altitude <= high, `${cluster.id} altitude in band`);
  }
  const [smokeLow, smokeHigh] = townSkyCloudSpec.smokeBand;
  assert.equal(townSkyCloudSpec.smokeBlobs.length, 2);
  for (const blob of townSkyCloudSpec.smokeBlobs) {
    assert.ok(blob.altitude >= smokeLow && blob.altitude <= smokeHigh, `${blob.id} altitude in smoke band`);
  }
  // Smelter smoke sits on the smelter site (207 deg / r88 from the crater
  // anchor (-120, 185)); steam sits on the crater-mouth anchor itself. The
  // white crater cluster stays off the pit centre so it cannot upstage the
  // smoke signature.
  assert.deepEqual([townSkyCloudSpec.smokeBlobs[0].east, townSkyCloudSpec.smokeBlobs[0].north], [-160, 107]);
  assert.deepEqual([townSkyCloudSpec.smokeBlobs[1].east, townSkyCloudSpec.smokeBlobs[1].north], [-120, 185]);
  const crater = townSkyCloudSpec.clusters.find(cluster => cluster.id === 'crater-1')!;
  assert.ok(Math.hypot(crater.east - -120, crater.north - 185) > 100);
});

test('batch-67 structure: two instanced meshes, 33 white puffs and 12 smoke puffs, two draws', t => {
  const clouds = createTownSkyClouds();
  t.after(() => clouds.dispose());
  const meshes = clouds.group.children.filter(child => (child as InstancedMesh).isInstancedMesh);
  assert.equal(meshes.length, 2);
  const state = clouds.state();
  assert.equal(state.whitePuffs, 33);
  assert.equal(state.smokePuffs, 12);
  assert.equal(state.draws, 2);
});

test('batch-67 weather mapping: cover follows the single G-09 state, nights thin out, whiteout lowers the layer', t => {
  const clearDay = createTownSkyClouds();
  t.after(() => clearDay.dispose());
  assert.ok(Math.abs(drive(clearDay, { weather: weather('clear-snow'), night: false }).cover - .42) < .01);

  const clearNight = createTownSkyClouds();
  t.after(() => clearNight.dispose());
  const nightState = drive(clearNight, { weather: weather('clear-snow'), night: true });
  assert.ok(Math.abs(nightState.cover - .18) < .01, 'clear nights thin the clouds for the star window');
  assert.ok(nightState.nightBlend > .99);

  const windDay = createTownSkyClouds();
  t.after(() => windDay.dispose());
  assert.ok(Math.abs(drive(windDay, { weather: weather('wind'), night: false }).cover - .66) < .01);

  const whiteout = createTownSkyClouds();
  t.after(() => whiteout.dispose());
  const whiteoutState = drive(whiteout, { weather: weather('whiteout'), night: false });
  assert.ok(Math.abs(whiteoutState.cover - .97) < .01);
  assert.ok(Math.abs(whiteoutState.altitudeScale - .8) < .01, 'whiteout presses the layer down');

  const fallback = createTownSkyClouds();
  t.after(() => fallback.dispose());
  assert.ok(Math.abs(drive(fallback, { night: false }).cover - .40) < .01,
    'no G-09 snapshot (legacy room / rehearsal) still shows the designed clouds');
});

test('batch-67 drift: puffs move slowly inside their clusters and placement is deterministic', t => {
  const a = createTownSkyClouds();
  const b = createTownSkyClouds();
  t.after(() => { a.dispose(); b.dispose(); });
  const meshOf = (clouds: ReturnType<typeof createTownSkyClouds>) =>
    clouds.group.children.find(child => (child as InstancedMesh).isInstancedMesh) as InstancedMesh;
  a.update(60_000, { weather: weather('clear-snow'), night: false });
  b.update(60_000, { weather: weather('clear-snow'), night: false });
  const first = Array.from(meshOf(a).instanceMatrix.array);
  assert.deepEqual(first, Array.from(meshOf(b).instanceMatrix.array), 'same inputs, same sky');
  a.update(180_000, { weather: weather('clear-snow'), night: false });
  assert.notDeepEqual(Array.from(meshOf(a).instanceMatrix.array), first, 'puffs drift over time');
});

test('continuous authoritative cloud palette reaches the original two cloud batches without a second clock', t => {
 const clouds=createTownSkyClouds();t.after(()=>clouds.dispose());
 const cloud=clouds.group.getObjectByName('town-sky-drift-clouds') as InstancedMesh;
 const tint=(cloud.material as ShaderMaterial).uniforms.cloudTint!.value;
 const epoch=Date.UTC(2026,0,1);
 const phases=[.03,.3,.53,.6,.8,.99];
 for(const phase of phases){
  const sample=townNightWeatherAt(epoch+phase*600000,epoch);
  const s=clouds.update(sample.now,{weather:weather('clear-snow'),night:!sample.daylight,sky:sample});
  assert.equal(tint.getHex(),sample.cloudColor);
  assert.equal(s.draws,2);
 }
 const dusk={cloudColor:0xc0948f,lampLevel:.48};
 for(let i=1;i<=40;i++)clouds.update(epoch+600000+i*5000,{weather:weather('clear-snow'),night:false,sky:dusk});
 assert.ok(Math.abs(clouds.state().nightBlend-.48)<.002);
 assert.ok(Math.abs(clouds.state().cover-(.42+(.18-.42)*.48))<.002);
});

test('batch-67 dispose: update after dispose throws', t => {
  const clouds = createTownSkyClouds();
  clouds.dispose();
  assert.throws(() => clouds.update(0, { night: false }), /disposed/);
});
