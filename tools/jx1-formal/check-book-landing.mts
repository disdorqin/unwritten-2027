import assert from 'node:assert/strict';
import type { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

type Door = { id: string; x: number; n: number; ground: number };
type Landing = { x: number; n: number; ground: number };
type GroundAt = (east: number, north: number) => number | undefined;
type Occupied = (east: number, north: number, feet: number) => boolean;
type StandardLanding = (door: Door, groundAt: GroundAt) => Landing | undefined;
const same = (a: Landing, b: Landing) => a.x === b.x && a.n === b.n && a.ground === b.ground;
const copy = (pose: Landing | undefined) => pose ? { x: pose.x, n: pose.n, ground: pose.ground } : undefined;

export function productionLandingHelper(root: string, require: ReturnType<typeof createRequire>,
  findHouseDoorLanding: StandardLanding, marketHomes: ReadonlyMap<string, unknown>, viewerPath?: string) {
  const ts: typeof import('typescript') = require('typescript');
  const viewer = readFileSync(viewerPath ?? resolve(root, 'tools/voxel-tavern/town-blockout/viewer.ts'), 'utf8');
  const source = ts.createSourceFile('viewer.ts', viewer, ts.ScriptTarget.Latest, true);
  const find = (name: string) => source.statements.find((line): line is import('typescript').FunctionDeclaration =>
    ts.isFunctionDeclaration(line) && line.name?.text === name);
  const syntax = find('resolveHouseDoorLanding');
  if (!syntax) return;
  for (const name of ['prewarmHouseDoorExit', 'exitThroughHouseDoor', 'checkHouseDoorLanding']) {
    assert.match(find(name)?.getText(source) ?? '', /\bresolveHouseDoorLanding\(/, name + ' bypasses the common resolver');
  }
  const compiled = ts.transpileModule(syntax.getText(source), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  let dry: GroundAt;
  let occupied: Occupied;
  const choose = runInNewContext(compiled + '\nresolveHouseDoorLanding;', {
    findHouseDoorLanding, districts: { marketHomes },
    dryTownLandingHeight: (x: number, n: number) => dry(x, n),
    houseDoorOccupied: (x: number, n: number, feet: number) => occupied(x, n, feet),
    availableHouseDoorGround: (x: number, n: number) => {
      const feet = dry(x, n);
      return feet !== undefined && !occupied(x, n, feet) ? feet : undefined;
    },
  }) as (door: Door) => Landing | undefined;
  return (door: Door, groundAt: GroundAt, peersAt: Occupied) => {
    dry = groundAt;
    occupied = peersAt;
    return copy(choose(door));
  };
}

export function auditBookLanding(doors: readonly Door[], find: StandardLanding,
  choose: NonNullable<ReturnType<typeof productionLandingHelper>>, isActive: (id: string) => boolean,
  baseline: GroundAt, candidate: GroundAt) {
  const exceptions = [];
  const relocated = [];
  const failures = [];
  for (const door of doors) {
    const prior = copy(find(door, baseline));
    const standard = copy(find(door, candidate));
    const safeTransfer = choose(door, candidate, () => false);
    const canUseRecord = isActive(door.id) && candidate(door.x, door.n) === door.ground;
    const recorded = { x: door.x, n: door.n, ground: door.ground };
    const expected = standard ?? (canUseRecord ? recorded : undefined);
    assert.deepEqual(safeTransfer, expected, door.id + ' vacant destination');
    if (prior && !safeTransfer) failures.push(door.id + ' previously usable destination unavailable');
    if (safeTransfer && !standard) exceptions.push({ id: door.id, prior, target: safeTransfer });
    if (safeTransfer && prior && !same(safeTransfer, prior)) {
      relocated.push({ id: door.id, prior, target: safeTransfer, deltaY: safeTransfer.ground - prior.ground });
    }
    // With a free original stand, only statically omitted standard landings may use it.
    const stancesOccupied: Occupied = (x, n) => x !== door.x || n !== door.n;
    assert.deepEqual(choose(door, candidate, stancesOccupied), standard ? undefined : expected,
      door.id + ' legacy peer-blocked fallback');
    assert.equal(choose(door, candidate, () => true), undefined, door.id + ' occupied recorded stand');
    if (standard) {
      const firstOccupied: Occupied = (x, n) => x === standard.x && n === standard.n;
      const nextStandard = copy(find(door, (x, n) => firstOccupied(x, n, 0) ? undefined : candidate(x, n)));
      assert.deepEqual(choose(door, candidate, firstOccupied), nextStandard, door.id + ' ordered side fallback');
    }
  }
  return { tested: doors.length, exceptions, relocated, failures };
}
