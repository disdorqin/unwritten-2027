// From a dependency-ready checkout: node --import tsx /path/to/za30-skyline-proof.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? process.cwd());
const require = createRequire(resolve(root, 'package.json'));
const threeModule = new URL('./three.module.js', pathToFileURL(require.resolve('three')));
const { DoubleSide, Frustum, Matrix4, PerspectiveCamera, Raycaster, Vector2, Vector3 } = await import(threeModule.href);
const loadTown = name => import(pathToFileURL(resolve(root, 'tools/voxel-tavern/town-blockout', name)).href);
const { createMainSummitBlock, mainSummitLayout, mainSummitSpec } = await loadTown('main-summit-block.ts');
const { buildTowerLandmark } = await loadTown('landmark-tower.ts');
const { createTerrainGrid, canEnter, layout } = await loadTown('terrain.ts');

const grid = createTerrainGrid();
const towerPlot = layout.plots.find(plot => plot.id === 'clocktower');
const tower = buildTowerLandmark(towerPlot);
const [towerE, towerN, towerY] = towerPlot.origin;
tower.position.set(towerE, towerY, -towerN);
tower.updateMatrixWorld(true);
const summit = createMainSummitBlock(mainSummitLayout, 347, 100);
const { coarse } = summit;
coarse.material.side = DoubleSide;
coarse.position.set(300, 0, -676);
coarse.updateMatrixWorld(true);
const peak = new Vector3(mainSummitLayout.summit.east, mainSummitSpec.summitHeight,
  -mainSummitLayout.summit.north).add(coarse.position);
const triangles = coarse.geometry.index.count / 3;
assert.equal(triangles, 1450);
assert.equal(coarse.material.fog, false);
assert.equal(coarse.material.transparent, false);
console.log(JSON.stringify({
  sourceProxy: { vertices: coarse.geometry.attributes.position.count, drawsWhenSubmitted: 1, triangles },
  peak: [peak.x, -peak.z, peak.y],
}));

const [spawnE, spawnN] = layout.plaza.spawn;
const spawnYaw = Math.atan2(towerE - spawnE, towerN - spawnN);
const round = value => +value.toFixed(8);
const ray = new Raycaster();
const camera = new PerspectiveCamera(58, 1000 / 650, .1);
const frustum = new Frustum();

function measure(label, east, yaw, far, pitch = 0) {
  assert.ok(canEnter(east, spawnN));
  const eye = grid.heightAt(east, spawnN) + 1.65;
  camera.far = far;
  camera.updateProjectionMatrix();
  camera.position.set(east, eye, -spawnN);
  camera.lookAt(east + Math.sin(yaw) * Math.cos(pitch), eye + Math.sin(pitch),
    -spawnN - Math.cos(yaw) * Math.cos(pitch));
  camera.updateMatrixWorld(true);
  frustum.setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const ndc = peak.clone().project(camera);
  function hit(x, y) {
    ray.setFromCamera(new Vector2(x, y), camera);
    const mountain = ray.intersectObject(coarse, false).find(entry => frustum.containsPoint(entry.point));
    const obstruction = ray.intersectObject(tower).find(entry => entry.object.visible &&
      entry.object.material?.visible && frustum.containsPoint(entry.point));
    return { x: round(x), y: round(y),
      mountain: mountain ? [mountain.point.x, -mountain.point.z, mountain.point.y].map(round) : null,
      clocktowerDistance: obstruction ? round(obstruction.distance) : null };
  }
  const result = { label, far, eye: [east, spawnN, eye], viewDepth: round(-peak.clone().applyMatrix4(camera.matrixWorldInverse).z),
    ndc: ndc.toArray().map(round), peakInside: frustum.containsPoint(peak), proxyIntersects: frustum.intersectsObject(coarse),
    peakRay: hit(ndc.x, ndc.y), left: hit(-.25, .6), right: hit(.25, .6) };
  console.log(JSON.stringify(result));
  return result;
}

const oldSpawn = measure('spawn-default', spawnE, spawnYaw, 1400);
const newSpawn = measure('spawn-default', spawnE, spawnYaw, 2400);
const north = measure('spawn-due-north', spawnE, 0, 2400);
const offset = measure('plaza-east-offset-due-north', 236, 0, 2400, 6 * Math.PI / 180);
assert.ok(oldSpawn.proxyIntersects && !oldSpawn.peakInside && !oldSpawn.left.mountain && !oldSpawn.right.mountain);
assert.ok(newSpawn.proxyIntersects && newSpawn.peakInside && newSpawn.peakRay.clocktowerDistance < 50);
assert.ok(newSpawn.left.mountain && !newSpawn.left.clocktowerDistance && newSpawn.right.mountain && !newSpawn.right.clocktowerDistance);
assert.ok(north.left.mountain && !north.left.clocktowerDistance);
assert.ok(offset.peakInside && offset.peakRay.mountain[2] === 800 && !offset.peakRay.clocktowerDistance);
summit.dispose();
