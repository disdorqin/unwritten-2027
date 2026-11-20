from pathlib import Path


# Run from tools/ at the pinned tree and pipe stdout to Node's module stdin.
audit = Path("audit-jx2-south-loop.mjs").read_text()
prefix = audit[:audit.index("const southLoop = ")]
hook = r'''
globalThis.extraLotGates = [];
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith('/district-layout.ts')) return nextLoad(url, context);
    const source = readFileSync(new URL(url), 'utf8');
    const signature = 'function reject(reason: HousingRejectionReason) {';
    assert.equal(source.split(signature).length, 2);
    const probe = `
      if (address === '123:144' || address === '255:161') {
        globalThis.extraLotGates.push({ id, reason, site, footprint,
          footprintRailConflict: conflictsWithRail(footprint),
          samples: samples.map(([east, north]) => ({
            east, north, height: grid.heightAt(east, north),
            tile: grid.surfaces[Math.round(north) * grid.gridWidth + Math.round(east)],
            insidePlazaGate: insidePlaza(east, north, 1.4),
            blockedByLamp: lampBlocked(east, north),
            sampleFailure: sampleFailure(east, north) ?? null,
          })),
        });
      }`;
    return { format: 'module', shortCircuit: true,
      source: stripTypeScriptTypes(source.replace(signature, signature + probe), { mode: 'transform' }) };
  },
});
'''
print(prefix.replace("const load = name =>", hook + "\nconst load = name =>"))
print(r'''
const paths = [
  ...layout.roads.flatMap(({ id, points, width }) => points.slice(1).map((end, i) => ({
    id, start: points[i], end, halfWidth: width / 2,
  }))),
  ...layout.plots.map(({ id, connect: start, door: end }) => ({ id: 'plot:' + id, start, end, halfWidth: 2 })),
];
function pathDistance(east, north, [startE, startN], [endE, endN]) {
  const de = endE - startE;
  const dn = endN - startN;
  const lengthSquared = de * de + dn * dn;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((east - startE) * de + (north - startN) * dn) / lengthSquared)) : 0;
  return Math.hypot(east - startE - de * t, north - startN - dn * t);
}
function nearestPaths(east, north) {
  return paths.map(({ id, start, end, halfWidth }) => {
    const distance = pathDistance(east, north, start, end);
    return { id, start: start.slice(0, 2), end: end.slice(0, 2), distance, halfWidth,
      marginToHousingGate: distance - halfWidth - 1.35 };
  });
}
function footprintDistance(east, north, { x, n, w, d, angle }) {
  const sideways = Math.abs(Math.sin(angle)) > .5;
  return Math.hypot(Math.max(Math.abs(east - x) - (sideways ? d : w) / 2, 0),
    Math.max(Math.abs(north - n) - (sideways ? w : d) / 2, 0));
}
const audit = extraLotGates.map(({ samples, ...lot }) => {
  const [east, north] = lot.id.slice('old-town:'.length).split(':').map(Number);
  const rankedPaths = nearestPaths(east, north).sort((a, b) => a.distance - b.distance);
  const distances = samples.map(({ east, north, ...sample }) => ({ east, north, ...sample,
    tightestPath: nearestPaths(east, north).sort((a, b) => a.marginToHousingGate - b.marginToHousingGate)[0],
  }));
  const closestRail = railway.route.points.map(({ x, z }) => Math.hypot(x - east, -z - north))
    .reduce((a, b) => Math.min(a, b));
  return {
    ...lot, rejection: districts.rejectedHomes.find(entry => entry.id === lot.id),
    insidePublishedSouthLoopRange: rankedPaths.find(path => path.id === 'south-loop').distance <= 18,
    center: {
      east, north, tile: grid.surfaces[north * grid.gridWidth + east],
      terrainHeight: grid.heightAt(east, north), water: isWater(east, north),
      blockedByHousing: districts.blocked(east, north), actualDoor: registry.get(lot.id) ?? null,
      nearestRoad: rankedPaths.find(path => !path.id.startsWith('plot:')),
      nearestSouthLoop: rankedPaths.find(path => path.id === 'south-loop'),
      nearestRailSample: closestRail, insideRailKeepClear: railway.keepClear(east, north),
    },
    gradeSpread: Math.max(...samples.map(a => a.height)) - Math.min(...samples.map(a => a.height)),
    samples: distances,
    nearestBuiltHouseFootprint: districts.sites.map((site, i) => ({ site, door: districts.housePortals[i],
      distance: footprintDistance(east, north, site),
    })).sort((a, b) => a.distance - b.distance)[0],
    nearestRegisteredDoor: doors.map(door => ({ door, distance: Math.hypot(door.x - east, door.n - north) }))
      .sort((a, b) => a.distance - b.distance)[0],
  };
});
assert.deepEqual(audit.map(a => a.id), ['old-town:123:144', 'old-town:255:161']);
assert.ok(audit.every(a => a.center.actualDoor === null && a.rejection.reason === a.reason));
console.log(JSON.stringify({
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  counts: { total: registry.size, oldTown: districts.housePortals.length, extended: extension.housePortals.length, village: cabins.length },
  plazaBounds: layout.plaza.bounds, audit,
}, null, 2));
''')
