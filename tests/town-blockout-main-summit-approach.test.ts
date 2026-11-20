import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { Group } from 'three';
import {
  createMainSummitApproach, mountMainSummitApproachSigns,
} from '../tools/voxel-tavern/town-blockout/main-summit-approach';
import { northRidgeCableAnchors, sampleNorthRidge350 } from '../tools/voxel-tavern/town-blockout/north-ridge-350-terrain';

const origin = { east: 300, north: 676 };
const [terminalEast, terminalNorth] = northRidgeCableAnchors[2];
const config = {
  terminal: { east: terminalEast - origin.east, north: terminalNorth - origin.north },
  terraceTurnNorth: -12.75,
  gateArrival: { east: 0, north: 20 },
  frontStamp: { east: 306 - origin.east, north: 659 - origin.north },
  stampInteractionRadius: 1.1,
};

test('the surveyed terminal and stone branch preserve the mountain gate axis and original stamp reach', () => {
  const approach = createMainSummitApproach(config);
  assert.deepEqual(approach.gateRoute, [
    { east: 36, north: -36 }, { east: 36, north: -12.75 }, { east: 0, north: -12.75 }, { east: 0, north: 20 },
  ]);
  const stampDistance = Math.hypot(approach.stampStop.east - config.frontStamp.east,
    approach.stampStop.north - config.frontStamp.north);
  assert.ok(stampDistance > .27 && stampDistance <= config.stampInteractionRadius);
  assert.equal(approach.stampStop.north, -17);

  const floorAt = (east: number, north: number) => north < -10
    ? sampleNorthRidge350(east + origin.east, north + origin.north)
    : 347;
  // The lower monument's surveyed base is 2.90 × 2.20 m around world E306/N661.
  const survey = approach.survey({
    floorAt,
    blocked(east, north, _height, radius) {
      return Math.hypot(Math.max(Math.abs(east - 6) - 1.45, 0),
        Math.max(Math.abs(north + 15) - 1.1, 0)) < radius;
    },
  });
  assert.equal(survey.unsupportedSigns, 0);
  assert.equal(survey.gate.length, 92);
  assert.equal(survey.gate.sampleCount, 4602);
  assert.equal(survey.gate.initialHeight, 347);
  assert.equal(survey.gate.finalHeight, 347);
  assert.ok(survey.gate.traversable && survey.stamp.traversable);
  assert.ok(survey.gate.minimumSignClearance > .4);
  assert.ok(survey.stamp.minimumSignClearance > .4);
});

test('approach certification detects domain gaps, collision, and a step the player cannot climb', () => {
  const approach = createMainSummitApproach(config);
  const survey = approach.survey({
    floorAt(east, north) {
      if (east > 2 && east < 2.2 && north < -16) return undefined;
      return north >= -10 ? 348 : 347;
    },
    blocked(east, north) {
      return east > 35.9 && north < -35;
    },
  });
  assert.equal(survey.gate.maxStep, 1);
  assert.ok(survey.gate.blockedSamples > 0);
  assert.ok(survey.stamp.unsupported > 0);
  assert.equal(survey.gate.traversable, false);
  assert.equal(survey.stamp.traversable, false);
});

test('mounting signs registers both board and post volumes in the supplied frame and disposes them', () => {
  const owner = new Group();
  owner.position.set(300, 0, -676);
  const approach = createMainSummitApproach(config);
  const mounted = mountMainSummitApproachSigns(owner, approach, () => 347);
  assert.deepEqual(mounted.group.children.map(child => child.name), ['主峰山门 ↑', '主峰山门', '前山登记碑']);
  assert.equal(mounted.boxes.length, 6);
  assert.deepEqual(mounted.boxes.slice(2, 4).map(box => [box.width, box.depth]), [[.15, .15], [.08, 1.2]]);
  assert.equal(mounted.group.children[0]!.position.y, 347);
  const terminalSign = approach.signs[0]!;
  assert.ok(mounted.blocked(terminalSign.east, terminalSign.north, 347, .27, 1.8));
  assert.ok(mounted.blocked(terminalSign.east + .5, terminalSign.north, 347, .27, 1.8));
  assert.equal(mounted.blocked(config.terminal.east, config.terminal.north, 347, .27, 1.8), false);
  mounted.dispose();
  mounted.dispose();
  assert.equal(owner.children.length, 0);
  assert.equal(mounted.blocked(terminalSign.east, terminalSign.north, 347, .27, 1.8), false);
  assert.throws(() => mountMainSummitApproachSigns(owner, approach, () => undefined), /off its surveyed terrace/);
  assert.equal(owner.children.length, 0);
});

