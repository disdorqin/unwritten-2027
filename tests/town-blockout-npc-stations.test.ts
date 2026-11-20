import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Color, Matrix4, Scene, Vector3, type InstancedMesh } from 'three';
import { nearestTownActivity, type TownActivitySpot } from '../tools/voxel-tavern/town-blockout/town-activity';
import type { CampfireSite } from '../tools/voxel-tavern/town-blockout/town-campfires';
import { lighthouseSnakeClue } from '../tools/voxel-tavern/town-blockout/town-zodiac';
import { mascotHome, townMascotParts } from '../tools/voxel-tavern/town-blockout/town-mascot';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc';
import { npcAddedDialogue } from '../tools/voxel-tavern/town-blockout/town-npc-added-dialogue';
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

test('the 19 Qin town lines match the manuscript and keep the clue gates', () => {
  const source = readFileSync(new URL('../docs/交流区/Muse/NPC补供稿二-汤守礼仪官戏台联-v1.md', import.meta.url), 'utf8');
  const lines = [...source.matchAll(/^- \[秦知礼 · (?!问答\/)[^\]]+\] (.*)$/gm)].map(([, value]) =>
    value.trim().replace(/\[挡回式·门控口径\]$/, ''));
  const role = palaceStewardDialogue;
  assert.equal(lines.length, 19);
  assert.equal(Object.hasOwn(role, 'questions'), false);
  assert.deepEqual([
    ...Object.values(role.familiar).flat(), ...role.guides, ...role.clues, ...role.newYear, ...role.gossip,
  ], lines);
  assert.ok(residentZodiacClues('翁寒江', () => true).every(line => !line.includes('桥洞')));
  assert.deepEqual(residentZodiacClues('翁寒江', id => id === 'snake'), [lighthouseSnakeClue]);
  assert.deepEqual(residentZodiacClues('秦知礼', () => true), [role.clues[0]]);
  assert.deepEqual(residentZodiacClues('秦知礼', () => false, true), [role.clues[1]]);
  const initial = { key: false, throneRoom: false, gallery: false, mirrorCache: false, stairOpen: false };
  assert.equal(palaceStewardGuides(initial)[0], 0);
  assert.equal(palaceStewardGuides({ ...initial, key: true })[0], 4);
  assert.equal(palaceStewardGuides({ ...initial, key: true, throneRoom: true, gallery: true, mirrorCache: true })[0], 3);
});

