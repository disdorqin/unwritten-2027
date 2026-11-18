import assert from 'node:assert/strict';
import test from 'node:test';
import { createTownChronicleReviewHook, townChronicleKey, type TownChronicleEntry } from '../tools/voxel-tavern/town-blockout/town-chronicle.ts';
import { readTownChronicleViews, searchChronicle } from '../tools/voxel-tavern/town-blockout/town-chronicle-views.ts';

function storage(items: TownChronicleEntry[] = []) {
  return {
    getItem: (key: string) => key === townChronicleKey ? JSON.stringify({ version: 1, items }) : null,
    setItem: () => {},
  };
}
const newChapter: TownChronicleEntry = {
  id: 'chr-new-local', vol: 2, era: '开镇纪元年', date: '2027-01-01',
  title: '新一页', body: '本机所见', source: 'auto', actor: null, status: 'published', pinned: true,
};

test('one source supplies the eight first entries and both plaque selections', () => {
  const views = readTownChronicleViews(storage());
  assert.deepEqual(views.history.map(item => item.title), [
    '立镇之议', '镇基落成 · 门牌点亮', '试灯 · 首客临门', '镇门互通', '各正其名', '雪仗开场 · 烟花备好',
  ]);
  assert.deepEqual(views.entries.filter(item => item.reserved).map(item => [item.title, item.date]), [
    ['开镇', '2026-12-31'], ['迎未', '2027-02-05'],
  ]);
  assert.deepEqual(views.latest.map(item => item.id), ['chr-founding-6', 'chr-founding-5', 'chr-founding-4']);
  assert.equal(views.plaque.length, 5);
  assert.equal(views.featured.length, 3);
  assert.ok(views.plaque.every(item => views.entries.includes(item)));
  assert.ok(views.latest.every(item => views.plaque.includes(item)));
});

test('query by title and prose, actor name, or date keeps the safe facts and authored copy', () => {
  const views = readTownChronicleViews(storage());
  assert.deepEqual(searchChronicle(views, '烟花', '').map(item => item.title), ['雪仗开场 · 烟花备好']);
  assert.deepEqual(searchChronicle(views, '门开了一条缝', '').map(item => item.title), ['试灯 · 首客临门']);
  assert.deepEqual(searchChronicle(views, '纪守信', '').map(item => item.title), ['纪守信']);
  assert.equal(searchChronicle(views, '', '2026-11-18').length, 4);
  assert.equal(searchChronicle(views, '张乐天', '')[0].body,
    '张乐天，新加坡华人，AI 工程师，研究电价预测，正为保研发论文，这座跨年小镇就是他张罗的。');
  assert.doesNotMatch(views.entries.map(item => [item.title, item.body].join(' ')).join('\n'),
    /\b(?:SHA|IP|DNS|HTTPS?)\b|部署|[a-f0-9]{7,40}\b|\d{1,3}(?:\.\d{1,3}){3}/i);
});

test('published changes feed all views in lockstep and drafts are visible only to the owner hook', () => {
  const draft = { ...newChapter, id: 'chr-private-draft', body: '待审不公开', status: 'draft' } as const;
  const store = storage([newChapter, draft]);
  const views = readTownChronicleViews(store);
  const record = views.entries.find(item => item.id === newChapter.id)!;
  assert.equal(record.local, true);
  assert.equal(views.latest[0], record);
  assert.ok(views.featured.includes(record));
  assert.ok(views.plaque.includes(record));
  assert.deepEqual(searchChronicle(views, draft.body, ''), []);
  let owner = false;
  const queue = createTownChronicleReviewHook(() => owner, store);
  assert.deepEqual(queue(), []);
  owner = true;
  assert.deepEqual(queue(), [draft]);
});
