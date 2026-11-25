import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Mesh, MeshStandardMaterial, NearestFilter, Vector3 } from 'three';
import { meteorCraterDepth, meteorCraterRimRadius } from '../tools/voxel-tavern/town-blockout/meteor-crater';
import { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road';
import { mountZa31CraterWinch, surveyZa31CraterWinch } from '../tools/voxel-tavern/town-blockout/town-za31-crater-winch';

const coverRadius = meteorCraterRimRadius / 30 + .03;
const bodyRadius = .27;
function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < .0001, `${actual} differs from ${expected}`);
}

test('the B-01 exterior and its use foot follow the surveyed world transform on solid ground', () => {
  const road = mountWestCraterRoad(540, () => 10.7773);
  const { east, north, rimHeight } = road.anchor;
  const floorY = rimHeight - meteorCraterDepth;
  const survey = surveyZa31CraterWinch(road);
  assert.ok(survey);
  assert.deepEqual(road.winch?.survey, survey);
  near(survey.plinth.east, -120.7468);
  near(survey.plinth.north, 180.6050);
  near(survey.axle.height, -23.7127);
  near(survey.axle.bearing, road.anchor.yaw + Math.PI / 2);
  near(survey.useFoot.east, -121.0879);
  near(survey.useFoot.north, 181.7391);
  near(survey.useFoot.height, floorY);
  near(survey.snakeStoneReservation.east, -122.6446);
  near(survey.snakeStoneReservation.north, 180.3483);
  for (let i = 1; i < survey.descentApproach.length; i++) {
    const from = survey.descentApproach[i - 1];
    const to = survey.descentApproach[i];
    for (let j = 0; j <= 128; j++) {
      const t = j / 128;
      const x = from.east + (to.east - from.east) * t;
      const n = from.north + (to.north - from.north) * t;
      assert.ok(Math.abs((road.heightAt(x, n) ?? Infinity) - floorY) < .01);
      assert.ok(Math.hypot(x - east, n - north) > coverRadius + bodyRadius);
      const stone = survey.snakeStoneReservation;
      assert.ok(Math.hypot(x - stone.east, n - stone.north) > stone.radius + bodyRadius);
    }
  }
  for (const [x, n] of [[bodyRadius, 0], [-bodyRadius, 0], [0, bodyRadius], [0, -bodyRadius]]) {
    near(road.heightAt(survey.useFoot.east + x, survey.useFoot.north + n)!, floorY);
  }
  assert.equal(mountZa31CraterWinch({ ...road, heightAt: () => undefined }), undefined);
});

test('the crank exposes a visual pivot and the casing is clear of the shaft and stone reserve', () => {
  const road = mountWestCraterRoad(540, () => 10.7773);
  const winch = road.winch;
  assert.ok(winch);
  const { group, survey } = winch;
  assert.equal(group.parent, road.group);
  assert.equal(road.group.children.filter(child => child.name === group.name).length, 1);
  const pivot = group.getObjectByName('za31-crater-winch-crank');
  assert.ok(pivot);
  const localX = pivot.localToWorld(new Vector3(1, 0, 0));
  const center = pivot.getWorldPosition(new Vector3());
  near(center.x, survey.axle.east);
  near(-center.z, survey.axle.north);
  near(center.y, survey.axle.height);
  near(Math.atan2(localX.x - center.x, center.z - localX.z), survey.axle.bearing);

  for (const turns of [0, .4, 2.96, 3]) {
    winch.setCrankTurns(turns);
    near(pivot.rotation.x, -2 * Math.PI * turns);
    const vertex = new Vector3();
    let triangles = 0;
    group.traverse(object => {
      if (!(object instanceof Mesh)) return;
      assert.ok(object.material instanceof MeshStandardMaterial);
      assert.equal(object.material.map?.minFilter, NearestFilter);
      assert.equal(object.material.map?.magFilter, NearestFilter);
      const pos = object.geometry.getAttribute('position');
      triangles += pos.count / 3;
      object.updateWorldMatrix(true, false);
      const stone = survey.snakeStoneReservation;
      for (let i = 0; i < pos.count; i++) {
        vertex.fromBufferAttribute(pos, i).applyMatrix4(object.matrixWorld);
        assert.ok(Math.hypot(vertex.x - road.anchor.east, -vertex.z - road.anchor.north) > coverRadius);
        assert.ok(Math.hypot(vertex.x - stone.east, -vertex.z - stone.north) > stone.radius);
        assert.ok(Math.hypot(vertex.x - survey.useFoot.east, -vertex.z - survey.useFoot.north) > bodyRadius);
      }
    });
    assert.ok(triangles > 0 && triangles < 650);
  }
  winch.setCrankTurns(NaN);
  near(pivot.rotation.x, -6 * Math.PI);
  assert.ok(road.group.getObjectByName('meteor-crater-sealed-well')?.visible);
  near(road.heightAt(road.anchor.east, road.anchor.north)!, road.anchor.rimHeight - meteorCraterDepth);
});
