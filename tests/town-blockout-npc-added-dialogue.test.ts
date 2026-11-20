import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Scene } from 'three';
import { nearestTownActivity, type TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { createTownNpcActivity, memorialClerkHome } from '../tools/voxel-tavern/town-blockout/town-npc.ts';
import { canEnter, createTerrainGrid } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import { npcAuthoredDialogue, npcScript } from '../tools/voxel-tavern/town-blockout/town-npc-dialogue.ts';
import { townMailNpcNames } from '../tools/voxel-tavern/town-blockout/town-mail-store.ts';

const names = ['贾明灯', '文墨生', '胡六环', '纪守信', '翁寒江', '樊樵'] as const;

test('all 114 added NPC town lines match the Muse manuscript without the retired questions', () => {
  const source = readFileSync(new URL('../docs/交流区/Muse/NPC新增六人台词-v1.md', import.meta.url), 'utf8');
  const snakeUpdate = readFileSync(new URL('../docs/交流区/Muse/给GPT-蛇件新谜面与接线-2026-11-18.md', import.meta.url), 'utf8');
  const revisedClue = snakeUpdate.match(/^> 「(.+)」$/m)?.[1];
  assert.ok(revisedClue);
  const expected = source.split(/\r?\n/).filter(line => /^- \[[^\]]+ · [^\]]+\] /.test(line))
    .filter(line => !line.includes(' · 问答/'))
    .map(line => line.startsWith('- [翁寒江 · 线索] 远处还有一件') ? `- [翁寒江 · 线索] ${revisedClue}` : line);
  const actual = names.flatMap(name => {
    const role = npcAuthoredDialogue[name];
    const lineFor = (category: string, text: string) => `- [${name} · ${category}] ${text}`;
    const linesFor = (category: string, texts: readonly string[]) => texts.map(text => lineFor(category, text));
    assert.deepEqual(Object.values(role.familiar).map(lines => lines.length), [3, 3, 2]);
    assert.deepEqual([role.guides.length, role.clues.length, role.newYear.length, role.gossip.length], [6, 2, 2, 1]);
    assert.equal(Object.hasOwn(role, 'questions'), false, name);
    return [
      ...Object.entries(role.familiar).flatMap(([familiarity, lines]) => linesFor(`日常/${familiarity}`, lines)),
      ...linesFor('引导', role.guides),
      ...linesFor('线索', role.clues),
      ...linesFor('跨年夜', role.newYear),
      ...linesFor('八卦', role.gossip),
    ];
  });
  assert.equal(actual.length, 114);
  assert.deepEqual(actual, expected);
});

test('adding authored dialogue leaves the live dialogue and postal recipient list intact', () => {
  assert.deepEqual(townMailNpcNames, Object.keys(npcScript));
  assert.equal(Object.keys(npcScript).length, 6);
  assert.equal(Object.keys(npcAuthoredDialogue).length, 12);
  for (const [name, role] of Object.entries(npcScript)) {
    assert.equal(npcAuthoredDialogue[name as keyof typeof npcScript], role);
  }
});

test('the memorial clerk and branch mailbox remain separately selectable', () => {
  const grid = createTerrainGrid();
  const scene = new Scene();
  const residents = createTownNpcActivity({
    scene: scene as unknown as TownActivityContext['scene'],
    open: () => ({} as HTMLElement), announce() {}, sit() {}, face() {},
  }, grid.heightAt);
  const clerk = residents.spots.find(spot => spot.label === '和纪守信聊天');
  assert.ok(clerk);
  assert.deepEqual([clerk.x, clerk.n], [...memorialClerkHome]);
  assert.equal(clerk.ground, grid.heightAt(...memorialClerkHome));
  assert.ok(canEnter(clerk.x, clerk.n));
  const mailbox = {
    x: 417.7, n: 334.1, ground: grid.heightAt(417.7, 334.1), label: '纪念馆时光信箱', range: 1.25, run() {},
  };
  const spots = [...residents.spots, mailbox];
  assert.equal(nearestTownActivity(spots, mailbox.x, mailbox.n, mailbox.ground), mailbox);
  assert.equal(nearestTownActivity(spots, clerk.x, clerk.n, clerk.ground), clerk);
  assert.equal(scene.children.length, 1);
  assert.equal(scene.children[0].name, 'town-npc-shared-skins');
});
