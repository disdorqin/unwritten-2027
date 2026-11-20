import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createUndergroundCampRemains, undergroundCampInscriptions,
} from '../tools/voxel-tavern/town-blockout/underground-camp-remains.ts';

type CampOptions = Parameters<typeof createUndergroundCampRemains>[0];
type Point = ReturnType<typeof createUndergroundCampRemains>['recovery'];

// Mirrors the public camp interval of 2966d9f without requiring an unmerged file.
function fixture(side: CampOptions['camp']['side'] = 'right'): CampOptions {
  const direction = side === 'right' ? 1 : -1;
  const center: Point = [0, -91, 40];
  const recovery: Point = [2.5 * direction, -91, 40];
  return {
    camp: { side, length: 10, extension: 5 },
    walker: { radius: .27, standingHeight: 1.8 },
    mine: {
      route: [
        { zone: 'camp', from: [0, -91, 35], to: center },
        { zone: 'camp', from: center, to: recovery },
      ],
      anchors: { campRecovery: { position: recovery } },
      queryPassage(x, z, radius, bodyHeight) {
        const outward = x * direction;
        if (outward - radius < -2 || outward + radius > 7 ||
            z - radius < 35 || z + radius > 45 || bodyHeight > 3.5) return;
        return { zone: 'camp', floor: -91, clearance: 3.5 };
      },
    },
  };
}

test('the six dorms show distinct belongings, repeat no inscription, and register non-healing sit points', t => {
  const camp = createUndergroundCampRemains(fixture());
  t.after(camp.dispose);
  assert.equal(camp.rooms.length, 6);
  assert.equal(new Set(camp.rooms.map(room => room.trace)).size, 6);
  assert.deepEqual(camp.rooms.map(room => room.hasCabinet), [true, true, true, true, true, false]);
  assert.deepEqual(camp.rooms.map(room => room.hookState), ['fixed', 'fixed', 'fixed', 'fixed', 'fixed', 'marks']);
  const detailTags = ['folded-corners', 'glove', 'height-marks', 'scarf', 'tea-mug', 'ajar-door'];
  for (const [index, room] of camp.rooms.entries()) {
    assert.ok(camp.props.some(prop => prop.id === room.id + '/bed'));
    assert.ok(camp.props.some(prop => prop.id === room.id + '/hooks'));
    assert.ok(camp.props.some(prop => prop.id === room.id + '/' + detailTags[index]));
    assert.equal(camp.props.some(prop => prop.id === room.id + '/cabinet'), room.hasCabinet);
    assert.equal(room.sit.restoresHealth, false);
    assert.ok(room.sit.position[1] > room.approach[1]);
  }
  assert.ok(camp.props.some(prop => prop.id === 'dorm-4/paper'));
  assert.deepEqual(Object.values(undergroundCampInscriptions), ['慢些吃', '慢些走']);
});

test('the fifth dorm leaves tea visible on the part of the chest outside the bed', t => {
  for (const side of ['right', 'left'] as const) {
    const spec = fixture(side);
    const camp = createUndergroundCampRemains(spec);
    t.after(camp.dispose);
    const outward = ({ min, max }: { min: Point; max: Point }) =>
      side === 'right' ? [min[0], max[0]] : [-max[0], -min[0]];
    const bedFoot = Math.min(...camp.props.filter(prop => prop.id === 'dorm-5/bed').map(prop => outward(prop)[0]));
    const [, lid] = camp.props.filter(prop => prop.id === 'dorm-5/tea-chest');
    const [lidNear, lidFar] = outward(lid);
    assert.ok(Math.abs((lidNear + lidFar) / 2 - bedFoot) < 1e-8);
    const mug = camp.props.filter(prop => prop.id === 'dorm-5/tea-mug');
    assert.equal(mug.length, 3);
    for (const part of mug) {
      const [near, far] = outward(part);
      assert.ok(near > lidNear && far < bedFoot);
      assert.ok(part.min[2] > lid.min[2] && part.max[2] < lid.max[2]);
      assert.ok(part.min[1] >= lid.max[1]);
    }
    const [x, y, z] = camp.rooms[4].approach;
    assert.equal(camp.queryPassage(x, z, spec.walker.radius, spec.walker.standingHeight)?.floor, y);
  }
});

test('the cold kitchen contains two rows of tables with benches and the memorial leaves three sockets open', t => {
  const camp = createUndergroundCampRemains(fixture());
  t.after(camp.dispose);
  assert.equal(camp.dining.stoveLit, false);
  const [first, second] = camp.dining.tables;
  assert.notEqual(first.position[0], second.position[0]);
  assert.equal(first.position[2], second.position[2]);
  for (const table of camp.dining.tables) {
    for (const side of [1, 2]) assert.ok(camp.colliders.some(collider => collider.id === table.id + '/bench-' + side));
  }
  assert.ok(camp.props.some(prop => prop.id === 'canteen/bowl-cupboard/half-open-leaf'));
  assert.ok(camp.props.some(prop => prop.id === camp.dining.bowl.id));
  assert.equal(camp.memorial.inscription, '慢些走');
  assert.equal(camp.memorial.niches.length, 6);
  assert.equal(camp.memorial.niches.filter(niche => !niche.hasSpentLamp).length, 3);
  for (const niche of camp.memorial.niches) {
    assert.equal(niche.lit, false);
    assert.equal(camp.props.some(prop => prop.id === niche.id + '/spent-lamp'), niche.hasSpentLamp);
  }
});

