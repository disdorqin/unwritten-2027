import assert from 'node:assert/strict';
import test from 'node:test';
import { Group, Mesh, NearestFilter, Raycaster, RepeatWrapping } from 'three';
import {
  buildTownC2CraterCentralMound, createTownC2CraterCentralMound, mountTownC2CraterCentralMound,
  townC2CraterCentralMoundAnchor, townC2CraterCentralMoundPlan,
  townC2CraterCentralMoundProtectedSites,
} from '../tools/voxel-tavern/town-blockout/town-c2-crater-central-mound.ts';
import {
  createMeteorCrater, meteorCraterDepth, meteorCraterFixturePlan, meteorCraterFloorRadius,
} from '../tools/voxel-tavern/town-blockout/meteor-crater.ts';

function near(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
}

test('C2-01 keeps the approved world centre and height through the crater yaw transform', () => {
  const anchor = { east: -100, north: 200, rimHeight: 12, yaw: .63 };
  const mound = createTownC2CraterCentralMound(anchor);
  const local = mound.worldToLocal(-120, 196);
  const roundTrip = mound.localToWorld(local.east, local.north);
  near(roundTrip.east, -120);
  near(roundTrip.north, 196);
  near(mound.localCenter.east, local.east);
  near(mound.localCenter.north, local.north);
  near(mound.surfaceHeightAtWorld(-120, 196), 7.5);
  assert.deepEqual(mound.survey().centerWorld, { east: -120, north: 196 });
  assert.deepEqual(mound.settings, townC2CraterCentralMoundPlan);
});

test('the mound has a 4 m C1 rim, is monotone downslope and is exactly flat outside radius 21 m', () => {
  const mound = createTownC2CraterCentralMound(townC2CraterCentralMoundAnchor);
  const { center, radius, rimWidth } = mound.settings;
  const at = (distance: number) => mound.surfaceHeightAtWorld(center.east + distance, center.north);
  near(at(0), 7.5);
  near(at(radius - rimWidth), 7.5 * rimWidth / radius);
  near(at(radius), 0);
  near(at(radius + .001), 0);
  let previous = at(0);
  for (let radiusAt = .25; radiusAt <= radius; radiusAt += .25) {
    const height = at(radiusAt);
    assert.ok(height <= previous + 1e-9, `mound rises at r=${radiusAt}`);
    previous = height;
  }
  const join = radius - rimWidth, epsilon = .001;
  const leftSlope = (at(join) - at(join - epsilon)) / epsilon;
  const rightSlope = (at(join + epsilon) - at(join)) / epsilon;
  near(leftSlope, rightSlope, 1e-4);
  const rimSlope = (at(radius) - at(radius - epsilon)) / epsilon;
  assert.ok(Math.abs(rimSlope) < 1e-3, `rim tangent is ${rimSlope}`);
});

test('meteor-crater composes max(mound, bowl) only when the C2-01 model is injected', () => {
  const anchor = { east: -120, north: 185, rimHeight: 10, yaw: 0 };
  const mound = createTownC2CraterCentralMound(anchor);
  const neutral = createMeteorCrater(meteorCraterFixturePlan);
  const composed = createMeteorCrater(meteorCraterFixturePlan, { centralMound: mound });
  const centre = mound.worldToLocal(-120, 196);
  near(centre.east, 0);
  near(centre.north, 11);
  near(neutral.heightOffsetAt(centre.east, centre.north)!, -meteorCraterDepth);
  near(composed.heightOffsetAt(centre.east, centre.north)!, -meteorCraterDepth + 7.5);
  near(mound.composeHeightOffsetAtWorld(-120, 196, -meteorCraterDepth), -meteorCraterDepth + 7.5);
  near(mound.composeHeightOffsetAtWorld(-142, 196, -meteorCraterDepth), -meteorCraterDepth);
  near(mound.composeHeightAtWorld(-120, 196, anchor.rimHeight - meteorCraterDepth),
    anchor.rimHeight - meteorCraterDepth + 7.5);
  near(mound.composeHeightAtWorld(-142, 196, anchor.rimHeight - meteorCraterDepth),
    anchor.rimHeight - meteorCraterDepth);

  // The nominal 1 m overlap with the lowest terrace remains max(), never a cut or a raised rim.
  for (const radius of [20, 20.5, 21, 27, 32, 46, 50, 55]) {
    const bowl = neutral.heightOffsetAt(radius, 0)!;
    const result = composed.heightOffsetAt(radius, 0)!;
    assert.ok(result >= bowl - 1e-9);
    if (radius >= 21) near(result, bowl);
  }
  near(composed.heightOffsetAt(0, -10.1)!, neutral.heightOffsetAt(0, -10.1)!);
});