const snapshot = process.env.P11_ASSEMBLY_ROOT;
test('the 016ffb2 assembly supports the exact route, signs and original stamp action',
  { skip: !snapshot }, async context => {
    const moduleUrl = (name: string) =>
      pathToFileURL(resolve(snapshot!, 'tools/voxel-tavern/town-blockout', name + '.ts')).href;
    const {
      cloudTerminal, cloudTerraceTurnNorth, mountMainSummitAssembly, summitAssemblyAnchor, supportsCloudTerrace,
    } = await import(moduleUrl('main-summit-assembly'));
    const { mainSummitBounds, mainSummitSpec } = await import(moduleUrl('main-summit-block'));
    const { createMainSummitRegistrationLandmarks } = await import(moduleUrl('main-summit-registration'));
    const assembly = mountMainSummitAssembly(new Group(), Date.UTC(2026, 11, 31, 6));
    context.after(() => assembly.dispose());
    const stamp = createMainSummitRegistrationLandmarks(assembly.arrivalHeight).cloudDeck.stampPoint;
    const approach = createMainSummitApproach({
      terminal: cloudTerminal,
      terraceTurnNorth: cloudTerraceTurnNorth,
      gateArrival: assembly.stations.gate.to,
      frontStamp: { east: stamp.east - summitAssemblyAnchor.east, north: stamp.north - summitAssemblyAnchor.north },
      stampInteractionRadius: 1.1,
    });
    function floorAt(east: number, north: number, radius: number): number | undefined {
      if (north < mainSummitBounds.south) {
        return supportsCloudTerrace(east, north, radius) ? assembly.frontRidgeAt(east, north) : undefined;
      }
      if (Math.abs(east) > mainSummitSpec.arrivalPlaza[0] / 2 - radius ||
          north > mainSummitSpec.arrivalPlaza[1] - radius) return undefined;
      return assembly.stations.heightAt(east, north);
    }
    const survey = approach.survey({ floorAt, blocked: assembly.blocked });
    assert.equal(survey.unsupportedSigns, 0);
    assert.equal(survey.gate.sampleCount, 4602);
    assert.equal(survey.stamp.sampleCount, 470);
    for (const route of [survey.gate, survey.stamp]) {
      assert.equal(route.traversable, true);
      assert.equal(route.initialHeight, 347);
      assert.equal(route.finalHeight, 347);
      assert.equal(route.maxStep, 0);
    }
    assert.deepEqual(assembly.mountedParts(), ['P-1', 'P-2', 'P-3', 'P-4', 'P-7', 'P-9']);
    const mounted = mountMainSummitApproachSigns(assembly.group, approach, floorAt);
    context.after(() => mounted.dispose());
    assert.equal(mounted.group.children.length, 3);
    const { east, north } = approach.stampStop;
    assert.equal(assembly.interact(0, north, 347).action, 'out-of-range');
    const first = assembly.interact(east, north, 347);
    assert.equal(first.action, 'cloud-stamp');
    assert.equal(first.changed, true);
    assert.equal(first.profile.snowWingEligible, false);
    assert.equal(assembly.interact(east, north, 347).changed, false);
    context.diagnostic(JSON.stringify(survey));
  });
