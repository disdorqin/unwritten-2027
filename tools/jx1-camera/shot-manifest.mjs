import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const viewerDir = 'tools/voxel-tavern/town-blockout';
const headings = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] };
const streetOffsets = {
  'old-town:158:184': [166, 141.095],
  'old-town:173:135': [163.155, 145.5],
};
const pose = (east, y, north) => [east, y, -north];
const via = root => createRequire(join(root, 'package.json'));
const productionFiles = ['viewer.ts', 'district-layout.ts', 'district-housing.ts'];

async function loadTree(root, candidate) {
  const local = via(root);
  const { Group } = await import(pathToFileURL(local.resolve('three')));
  const { tsImport } = await import(pathToFileURL(local.resolve('tsx/esm/api')));
  const load = name => tsImport(pathToFileURL(join(root, viewerDir, name + '.ts')).href, import.meta.url);
  const { createTerrainGrid } = await load('terrain');
  const { addScenery } = await load('scenery');
  const { buildPineCamp } = await load('town-pine-camp');
  const { createTownRailway } = await load('town-railway');
  const { addDistrictHousing } = await load('district-layout');
  const ids = candidate ? (await load('market-home-interior')).marketHomeIds : [];
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  globalThis.Image = class { async decode() {} };
  globalThis.document = {
    createElement: () => ({
      toDataURL: () => 'data:image/png;base64,',
      getContext: () => ({
        createRadialGradient: () => ({ addColorStop() {} }),
        createLinearGradient: () => ({ addColorStop() {} }),
        fillRect() {}, strokeRect() {}, fillText() {}, drawImage() {},
      }),
    }),
  };
  try {
    const grid = createTerrainGrid();
    const scene = new Group();
    const scenery = addScenery(scene, grid, buildPineCamp(grid).keepClear);
    const railway = createTownRailway(grid, () => 0);
    const requested = new Set(ids);
    const district = addDistrictHousing(scene, grid, scenery.blocked, railway.keepClear, undefined, requested);
    const files = [...productionFiles];
    if (candidate) {
      const geometryFiles = (await readdir(join(root, viewerDir))).filter(file => /^market-home-.*\.ts$/.test(file)).sort();
      files.push(...geometryFiles);
    }
    const sourceSha256 = {};
    for (const file of files) {
      sourceSha256[file] = createHash('sha256').update(await readFile(join(root, viewerDir, file))).digest('hex');
    }
    return { district, heightAt: grid.heightAt, requested, sourceSha256 };
  } finally {
    if (previousDocument) globalThis.document = previousDocument;
    else delete globalThis.document;
    if (previousImage) globalThis.Image = previousImage;
    else delete globalThis.Image;
  }
}

function foundationHeight(site, surface) {
  const { x, n, w, d, angle } = site;
  const eastHalf = (Math.abs(Math.sin(angle)) > .5 ? d : w) / 2 + 1;
  const northHalf = (Math.abs(Math.sin(angle)) > .5 ? w : d) / 2 + 1;
  const values = [-1, 0, 1].flatMap(e => [-1, 0, 1].map(q => surface(x + e * eastHalf, n + q * northHalf)));
  return Math.max(...values) + .14;
}

export async function deriveShotManifest(frozenRoot, candidateRoot) {
  const before = await loadTree(frozenRoot, false);
  const after = await loadTree(candidateRoot, true);
  assert.deepEqual(after.district.housePortals, before.district.housePortals, 'All original old-town portal fields must match');
  assert.deepEqual(after.district.sites, before.district.sites, 'All original lots must match');
  const requested = [...after.requested].sort();
  const active = [...after.district.marketHomes.keys()].sort();
  assert.deepEqual(requested, before.district.housePortals.filter(portal => portal.zone === 'market').map(portal => portal.id).sort(),
    'The QA request must cover every registered old-town market door');
  assert.ok(active.every(id => after.requested.has(id)), 'Staged geometry activated a door outside the requested roster');
  const held = requested.filter(id => !after.district.marketHomes.has(id));
  const houses = [];
  const shots = [];
  for (const [index, portal] of before.district.housePortals.entries()) {
    if (portal.zone !== 'market') continue;
    const site = before.district.sites[index];
    const { x, n, w, d } = site;
    const home = after.district.marketHomes.get(portal.id);
    const base = foundationHeight(site, before.heightAt);
    if (home) assert.equal(base, home.foundationY, portal.id);
    const outward = [Math.sin(portal.exitYaw), Math.cos(portal.exitYaw)];
    const [streetEast, streetNorth] = streetOffsets[portal.id] ?? [
      portal.x + 10 * outward[0], portal.n + 10 * outward[1],
    ];
    const target = pose(x, base + 3, n);
    const exterior = (view, position) => shots.push({ id: portal.id, view, position, target, sides: ['frozen', 'staged'] });
    exterior('street', pose(streetEast, before.heightAt(streetEast, streetNorth) + 1.63, streetNorth));
    const radius = Math.max(w, d) * 1.32 + 5;
    for (const [view, [east, north]] of Object.entries(headings)) {
      const rise = portal.id === 'old-town:158:184' && (view === 'north' || view === 'east') ? 1
        : portal.id === 'old-town:179:155' && view === 'east' ? .8 : .62;
      exterior(view, pose(x + radius * east, base + radius * rise, n + radius * north));
    }
    if (home) {
      const inside = home.audit.forward.at(-1);
      assert.equal(inside.support, 'floor');
      shots.push({
        id: portal.id, view: 'interior', position: pose(inside.x, inside.ground + 1.63, inside.n),
        target: pose(inside.x - 5 * outward[0], inside.ground + 1.13, inside.n - 5 * outward[1]),
        sides: ['staged'],
      });
    }
    houses.push({
      id: portal.id, portal, site, foundationY: base, status: home ? 'staged-static-audit' : 'held-closed',
      ...(home ? { entrance: home.entrance, approach: home.approach,
        audit: { maxStep: home.audit.maxStep, minHeadroom: home.audit.minHeadroom,
          minLeftClearance: home.audit.minLeftClearance, minRightClearance: home.audit.minRightClearance } } : {}),
      ...(home?.porch ? { porch: { maximumStep: home.porch.maximumStep,
        minimumClearWidth: home.porch.minimumClearWidth, minimumClearHeight: home.porch.minimumClearHeight,
        ...(home.porch.side ? { side: home.porch.side } : {}) } } : {}),
    });
  }
  assert.equal(houses.length, 17);
  assert.equal(shots.filter(shot => shot.sides.length === 2).length, 85);
  assert.equal(shots.filter(shot => shot.view === 'interior').length, active.length);
  return {
    coordinates: '[world X/E, Y, world Z/−N] in meters',
    scopes: {
      frozen: 'Frozen production-source viewer and legacy closed facades.',
      staged: 'Production-source viewer. The QA build requests all 17 doors and opens only those accepted by production geometry.',
      interior: 'Fixed camera at the audited inside footpoint. Frozen facade has no matching room.',
    },
    settings: { width: 1000, height: 650, dpr: 1, fov: 58, near: .1, far: 1400 },
    requested, active, held, houses, shots,
    sourceSha256: { frozen: before.sourceSha256, staged: after.sourceSha256 },
  };
}
