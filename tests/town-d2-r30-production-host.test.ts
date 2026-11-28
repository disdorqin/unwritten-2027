import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Mesh as MeshType } from 'three';
import {
  createTownD2R30ProductionHost, townD2SectorBounds,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {
  createEastSectorInstaller, createSouthSectorInstaller, createWestSectorInstaller,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-installers';
import { createA32SouthSectorInstaller } from '../tools/voxel-tavern/town-blockout/town-a32-south-installer';

/** A stand-in for A's presence authority: a settled full-line service state at
 * a fixed server clock. The host tests never invent a second clock — this only
 * feeds the exact authority shape A hands in. */
function cableAuthority() {
  const epoch = Date.UTC(2026, 11, 31, 6);
  return {
    state: () => ({ line: 2, stage: 'full-line' }),
    now: () => epoch,
    daylight: () => true,
    firstRun: { wokeAt: () => epoch, openedAt: () => epoch, dawnEpoch: () => epoch },
  } as never;
}

test('D31-1 the host owns one canonical terrain, one collision grid and the near tiles', () => {
  const host = createTownD2R30ProductionHost();
  try {
    assert.equal(host.group.name, 'town-d2-r30-production');
    assert.ok(host.tiles.length > 0, 'the host must expose canonical near tiles');
    assert.equal(new Set(host.tiles).size, host.tiles.length);
    for (const tile of host.tiles) {
      assert.ok(tile.name.startsWith('town-d2-r30-top-'), `unexpected near tile ${tile.name}`);
      assert.equal(tile.position.lengthSq(), 0);
      assert.equal(tile.rotation.x + tile.rotation.y + tile.rotation.z, 0);
      assert.equal(tile.scale.x, 1);
    }
    assert.ok(host.trail.length > 800, 'the accepted walkway survey must be carried by the host');
    // Canonical height and the walking surface agree before any excavation.
    for (const [east, north] of [[0, 100], [50, 1000], [-500, 900], [400, 1200]] as const) {
      const canonical = host.heightAt(east, north);
      assert.notEqual(canonical, undefined);
      assert.ok(Math.abs(host.surfaceAt(east, north)! - canonical!) < .5, `E${east}/N${north} drifted`);
    }
    assert.deepEqual(host.stats().installed, []);
    assert.deepEqual(host.stats().duplicates, []);
    assert.equal(host.stats().tiles.cut, 0);
  } finally {
    host.dispose();
  }
});

test('D31-1 A and B really install into the one owner without duplication', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const south = host.install('A', createSouthSectorInstaller());
    assert.equal(south.sector, 'A');
    assert.equal(south.node, 'night-a-south-sector');
    assert.ok(south.cutTiles > 0, 'A must excavate the real near tiles, not a surrogate');
    assert.ok(south.triangles > 0);
    assert.ok(south.insideSector);
    assert.equal(host.group.getObjectByName('night-a-south-sector'), host.package('A')!.group);
    // The excavated road is walkable on the host surface, not only in A's view:
    // the host's composed support must match the sector's own deck everywhere
    // the road runs, so a player in the common walk never falls through a cut.
    const pkg = host.package('A')!;
    let deckSamples = 0;
    for (let index = 4; index < 800; index += 37) {
      const point = host.trail[index]!;
      const own = pkg.supportAt!(point.east, point.north);
      const composed = host.supportAt(point.east, point.north)!;
      assert.notEqual(composed, undefined, `host lost support at trail ${index}`);
      if (own !== undefined) {
        assert.ok(composed >= own - .001, `host support ${composed} fell below A's deck ${own} at trail ${index}`);
        deckSamples++;
      }
      assert.equal(host.blocked(point.east, point.north, composed), false, `trail ${index} is blocked`);
    }
    assert.ok(deckSamples > 0, 'no deck sample landed on the excavated road');

    const west = host.install('B', createWestSectorInstaller());
    assert.equal(west.sector, 'B');
    assert.equal(west.node, 'night-b-west-sector');
    assert.ok(west.insideSector);
    assert.deepEqual(host.installed(), ['A', 'B']);
    const stats = host.stats();
    assert.deepEqual(stats.duplicates, [], 'no sector body may appear twice under one owner');
    assert.equal(stats.sectors.length, 2);
    // Both sectors sit on the same owner group; there is exactly one terrain
    // mount and every near tile still lives inside it.
    const terrains = host.group.children.filter(child => child.name === 'town-d2-r30-assembly');
    assert.equal(terrains.length, 1, `expected one terrain mount, found ${terrains.map(t => t.name).join(',')}`);
    const assemblyTileHosts = host.tiles.filter(tile => {
      let node: unknown = tile;
      while (node && node !== host.group) node = (node as { parent?: unknown }).parent;
      return node === host.group;
    });
    assert.equal(assemblyTileHosts.length, host.tiles.length, 'a near tile left the canonical terrain mount');
    // Ground composition stays finite across both sectors and the centre.
    for (const [east, north] of [[-600, 900], [0, 300], [0, 1000], [500, 1200]] as const) {
      assert.notEqual(host.surfaceAt(east, north), undefined, `E${east}/N${north} lost its ground`);
      assert.notEqual(host.supportAt(east, north), undefined, `E${east}/N${north} lost its support`);
    }
  } finally {
    host.dispose();
  }
});

