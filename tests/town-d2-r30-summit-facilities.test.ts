import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { Group, Mesh } from 'three';
import { createTownD2R30SummitFacilities } from '../tools/voxel-tavern/town-blockout/town-d2-r30-summit-facilities';
import { mainSummitBounds } from '../tools/voxel-tavern/town-blockout/main-summit-block';
import { createTownD2R30Assembly } from '../tools/voxel-tavern/town-blockout/town-d2-r30-assembly';
import { sampleTownD2R30Height } from '../tools/voxel-tavern/town-blockout/town-d2-r30-domain';

function cleanup(context: TestContext, facilities: ReturnType<typeof createTownD2R30SummitFacilities>) {
  context.after(() => facilities.dispose());
  return facilities;
}

test('D2-R07 mounts the summit facility bodies and grounds every one of them', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities());
  const reports = facilities.reports();
  assert.ok(reports.length >= 30, `expected the full facility set, got ${reports.length}`);

  // Every body reports how it meets its support surface; none is left
  // unclassified, and none is left floating over open air without a
  // declared support.
  for (const report of reports) {
    assert.ok(['grounded', 'pedestal', 'on-trail', 'aerial', 'external'].includes(report.status),
      `${report.id} has status ${report.status}`);
  }

  // The summit plateau is exactly 800 m on the R30 massif, so the hut,
  // its furnishings and the registration desk must land dead level.
  const hut = reports.find(report => report.id === 'registration-hut');
  assert.ok(hut);
  assert.equal(hut.status, 'grounded');
  assert.equal(hut.height, 800);
  assert.equal(hut.delta, 0);

  const furnishings = reports.find(report => report.id === 'hut-furnishings');
  assert.ok(furnishings);
  assert.equal(furnishings.status, 'grounded');
  assert.equal(furnishings.delta, 0);

  // The nine glide rings are aerial waypoints and must never claim ground.
  const rings = reports.filter(report => report.id.startsWith('glide-ring-'));
  assert.equal(rings.length, 9);
  for (const ring of rings) assert.equal(ring.status, 'aerial');
});

test('D2-R07 keeps the canonical route props on the surveyed walkway', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities());
  const reports = facilities.reports();

  const bells = reports.filter(report => report.id.startsWith('bell-post-'));
  assert.equal(bells.length, 9, 'the canonical bell array keeps nine posts');
  for (const bell of bells) assert.equal(bell.status, 'on-trail');

  const markers = reports.find(report => report.id === 'trail-markers');
  assert.ok(markers);
  assert.equal(markers.status, 'on-trail');

  // The four survey stations keep their M4..M7 identities.
  const stations = reports.filter(report => report.id.startsWith('survey-')).map(report => report.id);
  assert.deepEqual(stations, ['survey-M4', 'survey-M5', 'survey-M6', 'survey-M7']);
});

test('D2-R07 builds real geometry and releases it on dispose', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities());
  const stats = facilities.stats();
  assert.ok(stats.meshes > 20, `expected facility meshes, got ${stats.meshes}`);
  assert.ok(stats.triangles > 5_000, `expected facility triangles, got ${stats.triangles}`);
  assert.equal(stats.facilities, facilities.reports().length);
  assert.equal(stats.grounded + stats.pedestal + stats.onTrail + stats.aerial + stats.external,
    stats.facilities);

  let meshes = 0;
  facilities.group.traverse(object => {
    if (object instanceof Mesh) meshes += 1;
  });
  assert.equal(meshes, stats.meshes);

  // The module must not mutate the shared height field.
  assert.equal(sampleTownD2R30Height(62.5, 1011, 347), 800);
});

test('D2-R07 facilities mount into the R30 assembly as one sub-package', context => {
  const assembly = createTownD2R30Assembly({ includeSummitFacilities: true });
  context.after(() => assembly.dispose());

  const stats = assembly.stats() as { subPackages: readonly string[] };
  assert.ok(stats.subPackages.includes('town-d2-r30-summit-facilities'));

  const facilities = assembly.group.getObjectByName('town-d2-r30-summit-facilities');
  assert.ok(facilities instanceof Group);
  assert.ok(facilities.children.length > 0);
  assert.equal(facilities.userData.owner, 'D2-R07');
});

