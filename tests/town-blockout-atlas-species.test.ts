import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAtlasSpeciesRegistry, type AtlasSpeciesEntry } from '../tools/voxel-tavern/town-blockout/town-atlas-species';

const fox: AtlasSpeciesEntry = {
  id: 'test-fox', region: 'mountain', range: 18,
  copy: { name: 'species.test-fox.name', form: 'species.test-fox.form', habit: 'species.test-fox.habit', folk: 'species.test-fox.folk' },
};
const copy = {
  'species.test-fox.name': '雪狐', 'species.test-fox.form': '通体雪白，耳尖一点黑。',
  'species.test-fox.habit': '夜里沿旧道走。', 'species.test-fox.folk': '老人说它认得回家的路。',
};

test('discovery is two-stage: heard shows lines without a name, seen completes the page', () => {
  const registry = createAtlasSpeciesRegistry(copy);
  assert.equal(registry.register(fox), true);
  assert.equal(registry.register(fox), false, 'duplicate registration refused');
  assert.equal(registry.page('test-fox')!.stage, 'unknown');
  assert.deepEqual(registry.page('test-fox')!.lines, []);
  assert.equal(registry.record('test-fox', 'heard'), 'heard');
  const heard = registry.page('test-fox')!;
  assert.equal(heard.name, '', 'heard-only page keeps the silhouette: no name yet');
  assert.equal(heard.lines.length, 3);
  assert.equal(registry.record('test-fox', 'heard'), 'heard', 'hearing twice never demotes or completes');
  assert.equal(registry.record('test-fox', 'seen'), 'seen');
  assert.equal(registry.page('test-fox')!.name, '雪狐');
  assert.equal(registry.record('nope', 'seen'), undefined);
});

test('unresolved copy keys render as empty slots — the framework invents no text', () => {
  const registry = createAtlasSpeciesRegistry();
  registry.register(fox);
  registry.record('test-fox', 'seen');
  const page = registry.page('test-fox')!;
  assert.equal(page.name, '');
  assert.deepEqual(page.lines, ['', '', '']);
});

test('pages group by region and the tally counts records, not score', () => {
  const registry = createAtlasSpeciesRegistry(copy);
  registry.register(fox);
  registry.register({ ...fox, id: 'test-crane', region: 'town' });
  registry.record('test-fox', 'seen');
  assert.equal(registry.pages('mountain').length, 1);
  assert.equal(registry.pages('town').length, 1);
  assert.deepEqual(registry.tally(), { heard: 0, seen: 1, total: 2 });
});