test('the winch and sealed well stay on the south-foot work face, never on the crown', () => {
  const mound = createTownC2CraterCentralMound(townC2CraterCentralMoundAnchor);
  const survey = mound.survey();
  assert.ok(survey.protectedClearanceM.well > 0);
  assert.ok(survey.protectedClearanceM.winch > 0);
  for (const site of Object.values(townC2CraterCentralMoundProtectedSites)) {
    near(mound.surfaceHeightAtWorld(site.east, site.north), 0);
    near(mound.composeHeightOffsetAtWorld(site.east, site.north, -meteorCraterDepth), -meteorCraterDepth);
    const local = mound.worldToLocal(site.east, site.north);
    assert.equal(mound.heightOverrideAtLocal(local.east, local.north, -meteorCraterDepth), undefined);
  }
  near(mound.surfaceHeightAtWorld(-120, 196), 7.5);
});

test('the mounted voxel mound exposes three textured material families and agrees with its height survey', t => {
  const owner = new Group();
  const anchor = { ...townC2CraterCentralMoundAnchor, rimHeight: 10.7773 };
  const built = mountTownC2CraterCentralMound(owner, anchor);
  assert.equal(built.group.parent, owner);
  assert.equal(built.group.position.x, anchor.east);
  assert.equal(built.group.position.y, anchor.rimHeight);
  assert.equal(built.group.position.z, -anchor.north);
  near(built.group.rotation.y, -anchor.yaw);
  assert.equal(built.stats.materialFamilies, 3);
  assert.equal(built.meshes.length, 3);
  assert.ok(built.stats.voxelCount > 1500);
  assert.ok(built.stats.triangles > 5000 && built.stats.triangles < 30000);
  assert.equal(Object.values(built.stats.materialVoxelCounts).reduce((sum, count) => sum + count, 0),
    built.stats.voxelCount);
  for (const count of Object.values(built.stats.materialVoxelCounts)) assert.ok(count > 100);
  near(built.stats.maxVisualRise, 7.5);
  assert.ok(built.survey.sampledFootprintM2 > 900 && built.survey.sampledFootprintM2 < 1400);
  assert.ok(built.stats.bounds.maxEast - built.stats.bounds.minEast <= 42.5);
  for (const mesh of built.meshes) {
    assert.ok(mesh instanceof Mesh);
    assert.equal(mesh.material.map?.minFilter, NearestFilter);
    assert.equal(mesh.material.map?.magFilter, NearestFilter);
    assert.equal(mesh.material.map?.wrapS, RepeatWrapping);
    assert.equal(mesh.material.map?.wrapT, RepeatWrapping);
    assert.equal(mesh.geometry.getAttribute('position').count % 6, 0);
    assert.deepEqual(Array.from(mesh.geometry.getAttribute('normal').array.slice(0, 3)), [0, 1, 0]);
  }

  built.group.updateMatrixWorld(true);
  const ray = new Raycaster();
  ray.ray.origin.set(-120, anchor.rimHeight + 20, -196);
  ray.ray.direction.set(0, -1, 0);
  const [top] = ray.intersectObject(built.group, true);
  assert.ok(top, 'the transformed world centre must hit the voxel crown');
  near(top.point.y, anchor.rimHeight - meteorCraterDepth + 7.5, .001);
  ray.ray.origin.set(-120, anchor.rimHeight + 20, -185);
  assert.equal(ray.intersectObject(built.group, true).length, 0, 'the well notch must remain visually open');
  const lamp = townC2CraterCentralMoundProtectedSites.lampRoom;
  ray.ray.origin.set(lamp.east, anchor.rimHeight + 20, -lamp.north);
  assert.equal(ray.intersectObject(built.group, true).length, 0, 'the lamp-room footprint must remain visually open');
  t.diagnostic(`${built.stats.voxelCount} voxels, ${built.stats.triangles} triangles, ` +
    `${built.stats.materialFamilies} families, sampled footprint ${built.survey.sampledFootprintM2.toFixed(2)} m²`);
  built.dispose();
  assert.equal(built.group.parent, null);
});

test('geometry parameters are configurable and invalid smooth-rim dimensions are rejected', () => {
  const custom = createTownC2CraterCentralMound(townC2CraterCentralMoundAnchor, {
    center: { east: -110, north: 190 }, radius: 12, height: 4, rimWidth: 2,
    crownRadius: 2, voxelSize: .5, workFace: { east: -140, north: 170, radius: 3, feather: 1 },
  });
  near(custom.surfaceHeightAtWorld(-110, 190), 4);
  near(custom.surfaceHeightAtWorld(-108, 190), 4);
  near(custom.surfaceHeightAtWorld(-100, 190), 4 * 2 / 12);
  near(custom.surfaceHeightAtWorld(-97.9, 190), 0);
  assert.throws(() => createTownC2CraterCentralMound(townC2CraterCentralMoundAnchor,
    { radius: 4, rimWidth: 4 }), /dimensions/);
  assert.throws(() => createTownC2CraterCentralMound(townC2CraterCentralMoundAnchor,
    { voxelSize: 0 }), /dimensions/);
  assert.equal(meteorCraterFloorRadius, 20);
});
