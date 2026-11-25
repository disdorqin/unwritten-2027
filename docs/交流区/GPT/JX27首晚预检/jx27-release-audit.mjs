import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node jx27-release-audit.mjs <75859a0 checkout>');
const root = resolve(checkout);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL) {
      const resolved = new URL(specifier, context.parentURL);
      const ts = resolved.href.endsWith('.js') ? resolved.href.slice(0, -3) + '.ts' : resolved.href + '.ts';
      if (!existsSync(resolved) && existsSync(new URL(ts))) return next(ts, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.json')) {
      return { shortCircuit: true, format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8') };
    }
    return next(url, context);
  },
});

const moduleAt = path => import(pathToFileURL(resolve(root, path)).href);
const town = 'tools/voxel-tavern/town-blockout/';
const { createTerrainGrid } = await moduleAt(town + 'terrain.ts');
const { buildTownRailRoute } = await moduleAt(town + 'town-railway.ts');
const { createRailTimetable, railDwellSeconds } = await moduleAt(town + 'town-rail-timetable.ts');
const { ceremonyMidnight, ceremonyStateAt, createCeremonyDirector } = await moduleAt(town + 'town-ceremony.ts');
const { sharedHomeOrigin, sharedHomeLayer, isSharedHomePosition } =
  await moduleAt('src/presence/shared-home-space.ts');
const { ceremonyLandingCentre, ceremonyLandingLeadMs, ceremonyLateWindowMs } = await moduleAt('src/presence/ceremony-arrival.ts');
const route = buildTownRailRoute(createTerrainGrid());
const timetable = createRailTimetable(route.stops, route.length);
const plaza = timetable.legs.find(leg => leg.from.id === 'plaza');
const memorial = timetable.legs.find(leg => leg.from.id === 'memorial');
assert.ok(plaza && memorial);
const epoch = Date.UTC(2026, 0, 1);
const phase = { leg: 0, distance: 0, stopped: false, secondsLeft: 0 };
const boardAt = epoch + plaza.offset * 1000 + (railDwellSeconds - 2) * 1000;
const departureAt = epoch + (plaza.offset + railDwellSeconds) * 1000;
const returnAt = epoch + (plaza.offset + timetable.cycleSeconds) * 1000;
const sample = time => {
  timetable.sample(time, phase);
  const leg = timetable.legs[phase.leg];
  return { from: leg.from.id, next: leg.to.id, stopped: phase.stopped, time };
};
const samples = [boardAt, departureAt + 10, returnAt - 10, returnAt + 10].map(sample);
assert.equal(samples[0].from, 'plaza');
assert.equal(samples[0].stopped, true);
assert.equal(samples[1].from, 'plaza');
assert.equal(samples[1].stopped, false);
assert.equal(samples[2].stopped, false);
assert.equal(samples[3].from, 'plaza');
assert.equal(samples[3].stopped, true);
assert.notEqual(memorial.to.id, 'plaza');

const midnight = ceremonyMidnight(2026, 480);
let instant = midnight - 4 * 3600_000 - 1;
const cues = [];
const director = createCeremonyDirector({ now: () => instant, utcOffsetMinutes: 480 }, { onCue: cue => cues.push(cue) });
director.update();
instant = midnight + 600_001;
director.update();
const shifts = [ -4 * 3600_000, -3.5 * 3600_000, -30 * 60_000, -1, 0, 600_000 ];
const phases = shifts.map(offset => ({ offset, phase: ceremonyStateAt(midnight + offset, 480).phase }));
const exactCues = [-14_400_000, -14_100_000, -13_500_000, -10_800_000, -7_200_000, -3_600_000, -1_800_000, -600_000, 0, 600_000]
  .map(offset => ({ offset, cues: cues.filter(cue => cue.at === midnight + offset).map(cue => cue.type) }));
assert.deepEqual(exactCues.find(row => row.offset === -14_100_000).cues, []);
assert.equal(isSharedHomePosition(sharedHomeOrigin.east, sharedHomeOrigin.north, sharedHomeOrigin.height), true);
assert.equal(isSharedHomePosition(sharedHomeOrigin.east, sharedHomeOrigin.north, sharedHomeOrigin.height - .6), false);
console.log(JSON.stringify({
  source: '75859a094757c5dcee8b874eef86ec37f4204907', rail: {
    stops: timetable.legs.map(leg => leg.from.id), metreLength: route.length, dwellSeconds: railDwellSeconds,
    cycleSeconds: timetable.cycleSeconds, memorialNext: memorial.to.id,
    departureToReturnSeconds: (returnAt - departureAt) / 1000, samples,
  }, ceremony: {
    midnightUTC: new Date(midnight).toISOString(), exactCues, phases,
    wallWindow: { leadMs: ceremonyLandingLeadMs, lateMs: ceremonyLateWindowMs, centre: ceremonyLandingCentre },
  }, sharedHome: { origin: sharedHomeOrigin, visualLayer: sharedHomeLayer },
}, null, 2));