test('the host can attach camp lights at the three empty niches and two supported guide points', t => {
  for (const side of ['right', 'left'] as const) {
    const spec = fixture(side);
    const camp = createUndergroundCampRemains(spec);
    t.after(camp.dispose);
    const { offeringAnchors, guideAnchors } = camp.lighting;
    assert.deepEqual(offeringAnchors.map(({ id }) => id),
      ['memorial/niche-2', 'memorial/niche-4', 'memorial/niche-6']);
    assert.deepEqual(guideAnchors.map(({ id }) => id), ['hall/guide', 'canteen/guide']);
    for (const { id, position, radius, tone } of offeringAnchors) {
      const niche = camp.memorial.niches.find(niche => niche.id === id);
      assert.ok(niche && !niche.hasSpentLamp && !niche.lit);
      assert.deepEqual(position, niche.position);
      assert.deepEqual([radius, tone], [8, 'warm']);
    }
    const footPoints = [camp.route[0].points[1], camp.route.find(row => row.id === 'canteen')!.points[2]];
    for (const [index, { position: [x, y, z], radius, tone }] of guideAnchors.entries()) {
      const foot = footPoints[index];
      assert.deepEqual([x, z], [foot[0], foot[2]]);
      const passage = camp.queryPassage(x, z, spec.walker.radius, spec.walker.standingHeight);
      assert.ok(passage && y > passage.floor + spec.walker.standingHeight && y < passage.floor + passage.clearance);
      assert.deepEqual([radius, tone], [4, 'cool']);
    }
    const mounts = [...offeringAnchors, ...guideAnchors];
    assert.equal(mounts.length, 5);
    for (const { position, mount } of mounts) {
      assert.equal(mount.parent, camp.group);
      assert.deepEqual(mount.position.toArray(), position);
      assert.equal(mount.children.length, 0);
    }
    const { position, mount } = offeringAnchors[0];
    const attached = mount.clone(false);
    attached.position.set(0, 0, 0);
    mount.add(attached);
    camp.group.position.set(10, 20, 30);
    assert.deepEqual(attached.getWorldPosition(attached.position.clone()).toArray(),
      [10 + position[0], 20 + position[1], 30 + position[2]]);
    camp.dispose();
    assert.equal(attached.parent, null);
  }
});

test('every standing route is clear in either wing of the hall and meets the existing recovery anchor', () => {
  for (const side of ['right', 'left'] as const) {
    const spec = fixture(side);
    const camp = createUndergroundCampRemains(spec);
    try {
      const { radius, standingHeight } = spec.walker;
      assert.deepEqual(camp.recovery, spec.mine.anchors.campRecovery.position);
      assert.deepEqual(camp.route[0].points.at(-1), camp.recovery);
      assert.equal(camp.route.length, 9);
      for (const { id, points } of camp.route) {
        for (let index = 1; index < points.length; index++) {
          const [x0, y0, z0] = points[index - 1];
          const [x1, y1, z1] = points[index];
          assert.equal(y0, y1);
          const steps = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .02);
          for (let step = 0; step <= steps; step++) {
            const x = x0 + (x1 - x0) * step / steps;
            const z = z0 + (z1 - z0) * step / steps;
            assert.equal(camp.queryPassage(x, z, radius, standingHeight)?.floor, y0, id + ' at ' + [x, z]);
          }
        }
      }
      for (const { min, max } of camp.colliders) {
        assert.equal(camp.queryPassage((min[0] + max[0]) / 2, (min[2] + max[2]) / 2,
          radius, standingHeight), undefined);
      }
      assert.equal(camp.queryPassage(0, 36, radius, 3.6), undefined);
      assert.equal(camp.queryPassage(0, 34, radius, standingHeight), undefined);
      assert.equal(camp.queryPassage(0, 36, -1, standingHeight), undefined);
    } finally {
      camp.dispose();
    }
  }
});

test('invalid camp dimensions, axis mismatch, and obstructed doorways fail before scene creation', () => {
  const valid = fixture();
  assert.throws(() => createUndergroundCampRemains({ ...valid, camp: { ...valid.camp, length: 9.9 } }),
    /supported mine hall/);
  assert.throws(() => createUndergroundCampRemains({ ...valid, camp: { ...valid.camp, side: 'left' } }),
    /mine axis/);
  assert.throws(() => createUndergroundCampRemains({ ...valid, walker: { ...valid.walker, radius: .38 } }),
    /walking profile is blocked/);
});

test('overlapping voxel faces with different colors are offset in depth', t => {
  const camp = createUndergroundCampRemains(fixture());
  t.after(camp.dispose);
  const axes = [0, 1, 2] as const;
  for (const [index, first] of camp.props.entries()) for (let next = index + 1; next < camp.props.length; next++) {
    const second = camp.props[next];
    if (first.color === second.color) continue;
    for (const axis of axes) for (const face of ['min', 'max'] as const) {
      if (Math.abs(first[face][axis] - second[face][axis]) > 1e-7) continue;
      const overlapped = axes.filter(component => component !== axis).every(component =>
        Math.min(first.max[component], second.max[component]) -
          Math.max(first.min[component], second.min[component]) > 1e-7);
      assert.ok(!overlapped, first.id + ' shares a face with ' + second.id);
    }
  }
});

test('real instances cover every authored voxel and release their own geometry once', () => {
  const camp = createUndergroundCampRemains(fixture());
  const batch = camp.group.getObjectByName('camp-voxel-furnishings') as typeof camp.group & {
    isInstancedMesh: boolean; count: number; geometry: { addEventListener(type: 'dispose', listener: () => void): void };
  };
  assert.ok(batch.isInstancedMesh);
  assert.equal(batch.count, camp.props.length);
  assert.ok(batch.count > 450);
  let disposalCount = 0;
  batch.geometry.addEventListener('dispose', () => { disposalCount++; });
  camp.dispose();
  camp.dispose();
  assert.equal(disposalCount, 1);
  assert.equal(camp.group.children.length, 0);
});