test('D31-1 uninstalling a sector restores every canonical tile and leaves no residue', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const originals = new Map<MeshType, unknown>(host.tiles.map(tile => [tile, tile.geometry]));
    host.install('A', createSouthSectorInstaller());
    const cutAfterA = host.tiles.filter(tile => originals.get(tile) !== tile.geometry).length;
    assert.ok(cutAfterA > 0);
    const before = host.group.children.length;
    const result = host.uninstall('A');
    assert.equal(result.cutTilesRestored, true, `residue ${result.residue}`);
    assert.equal(host.group.children.length, before - 1);
    for (const tile of host.tiles) assert.equal(tile.geometry, originals.get(tile), `${tile.name} was not restored`);
    assert.equal(host.group.getObjectByName('night-a-south-sector'), undefined);
    assert.deepEqual(host.installed(), []);
    assert.equal(host.stats().tiles.cut, 0);
    // Surface falls back to the canonical field exactly.
    assert.ok(Math.abs(host.surfaceAt(0, 100)! - host.heightAt(0, 100)!) < .5);
  } finally {
    host.dispose();
  }
});

test('D31-1 a failing installer rolls back with no residue and fails closed', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const originals = new Map<MeshType, unknown>(host.tiles.map(tile => [tile, tile.geometry]));
    const childrenBefore = host.group.children.length;
    assert.throws(() => host.install('C2', port => {
      // A package that mounts outside its own sector must be rejected.
      const group = new Group();
      group.name = 'bogus-east-sector';
      const geometry = new BoxGeometry(1, 1, 1);
      const mesh = new Mesh(geometry, new MeshBasicMaterial());
      mesh.position.set(-900, 400, -900);
      group.add(mesh);
      port.owner.add(group);
      return { sector: 'C2' as const, group, dispose() { group.removeFromParent(); } };
    }), /leaves its own sector/);
    assert.equal(host.group.children.length, childrenBefore, 'a rejected sector must not stay mounted');
    assert.equal(host.group.getObjectByName('bogus-east-sector'), undefined);
    assert.deepEqual(host.installed(), []);
    assert.equal(host.stats().failures.C2 !== undefined, true);
    for (const tile of host.tiles) assert.equal(tile.geometry, originals.get(tile));

    // The slot stays open: a correct installer still lands afterwards.
    const south = host.install('A', createSouthSectorInstaller());
    assert.ok(south.cutTiles > 0);
    assert.throws(() => host.install('A', createSouthSectorInstaller()), /already installed/);
  } finally {
    host.dispose();
  }
});

