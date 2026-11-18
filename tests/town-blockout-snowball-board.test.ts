import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTownSnowballBoard } from '../tools/voxel-tavern/town-blockout/town-snowball-board.ts';

function unusedPanel(): never {
  throw new Error('The score model can run without a DOM');
}

test('remote scoreboard entries affect received and hit standings but never persist a recycled session ID', () => {
  const saved = new Map<string, string>();
  const options = {
    open: unusedPanel,
    label: (id: string) => id === 'p:7' ? '小镇邻居' : '你',
    storage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, data: string) => { saved.set(key, data); },
    },
  };
  const board = createTownSnowballBoard(options);
  board.recordThrow('p:7');
  board.recordHit('p:7', 'local');
  assert.deepEqual(board.getRows().map(row => [row.id, row.label, row.hits, row.received]), [
    ['p:7', '小镇邻居', 1, 0], ['local', '你', 0, 1],
  ]);
  board.flush();
  assert.deepEqual(createTownSnowballBoard(options).getRows(), board.getRows().filter(row => row.id === 'local'));
  board.clearRemoteScores();
  assert.deepEqual(board.getRows().map(row => row.id), ['local']);
});

test('snowball board announces each formal streak milestone and resets local aliases when hit', () => {
  let now = 0;
  const alerts: string[] = [];
  const board = createTownSnowballBoard({
    open: unusedPanel, now: () => now, announce: message => alerts.push(message),
  });

  for (let hit = 1; hit <= 9; hit++) {
    board.recordThrow('local-player');
    assert.equal(board.recordHit('local', 'npc:乔麦', { announce: true }), hit);
    now += 1000;
  }
  assert.deepEqual(alerts, ['我三连中！', '我五连中！', '我八连中！']);
  board.recordHit('npc:乔麦', 'local-player');
  assert.equal(board.recordHit('local', 'npc:乔麦'), 1);
  now += 5001;
  assert.equal(board.recordHit('local', 'npc:乔麦'), 1);
  board.recordMiss('local-player');
  assert.equal(board.recordHit('local', 'npc:乔麦'), 1);
  board.flush();

  assert.deepEqual(board.getRows().map(row => [row.label, row.hits, row.bestStreak, row.received]), [
    ['我', 12, 9, 1],
    ['乔麦', 1, 1, 12],
  ]);
});

test('snowball results persist, with accuracy titles gated by 30 throws', () => {
  const saved = new Map<string, string>();
  const options = {
    open: unusedPanel,
    storage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, data: string) => { saved.set(key, data); },
    },
  };
  const board = createTownSnowballBoard(options);
  for (let shot = 0; shot < 29; shot++) {
    board.recordThrow('npc:罗大江');
    board.recordHit('npc:罗大江', 'local');
  }
  assert.equal(board.getTitles().sharpshooter, null);
  board.recordThrow('npc:罗大江');
  board.flush();

  const restored = createTownSnowballBoard(options);
  assert.deepEqual(restored.getRows(), board.getRows());
  assert.deepEqual(restored.getTitles(), {
    snowballKing: { id: 'npc:罗大江', label: '罗大江', value: 29 },
    sharpshooter: { id: 'npc:罗大江', label: '罗大江', value: 29 / 30 },
    popularityKing: { id: 'local', label: '我', value: 29 },
  });
  assert.equal(restored.recordHit('npc:罗大江', 'local'), 1);
  restored.flush();
});