test('each resident station offers only town topics and its available activity', t => {
  class Element {
    children: Element[] = [];
    textContent = '';
    onclick?: () => void;
    constructor(readonly tagName: string) {}
    append(...nodes: Element[]) { this.children.push(...nodes); }
    setAttribute() {}
    closest() { return undefined; }
  }
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: (tagName: string) => new Element(tagName) },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  const grid = createTerrainGrid();
  let panel = new Element('section');
  const npc = createTownNpcActivity({
    scene: new Scene(),
    open: () => { panel = new Element('section'); return panel as unknown as HTMLElement; },
    announce() {}, face() {}, sit() {},
  }, grid.heightAt);
  const forest = fire('forest', 122.47759, 407.65367, grid.heightAt(122.47759, 407.65367));
  const lake = fire('lakeside', 337, 109.65, grid.heightAt(337, 109.65));
  const activities = {
    贾明灯: feature('挑灯笼'), 文墨生: feature('挑春联年画'), 胡六环: feature('玩套圈'),
  };
  let activated: string | undefined;
  for (const activity of Object.values(activities)) activity.run = () => { activated = activity.label; };
  const [woodcutter, fisherman, steward, lantern, words, toss] = registerTownResidentStations(npc, {
    campfires: [forest, lake], canStand: () => true, isNight: () => false,
    forestChop: () => feature('篝火旁劈柴'), mainFishing: () => feature('冰湖冰钓'),
    palaceProgress: () => ({ key: false, throneRoom: false, gallery: false, mirrorCache: false, stairOpen: false }),
    marketStall: name => ({ station: townResidentStations.palace, activity: activities[name] }),
  });
  const cases = [
    [woodcutter, npcAddedDialogue.樊樵, undefined], [fisherman, npcAddedDialogue.翁寒江, undefined],
    [steward, palaceStewardDialogue, undefined], [lantern, npcAddedDialogue.贾明灯, activities.贾明灯],
    [words, npcAddedDialogue.文墨生, activities.文墨生], [toss, npcAddedDialogue.胡六环, activities.胡六环],
  ] as const;
  for (const [spot, role, activity] of cases) {
    assert.equal(spot.available?.(), true, spot.label);
    spot.run();
    const [speech, controls] = panel.children;
    assert.deepEqual(panel.children.map(child => child.tagName), ['p', 'div']);
    assert.ok(controls.children.every(child => child.tagName === 'button'));
    assert.deepEqual(controls.children.map(button => button.textContent), [
      '请讲讲这里的玩法', ...(spot === steward ? ['问生肖线索'] : []), '聊聊镇民', '聊聊跨年',
      ...(activity ? [activity.label] : []), '道别',
    ], spot.label);
    const click = (label: string) => {
      const button = controls.children.find(child => child.textContent === label);
      assert.ok(button?.onclick, `${spot.label}: ${label}`);
      button.onclick();
      return speech.textContent;
    };
    assert.equal(click('请讲讲这里的玩法'), role.guides[0]);
    assert.equal(click('聊聊镇民'), role.gossip[0]);
    assert.equal(click('聊聊跨年'), role.newYear[0]);
    if (spot === steward) assert.equal(click('问生肖线索'), palaceStewardDialogue.clues[0]);
    if (activity) {
      click(activity.label);
      assert.equal(activated, activity.label);
    }
  }
});

test('resident station visibility and 小未 repack the same batch without replacing each other', () => {
  const scene = new Scene();
  let shown = true;
  const activity = createTownNpcActivity({
    scene, open: () => { throw Error('not needed'); }, announce() {}, face() {}, sit() {},
  }, () => 10, undefined, undefined, undefined, undefined, {
    now: () => 900_000, groundAt: () => 10, visible: () => shown,
  });
  const batch = scene.children[0] as InstancedMesh;
  const base = batch.count;
  const matrix = new Matrix4();
  const position = new Vector3();
  const tint = new Color();
  const palette = new Color(townMascotParts[0].tint);
  const count = townMascotParts.length;
  let station = false;
  const spot = activity.registerResident('樊樵', () => station ? townResidentStations.forest : undefined);
  function checkMascot(offset: number) {
    assert.equal(batch.count, offset + count);
    batch.getMatrixAt(offset, matrix);
    position.setFromMatrixPosition(matrix);
    assert.ok(Math.hypot(position.x - mascotHome[0], position.z + mascotHome[1]) < .07);
    batch.getColorAt(offset, tint);
    assert.ok(Math.hypot(tint.r - palette.r, tint.g - palette.g, tint.b - palette.b) < 1e-6);
  }

  activity.update?.(0);
  checkMascot(base);
  station = true;
  activity.update?.(0);
  assert.equal(spot.available?.(), true);
  checkMascot(base + 23);
  batch.getMatrixAt(base, matrix);
  position.setFromMatrixPosition(matrix);
  assert.ok(Math.hypot(position.x - townResidentStations.forest.actor[0],
    position.z + townResidentStations.forest.actor[1]) < .7);

  shown = false;
  activity.update?.(0);
  assert.equal(batch.count, base + 23);
  shown = true;
  activity.update?.(0);
  checkMascot(base + 23);
  station = false;
  activity.update?.(0);
  assert.equal(spot.available?.(), false);
  checkMascot(base);
  assert.equal(scene.children.length, 1);
});
