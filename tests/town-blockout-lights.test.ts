import assert from 'node:assert/strict';
import test from 'node:test';
import { Color, InstancedMesh, Scene } from 'three';
import { createTownLights } from '../tools/voxel-tavern/town-blockout/town-lights.ts';

const plazaPane = 0 * 15 + 5;
const forestPane = 1 * 15 + 5;

function harness(saved: string[] = []) {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => JSON.stringify(saved),
    setItem: () => {},
  };
  const scene = new Scene();
  const context = {
    scene,
    open: () => { throw new Error('not used'); },
    announce: () => {},
    sit: () => {},
    face: () => {},
  };
  const grid = { heightAt: () => 0 };
  const lights = createTownLights(context as never, grid as never);
  const mesh = scene.getObjectByName('Town light trail') as InstancedMesh;
  return { lights, mesh };
}

function paneColor(mesh: InstancedMesh, index: number): Color {
  const color = new Color();
  mesh.getColorAt(index, color);
  return color;
}

function close(a: Color, b: Color, tolerance = .01): boolean {
  return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance;
}

test('automatic dusk lamps fade continuously with the night level', () => {
  const { lights, mesh } = harness();
  const glass = new Color('#554738');
  const lamp = new Color('#ffbb66');
  assert.ok(close(paneColor(mesh, plazaPane), glass), 'daytime lamp pane should be cold glass');

  lights.setDusk(true);
  assert.ok(close(paneColor(mesh, plazaPane), lamp), 'dusk turns the plaza lamp on');
  const full = paneColor(mesh, plazaPane);

  lights.setNightLevel(.5);
  const half = paneColor(mesh, plazaPane);
  assert.ok(half.r > glass.r && half.r < full.r, 'lamp brightness should sit between glass and full glow');
  assert.ok(half.g > glass.g && half.g < full.g);
  assert.ok(half.b > glass.b && half.b < full.b);

  lights.setNightLevel(0);
  assert.ok(close(paneColor(mesh, plazaPane), glass), 'noon glow returns to cold glass');

  lights.setNightLevel(1);
  assert.ok(close(paneColor(mesh, plazaPane), lamp), 'full night restores the lamp');
});

test('player-lit trail lamps stay lit while the automatic night level is zero', () => {
  const { lights, mesh } = harness(['forest']);
  const lamp = new Color('#ffbb66');
  lights.setNightLevel(0);
  assert.ok(close(paneColor(mesh, forestPane), lamp), 'player progress lamps are not tied to the day cycle');
  lights.setNightLevel(1);
  assert.ok(close(paneColor(mesh, forestPane), lamp));
});

test('out-of-range night levels are clamped and NaN is ignored', () => {
  const { lights, mesh } = harness();
  const glass = new Color('#554738');
  lights.setDusk(true);
  lights.setNightLevel(Number.NaN);
  assert.notEqual(paneColor(mesh, plazaPane).r, glass.r);
  lights.setNightLevel(-4);
  assert.ok(close(paneColor(mesh, plazaPane), glass));
  lights.setNightLevel(4);
  assert.ok(close(paneColor(mesh, plazaPane), new Color('#ffbb66')));
});
