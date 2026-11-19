import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { BoxGeometry, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Texture, Vector3 } from 'three';
import { prewarmHouseDoorTextures } from '../tools/voxel-tavern/town-blockout/town-house-door-textures.ts';

function fixture(t: TestContext) {
  let now = 0;
  let nextFrame = 0;
  const frames: FrameRequestCallback[] = [];
  const previousRaf = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: FrameRequestCallback) => {
      frames.push(callback);
      return ++nextFrame;
    },
  });
  t.after(() => {
    if (previousRaf) Object.defineProperty(globalThis, 'requestAnimationFrame', previousRaf);
    else Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  });
  t.mock.method(performance, 'now', () => now);

  const uploads: Texture[] = [];
  const properties = new Map<unknown, { __webglInit?: boolean }>();
  const renderer = {
    initTexture(texture: Texture) { uploads.push(texture); },
    properties: {
      has: (object: unknown) => properties.has(object),
      get: (object: unknown) => properties.get(object),
      remove: (object: unknown) => { properties.delete(object); },
      update: () => undefined,
      dispose: () => properties.clear(),
    },
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera(58, 1, .1, 100);
  camera.position.set(25, 3, 4);
  camera.layers.set(6);

  function addTexture(texture: Texture, z: number, layer = 0) {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ map: texture }));
    mesh.position.z = z;
    mesh.layers.set(layer);
    scene.add(mesh);
  }
  async function runFrame(at: number) {
    now = at;
    const scheduled = frames.splice(0);
    assert.equal(scheduled.length, 1);
    scheduled[0]!(at);
    await Promise.resolve();
  }
  const start = (stillInside: () => boolean = () => true) =>
    prewarmHouseDoorTextures(renderer, scene, camera, new Vector3(), 0, stillInside);
  return { addTexture, camera, frames, properties, runFrame, start, uploads };
}

test('A6 prewarms visible cold exterior textures once and uploads at most one per frame', async t => {
  const f = fixture(t);
  const resident = new Texture(), first = new Texture(), second = new Texture();
  f.properties.set(resident, { __webglInit: true });
  f.properties.set(second, {});
  f.addTexture(resident, -3);
  f.addTexture(first, -4);
  f.addTexture(first, -5);
  f.addTexture(second, -6);
  f.addTexture(new Texture(), 5);
  f.addTexture(new Texture(), -5, 6);

  const pending = f.start();
  assert.deepEqual(f.uploads, []);
  await f.runFrame(16);
  assert.deepEqual(f.uploads, [first]);
  await f.runFrame(32);
  await pending;
  assert.deepEqual(f.uploads, [first, second]);
  assert.equal(f.frames.length, 0);
  assert.deepEqual(f.camera.position.toArray(), [25, 3, 4]);
  assert.equal(f.camera.layers.mask, 1 << 6);
});

test('A6 stops scheduling and uploading when the shared-room conceal is over', async t => {
  const f = fixture(t);
  const first = new Texture();
  f.addTexture(first, -4);
  f.addTexture(new Texture(), -5);
  let concealActive = true;

  const pending = f.start(() => concealActive);
  await f.runFrame(16);
  concealActive = false;
  await f.runFrame(32);
  await pending;
  assert.deepEqual(f.uploads, [first]);
  assert.equal(f.frames.length, 0);

  await f.start(() => false);
  assert.equal(f.frames.length, 0);
});

test('A6 skips a scheduled upload once the 260 ms prewarm budget expires', async t => {
  const f = fixture(t);
  f.addTexture(new Texture(), -4);
  const pending = f.start();
  await f.runFrame(260);
  await pending;
  assert.deepEqual(f.uploads, []);
  assert.equal(f.frames.length, 0);
});
