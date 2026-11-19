import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PerspectiveCamera } from 'three';
import { createIcePalaceCrown } from '../tools/voxel-tavern/town-blockout/ice-palace-crown';

function fixture() {
  const names = new Set<string>();
  const attributes = new Map<string, string>();
  const added: unknown[] = [];
  let removed = false;
  const marker = {
    className: '',
    hidden: false,
    style: { transform: '' },
    classList: {
      toggle(name: string, enabled: boolean) {
        if (enabled) names.add(name);
        else names.delete(name);
      },
    },
    setAttribute(key: string, value: string) { attributes.set(key, value); },
    remove() { removed = true; },
  };
  const root = {
    ownerDocument: {
      createElement(tag: string) {
        assert.equal(tag, 'span');
        return marker;
      },
      defaultView: { innerWidth: 1000, innerHeight: 600 },
    },
    append(node: unknown) { added.push(node); },
  };
  const camera = new PerspectiveCamera(60, 1000 / 600, .1, 100);
  const crown = createIcePalaceCrown(root as unknown as HTMLElement);
  return { crown, marker, camera, names, attributes, added, removed: () => removed };
}

test('one accessible ice crown appears for the local owner and clears on return', () => {
  const { crown, marker, camera, names, attributes, added, removed } = fixture();
  assert.deepEqual(added, [marker]);
  assert.equal(marker.className, 'ice-palace-crown');
  assert.deepEqual([...attributes], [['role', 'img'], ['aria-label', '冰冠']]);
  assert.equal(marker.hidden, true);
  crown.render('self', camera);
  assert.equal(marker.hidden, false);
  assert.equal(names.has('is-self'), true);
  crown.render(null, camera);
  assert.equal(marker.hidden, true);
  crown.remove();
  assert.equal(removed(), true);
});

test('the same ice crown tracks the remote head offset and resets between peer and first person', () => {
  const { crown, marker, camera, names, added } = fixture();
  const position = { east: 0, north: 10, height: 0 };
  crown.render(position, camera);
  assert.equal(marker.hidden, false);
  assert.equal(marker.style.transform, 'translate3d(500px, 189px, 0)');
  crown.render({ ...position, pose: 1 }, camera);
  assert.equal(marker.style.transform, 'translate3d(500px, 213px, 0)');
  crown.render('self', camera);
  assert.equal(marker.style.transform, '');
  assert.equal(names.has('is-self'), true);
  crown.render(position, camera);
  assert.equal(marker.style.transform, 'translate3d(500px, 189px, 0)');
  assert.equal(names.has('is-self'), false);
  assert.equal(added.length, 1);
});

test('offscreen, behind-camera and far owners leave no stale crown', () => {
  const { crown, marker, camera } = fixture();
  for (const [east, north] of [[15, 10], [0, -10], [0, 41], [0, NaN]]) {
    crown.render('self', camera);
    crown.render({ east, north, height: 0 }, camera);
    assert.equal(marker.hidden, true);
  }
});
