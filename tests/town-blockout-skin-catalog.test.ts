import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { icePalaceProgressKey } from '../tools/voxel-tavern/town-blockout/ice-palace-race.ts';
import {
  mayorTownSkin, readRequestedTownSkin, readTownSkinSources, townSkinCatalog, townSkinStorageKeys,
} from '../tools/voxel-tavern/town-blockout/town-skin-catalog.ts';
import { createZodiacProgress, zodiacStorageKey } from '../tools/voxel-tavern/town-blockout/town-zodiac.ts';
import { voxelPersonParts } from '../tools/voxel-tavern/town-blockout/town-voxel-person.ts';

test('town skin names, order and unlock requirements match the signed design', () => {
  const design = readFileSync(new URL('../docs/交流区/Muse/吉祥物与服主权限及皮肤系统设计-v1.md', import.meta.url), 'utf8');
  const sections = design.slice(design.indexOf('### 4.2'), design.indexOf('### 4.5'));
  const table = sections.split(/\r?\n/).filter(line => /^\|\s+\d+\s+\|/.test(line))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()));
  assert.deepEqual(table.map(([id, name]) => [Number(id), name.replaceAll('**', '')]), [
    ...townSkinCatalog.map(({ id, name }) => [id, name]),
    [mayorTownSkin.id, mayorTownSkin.name],
  ]);
  for (const skin of townSkinCatalog) {
    const colours = [...skin.palette, skin.scarf];
    assert.ok(colours.every(colour => /^#[0-9a-f]{6}$/.test(colour)));
    assert.ok(voxelPersonParts.every(([, , material]) => material < skin.palette.length));
    if ('requirement' in skin) assert.equal(skin.requirement, table[skin.id][3]);
  }
  assert.equal(new Set(townSkinCatalog.map(({ palette, scarf }) => `${palette[2]}:${scarf}`)).size, 12);
  assert.deepEqual(mayorTownSkin.palette, townSkinCatalog[8].palette);
  assert.equal(mayorTownSkin.id, 255);
});

test('skin preference accepts canonical catalog IDs and never decides owner authorization', () => {
  for (const { id } of [...townSkinCatalog, mayorTownSkin]) {
    assert.equal(readRequestedTownSkin({ getItem(key) {
      assert.equal(key, 'unwritten.presence.skin.v1');
      return String(id);
    } }), id);
  }
  for (const raw of [null, '8.0', '01', ' 1', '1e1', '256', '-1', '12', '"255"']) {
    assert.equal(readRequestedTownSkin({ getItem: () => raw }), 0);
  }
  assert.equal(readRequestedTownSkin({ getItem() { throw new Error('denied'); } }), 0);
});

test('gold goat skin needs the existing zodiac ledger to contain all twelve charms', () => {
  const collected = Object.fromEntries(createZodiacProgress([]).rows().filter(({ id }) => id !== 'goat')
    .map(({ id }) => [id, '2026-11-18']));
  const storage = (saved: Record<string, string>) => ({
    getItem: (key: string) => key === zodiacStorageKey ? JSON.stringify({ collected: saved }) : null,
  });
  assert.equal(readTownSkinSources(storage({ ...collected, fake: '2026-11-18' })).zodiacComplete, false);
  assert.equal(readTownSkinSources(storage({ ...collected, goat: 'invalid' })).zodiacComplete, false);
  assert.equal(readTownSkinSources(storage({ ...collected, goat: '2026-11-18' })).zodiacComplete, true);
  assert.equal(readTownSkinSources({ getItem: () => '{broken JSON' }).zodiacComplete, false);
});

test('unlock sources expose raw writer-owned values without creating or updating a local ledger', () => {
  const previousRaceSave = '{"race":{"balconyBestMs":26142}}';
  const values: Partial<Record<string, string>> = {
    [icePalaceProgressKey]: previousRaceSave,
    [townSkinStorageKeys.fireworks]: 'unrecognized marker',
    [townSkinStorageKeys.tester]: '',
  };
  const seen: string[] = [];
  const result = readTownSkinSources({ getItem(key) {
    seen.push(key);
    return values[key] ?? null;
  } });
  assert.deepEqual(result, {
    zodiacComplete: false, palaceSave: previousRaceSave, fireworksMarker: 'unrecognized marker', testerMarker: '',
  });
  assert.deepEqual(seen, [zodiacStorageKey, 'unwritten.ice-palace.v1',
    'unwritten.presence.skin-fireworks.v1', 'unwritten.presence.skin-tester.v1']);
  assert.deepEqual(readTownSkinSources({ getItem() { throw new Error('denied'); } }), {
    zodiacComplete: false, palaceSave: null, fireworksMarker: null, testerMarker: null,
  });
});
