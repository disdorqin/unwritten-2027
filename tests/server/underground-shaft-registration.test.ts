import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveUndergroundShaftRegistration } from '../../src/presence/underground-shaft-registration.js';

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
    createExpansionAnchorTransform(fixture, live) {
      assert.deepEqual(fixture, fixtureRim);
      assert.deepEqual(live, worldRim);
      return { toWorld(point) {
        if (point.east === 0 && point.height === 0) return worldRim;
        if (point.east === 0 && point.height === -35) return { ...shaftFoot, yaw };
        assert.equal(point.east, fixtureWinch.east);
        return { ...winch, yaw };
      } };
    },
    auditFirstFallDepths(_crossing, landing) {
      return landing === -90 ? [] : ['unapproved datum'];
    },
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

test('absent survey inputs never reach the transform or invent a shaft crossing', () => {
  const port = host({ createExpansionAnchorTransform: () => assert.fail('registration incomplete') });
  for (const key of Object.keys(survey) as (keyof Survey)[]) {
    assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, [key]: undefined }, port), { kind: 'unregistered' });
  }
});

test('domains, finite registration, rim alignment and the independent depth line fail closed', () => {
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, mineLanding: { ...mineLanding, domainId: 'west' } }, host()),
    { kind: 'invalid-domains' });
  assert.deepEqual(resolveUndergroundShaftRegistration({ ...survey, fixtureWinch: { ...fixtureWinch, verticalReach: NaN } }, host()),
    { kind: 'invalid-points' });
  assert.deepEqual(resolveUndergroundShaftRegistration(survey, host({
    createExpansionAnchorTransform: () => ({ toWorld: point => point }),
  })), { kind: 'invalid-transform' });
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
