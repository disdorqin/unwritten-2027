import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Mesh } from 'three';
import { buildCoasterStation, buildRailwayStation } from '../tools/voxel-tavern/town-blockout/landmark-station.ts';
import { stationSignCopy, TOWN_STATION_NAME } from '../tools/voxel-tavern/town-blockout/station-sign-copy.ts';

test('the two stations draw the complete approved copy in their existing atlas batches', () => {
  const specification = readFileSync(new URL('../docs/交流区/Claude/2026-11-18-站牌文案-v1.md', import.meta.url), 'utf8');
  const rows = Array.from(specification.matchAll(/^\| (?:站名下副标|进站口牌|候车提示牌|时刻表标题|出站指引牌|站台安全牌) \| (.+?) \|\r?$/gm),
    row => row[1]);
  assert.deepEqual(rows, [stationSignCopy.townSubtitle, stationSignCopy.entrance, stationSignCopy.waiting,
    stationSignCopy.timetable, stationSignCopy.exit, stationSignCopy.platformSafety]);
  assert.ok(specification.includes(`「${TOWN_STATION_NAME}」`) || specification.includes(`：${TOWN_STATION_NAME}`));
  assert.ok(specification.includes(`\`${stationSignCopy.englishName}\``));
  assert.ok(specification.includes(`**${stationSignCopy.coasterEntrance}**`));

  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const drawn: { text: string; color: string; background: string }[] = [];
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        let background = '';
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: '',
            fillRect() { background = this.fillStyle; },
            strokeRect() {},
            drawImage() {},
            fillText(text: string) { drawn.push({ text, color: this.fillStyle, background }); },
          }),
        };
      },
    },
  });
  try {
    const railway = buildRailwayStation();
    const coaster = buildCoasterStation();
    for (const text of [TOWN_STATION_NAME, stationSignCopy.englishName, ...rows]) {
      assert.deepEqual(drawn.filter(ink => ink.text === text), [{ text, color: '#fff', background: '#292f32' }]);
    }
    assert.deepEqual(drawn.filter(ink => ink.text === stationSignCopy.coasterEntrance), [
      { text: stationSignCopy.coasterEntrance, color: '#fff', background: '#8f242b' },
    ]);
    assert.equal(drawn.some(ink => ink.text === '冬夜火车站'), false);
    for (const model of [railway, coaster]) {
      const labels = model.children.filter(child => child.name === 'Museum sign atlas') as Mesh[];
      assert.equal(labels.length, 1);
      assert.ok(labels[0].geometry.index);
    }
  } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
