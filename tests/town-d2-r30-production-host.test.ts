import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Mesh as MeshType } from 'three';
import {
  createTownD2R30ProductionHost, townD2SectorBounds,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-production-host';
import {
  createEastSectorInstaller, createSouthSectorInstaller, createWestSectorInstaller,
} from '../tools/voxel-tavern/town-blockout/town-d2-r30-sector-installers';

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

test('A31 joint: an uncertified cable line is refused and stays closed', () => {
  const host = createTownD2R30ProductionHost();
  try {
    assert.deepEqual({ ...host.cableState(), refusal: undefined },
      { installed: false, boardable: false, certified: false, refusal: undefined });
    assert.throws(() => host.installCable(port => {
      const group = new Group();
      group.name = 'b6-cable-line';
      port.owner.add(group);
      return { certified: false, boardable: false, group, dispose() { group.removeFromParent(); } };
    }), /not certified/);
    assert.equal(host.cableState().installed, false);
    assert.equal(host.cableState().boardable, false);
    assert.equal(host.group.getObjectByName('b6-cable-line'), undefined, 'a refused line must not stay mounted');
    assert.match(host.cableState().refusal ?? '', /not certified/);

    const accepted = host.installCable(port => {
      const group = new Group();
      group.name = 'b6-cable-line';
      port.owner.add(group);
      return { certified: true, boardable: true, group, dispose() { group.removeFromParent(); } };
    });
    assert.equal(accepted.certified, true);
    assert.equal(host.cableState().boardable, true);
    assert.throws(() => host.installCable(() => { throw new Error('second line'); }), /already installed/);
  } finally {
    host.dispose();
  }
});

test('D31-1 the host publishes the four sector bounds it enforces', () => {
  assert.deepEqual({ ...townD2SectorBounds.A }, { west: -1100, east: 1100, south: -10, north: 480 });
  assert.deepEqual({ ...townD2SectorBounds.B }, { west: -1100, east: -300, south: 480, north: 1790 });
  assert.deepEqual({ ...townD2SectorBounds.C2 }, { west: 300, east: 1100, south: 480, north: 1790 });
  assert.deepEqual({ ...townD2SectorBounds.D2 }, { west: -300, east: 300, south: 480, north: 1790 });
});
