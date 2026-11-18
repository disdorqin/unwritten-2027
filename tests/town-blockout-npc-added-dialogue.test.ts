import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { npcAuthoredDialogue, npcScript } from '../tools/voxel-tavern/town-blockout/town-npc-dialogue.ts';
import { townMailNpcNames } from '../tools/voxel-tavern/town-blockout/town-mail-store.ts';

const names = ['贾明灯', '文墨生', '胡六环', '纪守信', '翁寒江', '樊樵'] as const;

test('all 150 added NPC lines and routing markers round-trip to the Muse manuscript', () => {
  const source = readFileSync(new URL('../docs/交流区/Muse/NPC新增六人台词-v1.md', import.meta.url), 'utf8');
  const expected = source.split(/\r?\n/).filter(line => /^- \[[^\]]+ · [^\]]+\] /.test(line));
  const actual = names.flatMap(name => {
    const role = npcAuthoredDialogue[name];
    const lineFor = (category: string, text: string) => `- [${name} · ${category}] ${text}`;
    const linesFor = (category: string, texts: readonly string[]) => texts.map(text => lineFor(category, text));
    assert.deepEqual(Object.values(role.familiar).map(lines => lines.length), [3, 3, 2]);
    assert.deepEqual([role.guides.length, role.clues.length, role.newYear.length, role.gossip.length], [6, 2, 2, 1]);
    assert.deepEqual(role.questions.host.map(({ verdict }) => verdict), ['挡回', '可答', '挡回', '可答']);
    assert.deepEqual(role.questions.outside.map(({ verdict }) => verdict), ['挡回', '挡回']);
    return [
      ...Object.entries(role.familiar).flatMap(([familiarity, lines]) => linesFor(`日常/${familiarity}`, lines)),
      ...linesFor('引导', role.guides),
      ...linesFor('线索', role.clues),
      ...linesFor('跨年夜', role.newYear),
      ...role.questions.host.map(({ text, verdict }) => lineFor('问答/张乐天', `${text}[${verdict}]`)),
      ...role.questions.outside.map(({ text, verdict }) => lineFor('问答/挡回', `${text}[${verdict}]`)),
      ...linesFor('八卦', role.gossip),
    ];
  });
  assert.equal(actual.length, 150);
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
