import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { createIceFishingActivity } from '../tools/voxel-tavern/town-blockout/ice-fishing-activity.ts';
import { findRegionalCampfires, pineCampfireId } from '../tools/voxel-tavern/town-blockout/town-campfires.ts';
import { createForestCampfire, findForestChopSites, forestChopHits } from '../tools/voxel-tavern/town-blockout/town-forest-campfire.ts';
import type { TownActivityContext } from '../tools/voxel-tavern/town-blockout/town-activity.ts';
import { npcAddedDialogue } from '../tools/voxel-tavern/town-blockout/town-npc-added-dialogue.ts';
import {
  createPineFireActivities, createRegionalCarry, isPineStoryTime, pineStoryLines, regionalCarryKey,
} from '../tools/voxel-tavern/town-blockout/town-pine-camp-fire-activity.ts';

test('ice catch and roasting reserve three carry slots and survive reopening the town', () => {
  let at = 1_000;
  let persisted = '';
  const storage = {
    getItem: () => persisted,
    setItem: (key: string, value: string) => { assert.equal(key, regionalCarryKey); persisted = value; },
  };
  const carry = createRegionalCarry({ storage, now: () => at });
  assert.equal(carry.startRoasting(true), 'empty');
  for (let index = 0; index < 3; index++) assert.equal(carry.collectFish(), true);
  assert.equal(carry.collectFish(), false);
  assert.equal(carry.startRoasting(false), 'unlit');
  assert.equal(carry.startRoasting(true), 'started');
  assert.equal(carry.startRoasting(true), 'busy');
  at = 30_999;
  const resumed = createRegionalCarry({ storage, now: () => at });
  assert.deepEqual(resumed.snapshot(), { used: 3, fresh: 3, roast: 0, roastReadyAt: 31_000 });
  assert.equal(resumed.eatRoast(), false);
  assert.equal(resumed.collectFish(), false);
  at = 31_000;
  assert.deepEqual(resumed.snapshot(), { used: 3, fresh: 2, roast: 1, roastReadyAt: undefined });
  assert.equal(resumed.eatRoast(), true);
  assert.equal(resumed.eatRoast(), false);
  assert.deepEqual(resumed.snapshot(), { used: 2, fresh: 2, roast: 0, roastReadyAt: undefined });
  assert.equal(createRegionalCarry({ storage, now: () => at }).snapshot().roast, 0);
});

test('a corrupt bag retains at most three valid items and keeps roasting without storage', () => {
  const storage = {
    getItem: () => JSON.stringify({ items: ['invalid', 'fresh-fish', 'bamboo', 'lantern', 'ridge-snow'], roastReadyAt: -1 }),
    setItem: () => { throw new Error('quota'); },
  };
  let at = 1_000;
  const carry = createRegionalCarry({ storage, now: () => at });
  assert.deepEqual(carry.snapshot(), { used: 3, fresh: 1, roast: 0, roastReadyAt: undefined });
  assert.equal(carry.startRoasting(true), 'started');
  at += 30_000;
  assert.deepEqual(carry.snapshot(), { used: 3, fresh: 0, roast: 1, roastReadyAt: undefined });
});

test('campfire story uses the Shanghai NPC night segment and existing approved lines', () => {
  const time = (local: string) => Date.parse(`2026-11-19T${local}:00+08:00`);
  assert.equal(isPineStoryTime(time('05:59'), false), true);
  assert.equal(isPineStoryTime(time('06:00'), false), false);
  assert.equal(isPineStoryTime(time('19:59'), false), false);
  assert.equal(isPineStoryTime(time('20:00'), false), true);
  assert.equal(isPineStoryTime(time('20:00'), true), false);
  assert.equal(isPineStoryTime(Date.parse('2026-12-31T22:00:00+08:00'), false), true);
  assert.deepEqual(pineStoryLines, [npcAddedDialogue.樊樵.familiar.再访[1], npcAddedDialogue.樊樵.guides[3]]);
});

