import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, InstancedMesh, Matrix4, Scene, Vector3 } from 'three';
import { createTavernTableCups } from '../tools/voxel-tavern/town-blockout/tavern-table-cups.ts';
import { createTavernSeatSpots, tavernSeatPlacements, type TavernCupRow } from '../tools/voxel-tavern/town-blockout/tavern-seats.ts';
import { layout } from '../tools/voxel-tavern/town-blockout/terrain.ts';
import {
  createTavernMixBook, getTavernRecipe, tavernAddIns, tavernBases, tavernRecipes,
} from '../tools/voxel-tavern/town-blockout/tavern-mix-book.ts';

function fakeStorage() {
  const saved = new Map<string, string>();
  let writes = 0;
  return {
    getItem(key: string) { return saved.get(key) ?? null; },
    setItem(key: string, value: string) {
      writes++;
      saved.set(key, value);
    },
    writeCount() { return writes; },
  };
}

test('each tavern recipe requires its own valid pair of ingredients', () => {
  assert.equal(tavernRecipes.length, 3);
  assert.equal(new Set(tavernRecipes.map(recipe => recipe.id)).size, tavernRecipes.length);
  const bases = new Set<string>(tavernBases.map(ingredient => ingredient.id));
  const addIns = new Set<string>(tavernAddIns.map(ingredient => ingredient.id));
  for (const recipe of tavernRecipes) {
    assert.ok(bases.has(recipe.base));
    assert.ok(addIns.has(recipe.addIn));
    assert.equal(getTavernRecipe(recipe.base, recipe.addIn)?.id, recipe.id);
  }
  const [first, second] = tavernRecipes;
  assert.equal(getTavernRecipe(first.base, second.addIn), undefined);
  assert.equal(getTavernRecipe('', first.addIn), undefined);
  assert.equal(getTavernRecipe(first.base, 'unknown-add-in'), undefined);
});

test('the drink book persists completed discoveries and ignores duplicates or unknown ids', () => {
  const storage = fakeStorage();
  const book = createTavernMixBook(storage);
  const [recipe] = tavernRecipes;
  assert.deepEqual(book.ids(), []);
  assert.equal(book.record('unknown-recipe'), false);
  assert.equal(book.record(recipe.id), true);
  assert.equal(book.record(recipe.id), false);
  assert.equal(storage.writeCount(), 1);
  const reopened = createTavernMixBook(storage);
  assert.deepEqual(reopened.ids(), [recipe.id]);
  assert.equal(reopened.has(recipe.id), true);
  assert.equal(reopened.has('unknown-recipe'), false);
  assert.equal(reopened.record(recipe.id), false);
  assert.equal(storage.writeCount(), 1);
});

test('two tabs opened before the first mix retain each independent discovery', () => {
  const storage = fakeStorage();
  const firstTab = createTavernMixBook(storage);
  const secondTab = createTavernMixBook(storage);
  const [first, second, third] = tavernRecipes;
  assert.deepEqual(firstTab.ids(), []);
  assert.deepEqual(secondTab.ids(), []);
  assert.equal(firstTab.record(first.id), true);
  assert.equal(secondTab.record(second.id), true);
  assert.equal(firstTab.record(third.id), true);
  const expected = new Set(tavernRecipes.map(recipe => recipe.id));
  assert.deepEqual(new Set(firstTab.ids()), expected);
  assert.deepEqual(new Set(secondTab.ids()), expected);
  assert.deepEqual(new Set(createTavernMixBook(storage).ids()), expected);
});

test('the current page can still track a completed mix when local storage is blocked', () => {
  const blocked = () => { throw new Error('Storage is blocked'); };
  const book = createTavernMixBook({ getItem: blocked, setItem: blocked });
  const [recipe] = tavernRecipes;
  assert.equal(book.record(recipe.id), true);
  assert.equal(book.has(recipe.id), true);
  assert.deepEqual(book.ids(), [recipe.id]);
  assert.equal(book.record(recipe.id), false);
});

test('a held drink displays one cup only while sitting at a tavern table', () => {
  const plot = layout.plots.find(({ id }) => id === 'tavern')!;
  const placements = tavernSeatPlacements(plot);
  assert.equal(placements.length, 18);
  assert.equal(placements.filter(({ pose }) => pose.cupRow).length, 16);
  const piano = placements.find(({ label }) => label === '一楼琴椅')!;
  const bench = placements.find(({ label }) => label === '二楼阅览长凳')!;
  assert.equal(piano.pose.cupRow, undefined);
  assert.equal(bench.pose.cupRow, undefined);

  const scene = new Scene();
  const table = createTavernTableCups(scene);
  const mesh = scene.children[0];
  assert.ok(mesh instanceof InstancedMesh);
  assert.equal(scene.children.length, 1);
  let row: TavernCupRow | undefined;
  const spots = createTavernSeatSpots(plot, { sit: seat => { row = seat.cupRow; } }, () => true);
  const drink = tavernRecipes[0];
  table.update(row, drink);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.count, 0);

  spots[0].run();
  const anchor = placements[0].pose.cupRow!;
  assert.deepEqual(row, anchor);
  table.update(row, undefined);
  assert.equal(mesh.visible, false);
  table.update(row, drink);
  assert.equal(mesh.visible, true);
  assert.equal(mesh.count, 9);
  const matrix = new Matrix4();
  const center = new Vector3();
  mesh.getMatrixAt(0, matrix);
  assert.ok(center.setFromMatrixPosition(matrix).distanceTo(new Vector3(anchor.x, anchor.y + .015, -anchor.n)) < .00005);
  const tint = new Color();
  mesh.getColorAt(mesh.count - 1, tint);
  assert.equal(tint.getHexString(), new Color(drink.color).getHexString());

  row = undefined; // The viewer's ordinary leaveSeat clears the seat and its table anchor.
  table.update(row, drink);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.count, 0);
  spots.find(({ label }) => label.includes(piano.label))!.run();
  table.update(row, drink);
  assert.equal(mesh.visible, false);
  spots[0].run();
  table.update(row, drink);
  assert.equal(mesh.visible, true);
  table.update(row, undefined);
  assert.equal(mesh.visible, false);
  assert.equal(mesh.count, 0);
});