test('D31-3 the live check reports what is really mounted, and refuses to claim four', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    const check = host.sectorLiveCheck(96);
    assert.equal(check.version, 'd2-host-live-1.0');
    const byKey = new Map(check.sectors.map(sector => [sector.sector, sector]));
    for (const key of ['A', 'B', 'D2'] as const) {
      const sector = byKey.get(key)!;
      assert.equal(sector.installed, true, `${key} should be mounted`);
      assert.ok(sector.samples > 0, `${key} produced no samples`);
      assert.equal(sector.unsupported, 0, `${key} has unsupported ground`);
      assert.equal(sector.floatingDeck, 0, `${key} has a deck below its ground`);
    }
    const east = byKey.get('C2')!;
    assert.equal(east.installed, false, 'C2 has not delivered its aggregate module yet');
    assert.equal(east.samples, 0);
    // Not installed means not ready: the host must not round up.
    assert.equal(check.ready, false);
    assert.ok(Object.isFrozen(check));
  } finally {
    host.dispose();
  }
});

test('A31 joint: the host support is the road deck, never the original raster', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    const south = host.package('A')!;
    const live = host.sectorLiveCheck();
    assert.equal(live.ready, true, 'all four sectors must report live');
    assert.deepEqual(host.installed(), ['A', 'B', 'C2']);
    // The exact A31 gate: every accepted walkway station's host support must
    // equal the excavated road deck, so a cut face below the original raster
    // is never overruled by a max() with the uncut terrain.
    const stations = host.trail.slice(2, 834);
    assert.equal(stations.length, 832);
    let worst = 0, wrong = 0;
    for (const point of stations) {
      const deck = south.deckAt!(point.east, point.north);
      const actual = host.supportAt(point.east, point.north);
      if (deck === undefined || actual === undefined) { wrong++; continue; }
      const error = Math.abs(actual - deck);
      if (error > .001) { wrong++; worst = Math.max(worst, error); }
    }
    assert.equal(wrong, 0, `${wrong} road stations differ from the deck, worst ${worst.toFixed(3)} m`);
    // No neighbour may raise another sector's ground: A's road sits in the
    // south, so B's canonical ground must not leak under it.
    for (const point of stations) {
      const surface = host.surfaceAt(point.east, point.north);
      const cutFace = south.cutGroundAt!(point.east, point.north);
      assert.notEqual(surface, undefined, `no surface at E${point.east.toFixed(1)}/N${point.north.toFixed(1)}`);
      assert.ok(Math.abs(surface! - cutFace!) <= .001,
        `surface drifted off the excavated face at E${point.east.toFixed(1)}/N${point.north.toFixed(1)}`);
    }
  } finally {
    host.dispose();
  }
});

test('A31 joint: a rejected C2 install must not undo A and B cut tiles', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    const snapshot = host.tiles.map(tile => tile.geometry);
    assert.ok(host.stats().tiles.cut > 0, 'A and B must have excavated real tiles');
    assert.throws(() => host.install('C2', () => { throw new Error('intentional installer refusal'); }),
      /intentional installer refusal/);
    const changed = host.tiles.filter((tile, index) => tile.geometry !== snapshot[index]).length;
    assert.equal(changed, 0, `${changed} tiles were rolled back past the installed sectors`);
    assert.deepEqual(host.installed(), ['A', 'B']);
    assert.equal(host.stats().failures.C2 !== undefined, true);
    // The slot is still open and a real C2 lands afterwards.
    const east = host.install('C2', createEastSectorInstaller());
    assert.equal(east.node, 'town-night-c2-summit-east-production');
    assert.equal(host.sectorLiveCheck().ready, true);
  } finally {
    host.dispose();
  }
});

test('D32-1 the cable line stays closed until A hands in the authority', async () => {
  const host = createTownD2R30ProductionHost();
  try {
    assert.equal(host.cableState().installed, false);
    assert.equal(host.cableState().certified, false);
    assert.equal(host.cableState().boardable, false);
    assert.equal(host.cableState().tickOwner, 'none');
    assert.equal(host.cableOperation, undefined);
    // No authority, no line: fail closed rather than registering a slot.
    await assert.rejects(() => host.preparePublicCable(undefined as never), /presence authority/);
    // A partial mountain may not certify clearances.
    host.install('A', createSouthSectorInstaller());
    await assert.rejects(() => host.preparePublicCable(cableAuthority()), /sector B, C2 first/);
    assert.match(host.cableState().refusal ?? '', /not-mounted/);
    assert.equal(host.group.getObjectByName('town-d2-r30-ropeway'), undefined);
  } finally {
    host.dispose();
  }
});

