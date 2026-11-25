import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const checkout = path.resolve(process.argv[2] ?? '.');
const output = process.argv[3];
const tablePath = 'docs/交流区/GPT/2026-11-19-灯市散挂52户挂灯点位表.md';
const originalTable = '260eae1dbdd8b96d979a566bc6be17c6e264f0f2';
const townPath = 'tools/voxel-tavern/town-blockout/';
const git = (...args) => execFileSync('git', args, { cwd: checkout, encoding: 'utf8' });
const sha = git('rev-parse', 'HEAD').trim();
const townModule = file => import(pathToFileURL(path.join(checkout, townPath, file)).href);
const [three, { createTerrainGrid }, { buildTownRailRoute }, { buildPineCamp }, { addScenery }, { addDistrictHousing }, { buildDistrictHousing }, { createWishActivity }] =
  await Promise.all([
    import(pathToFileURL(path.join(checkout, 'tools/voxel-tavern/node_modules/three/build/three.module.js')).href),
    townModule('terrain.ts'), townModule('town-railway.ts'), townModule('town-pine-camp.ts'),
    townModule('scenery.ts'), townModule('district-layout.ts'), townModule('district-housing.ts'),
    townModule('wish-activity.ts'),
  ]);
const { Color, Group, Matrix4, Vector3 } = three;
const originalRows = git('show', originalTable + ':' + tablePath).split('\n').flatMap(line => {
  if (!/^\|\s*\d+\s*\|\s*[`]?old-town:/.test(line)) return [];
  const [, ordinal, id, zone, foundation, direction, count, centers, batch] = line.split('|').map(value => value.trim());
  const coordinates = value => [...value.matchAll(/\(([^)]+)\)/g)].map(match => match[1].split(', ').map(Number));
  return [{ ordinal: Number(ordinal), id: id.replaceAll('`', ''), zone, foundation: coordinates(foundation)[0],
    direction, count: Number(count), centers: coordinates(centers), batch: batch.replaceAll('`', '') }];
});
assert.equal(originalRows.length, 52);
assert.equal(originalRows.reduce((sum, row) => sum + row.count, 0), 102);

const scene = new Group();
const grid = createTerrainGrid();
const railway = buildTownRailRoute(grid);
const pineCamp = buildPineCamp(grid);
scene.add(pineCamp.group);
// Use the same minimal Canvas 2D surface as the production portal unit test.
// Lamp glow texture pixels do not feed the geometry or occupancy calculation.
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  createElement: () => ({ getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
  }) }),
} });
let scenery;
let plazaWishes;
try {
  scenery = addScenery(scene, grid, pineCamp.keepClear);
  plazaWishes = createWishActivity({ scene });
} finally {
  Reflect.deleteProperty(globalThis, 'document');
}
const housing = addDistrictHousing(scene, grid, scenery.blocked, railway.keepClear);
scene.updateMatrixWorld(true);
const detail = scene.getObjectByName('district-infill');
assert.ok(detail?.visible);
const detailMeshes = detail.children.filter(mesh => mesh.isInstancedMesh && mesh.instanceColor);
const matrix = new Matrix4(), tint = new Color(), centre = new Vector3(), dimensions = new Vector3();
function readLamps(meshes) {
  const body = [], face = [];
  for (const mesh of meshes) {
    for (let index = 0; index < mesh.count; index++) {
      mesh.getColorAt(index, tint);
      const code = tint.getHex();
      if (code !== 0xd95b42 && code !== 0xffb466) continue;
      mesh.getMatrixAt(index, matrix);
      matrix.premultiply(mesh.matrixWorld);
      centre.setFromMatrixPosition(matrix);
      dimensions.setFromMatrixScale(matrix);
      const sample = { batch: mesh.name, index, point: [centre.x, -centre.z, centre.y], size: dimensions.x / .92, transform: matrix.toArray() };
      (code === 0xd95b42 ? body : face).push(sample);
    }
  }
  return { body, face };
}
const details = readLamps(detailMeshes);
const round = number => Number(number.toFixed(3));
const distance = (left, right) => Math.hypot(...left.map((value, index) => value - right[index]));
const key = lamp => lamp.batch + ':' + lamp.index;
const matchedBodies = new Set(), matchedFaces = new Set();
const originalById = new Map(originalRows.map(row => [row.id, row]));
const directionName = angle => Math.abs(Math.sin(angle)) > .5
  ? Math.sin(angle) > 0 ? '东' : '西'
  : Math.cos(angle) > 0 ? '南' : '北';
const zoneName = { central: '中央', memorial: '纪念馆', forest: '森林', market: '集市', lakeside: '湖畔' };
assert.equal(housing.sites.length, housing.housePortals.length);
const districtSource = git('show', sha + ':' + townPath + 'district-layout.ts');
const mapContents = name => districtSource.split('const ' + name)[1].split('\n]);')[0];
const cardsSource = mapContents('plazaResidentialCards');
const centralCards = new Map([...cardsSource.matchAll(/\['(\d+:\d+)', (\d+)\]/g)]
  .map(([, address, card]) => ['old-town:' + address, Number(card)]));
