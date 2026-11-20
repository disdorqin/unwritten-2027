import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { Group, type BufferGeometry, type Mesh, type MeshBasicMaterial } from 'three';
import { addNewYearDecor, townOpeningAt } from '../tools/voxel-tavern/town-blockout/town-new-year.ts';

const openingDayStarts = Date.parse('2026-12-31T00:00:00+08:00');
const ceremonyStarts = Date.parse('2027-01-01T00:00:00+08:00');

function recordBoard(t: TestContext) {
  const paints: string[] = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement() {
      const canvas = { width: 0, height: 0, getContext() {
        return {
          fillRect() {}, strokeRect() {}, drawImage() {},
          createLinearGradient: () => ({ addColorStop() {} }),
          fillText(text: string) {
            if (canvas.width === 512 && canvas.height === 166) paints.push(text);
          },
        };
      } };
      return canvas;
    } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  return paints;
}

test('the entrance board follows the supplied world clock and redraws only when the Beijing message changes', t => {
  const painted = recordBoard(t);
  assert.equal(townOpeningAt, Date.parse('2026-12-31T20:00:00+08:00'));
  const parent = new Group();
  const decor = addNewYearDecor(parent, openingDayStarts - 1);
  assert.equal(decor.parent, parent);
  assert.deepEqual(painted, ['开镇日 · 2026.12.31 20:00', '还有 1 天']);

  const atlas = decor.children[0] as Mesh<BufferGeometry, MeshBasicMaterial>;
  assert.ok(atlas.isMesh && atlas.material.isMeshBasicMaterial);
  const texture = atlas.material.map;
  assert.ok(texture);
  const startVersion = texture.version;
  decor.updateOpeningBoard(openingDayStarts);
  assert.equal(painted.at(-1), '今日 20:00 开镇');
  const morningVersion = texture.version;
  assert.ok(morningVersion > startVersion);
  decor.updateOpeningBoard(townOpeningAt - 1);
  assert.equal(texture.version, morningVersion);

  decor.updateOpeningBoard(townOpeningAt);
  assert.equal(painted.at(-1), '今日开镇');
  const eveningVersion = texture.version;
  assert.ok(eveningVersion > morningVersion);
  decor.updateOpeningBoard(ceremonyStarts - 1);
  assert.equal(texture.version, eveningVersion);
  decor.updateOpeningBoard(ceremonyStarts);
  assert.equal(painted.at(-1), '雪镇纪念');
  assert.ok(texture.version > eveningVersion);

  // Rehearsals and synchronized clock corrections can move backward.
  decor.updateOpeningBoard(townOpeningAt - 1);
  assert.equal(painted.at(-1), '今日 20:00 开镇');
  assert.equal(decor.children[0], atlas);
});

test('the legacy host schedules both the 20:00 opening and the next Beijing day', t => {
  const painted = recordBoard(t);
  let now = townOpeningAt - 1;
  t.mock.method(Date, 'now', () => now);
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const timers: { callback: () => void; delay: number }[] = [];
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { setTimeout(callback: () => void, delay: number) { timers.push({ callback, delay }); } },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  addNewYearDecor(new Group());
  assert.equal(painted.at(-1), '今日 20:00 开镇');
  assert.equal(timers[0].delay, 1);
  now = townOpeningAt;
  timers.shift()!.callback();
  assert.equal(painted.at(-1), '今日开镇');
  assert.equal(timers[0].delay, 4 * 3_600_000);
  now = ceremonyStarts;
  timers.shift()!.callback();
  assert.equal(painted.at(-1), '雪镇纪念');
  assert.equal(timers.length, 0);
});