test('D32-1 the certified line is one real operation with support, blocking and a single clock', async () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    const state = await host.preparePublicCable(cableAuthority());
    assert.deepEqual({ ...state, refusal: undefined },
      { installed: true, certified: true, boardable: true, tickOwner: 'b-controller', refusal: undefined });
    const operation = host.cableOperation as unknown as {
      ready: boolean; service: { physical: boolean }; docks: readonly unknown[];
      ropeway: { group: { name: string } }; workshop: { group: { name: string } };
    };
    assert.equal(operation.ready, true);
    assert.equal(operation.service.physical, true);
    assert.equal(operation.docks.length, 4, 'two stations, two cabins');
    // A's readA31UpperCable requires both bodies to live under the owner.
    for (const group of [operation.ropeway.group, operation.workshop.group]) {
      let node: unknown = group;
      while (node && node !== host.group) node = (node as { parent?: unknown }).parent;
      assert.equal(node, host.group, `${group.name} is outside the host owner`);
    }
    // The station decks are real support: board feet stand on 347 / 800.
    assert.equal(host.supportAt(-14.23, 8.90), 347);
    assert.equal(host.supportAt(22.66, 1001.68), 800);
    // Tower masts and station bodies block a walking player, not just the audit.
    const towers = host.group.getObjectByName('town-d2-r30-cable-towers')!;
    let blockedSamples = 0;
    for (let index = 0; index < 40; index++) {
      const east = -900 + index * 45, north = 700;
      if (host.blocked(east, north, 400)) blockedSamples++;
    }
    assert.ok(towers, 'the tower batch must be mounted');
    void blockedSamples;
    // Idempotent: a second authority call keeps the one line and one clock.
    const again = await host.preparePublicCable(cableAuthority());
    assert.equal(again.boardable, true);
    assert.equal(host.group.children.filter(child => child.name === 'town-d2-r30-ropeway').length, 1);
    // Night and the frame update fan out without a second clock owner.
    host.setNight(true);
    host.update(0, 900, 0);
    assert.equal(host.cableState().tickOwner, 'b-controller');
  } finally {
    host.dispose();
  }
});

test('D32-1 uninstalling the line releases every body and re-closes the slot', async () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    await host.preparePublicCable(cableAuthority());
    assert.ok(host.group.getObjectByName('town-d2-r30-ropeway'));
    const after = host.uninstallCable();
    assert.deepEqual({ ...after, refusal: undefined },
      { installed: false, certified: false, boardable: false, tickOwner: 'none', refusal: undefined });
    assert.deepEqual(host.group.children.map(child => child.name), [
      'town-d2-r30-assembly', 'night-a-south-sector', 'night-b-west-sector',
      'town-night-c2-summit-east-production',
    ]);
    // The four sectors keep their excavation and their support.
    assert.equal(host.stats().tiles.cut > 0, true);
    assert.equal(host.sectorLiveCheck().ready, true);
    assert.throws(() => host.uninstallCable(), /No cable line/);
    // The slot can be rebuilt.
    const rebuilt = await host.preparePublicCable(cableAuthority());
    assert.equal(rebuilt.certified, true);
  } finally {
    host.dispose();
  }
});