const railRelocations = new Set([...mapContents('centralRailHouseRelocations').matchAll(/\['(\d+:\d+)',/g)]
  .map(([, address]) => address));
const zoneOrdinals = new Map();
const rows = housing.housePortals.map((portal, index) => {
  const site = housing.sites[index];
  const batch = 'Old town housing ' + Math.floor(site.x / 96) + ',' + Math.floor(site.n / 96);
  const frontE = Math.sin(site.angle), frontN = -Math.cos(site.angle);
  const variantIndex = zoneOrdinals.get(portal.zone) ?? 0;
  zoneOrdinals.set(portal.zone, variantIndex + 1);
  const theme = portal.zone === 'central' ? undefined : portal.zone;
  const model = buildDistrictHousing(site.style, site.w, site.d, site.variant, theme, centralCards.get(portal.id), variantIndex);
  const swapped = Math.abs(Math.sin(site.angle)) > .5;
  const halfEast = (swapped ? site.d : site.w) / 2 + 1;
  const halfNorth = (swapped ? site.w : site.d) / 2 + 1;
  const gradeHeights = [-1, 0, 1].flatMap(i => [-1, 0, 1]
    .map(j => grid.heightAt(site.x + i * halfEast, site.n + j * halfNorth)));
  const level = Math.max(grid.heightAt(site.x, site.n), ...gradeHeights) + .14;
  model.position.set(site.x, level, -site.n);
  model.rotation.y = site.angle;
  model.updateMatrixWorld(true);
  const ownerLights = readLamps(model.children.filter(mesh => mesh.isInstancedMesh && mesh.instanceColor));
  const bodies = ownerLights.body.map(owner => {
    const candidates = details.body.filter(lamp => lamp.batch === batch && distance(lamp.point, owner.point) < .0001);
    assert.equal(candidates.length, 1, 'Unique matching published batch body at ' + portal.id);
    return candidates[0];
  });
  assert.equal(ownerLights.body.length, ownerLights.face.length);
  for (const authoredFace of ownerLights.face) {
    assert.equal(details.face.filter(face => face.batch === batch && distance(face.point, authoredFace.point) < .0001).length,
      1, 'Unique matching published batch panel at ' + portal.id);
  }
  const counts = bodies.map(lamp => {
    assert.ok(!matchedBodies.has(key(lamp)), 'Ambiguous lamp ownership at ' + portal.id);
    matchedBodies.add(key(lamp));
    // Match the emissive rearward-facing panel with the lantern's world front offset.
    const pairedAt = [lamp.point[0] + frontE * lamp.size * .45, lamp.point[1] + frontN * lamp.size * .45, lamp.point[2]];
    const faces = details.face.filter(face => face.batch === batch && distance(face.point, pairedAt) < .0001);
    assert.equal(faces.length, 1, 'Emissive panel for ' + portal.id);
    assert.ok(!matchedFaces.has(key(faces[0])), 'Duplicate emissive panel for ' + portal.id);
    matchedFaces.add(key(faces[0]));
    return { body: lamp.point.map(round), panel: faces[0].point.map(round),
      solidInstance: lamp.index, glowInstance: faces[0].index };
  });
  const original = originalById.get(portal.id);
  const changed = [];
  if (!original) changed.push('added');
  else {
    if (site.x !== original.foundation[0] || site.n !== original.foundation[1]) changed.push('foundation');
    if (portal.zone && zoneName[portal.zone] !== original.zone) changed.push('zone');
    if (directionName(site.angle) !== original.direction) changed.push('direction');
    if (bodies.length !== original.count) changed.push('count');
    if (batch !== original.batch) changed.push('batch');
    if (bodies.some(lamp => !original.centers.some(centre => distance(lamp.point, centre) < .0009))) changed.push('centres');
  }
  const address = portal.id.slice('old-town:'.length);
  const relocation = changed.includes('foundation')
    ? railRelocations.has(address) ? 'central rail corridor'
      : housing.relocations.has(address) ? 'theater plaza'
        : 'original lot under theater plaza bounds'
    : null;
  return { id: portal.id, zone: zoneName[portal.zone], foundation: [site.x, site.n], direction: directionName(site.angle),
    batch, count: bodies.length, lamps: counts, relocation, changed, old: original ?? null };
});

housing.setPanorama(true);
scene.updateMatrixWorld(true);
const panorama = scene.getObjectByName('Old town housing panorama');
assert.ok(!detail.visible && panorama?.visible);
const panoramaMeshes = panorama.children.filter(mesh => mesh.isInstancedMesh && mesh.instanceColor);
const wide = readLamps(panoramaMeshes);
housing.setPanorama(false);
assert.ok(detail.visible && !panorama.visible);
const sortedTransforms = lights => lights.map(lamp => lamp.transform.join(',')).sort();
assert.deepEqual(sortedTransforms(wide.body), sortedTransforms(details.body));
assert.deepEqual(sortedTransforms(wide.face), sortedTransforms(details.face));
for (const [meshes, lights] of [[detailMeshes, details], [panoramaMeshes, wide]]) {
  for (const mesh of meshes) {
    const tintMatch = mesh.material === detailMeshes[0].material ? lights.body : lights.face;
    assert.ok(mesh.count > tintMatch.filter(lamp => lamp.batch === mesh.name).length, 'House batch has other instances');
  }
}
const absent = originalRows.filter(row => !rows.some(candidate => candidate.id === row.id)).map(row => row.id);
const objectContract = meshes => ({
  gridCells: [...new Set(meshes.map(mesh => mesh.name))].sort(),
  coloredInstancedMeshes: meshes.length,
  geometryObjects: new Set(meshes.map(mesh => mesh.geometry)).size,
  materialObjects: new Set(meshes.map(mesh => mesh.material)).size,
  instances: meshes.reduce((sum, mesh) => sum + mesh.count, 0),
});
const expectedMaterials = new Set(detailMeshes.map(mesh => mesh.material));
assert.ok(panoramaMeshes.every(mesh => expectedMaterials.has(mesh.material)));
const expectedGeometries = new Set(detailMeshes.map(mesh => mesh.geometry));
assert.ok(panoramaMeshes.every(mesh => expectedGeometries.has(mesh.geometry)));
const sourceBlob = file => git('rev-parse', sha + ':' + townPath + file).trim();
const baseline = '0ee7c738227f0ccd45ebe4dd5985cab78ee2d164';
const summary = {
  houses: rows.length, zoneCounts: housing.zoneCounts, oldIdsMissing: absent, newIds: rows.filter(row => row.old === null).map(row => row.id),
  oldTableChangedRows: rows.filter(row => row.changed.length > 0).map(row => ({ id: row.id, changes: row.changed, relocation: row.relocation })),
  relocating: Object.fromEntries(['central rail corridor', 'theater plaza', 'original lot under theater plaza bounds']
    .map(reason => [reason, rows.filter(row => row.relocation === reason).length])),
  batchesChanged: rows.filter(row => row.changed.includes('batch')).length,
  directionsChanged: rows.filter(row => row.changed.includes('direction')).length,
  addedLanternOnlyBatches: 0,
  singleLamp: rows.filter(row => row.count === 1).map(row => row.id),
  lampBodies: details.body.length, uniquelyAssignedBodies: matchedBodies.size,
  lightPanels: details.face.length, uniquelyAssignedPanels: matchedFaces.size,
  detail: objectContract(detailMeshes), overview: objectContract(panoramaMeshes),
};
const viewerText = git('show', sha + ':' + townPath + 'viewer.ts');
const wishText = git('show', sha + ':' + townPath + 'wish-activity.ts');
const plazaWishRoot = scene.getObjectByName('Wish tree and town blessings');
assert.ok(plazaWishRoot);
const tree = {
  frozenDesignEN: [118, 88], referenceSource: baseline,
  sceneGroupEN: [plazaWishRoot.position.x, -plazaWishRoot.position.z],
  existingPlazaInteractionEN: [plazaWishes.spots[0].x, plazaWishes.spots[0].n],
  releasePlazaSceneAnchorEN: ['anchorX', 'anchorNorth'].map(name => Number(wishText.match(new RegExp('const ' + name + ' = ([0-9.]+);'))[1])),
  releasePlazaTrunkOffsetXYZ: [-2.25, 1.42, -.16],
  compiledViewerWishActivityMounts: [...viewerText.matchAll(/nearbyActivity\(createWishActivity\)/g)].length,
  releaseWishSourceBlob: sourceBlob('wish-activity.ts'),
  historicWishSourceBlob: git('rev-parse', baseline + ':' + townPath + 'wish-activity.ts').trim(),
};
const result = { sha, originalTable, tableBlob: git('rev-parse', originalTable + ':' + tablePath).trim(), three: three.REVISION,
  blobs: Object.fromEntries(['district-layout.ts', 'district-housing.ts', 'viewer.ts'].map(file => [file, sourceBlob(file)])),
  summary, tree, rows };
if (output) await writeFile(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ sha, summary, tree }, null, 2));
assert.equal(rows.length, 52);
assert.deepEqual(summary.oldIdsMissing, []);
assert.deepEqual(summary.newIds, []);
assert.equal(details.body.length, 102);
assert.equal(details.face.length, 102);
assert.equal(matchedBodies.size, details.body.length);
assert.equal(matchedFaces.size, details.face.length);
assert.ok(rows.every(row => row.count === 1 || row.count === 2));
assert.equal(summary.detail.geometryObjects, 1);
assert.equal(summary.detail.materialObjects, 2);
assert.equal(summary.detail.coloredInstancedMeshes, summary.detail.gridCells.length * 2);
assert.equal(summary.overview.coloredInstancedMeshes, 2);
assert.deepEqual(Object.values(summary.relocating), [9, 4, 9]);
assert.deepEqual(tree.sceneGroupEN, tree.releasePlazaSceneAnchorEN);
assert.equal(tree.releaseWishSourceBlob, tree.historicWishSourceBlob);
