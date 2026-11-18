import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Scene, type InstancedMesh } from 'three';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity';
import type { CampfireSite } from '../tools/voxel-tavern/town-blockout/town-campfires';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc';
import { palaceStewardDialogue } from '../tools/voxel-tavern/town-blockout/town-npc-palace-dialogue';
import { residentZodiacClues } from '../tools/voxel-tavern/town-blockout/town-npc-residents';
import { registerTownResidentStations, palaceStewardGuides, townResidentStations } from '../tools/voxel-tavern/town-blockout/town-npc-stations';
import { createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain';

const feature = (label: string): TownActivitySpot => ({ label, x: 0, n: 0, ground: 0, range: 1, run() {} });
const fire = (id: string, x: number, n: number, ground: number): CampfireSite =>
  ({ id, x, n, ground, label: id, seats: [], style: 'bucket' });

test('resident hotspots fail closed until their stations work, share a batch, and move one lakeside actor', () => {
  const scene = new Scene();
  const grid = createTerrainGrid();
  const npc = createTownNpcActivity({ scene, open: () => ({} as HTMLElement), announce() {}, face() {}, sit() {} }, grid.heightAt);
  const batch = scene.children[0] as InstancedMesh;
  const oldCount = batch.count;
  const forest = fire('forest', 122.47759, 407.65367, grid.heightAt(122.47759, 407.65367));
  const lake = fire('lakeside', 337, 109.65, grid.heightAt(337, 109.65));
  let chop = false;
  let fishing = false;
  let palace = false;
  let night = false;
  let hotSpring: CampfireSite | undefined;
  let vendorWork: TownActivitySpot | undefined;
  const [woodcutter, fisherman, steward, lantern, words, toss] = registerTownResidentStations(npc, {
    campfires: [forest, lake], canStand: () => true, isNight: () => night,
    forestChop: () => chop ? feature('篝火旁劈柴') : undefined,
    mainFishing: () => fishing ? feature('冰湖冰钓') : undefined,
    palaceProgress: () => palace ? { key: false, throneRoom: false, gallery: false, mirrorCache: false, stairOpen: false } : undefined,
    hotSpringFire: () => hotSpring,
    marketStall: name => name === '贾明灯' ? { station: townResidentStations.palace, activity: vendorWork } : undefined,
  });
  const positions = [woodcutter, fisherman, steward, lantern, words, toss];
  assert.ok(positions.every(spot => spot.available?.() === false));
  assert.equal(batch.count, oldCount);
  chop = fishing = true;
  npc.update?.(0);
  assert.ok(woodcutter.available?.() && fisherman.available?.());
  assert.deepEqual([woodcutter.x, woodcutter.n, woodcutter.ground], townResidentStations.forest.talk);
  assert.deepEqual([fisherman.x, fisherman.n, fisherman.ground], townResidentStations.lakeside.talk);
  assert.equal(nearestTownActivity(positions, ...townResidentStations.forest.talk), woodcutter);
  const twoResidents = batch.count;
  assert.ok(twoResidents > oldCount);
  assert.equal(scene.children.length, 1);

  night = true;
  npc.update?.(0);
  assert.equal(fisherman.x, townResidentStations.lakeside.talk[0]);
  hotSpring = fire('castle-south', 502.8, 23.5, 7.38);
  npc.update?.(0);
  assert.equal(fisherman.x, townResidentStations.lakeside.talk[0]);
  hotSpring = fire('hot-spring', 556.7, 162, 15.18);
  npc.update?.(0);
  assert.deepEqual([fisherman.x, fisherman.n, fisherman.ground], townResidentStations.hotSpring.talk);
  assert.equal(nearestTownActivity(positions, ...townResidentStations.lakeside.talk), undefined);
  assert.equal(batch.count, twoResidents);
  assert.equal(lantern.available?.(), false);

  palace = true;
  vendorWork = feature('挑灯笼');
  npc.update?.(0);
  assert.equal(steward.available?.(), true);
  assert.equal(lantern.available?.(), true);
  assert.equal(words.available?.(), false);
  assert.equal(toss.available?.(), false);
  palace = chop = fishing = false;
  hotSpring = vendorWork = undefined;
  npc.update?.(0);
  assert.equal(batch.count, oldCount);
  assert.equal(scene.children.length, 1);
});

test('the 25 Qin lines match the manuscript and clue gates do not expose the obsolete bridge or future goat', () => {
  const source = readFileSync(new URL('../docs/交流区/Muse/NPC补供稿二-汤守礼仪官戏台联-v1.md', import.meta.url), 'utf8');
  const lines = [...source.matchAll(/^- \[秦知礼 · [^\]]+\] (.*)$/gm)].map(([, value]) =>
    value.trim().replace(/\[(挡回式·门控口径|挡回|可答)\]$/, ''));
  const role = palaceStewardDialogue;
  assert.equal(lines.length, 25);
  assert.deepEqual([
    ...Object.values(role.familiar).flat(), ...role.guides, ...role.clues, ...role.newYear,
    ...role.questions.host.map(row => row.text), ...role.questions.outside.map(row => row.text), ...role.gossip,
  ], lines);
  assert.ok(residentZodiacClues('翁寒江', () => true).every(line => !line.includes('桥洞')));
  assert.deepEqual(residentZodiacClues('翁寒江', id => id === 'snake', false, '定稿灯塔线索'), ['定稿灯塔线索']);
  assert.deepEqual(residentZodiacClues('秦知礼', () => true), [role.clues[0]]);
  assert.deepEqual(residentZodiacClues('秦知礼', () => false, true), [role.clues[1]]);
  const initial = { key: false, throneRoom: false, gallery: false, mirrorCache: false, stairOpen: false };
  assert.equal(palaceStewardGuides(initial)[0], 0);
  assert.equal(palaceStewardGuides({ ...initial, key: true })[0], 4);
  assert.equal(palaceStewardGuides({ ...initial, key: true, throneRoom: true, gallery: true, mirrorCache: true })[0], 3);
});