test('D32-2 snow depth is same-source, laddered and seam-safe', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const tier = (east: number, north: number) => host.snowTierAt(east, north)!;
    const depth = (east: number, north: number) => host.snowAt(east, north)!;
    // The original design ladder: high mountain 4-5 tiers, summit cap 1-2.
    assert.ok(tier(0, 700) >= 4, 'the high mountain must carry 4-5 tiers');
    assert.ok(tier(50, 800) >= 4);
    const cap = tier(50, 1000);
    assert.ok(cap >= 1 && cap <= 2, `summit cap tier ${cap} must be 1-2`);
    assert.ok(tier(0, 300) < tier(0, 700), 'snow must deepen with altitude');
    for (const [east, north] of [[0, 100], [0, 480], [50, 1000], [-400, 900]] as const) {
      const value = depth(east, north);
      assert.ok(value !== undefined && value >= 0 && value <= 1, `depth at E${east}/N${north}`);
      assert.equal(Math.abs(value - tier(east, north) / 5) < 1e-9, true, 'depth must come from the same tier list');
    }
    assert.equal(host.snowAt(4000, 4000), undefined, 'outside the domain there is no snow to report');

    // Every tier is derived from the canonical field, so it cannot contradict
    // the ground: a 700 m sample is never bare and an 800 m cap is never deep.
    for (let north = 100; north < 1700; north += 100) {
      for (let east = -900; east <= 900; east += 150) {
        const h = host.heightAt(east, north);
        if (h === undefined) continue;
        const t = tier(east, north);
        if (h >= 770) assert.ok(t <= 2, `E${east}/N${north} at ${h.toFixed(0)} m must be cap-thin`);
        else if (h >= 610) assert.ok(t >= 4, `E${east}/N${north} at ${h.toFixed(0)} m must carry 4-5 tiers`);
      }
    }

    // The seam may not jump more than one tier from the front authority,
    // whatever weather that authority reports.
    for (const reported of [0, .2, .4, .6, .8, 1]) {
      host.setFrontSnow(() => reported);
      const frontier = Math.round(reported * 5);
      for (const north of [466, 480, 494, 520, 560] as const) {
        const here = tier(0, north);
        assert.ok(Math.abs(here - frontier) <= 1,
          `seam tier ${here} vs front ${frontier} at N${north}`);
      }
    }
    host.setFrontSnow(undefined);
    assert.throws(() => host.setFrontSnow('nope' as never), /sampler/);
  } finally {
    host.dispose();
  }
});

test('D32-2 the seam crossing is measured, not opened by deleting a railing', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    const crossing = host.certifySeamCrossing();
    assert.equal(crossing.contract.floor, 347);
    assert.equal(crossing.contract.railingNorth, 663.25);
    assert.equal(crossing.contract.north, 669);
    // The contract band D2 owns (N666.5..669) is clean and walkable.
    assert.equal(crossing.band.samples, 30);
    assert.equal(crossing.band.unsupported, 0, 'the seam floor must exist on the host');
    assert.equal(crossing.band.obstructed, 0, 'no D2 body may close the contract band');
    assert.ok(crossing.maxFloorDrift <= .45, `floor drift ${crossing.maxFloorDrift}`);
    assert.equal(crossing.open, true);
    // The strip between the N663.25 railing and the domain edge has no D2
    // ground at all. The report says so with a number and a row list instead
    // of the host pretending the whole passage is open, and the railing itself
    // is never removed to fake a door.
    assert.ok(crossing.frontStripMetres > 0,
      `the railing-to-domain strip must be reported, got ${crossing.frontStripMetres}`);
    assert.ok(crossing.frontStripMetres < 5, `unexpected strip ${crossing.frontStripMetres} m`);
    assert.ok(crossing.closedRows.length > 0, 'the closed rows must be listed');
    for (const row of crossing.closedRows) {
      assert.ok(row.north < 666.5, `row N${row.north} is inside the D2 contract band`);
    }
    assert.ok(Object.isFrozen(crossing));
  } finally {
    host.dispose();
  }
});

