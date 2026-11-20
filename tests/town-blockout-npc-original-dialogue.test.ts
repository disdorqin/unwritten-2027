import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Scene } from 'three';
import { livingMayorDeflection, livingMayorQuestion } from '../src/shared/soul-mayor.ts';
import { createTownNpcActivity } from '../tools/voxel-tavern/town-blockout/town-npc.ts';
import * as dialogue from '../tools/voxel-tavern/town-blockout/town-npc-dialogue.ts';
import { tavernWaiterLines } from '../tools/voxel-tavern/town-blockout/tavern-waiter.ts';

const originalRoles = ['罗大江', '苏小满', '顾长明', '乔麦', '柳三弦', '钟铁生'] as const;

test('the original roles export the authored town data without private questions', () => {
  assert.deepEqual(Object.keys(dialogue.npcScript), originalRoles);
  for (const name of originalRoles) {
    assert.deepEqual(Object.keys(dialogue.npcScript[name]), ['greetings', 'farewells', 'smallTalk']);
    assert.deepEqual(Object.keys(dialogue.npcExpansion[name]).sort(), ['familiar', 'guides', 'life', 'neighbors', 'newYear', 'weather']);
  }
  for (const removed of ['npcQuestions', 'answerNpcQuestion', 'npcAuthoredQuestionTopics', 'answerAuthoredNpcQuestion']) {
    assert.equal(removed in dialogue, false, removed);
  }
});

test('the original conversations retain local activity, neighbor, and festival controls', t => {
  let closed = false;
  class Element {
    children: Element[] = [];
    style = { cssText: '' };
    textContent = '';
    value = '';
    label = '';
    disabled = false;
    onclick?: () => void;
    onchange?: () => void;
    constructor(readonly tagName: string) {}
    append(...nodes: Element[]) { this.children.push(...nodes); }
    setAttribute() {}
    closest() { return { close() { closed = true; } }; }
  }
  const documentBefore = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: { createElement: (tagName: string) => new Element(tagName) },
  });
  t.after(() => {
    if (documentBefore) Object.defineProperty(globalThis, 'document', documentBefore);
    else Reflect.deleteProperty(globalThis, 'document');
  });

  let panel = new Element('section');
  let announced = '';
  let diceOpened = false;
  let guideEnabled = true;
  const activity = createTownNpcActivity({
    scene: new Scene(),
    open: () => { panel = new Element('section'); return panel as unknown as HTMLElement; },
    announce(message) { announced = message; },
    face() {}, sit() {},
  }, () => 0, () => guideEnabled, () => true, undefined, () => { diceOpened = true; });

  function conversation(name: string) {
    const spot = activity.spots.find(option => option.label === `和${name}聊天`);
    assert.ok(spot, name);
    spot.run();
    const [speech] = panel.children;
    const controls = panel.children.at(-1)!;
    assert.ok(speech.textContent);
    return {
      tags: panel.children.map(node => node.tagName),
      selector: panel.children.find(node => node.tagName === 'select'),
      ask: controls.children.find(node => node.textContent === '问一句'),
      buttons: controls.children.map(button => button.textContent),
      click(label: string) {
        const button = controls.children.find(node => node.textContent === label);
        assert.ok(button?.onclick, `${name}: ${label}`);
        button.onclick();
        return speech.textContent;
      },
    };
  }

  for (const name of originalRoles) {
    const talk = conversation(name);
    const script = dialogue.npcScript[name];
    const expansion = dialogue.npcExpansion[name];
    const buttons = name === '苏小满' ? talk.buttons.filter(label => label !== '问百门通') : talk.buttons;
    assert.deepEqual(talk.tags, ['p', 'select', 'div']);
    assert.deepEqual(buttons, ['问一句', '聊聊雪镇', '聊聊镇民', '聊聊跨年', '附近有什么好玩的？', '道别']);
    const { selector, ask } = talk;
    assert.ok(selector?.onchange && ask);
    assert.deepEqual(selector.children.map(node => [node.tagName, node.label, node.children.map(option => option.value)]), [
      ['option', '', []],
      ['optgroup', '地点与设施', ['activities']],
      ['optgroup', '镇民与日常', ['town', 'neighbors', 'new-year', 'mayor']],
      ['optgroup', '镇史传说', ['founding', 'crater', 'mountain', 'chronicle']],
      ['optgroup', '生肖星石', ['star-decree']],
    ]);
    assert.equal(ask.disabled, true);
    selector.value = 'mayor';
    selector.onchange();
    assert.equal(talk.click('问一句'), livingMayorDeflection);
    selector.value = '12';
    selector.onchange();
    assert.equal(ask.disabled, true);
    for (const [topic, text] of [
      ['town', script.smallTalk[0]], ['neighbors', expansion.neighbors[0]], ['new-year', expansion.newYear[0]],
      ['activities', Object.values(expansion.guides)[0]],
    ]) {
      selector.value = topic;
      selector.onchange();
      assert.equal(ask.disabled, false);
      assert.equal(talk.click('问一句'), text);
    }
    assert.equal(talk.click('聊聊雪镇'), script.smallTalk[1]);
    guideEnabled = false;
    assert.equal(talk.click('附近有什么好玩的？'), '先到街上走走，看看雪和灯吧。');
    assert.equal(talk.click('问一句'), '先到街上走走，看看雪和灯吧。');
    guideEnabled = true;
    for (const topic of ['crater', 'mountain', 'star-decree', 'founding', 'chronicle', 'star-decree']) {
      selector.value = topic;
      selector.onchange();
      assert.equal(ask.disabled, false);
      const deflection = talk.click('问一句');
      assert.equal(deflection, script.smallTalk[0]);
      assert.doesNotMatch(deflection, /入口|归环|核心舱|飞船|铃铛芯|大坑|山顶/u);
    }
    closed = false;
    announced = '';
    talk.click('道别');
    assert.equal(closed, true);
    assert.ok(announced);
  }

  const clerk = conversation('纪守信');
  assert.deepEqual(clerk.tags, ['p', 'div']);
  assert.deepEqual(clerk.buttons.filter(label => label !== '问百门通'), ['问信箱规矩', '聊聊镇民', livingMayorQuestion, '道别']);
  assert.equal(clerk.click(livingMayorQuestion), livingMayorDeflection);
  assert.equal(clerk.click('问信箱规矩'), dialogue.npcAuthoredDialogue.纪守信.guides[0]);
  assert.equal(clerk.click('聊聊镇民'), dialogue.npcAuthoredDialogue.纪守信.gossip[0]);

  const waiter = conversation('田小勤');
  assert.deepEqual(waiter.tags, ['p', 'div']);
  assert.deepEqual(waiter.buttons, ['和田小勤摇骰子', '问问热饮', '招呼小二', livingMayorQuestion, '道别']);
  assert.equal(waiter.click(livingMayorQuestion), livingMayorDeflection);
  assert.equal(waiter.click('问问热饮'), tavernWaiterLines.上酒[0]);
  assert.equal(waiter.click('招呼小二'), tavernWaiterLines.巡堂[0]);
  waiter.click('和田小勤摇骰子');
  assert.equal(diceOpened, true);
});
