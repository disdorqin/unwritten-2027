import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group } from 'three';
import {
  cloudTerminal, cloudTerraceTurnNorth, mountMainSummitAssembly, summitAssemblyAnchor, supportsCloudTerrace,
} from '../tools/voxel-tavern/town-blockout/main-summit-assembly';
import { mountZa22MountainGate, za22GateSeamNorth } from '../tools/voxel-tavern/town-blockout/town-za22-mountain-gate';
import {
  createZa22CloudRoute, createZa22NorthRidgeLine, za22StationApproach,
} from '../tools/voxel-tavern/town-blockout/town-za22-cloud-route';

test('ZA-22 walks the original cloud terrace and physical gate in both directions', () => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  const gate = mountZa22MountainGate(assembly, { open: () => { throw new Error('unexpected interaction'); } });
  const { east, north } = summitAssemblyAnchor;
  const radius = .27;
  const points = [
    [east + cloudTerminal.east, north + cloudTerminal.north],
    [east + cloudTerminal.east, north + cloudTerraceTurnNorth],
    [east, north + cloudTerraceTurnNorth],
    [east, north + 20], [east, north + 7], [east + 7.25, north + 7],
  ] as const;
  const roundTrip = [...points, ...points.slice(0, -1).reverse()];
  let previous = { east: points[0]![0], north: points[0]![1], height: assembly.arrivalHeight };
  let crossed = 0;
  try {
    for (const [position, [endEast, endNorth]] of roundTrip.slice(1).entries()) {
      const [startEast, startNorth] = roundTrip[position]!;
      const samples = Math.ceil(Math.hypot(endEast - startEast, endNorth - startNorth) / .12);
      for (let sample = 1; sample <= samples; sample++) {
        const eastAt = startEast + (endEast - startEast) * sample / samples;
        const northAt = startNorth + (endNorth - startNorth) * sample / samples;
        const localEast = eastAt - east;
        const localNorth = northAt - north;
        const height = northAt < za22GateSeamNorth
          ? supportsCloudTerrace(localEast, localNorth, radius) ? assembly.frontRidgeAt(localEast, localNorth) : undefined
          : gate.surfaceAt(eastAt, northAt, radius);
        assert.notEqual(height, undefined, `no support at ${eastAt},${northAt}`);
        assert.ok(Math.abs(height! - previous.height) < .025);
        assert.equal(assembly.blocked(localEast, localNorth, height!, radius, 1.8), false);
        assert.equal(gate.acceptsStep(previous.east, previous.north, eastAt, northAt, radius), true);
        if ((previous.north < za22GateSeamNorth) !== (northAt < za22GateSeamNorth)) crossed++;
        previous = { east: eastAt, north: northAt, height: height! };
      }
    }
    assert.equal(crossed, 2);
    assert.equal(gate.acceptsStep(east + 4.5, za22GateSeamNorth - .1, east + 4.5, za22GateSeamNorth + .1), false);
    assert.equal(gate.acceptsStep(east + 1.72, za22GateSeamNorth + .1, east + 1.72, za22GateSeamNorth - .1), true);
    assert.equal(gate.acceptsStep(east + 1.74, za22GateSeamNorth + .1, east + 1.74, za22GateSeamNorth - .1), false);
  } finally {
    gate.dispose();
    assembly.dispose();
  }
});

test('ZA-22 reveals the interior floor and permits board use only at its real approach', () => {
  const assembly = mountMainSummitAssembly(new Group(), 0);
  const shown: string[] = [];
  const gate = mountZa22MountainGate(assembly, {
    open(title) { shown.push(title); },
  });
  try {
    const floor = assembly.group.getObjectByName('za22-main-summit-arrival-floor')!;
    assert.equal(floor.visible, false);
    gate.update({ east: 300, north: 666.12, height: assembly.arrivalHeight });
    assert.equal(floor.visible, true);
    assert.equal(gate.surfaceAt(300, 665.99), undefined);
    assert.equal(gate.surfaceAt(300, 696), assembly.arrivalHeight);
    assert.equal(gate.action({ east: 300, north: 685, height: assembly.arrivalHeight }), undefined);
    assert.equal(gate.action({ east: 307.25, north: 683, height: assembly.arrivalHeight + 1 }), undefined);
    const action = gate.action({ east: 307.25, north: 683, height: assembly.arrivalHeight });
    assert.equal(action?.label, '查看山门班次');
    action?.run();
    assert.deepEqual(shown, ['山门班次与登记']);
    gate.update({ east: 300, north: 665.88, height: assembly.arrivalHeight });
    assert.equal(floor.visible, false);
  } finally {
    gate.dispose();
    assembly.dispose();
  }
  assert.equal(assembly.group.getObjectByName('za22-main-summit-arrival-floor'), undefined);
});

test('ZA-22 switches the active arrival surfaces and gate action on the live cable route', () => {
  const epoch = Date.UTC(2026, 0, 1);
  let now = epoch + 500;
  let arrived = false;
  let returned = false;
  let shown = '';
  const cableEnd = { east: 336, north: 640, height: 347 };
  const { legMs } = createZa22NorthRidgeLine(26);
  const cloud = createZa22CloudRoute({
    now: () => now,
    enterOrExit(terminal, at) {
      if (terminal === 'summit') {
        assert.deepEqual(at, cableEnd);
        arrived = true;
      } else {
        assert.deepEqual(at, za22StationApproach);
        returned = true;
      }
    },
    view(title) { shown = title; },
  });
  cloud.action(za22StationApproach)?.run();
  cloud.update(za22StationApproach);
  assert.equal(cloud.riding(), true);
  now = epoch + Math.ceil(legMs);
  cloud.update(za22StationApproach, false);
  assert.equal(cloud.riding(), false);
  assert.equal(arrived, true);
  const deck = { east: 300, north: 665.9, height: 347 };
  const hall = { ...deck, north: 666.1 };
  assert.equal(cloud.surfaceAt(deck.east, deck.north, .27), 347);
  assert.equal(cloud.surfaceAt(hall.east, hall.north, .27), 347);
  assert.equal(cloud.acceptsStep(304.5, deck.north, 304.5, hall.north, .27), false);
  assert.equal(cloud.acceptsStep(deck.east, deck.north, hall.east, hall.north, .27), true);
  assert.equal(cloud.updateView(deck), '云海台');
  assert.equal(cloud.front()?.visible, true);
  assert.equal(cloud.updateView(hall), '山门');
  assert.equal(cloud.front()?.visible, false);
  assert.equal(cloud.assembly()?.group.getObjectByName('cloud-deck-registration-monument')?.visible, false);
  cloud.action({ east: 307.25, north: 683, height: 347 })?.run();
  assert.equal(shown, '山门班次与登记');
  assert.equal(cloud.updateView(deck), '云海台');
  assert.equal(cloud.front()?.visible, true);
  cloud.action(cableEnd)?.run();
  cloud.update(cableEnd);
  assert.equal(cloud.riding(), true);
  now = epoch + Math.ceil(2 * legMs);
  cloud.update(cableEnd);
  assert.equal(returned, true);
  assert.equal(cloud.assembly(), undefined);
});