test('ice fishing controls put fresh fish in the shared carry and the grill cooks and feeds from that carry', t => {
  class Element extends EventTarget {
    children: Element[] = [];
    textContent = '';
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    disabled = false;
    hidden = false;
    isConnected = true;
    onclick?: () => void;

    append(...children: Element[]) { this.children.push(...children); }
    setAttribute() {}
    focus() {}
    closest() { return null; }
    getContext() { return null; }
    click() {
      if (this.disabled || this.hidden) return;
      this.dispatchEvent(new Event('click'));
      this.onclick?.();
    }
  }

  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const body = new Element();
  for (const [key, value] of Object.entries({
    document: { body, activeElement: body, createElement: () => new Element() },
    localStorage: storage,
  })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }

  let at = 1_000;
  let roll = 0;
  let warmth = 0;
  let catalogue = 0;
  let panel = new Element();
  t.mock.method(Math, 'random', () => roll);
  const messages: string[] = [];
  const context: TownActivityContext = {
    scene: new Scene(),
    open() {
      panel.isConnected = false;
      panel = new Element();
      return panel as unknown as HTMLElement;
    },
    announce(message) { messages.push(message); },
    face() {},
    sit() {},
  };
  const carry = createRegionalCarry({ storage, now: () => at });
  const fishing = createIceFishingActivity(context, () => 0, () => { catalogue++; }, carry.collectFish);
  const ground = () => 12;
  const fire = findRegionalCampfires(ground, undefined, { pineCamp: true }).find(site => site.id === pineCampfireId);
  assert.ok(fire);
  const forest = createForestCampfire(context.scene, context, findForestChopSites([fire], ground), {
    isNight: () => true, now: () => at, pineCamp: fire, storage,
  });
  const chop = forest.spots.find(spot => spot.label === '松林营地劈柴');
  const feed = forest.spots.find(spot => spot.label === '给松林火塘添柴');
  assert.ok(chop && feed);
  const pine = createPineFireActivities(context, carry, {
    lighted: () => forest.pineCampState().fuel > 0,
    warmFromRoast: () => { warmth++; },
    storyHint: () => undefined,
    leaveSeat() {},
    now: () => at,
  });
  fishing.spots[0].run();
  const [status, cast, collect, release] = panel.children[0].children;
  for (const [index, speciesRoll] of [0, .4, .8, 0].entries()) {
    roll = 0;
    cast.click();
    assert.equal(status.dataset.iceFishingStatus, 'waiting');
    for (let tick = 0; tick < 16; tick++) fishing.update!(.1);
    assert.equal(status.dataset.iceFishingStatus, 'waiting');
    fishing.update!(.1);
    assert.equal(status.dataset.iceFishingStatus, 'bite');
    assert.equal(cast.textContent, '收线');
    roll = speciesRoll;
    cast.click();
    assert.equal(status.dataset.iceFishingStatus, 'caught');
    assert.equal(collect.hidden, false);
    assert.equal(release.hidden, false);
    collect.click();
    if (index < 3) {
      assert.match(status.textContent, /已收入随身格/);
      assert.equal(carry.snapshot().fresh, index + 1);
      assert.equal(collect.hidden, true);
    } else {
      assert.match(status.textContent, /随身格已满/);
      assert.equal(carry.snapshot().fresh, 3);
      assert.equal(release.hidden, false);
      release.click();
      assert.match(status.textContent, /已放生/);
      assert.equal(release.hidden, true);
      assert.equal(carry.snapshot().used, 3);
    }
  }
  assert.ok(catalogue > 0);

  pine.openGrill();
  const [grillStatus, begin, eat] = panel.children;
  assert.match(grillStatus.textContent, /鲜鱼 3 · 烤鱼 0/);
  assert.equal(begin.disabled, true);
  for (let fuel = 1; fuel <= 4; fuel++) {
    for (let hit = 0; hit < forestChopHits; hit++) { at += 400; chop.run(); }
    feed.run();
    assert.deepEqual(forest.pineCampState(), { wood: 0, fuel, level: fuel === 4 ? 2 : 0 });
  }
  pine.update();
  assert.equal(begin.disabled, false);
  begin.click();
  assert.equal(messages.at(-1), '鲜鱼已挂上烤架');
  at += 29_999;
  pine.update();
  assert.match(grillStatus.textContent, /随身格 3\/3 · 鲜鱼 3 · 烤鱼 0 · 烤制还需 1 秒/);
  assert.equal(eat.disabled, true);
  at++;
  pine.update();
  assert.match(grillStatus.textContent, /随身格 3\/3 · 鲜鱼 2 · 烤鱼 1$/);
  assert.equal(eat.disabled, false);
  eat.click();
  assert.match(grillStatus.textContent, /随身格 2\/3 · 鲜鱼 2 · 烤鱼 0$/);
  assert.equal(warmth, 1);
  assert.equal(messages.at(-1), '吃了一份烤鱼 · 暖意入身');
  t.diagnostic('cast/reel/collect passed 3 fish; fourth catch released; four five-hit chop rounds fueled the pine fire to stage 2; at 29,999 ms fresh=3 roast=0, at 30,000 ms fresh=2 roast=1, after eating used=2 warm callbacks=1');
});