test('D2-R07 optional subsets can be switched off independently', context => {
  const only = cleanup(context, createTownD2R30SummitFacilities({
    includeHut: false,
    includeGeology: false,
    includeRouteProps: false,
    includeFlight: false,
  }));
  assert.equal(only.reports().length, 0);
  assert.equal(only.stats().meshes, 0);

  const hutOnly = cleanup(context, createTownD2R30SummitFacilities({
    includeGeology: false,
    includeRouteProps: false,
    includeFlight: false,
  }));
  const ids = hutOnly.reports().map(report => report.id);
  assert.deepEqual(ids, ['registration-hut', 'hut-furnishings', 'machine-room']);
});

test('D2-R10 trims the invisible paint quads without touching the visible bands', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities({
    includeHut: false, includeGeology: false, includeFlight: false,
  }));
  const stats = facilities.stats();
  assert.ok(stats.culledPaintQuads > 0, 'expected the blank paint cells to be dropped');

  const paint = facilities.group.getObjectByName('main-summit-paint') as Mesh | undefined;
  assert.ok(paint, 'the canonical paint overlay must still be mounted');
  const geometry = paint.geometry;
  const index = geometry.getIndex();
  const color = geometry.getAttribute('color');
  assert.ok(index && color);

  // The canonical overlay spans the whole P-1 footprint; the R30 host keeps
  // only the quads that actually carry a band colour.
  const bounds = mainSummitBounds;
  const columns = Math.floor((bounds.east - bounds.west) / 20) + 1;
  const rows = Math.floor((bounds.north - bounds.south) / 20) + 1;
  const fullTriangles = (rows - 1) * (columns - 1) * 2;
  assert.equal(index.count / 3, fullTriangles - stats.culledPaintQuads,
    'the trimmed overlay must equal the canonical grid minus the blank quads');

  // Every surviving triangle must carry at least one opaque vertex, otherwise
  // the overlay would still write depth over the massif for nothing.
  let blank = 0;
  let painted = 0;
  for (let triangle = 0; triangle + 2 < index.count; triangle += 3) {
    const a = index.getX(triangle), b = index.getX(triangle + 1), c = index.getX(triangle + 2);
    const alpha = Math.max(color.getW(a), color.getW(b), color.getW(c));
    if (alpha === 0) blank++;
    else painted++;
  }
  assert.equal(blank, 0, 'no fully transparent paint triangle may survive');
  assert.ok(painted > 1000, `expected the band grammar to survive, got ${painted} triangles`);
});

test('D2-R4/R5 mounts the summit five-piece polish overlay with night response', context => {
  const facilities = cleanup(context, createTownD2R30SummitFacilities());
  const group = facilities.group;

  // The hut/monument and terrace polish overlays mount as named sub-groups.
  const hutPolish = group.getObjectByName('summit-hut-monument-polish');
  assert.ok(hutPolish instanceof Group, 'the hut/monument polish overlay must mount');
  assert.ok(hutPolish.children.length > 0, 'the hut/monument polish must carry meshes');

  const terracePolish = group.getObjectByName('summit-terrace-polish');
  assert.ok(terracePolish instanceof Group, 'the terrace polish overlay must mount');
  assert.ok(terracePolish.children.length > 0, 'the terrace polish must carry meshes');

  // The overlay must add real triangles without touching the canonical
  // facility reports: the report count and every grounded/pedestal status
  // stay exactly as the canonical modules define them.
  const reports = facilities.reports();
  assert.ok(reports.length >= 30, `expected the canonical facility set, got ${reports.length}`);
  const hut = reports.find(report => report.id === 'registration-hut');
  assert.ok(hut);
  assert.equal(hut.status, 'grounded');
  assert.equal(hut.height, 800);
  assert.equal(hut.delta, 0);

  // The polish meshes are real geometry and raise the triangle budget.
  const stats = facilities.stats();
  assert.ok(stats.triangles > 5_000, `expected facility triangles, got ${stats.triangles}`);

  // The lamp core carries an emissive term: the setNight hook keeps the glow
  // after dusk and clears it at noon through the shared tint pass.
  const doorLamp = hutPolish.getObjectByName('hut-monument-door-lamp') as Mesh | undefined;
  assert.ok(doorLamp, 'the hut door lamp must mount');
  const lampMaterial = doorLamp.material as { emissiveIntensity?: number; emissive?: { getHexString(): string } };
  assert.ok(lampMaterial.emissive, 'the door lamp must carry an emissive term');

  facilities.setNight(true);
  assert.equal(group.userData.night, true, 'setNight(true) must record the night state');
  facilities.setNight(false);
  assert.equal(group.userData.night, false, 'setNight(false) must restore the day state');
});
