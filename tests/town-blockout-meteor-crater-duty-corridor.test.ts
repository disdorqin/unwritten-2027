import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';
import {
  createMeteorCraterDutyCorridor,
  type MeteorCraterDutyCorridorPlan,
} from '../tools/voxel-tavern/town-blockout/meteor-crater-duty-corridor.ts';

const plan: MeteorCraterDutyCorridorPlan = {
  floor: [{ north: 0, height: 0 }, { north: 3, height: -.35 }, { north: 7, height: -1.9 }, { north: 12, height: -2.8 }],
  width: 1.8,
  headroom: 2.08,
  blastDoor: { north: 1.2, depth: .3, openSide: 'left' },
  constrictions: [
    { id: 'collapse-near', north: 4.2, gap: .68, rubbleDepth: .34, approachWidth: .66, entrySide: 'left' },
    { id: 'collapse-far', north: 8.4, gap: .68, rubbleDepth: .34, approachWidth: .66, entrySide: 'right' },
  ],
};
const body = { radius: .27, height: 1.8, maxStride: 11.3 / 60, maxStep: .43 };

test('the half-open leaf takes half of the same doorway used for forward passage and blocks a swept shortcut', () => {
  const corridor = createMeteorCraterDutyCorridor(plan);
  const [door] = corridor.solids;
  assert.deepEqual(corridor.blastDoor, { state: 'half-open', clearWidth: .9 });
  assert.equal(door.kind, 'blast-door-leaf');
  assert.equal(door.min[0], 0);
  assert.equal(door.max[0], .9);
  assert.equal(corridor.solids.filter(solid => solid.kind === 'rubble').length, 4);
  assert.ok(corridor.clearanceAt({ east: -.57, north: 1.2 }, body));
  assert.equal(corridor.clearanceAt({ east: .57, north: 1.2 }, body), undefined);
  const before = { east: .57, north: .5 };
  const after = { east: .57, north: 1.8 };
  assert.ok(corridor.clearanceAt(before, body));
  assert.ok(corridor.clearanceAt(after, body));
  assert.equal(corridor.allowsSweep(before, after, { ...body, maxStride: 2 }), false);
});

test('two separate rubble placements require real lateral travel at standing size', t => {
  const corridor = createMeteorCraterDutyCorridor(plan);
  const route = [
    { east: -.57, north: 0 },
    { east: -.57, north: 4.2 },
    { east: .57, north: 4.2 },
    { east: .57, north: 8.4 },
    { east: -.57, north: 8.4 },
    { east: -.57, north: 12 },
  ];
  const lateral = new Map<string, number>();
  const constrictions = new Set<string>();
  let samples = 1, minWidth = Infinity, minSide = Infinity, minHeight = Infinity, maxStep = 0;
  let previous = route[0];
  let previousSupport = corridor.clearanceAt(previous, body)!.supportY;
  for (let i = 1; i < route.length; i++) {
    const from = route[i - 1], to = route[i];
    const dx = to.east - from.east, dn = to.north - from.north;
    const steps = Math.ceil(Math.hypot(dx, dn) / body.maxStride);
    for (let j = 1; j <= steps; j++) {
      const next = { east: from.east + dx * j / steps, north: from.north + dn * j / steps };
      const clearance = corridor.clearanceAt(next, body);
      assert.ok(clearance);
      assert.ok(corridor.allowsSweep(previous, next, body));
      minWidth = Math.min(minWidth, clearance.left + clearance.right);
      minSide = Math.min(minSide, clearance.left, clearance.right);
      minHeight = Math.min(minHeight, clearance.headroom);
      maxStep = Math.max(maxStep, Math.abs(clearance.supportY - previousSupport));
      if (clearance.constriction) {
        constrictions.add(clearance.constriction);
        // Facing the same forward bearing, the accepted movement must actually be lateral.
        if (Math.abs(next.east - previous.east) > Math.abs(next.north - previous.north)) {
          lateral.set(clearance.constriction, (lateral.get(clearance.constriction) ?? 0) + (next.east - previous.east));
        }
      }
      previous = next;
      previousSupport = clearance.supportY;
      samples++;
    }
  }
  assert.deepEqual([...constrictions], ['collapse-near', 'collapse-far']);
  assert.ok(lateral.get('collapse-near')! > 1);
  assert.ok(lateral.get('collapse-far')! < -1);
  assert.ok(Math.abs(minWidth - .66) < 1e-9);
  assert.ok(minSide > body.radius);
  assert.ok(minHeight > body.height);
  assert.ok(maxStep < body.maxStep);
  assert.equal(corridor.clearanceAt({ east: -.57, north: 4.7 }, body), undefined);
  assert.equal(corridor.clearanceAt({ east: .57, north: 8.9 }, body), undefined);
  assert.equal(corridor.clearanceAt({ east: 0, north: 4.2 }, { ...body, radius: .35 }), undefined);
  t.diagnostic(JSON.stringify({ samples, minWidth, minSide, minHeight, maxStep, lateral: [...lateral] }));
});