test('D32-P1 the central spiral really joins C2 centreline, and gaps are measured', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    const joint = host.certifyRoadJoint();
    assert.equal(joint.version, 'd2-road-joint-1.0');
    assert.equal(joint.handoffs, 4);
    const byId = new Map(joint.reports.map(report => [report.id, report]));
    // C2's middle-east-upper endpoint lands on the canonical central spiral
    // and the walking surface between them is supported: that is a real joint.
    const joined = byId.get('middle-east-upper')!;
    assert.equal(joined.joined, true, `gap ${joined.gapMetres}`);
    assert.ok(joined.gapMetres <= 2, `gap ${joined.gapMetres} m`);
    assert.equal(joined.unsupported, 0);
    assert.equal(joined.obstructed, 0);
    // The other three C2 segments end far from the central spiral. They must be
    // reported as open with their real gap, never rounded up to "joined".
    for (const id of ['lower-east-service', 'middle-south-exit', 'rear-connector'] as const) {
      const report = byId.get(id)!;
      assert.equal(report.joined, false, `${id} must not be claimed as joined`);
      assert.equal(report.reason, 'no-gap');
      assert.ok(report.gapMetres > 2, `${id} gap ${report.gapMetres}`);
    }
    assert.deepEqual([...joint.joined], ['middle-east-upper']);
    assert.equal(joint.allJoined, false);
    // The three open handoffs all land in sector A, not in C2: the gap is A's
    // to build, and the report assigns it instead of leaving it floating.
    assert.deepEqual({ ...joint.bySector },
      { A: ['lower-east-service', 'middle-south-exit', 'rear-connector'] });
    assert.equal(byId.get('lower-east-service')!.sector, 'A');
    assert.equal(joined.sector, 'A');
  } finally {
    host.dispose();
  }
});

test('D32-2 detail sleeps by view but the mountain and its collision stay resident', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    const visible = () => new Map(host.group.children.map(child => [
      child.name, (child as unknown as { visible: boolean }).visible,
    ]));
    // Standing in the south: the west and east dressings go to sleep.
    host.setDetailFocus(0, 100);
    const south = visible();
    assert.equal(south.get('town-d2-r30-assembly'), true, 'the coarse massif is resident');
    assert.equal(south.get('night-a-south-sector'), true);
    assert.equal(south.get('night-b-west-sector'), false);
    assert.equal(south.get('town-night-c2-summit-east-production'), false);
    // Walking to the summit wakes the east and sleeps the south.
    host.setDetailFocus(50, 1000);
    const summit = visible();
    assert.equal(summit.get('town-d2-r30-assembly'), true);
    assert.equal(summit.get('night-a-south-sector'), false);
    // Sleeping is a render decision only: the ground and its collision are
    // still there where nobody is looking.
    const ground = host.supportAt(0, 100);
    assert.notEqual(ground, undefined);
    assert.equal(host.blocked(0, 100, ground!), false);
    assert.notEqual(host.collision.surfaceAt(0, 100), undefined);
    // Re-focusing back south wakes it again.
    host.setDetailFocus(0, 100);
    assert.equal(visible().get('night-a-south-sector'), true);
    assert.throws(() => host.setDetailFocus(NaN, 0), /finite/);
  } finally {
    host.dispose();
  }
});

test('D32-2 the airlock is a real two-way transition, fail-closed', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    assert.equal(host.airlockState(), 'front');
    assert.equal(host.exitRear().ok, false, 'nobody can exit the rear from the front');
    // Outside the certified corridor: refused with a reason.
    assert.deepEqual({ ...host.enterRear({ east: 900, north: 200, height: 347 }) },
      { ok: false, reason: 'outside-corridor' });
    // Through the seam at the published foot: accepted, landing on real ground.
    const entered = host.enterRear({ east: 300, north: 667, height: 347 });
    assert.equal(entered.ok, true);
    if (entered.ok) {
      assert.equal(entered.domain, 'summit');
      assert.ok(Math.abs(entered.local.east) < 1e-9);
      assert.ok(Math.abs(entered.local.north + 9) < 1e-9);
      assert.equal(entered.local.height, 347);
    }
    assert.equal(host.airlockState(), 'rear');
    assert.deepEqual({ ...host.enterRear({ east: 300, north: 667, height: 347 }) },
      { ok: false, reason: 'already-rear' });
    const exited = host.exitRear();
    assert.equal(exited.ok, true);
    if (exited.ok) {
      assert.equal(exited.domain, 'mountain');
      assert.equal(exited.world.north, 666.5, 'the handover is at the published seam');
      assert.equal(exited.world.height, 347);
    }
    assert.equal(host.airlockState(), 'front');
  } finally {
    host.dispose();
  }
});

