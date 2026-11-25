import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const release = '75859a094757c5dcee8b874eef86ec37f4204907';
const checkout = resolve(process.argv[2] ?? '.');
const town = 'tools/voxel-tavern/town-blockout';
const layoutFile = `${town}/layout.json`;
const extensionFile = `${town}/town-extension.ts`;
const actorFile = `${town}/town-npc.ts`;
const stationsFile = `${town}/town-npc-stations.ts`;
const passportFile = `${town}/town-passport.ts`;
const viewerFile = `${town}/viewer.ts`;
const presenceFile = `${town}/town-presence.ts`;
const serverFile = 'src/presence/server.ts';
const watched = [layoutFile, extensionFile, actorFile, stationsFile, passportFile, viewerFile, presenceFile, serverFile];

const git = (...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();
const read = path => readFileSync(resolve(checkout, path), 'utf8');
const load = path => import(pathToFileURL(resolve(checkout, path)).href);
assert.equal(git('rev-parse', 'HEAD'), release);
const blobs = Object.fromEntries(watched.map(path => {
  const pinned = git('rev-parse', `HEAD:${path}`);
  assert.equal(git('hash-object', path), pinned, path);
  return [path, pinned];
}));

const layout = JSON.parse(read(layoutFile));
const [{ extensionPlots }, { createTownPassport }] = await Promise.all([load(extensionFile), load(passportFile)]);
const plots = [...layout.plots, ...extensionPlots];
assert.equal(layout.plots.length, 11);
assert.equal(extensionPlots.length, 4);
assert.equal(new Set(plots.map(plot => plot.id)).size, 15);
const matchedCivicPlots = plots.filter(plot => /town[-_]?hall|town[-_]?office|civic|mayor|镇公所/.test(plot.id));
assert.deepEqual(matchedCivicPlots, []);

const registeredJobLabels = Array.from(read(actorFile).matchAll(/\bjob:\s*'([^']+)'/g), match => match[1]);
assert.ok(registeredJobLabels.includes('火车站站长'));
assert.ok(registeredJobLabels.includes('邮局邮差'));
assert.ok(!registeredJobLabels.includes('镇长'));
assert.doesNotMatch(read(stationsFile), /registerResident\(\s*['"](?:镇长|张乐天)/);
assert.match(read(viewerFile), /for \(const plot of layout\.plots\) place\(plot, builders\[plot\.id\]\(plot\)\)/);
assert.match(read(presenceFile), /localStorage\.getItem\(guestNameKey\)/);

const saved = new Map();
const storage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => { saved.set(key, value); },
};
const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
try {
  const mockedOrdinaryStamps = Array.from({ length: 16 }, (_, index) => ({ id: `test-ordinary-${index}`, label: `夹具 ${index + 1}`, hint: '' }));
  const fixtureCeremony = { id: 'test-ceremony', label: '仪式记录夹具', hint: '' };
  const announcements = [];
  const create = () => createTownPassport({
    announce: value => { announcements.push(value); },
    open: () => { throw new Error('The fixture must not open a dialog'); },
  }, mockedOrdinaryStamps, undefined, [fixtureCeremony]);
  const passport = create();
  for (const { id } of mockedOrdinaryStamps.slice(0, -1)) assert.equal(passport.collect(id), true);
  const before = passport.getProgress();
  assert.deepEqual(before, { collected: 15, total: 16, complete: false });
  assert.equal(passport.collectExtension(fixtureCeremony.id), true);
  const after = passport.getProgress();
  assert.deepEqual(after, before);
  const reconstructed = create();
  assert.equal(reconstructed.hasExtension(fixtureCeremony.id), true);
  assert.equal(reconstructed.collectExtension(fixtureCeremony.id), false);
  assert.deepEqual(reconstructed.getProgress(), before);
  assert.equal(reconstructed.collect(mockedOrdinaryStamps.at(-1).id), true);
  const ordinaryCompleted = reconstructed.getProgress();
  assert.deepEqual(ordinaryCompleted, { collected: 16, total: 16, complete: true });
  assert.equal(announcements.length, 17);

  console.log(JSON.stringify({
    release, blobs,
    terrainPlots: plots.map(({ id, origin }) => ({ id, origin })),
    existingPlazaSpawn: { east: layout.plaza.spawn[0], north: layout.plaza.spawn[1], height: layout.plaza.height },
    hostSourceReadback: { matchedCivicPlots, registeredJobLabels, civicRoleFoundInAuditedRoster: false },
    localPassportStorageFixture: { before, after, extensionRecovered: true, duplicateExtensionRejected: true, ordinaryCompleted },
  }, null, 2));
} finally {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete globalThis.localStorage;
}
