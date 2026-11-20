import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveUndergroundShaftRegistration } from '../../src/presence/underground-shaft-registration.js';
import { createUndergroundWinchAccess } from '../../src/presence/underground-winch.js';

type Survey = Parameters<typeof resolveUndergroundShaftRegistration>[0];
type Port = Parameters<typeof resolveUndergroundShaftRegistration>[1];
const fixtureRim = { east: 0, north: 0, height: 0, yaw: 0 };
const yaw = Math.atan2(Math.sqrt(55 ** 2 - 26 ** 2), -26) - .7;
const liveRim = { east: -120, north: 185, rimHeight: 10.7773, yaw };
const worldRim = { east: -120, north: 185, height: 10.7773, yaw };
const fixtureShaftFoot = { east: 0, north: 0, height: -35, yaw: 0 };
const fixtureWinch = { east: 2, north: 0, height: -35, yaw: 0, horizontalReach: 1.4, verticalReach: .2 };
const pitHeight = worldRim.height + fixtureShaftFoot.height;
const shaftFoot = { domainId: 'west', east: -120, north: 185, height: pitHeight };
const winch = {
  domainId: 'west', east: -120 + 2 * Math.cos(yaw), north: 185 - 2 * Math.sin(yaw), height: pitHeight,
  horizontalReach: 1.4, verticalReach: .2,
};
// Test-host registrations, never used as production spawn or crossing defaults.
const mineLanding = { domainId: 'registered-mine', east: -119, north: 185, height: -90 };
const survey = {
  crater: { domainId: 'west', fixtureRim, liveRim }, fixtureShaftFoot, fixtureWinch, mineLanding, depthLine: -73,
} satisfies Survey;

function host(overrides: Partial<Port> = {}): Port {
  return {
    supportsFoot: () => true,
    acceptsShaftHandoff: () => true,
    ...overrides,
  };
}

test('resolves the west shaft and winch through B-01 while preserving the registered absolute mine landing', () => {
  const roles: string[] = [];
  const connection = { shaftFoot, winch, firstFallLanding: mineLanding, depthLine: -73 };
  const port = host({
    supportsFoot(role, foot) {
      roles.push(role);
      assert.deepEqual(foot, role === 'shaft' ? shaftFoot : role === 'winch' ? winch : mineLanding);
      return true;
    },
    acceptsShaftHandoff(candidate) {
      assert.deepEqual(candidate, connection);
      return true;
    },
  });
  assert.deepEqual(resolveUndergroundShaftRegistration(survey, port), { kind: 'ready', connection });
  assert.deepEqual(roles, ['shaft', 'winch', 'mine-pool']);
});

test('the ZA-31 surveyed foot stays in world coordinates and is independent of the shaft and axle', () => {
  // Operation foot and axle from ZA-31 at ffff6548. Reach here is a test-host setting.
  const liveWinchFoot = { domainId: 'west', east: -121.0879, north: 181.7391, height: -24.2227,
    horizontalReach: .7, verticalReach: .2 };
  const liveSurvey = { ...survey, fixtureWinch: undefined, liveWinchFoot };
  const result = resolveUndergroundShaftRegistration(liveSurvey, host({
    supportsFoot(role, foot) {
      if (role === 'winch') assert.deepEqual(foot, liveWinchFoot);
      return true;
    },
  }));
  assert.equal(result.kind, 'ready');
  if (result.kind !== 'ready') assert.fail('expected the surveyed operation foot');
  assert.deepEqual(result.connection.shaftFoot, shaftFoot);
  assert.deepEqual(result.connection.winch, liveWinchFoot);

  let accepted = { ...liveWinchFoot, playerId: 'opener' };
  const canUseWinch = createUndergroundWinchAccess(result.connection.winch, () => accepted);
  assert.equal(canUseWinch('opener'), true);
  accepted = { ...accepted, east: -120.7468, north: 180.6050, height: -23.7127 };
  assert.equal(canUseWinch('opener'), false);
  accepted = { ...accepted, ...shaftFoot };
  assert.equal(canUseWinch('opener'), false);

  assert.deepEqual(resolveUndergroundShaftRegistration({ ...liveSurvey, fixtureWinch }, host()),
    { kind: 'invalid-points' });
  assert.deepEqual(resolveUndergroundShaftRegistration({
    ...liveSurvey, liveWinchFoot: { ...liveWinchFoot, domainId: mineLanding.domainId },
  }, host()), { kind: 'invalid-domains' });
  assert.deepEqual(resolveUndergroundShaftRegistration({
    ...liveSurvey, liveWinchFoot: { ...liveWinchFoot, east: Infinity },
  }, host()), { kind: 'invalid-points' });
  assert.deepEqual(resolveUndergroundShaftRegistration(liveSurvey, host({ supportsFoot: role => role !== 'winch' })),
    { kind: 'unsupported-foot' });
  assert.deepEqual(resolveUndergroundShaftRegistration(liveSurvey, host({ acceptsShaftHandoff: () => false })),
    { kind: 'unregistered-handoff' });
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...liveSurvey, mineLanding: undefined }, host()),
    { kind: 'unregistered' });
});

test('absent survey inputs never reach the host or invent a shaft crossing', () => {
  const port = host({ supportsFoot: () => assert.fail('registration incomplete') });
  for (const key of Object.keys(survey) as (keyof Survey)[]) {
    assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, [key]: undefined }, port), { kind: 'unregistered' });
  }
});

test('domains, non-finite transforms and the independent depth line fail closed', () => {
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, mineLanding: { ...mineLanding, domainId: 'west' } }, host()),
    { kind: 'invalid-domains' });
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, fixtureWinch: { ...fixtureWinch, verticalReach: NaN } }, host()),
    { kind: 'invalid-points' });
  assert.deepEqual(resolveUndergroundShaftRegistration({
    ...survey,
    crater: { ...survey.crater, fixtureRim: { ...fixtureRim, east: -Number.MAX_VALUE } },
    fixtureShaftFoot: { ...fixtureShaftFoot, east: Number.MAX_VALUE },
  }, host()), { kind: 'invalid-transform' });
  for (const depthLine of [Infinity, -90, pitHeight, 0]) {
    assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, depthLine }, host()), { kind: 'invalid-depth' });
  }
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, mineLanding: { ...mineLanding, height: -91 } }, host()),
    { kind: 'invalid-depth' });
});

test('valid coordinates still require supported feet and a live registered shaft route', () => {
  for (const missing of ['shaft', 'winch', 'mine-pool']) {
    assert.deepEqual(resolveUndergroundShaftRegistration(survey, host({
      supportsFoot: role => role !== missing,
      acceptsShaftHandoff: () => assert.fail('foot has no support'),
    })), { kind: 'unsupported-foot' });
  }
  assert.deepEqual(resolveUndergroundShaftRegistration(survey, host({ acceptsShaftHandoff: () => false })),
    { kind: 'unregistered-handoff' });
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, depthLine: -62.5 }, host({
    acceptsShaftHandoff: route => route.depthLine === survey.depthLine,
  })), { kind: 'unregistered-handoff' });
});