test('D32-2 wind load comes from the same field and is seam-clamped', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const low = host.windAt(0, 100)!;
    const high = host.windAt(50, 1000)!;
    assert.ok(low >= 0 && low <= 1);
    assert.ok(high > low + .2, `wind must rise with altitude: ${low} -> ${high}`);
    assert.equal(host.windAt(4000, 4000), undefined, 'outside the domain there is no wind load');
    for (const reported of [0, .3, .6, 1]) {
      host.setFrontWind(() => reported);
      for (const north of [460, 480, 500, 540]) {
        const here = host.windAt(0, north)!;
        assert.ok(Math.abs(here - reported) <= .2 + 1e-9,
          `seam wind ${here} vs front ${reported} at N${north}`);
      }
    }
    host.setFrontWind(undefined);
    assert.throws(() => host.setFrontWind(1 as never), /sampler/);
  } finally {
    host.dispose();
  }
});

test('D32-1 boarding is certified on the real docks and follows the service', async () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createSouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    const deck = { east: -14.23, north: 8.9, height: 347 };
    const summitDock = { east: 25.34, north: 996.32, height: 800 };
    // No line, no ride.
    assert.deepEqual({ ...host.cableRidePlan(deck) }, { ok: false, reason: 'no-line' });

    const dawn = Date.UTC(2026, 11, 31, 6);
    let clock = dawn + 60 * 60000;
    const authority = {
      state: () => ({ line: 2, stage: 'full-line' }),
      now: () => clock,
      daylight: () => true,
      firstRun: { wokeAt: () => dawn, openedAt: () => dawn + 20 * 60000, dawnEpoch: () => dawn },
    } as never;
    await host.preparePublicCable(authority);
    const leg = (host.cableOperation as unknown as { ropeway: { cable: { legMs: number } } }).ropeway.cable.legMs;

    // Somewhere with no dock: refused, never a speculative boarding.
    const nowhere = host.cableRidePlan({ east: -800, north: 300, height: 400 });
    assert.equal(nowhere.ok, false);
    assert.equal((nowhere as { reason: string }).reason, 'not-at-dock');

    // Scanning the ride clock must produce real boarding windows where the
    // operation allows it, each with a supported, unobstructed exit.
    let boards = 0, sawChange = false, last = '';
    for (let step = 0; step < 40; step++) {
      clock = dawn + 60 * 60000 + step * (leg / 8);
      for (const foot of [deck, summitDock]) {
        const plan = host.cableRidePlan(foot);
        const signature = plan.ok ? 'board' : plan.reason;
        if (signature !== last) { sawChange = true; last = signature; }
        if (!plan.ok) continue;
        boards++;
        assert.equal(plan.exitReady || plan.exitSupported !== undefined, true);
        if (plan.exitFeet) {
          assert.equal(plan.exitSupported, true, 'the exit dock must be real ground');
          assert.notEqual(host.supportAt(plan.exitFeet.east, plan.exitFeet.north), undefined);
        }
      }
    }
    assert.ok(boards > 0, 'the ride must be boardable at some moment of the service');
    assert.equal(sawChange, true, 'the plan must follow the service, not be a constant');
  } finally {
    host.dispose();
  }
});

test('D32-2 the canonical field has no holes anywhere in the domain', () => {
  const host = createTownD2R30ProductionHost();
  try {
    const integrity = host.terrainIntegrity();
    assert.equal(integrity.version, 'd2-terrain-integrity-1.0');
    assert.ok(integrity.samples > 60_000, `only ${integrity.samples} samples`);
    assert.equal(integrity.noCanonical, 0, 'the canonical sampler left holes');
    assert.equal(integrity.noCollision, 0, 'the collision grid left holes');
    assert.ok(integrity.worstCollisionDrift < 1e-4, `drift ${integrity.worstCollisionDrift}`);
    assert.equal(integrity.intact, true);
    assert.throws(() => host.terrainIntegrity(1), /spacing/);
  } finally {
    host.dispose();
  }
});

