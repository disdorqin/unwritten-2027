import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Color, Matrix4, Vector3 } from 'three';
import { createUndergroundCombatDebris } from '../tools/voxel-tavern/town-blockout/underground-combat-debris';
import {
  mountUndergroundCombatFeedback, type UndergroundCombatCue,
} from '../tools/voxel-tavern/town-blockout/underground-combat-feedback';

class Element {
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  children: Element[] = [];
  attributes = new Map<string, string>();
  hidden = false;
  removed = false;
  textContent = '';
  constructor(readonly ownerDocument: { createElement(): Element }) {}
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  remove() { this.removed = true; }
}

function audioFixture() {
  type Source = {
    onended?: (() => void) | null;
    connect(): void;
    disconnect(): void;
    start(): void;
    stop(): void;
  };
  const sources = new Set<Source>();
  let samples = 0;
  const audio = {
    state: 'running',
    sampleRate: 8000,
    destination: {} as { context?: unknown },
    createBuffer(_channels: number, length: number) {
      samples++;
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource(): Source {
      return {
        connect() {},
        disconnect() {},
        start() { sources.add(this); },
        stop() { sources.delete(this); },
      };
    },
  };
  audio.destination.context = audio;
  return { audio, sources, samples: () => samples };
}

const point = { layer: 'mine', east: 8, north: 12, height: -90 };
const creature = (sequence: number, tool: 'snowball' | 'pickaxe' = 'pickaxe'): UndergroundCombatCue => ({
  layer: point.layer, sequence, kind: 'creature-hit', targetId: 'miner', at: point,
  tool, outcome: 'damaged', hitsLost: 1,
});

function mount(onKnockback?: Parameters<typeof mountUndergroundCombatFeedback>[0]['onKnockback']) {
  let reduced = false;
  let clears = 0;
  const visuals: string[] = [];
  const doc = { createElement: (): Element => new Element(doc) };
  const parent = new Element(doc);
  const sound = audioFixture();
  const feedback = mountUndergroundCombatFeedback({
    parent: parent as unknown as HTMLElement,
    project: () => ({ x: 200, y: 100 }),
    getAudioContext: () => sound.audio as unknown as BaseAudioContext,
    showCreatureHit: (cue, presentation) =>
      visuals.push([cue.targetId, presentation.family, presentation.holdMs, presentation.flashMs, presentation.extraStaggerMs].join(':')),
    onKnockback,
    clear: () => { clears++; },
    prefersReducedMotion: () => reduced,
  });
  return {
    feedback, overlay: parent.children[0], visuals, sound, clears: () => clears,
    reduce: () => { reduced = true; },
  };
}

test('only confirmed matching-tool hits flash, show their confirmed loss and hold the target for 40 ms', () => {
  const { feedback, overlay, visuals, sound } = mount();
  feedback.setLayer('mine');
  const [rim, number] = overlay.children;
  assert.equal(overlay.style.pointerEvents, 'none');
  assert.equal(overlay.attributes.get('aria-hidden'), 'true');
  const wrong = { ...creature(1), outcome: 'wrong-tool' } as const;
  assert.equal(feedback.receive(wrong, 15), true);
  assert.equal(feedback.sample(16).held.size, 0);
  assert.equal(number.hidden, true);
  assert.deepEqual(visuals, []);
  assert.equal(sound.sources.size, 0);

  assert.equal(feedback.receive(creature(2), 30), true);
  assert.equal(feedback.receive(creature(2), 31), false);
  assert.equal(feedback.sample(69).held.get('miner'), 70);
  assert.equal(feedback.sample(70).held.size, 0);
  assert.equal(number.hidden, false);
  assert.equal(number.textContent, '1');
  assert.match(number.style.transform, /translate\(200px, /);
  assert.deepEqual(visuals, ['miner:metal:40:110:0']);
  assert.equal(rim.style.opacity, '0');
  assert.equal(sound.samples(), 1);

  assert.equal(feedback.receive(creature(3, 'snowball'), 90), true);
  assert.equal(feedback.receive(creature(4, 'snowball'), 100), true);
  assert.equal(sound.samples(), 2);
  assert.equal(sound.sources.size, 2);
  assert.deepEqual(visuals.slice(1), ['miner:ice:40:110:80', 'miner:ice:40:110:80']);
  assert.equal(feedback.sample(140).held.size, 0);
  feedback.sample(1000);
  assert.ok(overlay.children.slice(1).every(item => item.hidden));
});

test('player hurt is a temporary screen-only cue and wrong-layer or repeated receipts stay silent', () => {
  const { feedback, overlay, reduce, visuals, clears, sound } = mount();
  feedback.setLayer('mine');
  assert.equal(feedback.receive(creature(3), 25), true);
  const hurt = { layer: 'mine', sequence: 3, kind: 'player-hurt', damage: 16, weight: 'medium' } as const;
  assert.equal(feedback.receive(hurt, 25), true);
  const frame = feedback.sample(36);
  assert.ok(Math.hypot(frame.screenX, frame.screenY) > 0);
  assert.ok(Number(overlay.children[0].style.opacity) > 0);
  assert.equal(feedback.receive(hurt, 40), false);

  reduce();
  assert.equal(feedback.sample(44).screenX, 0);
  assert.equal(feedback.sample(44).screenY, 0);
  assert.ok(Number(overlay.children[0].style.opacity) > 0);
  feedback.setLayer('crystal-cave');
  assert.equal(clears(), 1);
  assert.equal(feedback.sample(49).held.size, 0);
  assert.equal(sound.sources.size, 0);
  assert.equal(overlay.children[0].style.opacity, '0');
  assert.equal(feedback.receive(creature(4), 50), false);
  feedback.setLayer('mine');
  assert.equal(feedback.receive(creature(3), 51), false);
  assert.equal(visuals.length, 1);

  feedback.dispose();
  assert.equal(overlay.removed, true);
  assert.equal(feedback.receive(creature(4), 52), false);
});

test('only accepted same-layer hits send their ordered weight to the movement host', () => {
  const shoves: Array<[UndergroundCombatCue, string]> = [];
  const { feedback, reduce } = mount((cue, weight) => shoves.push([cue, weight]));
  feedback.setLayer('mine');
  const wrong = { ...creature(1), outcome: 'wrong-tool' } as const;
  const snow = creature(2, 'snowball');
  const pick = creature(3);
  const heavy = { layer: 'mine', sequence: 2, kind: 'player-hurt', damage: 16, weight: 'heavy' } as const;
  assert.equal(feedback.receive(wrong, 10), true);
  assert.equal(feedback.receive(snow, 20), true);
  assert.equal(feedback.receive(snow, 21), false);
  assert.equal(feedback.receive(pick, 25), true);
  reduce();
  assert.equal(feedback.receive(heavy, 30), true);
  assert.equal(feedback.receive(heavy, 35), false);
  assert.equal(feedback.receive({ ...heavy, layer: 'crystal-cave', sequence: 3 }, 40), false);
  feedback.setLayer('crystal-cave');
  assert.equal(feedback.receive(creature(4), 50), false);
  feedback.setLayer('mine');
  assert.equal(feedback.receive(pick, 55), false);
  feedback.dispose();
  assert.equal(feedback.receive(creature(4), 60), false);
  assert.deepEqual(shoves, [[snow, 'light'], [pick, 'medium'], [heavy, 'heavy']]);
});

test('a single debris batch scatters ice and metal, expires each at its own age and reuses its capacity', () => {
  const debris = createUndergroundCombatDebris();
  const matrix = new Matrix4();
  const color = new Color();
  const firstPosition = () => {
    debris.object.getMatrixAt(0, matrix);
    return new Vector3().setFromMatrixPosition(matrix);
  };
  debris.burst('ice', { x: 8, y: -90, z: -12 }, 0);
  debris.burst('metal', { x: 9, y: -90, z: -12 }, 0);
  debris.sample(0);
  assert.equal(debris.object.count, 11);
  assert.equal(debris.object.visible, true);
  debris.object.getColorAt(0, color);
  assert.equal(color.getHexString(), 'eafdff');
  debris.object.getColorAt(6, color);
  assert.equal(color.getHexString(), 'fff5a6');
  const start = firstPosition();
  debris.sample(100);
  const scattered = firstPosition();
  assert.ok(scattered.x > start.x && scattered.y > start.y);
  debris.sample(170);
  assert.equal(debris.object.count, 6);
  debris.sample(240);
  assert.equal(debris.object.visible, false);
  assert.equal(debris.object.count, 0);

  for (let burst = 0; burst < 5; burst++) {
    debris.burst('ice', { x: burst, y: 0, z: 0 }, 250);
  }
  debris.sample(250);
  assert.equal(debris.object.count, 24);
  assert.ok(firstPosition().x > 1);
  debris.clear();
  debris.sample(250);
  assert.equal(debris.object.visible, false);
  assert.equal(debris.object.count, 0);
  debris.dispose();
});
