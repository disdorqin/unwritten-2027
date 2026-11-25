import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, PointLight } from 'three';
import { mountMeteorCraterSurface } from '../tools/voxel-tavern/town-blockout/meteor-crater-surface.js';
import {
  buildUndergroundShaftSurvey, mountUndergroundDomainHost, undergroundMineLanding,
} from '../tools/voxel-tavern/town-blockout/underground-domain-host.js';
import type { mountWestCraterRoad } from '../tools/voxel-tavern/town-blockout/town-za22-crater-road.js';

type Road = ReturnType<typeof mountWestCraterRoad>;

// The certified B-01 live anchor: crater centre E-120 / N185 on the town datum.
const liveAnchor = { east: -120, north: 185, rimHeight: 10.7773, yaw: 0 };

function fakeRoad(anchorOverrides: Partial<typeof liveAnchor> = {}, heightAnchor = liveAnchor): Road {
  const surface = mountMeteorCraterSurface(heightAnchor);
  return {
    anchor: { ...liveAnchor, ...anchorOverrides },
    heightAt: (east: number, north: number) => surface.heightAt(east, north),
  } as unknown as Road;
}

test('the host builds the certified survey from the mounted west route', () => {
  const survey = buildUndergroundShaftSurvey(fakeRoad());
  assert.ok(survey);
  assert.equal(survey.crater.domainId, 'west');
  assert.deepEqual(survey.crater.liveRim, liveAnchor);
  assert.equal(survey.fixtureShaftFoot.height, -35);
  assert.equal(survey.liveWinchFoot.domainId, 'west');
  assert.equal(survey.liveWinchFoot.horizontalReach, .7);
  assert.equal(survey.liveWinchFoot.verticalReach, .3);
  assert.ok(Math.abs(survey.liveWinchFoot.height - (liveAnchor.rimHeight - 35)) < 1e-6);
  assert.deepEqual(survey.mineLanding, undergroundMineLanding);
  assert.equal(survey.depthLine, -73);
});

test('the host resolves the registration and mounts the mine domain', () => {
  const parent = new Group();
  const result = mountUndergroundDomainHost({ parent, road: fakeRoad() });
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') assert.fail('expected a mounted mine domain');
  assert.equal(result.registration.kind, 'ready');
  assert.deepEqual(result.mounted.poolWorld, {
    east: undergroundMineLanding.east,
    north: undergroundMineLanding.north,
    height: undergroundMineLanding.height,
  });
  const domain = parent.children.find(child => child.name.startsWith('underground-mine-domain:'));
  assert.ok(domain, 'mine domain group is mounted under the host parent');
  // No light is granted from render state: sync reads the host's empty
  // receipts and every camp lamp stays dark.
  result.mounted.sync();
  const lamps: PointLight[] = [];
  domain.traverse(object => {
    if ('isPointLight' in object && object.isPointLight === true) lamps.push(object as PointLight);
  });
  assert.ok(lamps.every(light => light.visible === false));
  result.mounted.dispose();
});

test('a route whose surveyed heights disagree with its anchor cannot register or mount', () => {
  const parent = new Group();
  const road = fakeRoad({ rimHeight: liveAnchor.rimHeight + 5 });
  const result = mountUndergroundDomainHost({ parent, road });
  assert.equal(result.kind, 'unregistered');
  assert.equal(parent.children.length, 0);
});

test('a route with no surveyed winch foot stays unregistered', () => {
  const parent = new Group();
  const road = {
    anchor: liveAnchor,
    heightAt: () => undefined,
  } as unknown as Road;
  const result = mountUndergroundDomainHost({ parent, road });
  assert.deepEqual(result, { kind: 'unregistered', reason: 'winch-survey' });
  assert.equal(parent.children.length, 0);
});