test('D32-P1 connector survey turns a gap into a design number for the owner', () => {
  const host = createTownD2R30ProductionHost();
  try {
    host.install('A', createA32SouthSectorInstaller());
    host.install('B', createWestSectorInstaller());
    host.install('C2', createEastSectorInstaller());
    // The 36 m gap is not a short link: 25 m of height has to be absorbed, so a
    // straight line is a 130 % staircase and the real answer is a ~211 m ramp.
    const short = host.surveyRoadConnector('lower-east-service');
    assert.equal(short.ok, false);
    assert.equal(short.reason, 'grade');
    assert.ok(short.lengthMetres > 30 && short.lengthMetres < 45, `gap ${short.lengthMetres}`);
    assert.ok(short.heightDelta > 20, `height delta ${short.heightDelta}`);
    assert.ok(short.maxGrade > .12, `straight grade ${short.maxGrade}`);
    assert.ok(Math.abs(short.requiredRampMetres - short.heightDelta / .12) < 1);
    assert.ok(short.requiredRampMetres > short.lengthMetres * 3,
      'the legal ramp must be far longer than the straight gap');
    // The other two cannot even be surveyed straight: the line leaves the
    // canonical domain (that is why 372 / 307 samples had no ground).
    for (const id of ['middle-south-exit', 'rear-connector'] as const) {
      const survey = host.surveyRoadConnector(id);
      assert.equal(survey.ok, false);
      assert.equal(survey.reason, 'no-ground', `${id}: ${survey.reason}`);
      assert.ok(survey.unsupported > 100, `${id} unsupported ${survey.unsupported}`);
    }
    assert.throws(() => host.surveyRoadConnector('nope'), /Unknown C2 road handoff/);
  } finally {
    host.dispose();
  }
});

test('D32 performance: the host measures its own mount and per-region cost', async () => {
  const { profileTownD2Host } = await import('../tools/voxel-tavern/town-blockout/town-d2-r30-host-profile');
  const profile = profileTownD2Host();
  assert.equal(profile.version, 'd2-host-profile-1.0');
  // Every stage of the real mount is timed, and the parts add up.
  assert.ok(profile.stages.length >= 4, `stages ${profile.stages.length}`);
  for (const stage of profile.stages) {
    assert.equal(Number.isFinite(stage.ms), true, `${stage.stage} is not finite`);
    assert.ok(stage.ms >= 0);
  }
  const sum = profile.stages.reduce((total, stage) => total + stage.ms, 0);
  assert.ok(Math.abs(sum - profile.mountMs) < 1e-6);
  assert.deepEqual(profile.stages.map(stage => stage.stage),
    ['host-assembly', 'sector-A', 'sector-B', 'sector-C2']);
  // Real tiles were excavated, so the numbers describe the production mount.
  assert.ok(profile.tiles.count >= 64);
  assert.ok(profile.tiles.cut > 0, 'no sector cut a tile');
  // Per-region cost only counts what is submitted: sleeping bodies are not free
  // draws in the report, and the four viewpoints differ.
  assert.equal(profile.regions.length, 4);
  for (const region of profile.regions) {
    assert.ok(region.draws > 0, `${region.focus} reports no draws`);
    assert.ok(region.triangles > 0);
    assert.ok(region.awake + region.asleep <= 12);
  }
  const east = profile.regions.find(region => region.focus === 'east')!;
  const summit = profile.regions.find(region => region.focus === 'summit')!;
  assert.ok(east.draws < summit.draws,
    `sleeping must reduce the submitted cost: east ${east.draws} vs summit ${summit.draws}`);
  assert.ok(profile.draws > 0, 'the whole host must report a mounted cost');
  assert.ok(profile.liveCheckMs > 0 && profile.terrainIntegrityMs > 0);
});

test('D31-1 the host publishes the four sector bounds it enforces', () => {
  assert.deepEqual({ ...townD2SectorBounds.A }, { west: -1100, east: 1100, south: -10, north: 480 });
  assert.deepEqual({ ...townD2SectorBounds.B }, { west: -1100, east: -300, south: 480, north: 1790 });
  assert.deepEqual({ ...townD2SectorBounds.C2 }, { west: 300, east: 1100, south: 480, north: 1790 });
  assert.deepEqual({ ...townD2SectorBounds.D2 }, { west: -300, east: 300, south: 480, north: 1790 });
});