test('rendered floor and roof are the surfaces used by the passage check', t => {
  const corridor = createMeteorCraterDutyCorridor(plan);
  const material = new MeshBasicMaterial();
  const makeMesh = ({ positions, indices }: typeof corridor.floor) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setIndex(new BufferAttribute(indices, 1));
    const mesh = new Mesh(geometry, material);
    t.after(() => geometry.dispose());
    return mesh;
  };
  const floor = makeMesh(corridor.floor);
  const ceiling = makeMesh(corridor.ceiling);
  t.after(() => material.dispose());
  const down = new Raycaster(new Vector3(), new Vector3(0, -1, 0));
  const up = new Raycaster(new Vector3(), new Vector3(0, 1, 0));
  const samples = [{ east: -.57, north: .7 }, { east: 0, north: 4.2 }, { east: 0, north: 8.4 }];
  for (const { east, north } of samples) {
    const passage = corridor.clearanceAt({ east, north }, body);
    assert.ok(passage);
    down.ray.origin.set(east, 10, -north);
    up.ray.origin.set(east, -10, -(north + body.radius));
    assert.ok(Math.abs(down.intersectObject(floor)[0].point.y - passage.supportY) < 1e-6);
    assert.ok(Math.abs(up.intersectObject(ceiling)[0].point.y - passage.supportY - passage.headroom) < 1e-6);
  }
});

test('unsafe grade, insufficient standing space, and overlapping sections cannot pass', () => {
  const steep = createMeteorCraterDutyCorridor({
    ...plan, floor: [{ north: 0, height: 0 }, { north: 12, height: -36 }],
    headroom: 3,
  });
  assert.equal(steep.allowsSweep({ east: -.57, north: .1 }, { east: -.57, north: .28 }, body), false);
  const low = createMeteorCraterDutyCorridor({ ...plan, headroom: 1.8 });
  assert.equal(low.clearanceAt({ east: -.57, north: 2 }, body), undefined);
  const roofChangeInsideSweep = createMeteorCraterDutyCorridor({
    ...plan,
    floor: [
      { north: 0, height: 0 }, { north: 1.92, height: 0 }, { north: 1.99, height: .31 },
      { north: 2.06, height: 0 }, { north: 12, height: 0 },
    ],
  });
  const before = { east: -.57, north: 1.9 };
  const after = { east: -.57, north: 2.08 };
  assert.ok(roofChangeInsideSweep.clearanceAt(before, body));
  assert.ok(roofChangeInsideSweep.clearanceAt(after, body));
  assert.equal(roofChangeInsideSweep.allowsSweep(before, after, body), false);
  assert.throws(() => createMeteorCraterDutyCorridor({
    ...plan, constrictions: [plan.constrictions[0], { ...plan.constrictions[1], north: 4.3 }],
  }), /distinct constrictions/);
  assert.throws(() => createMeteorCraterDutyCorridor({
    ...plan, floor: [{ north: 0, height: 0 }, { north: 1, height: 0 }, { north: .5, height: -3 }],
  }), /ordered floor stations/);
});
