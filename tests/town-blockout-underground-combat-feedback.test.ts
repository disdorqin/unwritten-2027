import assert from 'node:assert/strict';
import { test } from 'node:test';
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

function mount() {
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
      visuals.push([cue.targetId, presentation.family, presentation.holdMs, presentation.flashMs].join(':')),
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
  assert.deepEqual(visuals, ['miner:metal:40:110']);
  assert.equal(rim.style.opacity, '0');
  assert.equal(sound.samples(), 1);

  assert.equal(feedback.receive(creature(3, 'snowball'), 90), true);
  assert.equal(feedback.receive(creature(4, 'snowball'), 100), true);
  assert.equal(sound.samples(), 2);
  assert.equal(sound.sources.size, 2);
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
