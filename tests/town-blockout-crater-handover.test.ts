import assert from 'node:assert/strict';
import { test } from 'node:test';
import { craterHandoverAt, craterHandoverExchanges, handoverLineAt } from '../tools/voxel-tavern/town-blockout/town-crater-handover-lines';
import { townDaylightMs } from '../src/shared/town-night-window';

const dawn = Date.UTC(2026, 0, 1);

test('the three exchanges carry the supplied text verbatim, nails included', () => {
  const [morning, midday, evening] = craterHandoverExchanges;
  assert.equal(morning.lines[0].text, '大年叔，夜里安生。栅栏那头塌口我又去看了一眼，没新脚印。');
  assert.equal(morning.lines[3].text, '风。坑里的风，夜里都这样。回去睡吧，娃。');
  assert.equal(midday.lines[3].text, '放心。有登记的过，没登记的——天王老子也得在栅栏外头站着。');
  assert.equal(evening.lines[2].text, '对喽。夜里听见什么都别应，听见有人喊你名字，更别应。');
  assert.equal(evening.lines[4].text, '我也是从小听我爹说的。');
  for (const ex of craterHandoverExchanges) {
    assert.equal(ex.lines[0].speaker, ex.from, 'the outgoing guard speaks first');
    assert.ok(ex.lines.every((l, i) => i === 0 || l.speaker !== ex.lines[i - 1].speaker), 'speakers alternate');
  }
});

test('handovers play at dawn, noon and just before dusk — and at no other time', () => {
  assert.equal(craterHandoverAt(dawn + 1_000, dawn)?.exchange.shift, 'morning');
  assert.equal(craterHandoverAt(dawn + townDaylightMs / 2 + 1_000, dawn)?.exchange.shift, 'midday');
  assert.equal(craterHandoverAt(dawn + townDaylightMs - 20_000, dawn)?.exchange.shift, 'evening');
  assert.equal(craterHandoverAt(dawn + 60_000, dawn), undefined, 'an hour into the morning the post is quiet');
  assert.equal(craterHandoverAt(dawn + townDaylightMs + 60_000, dawn), undefined, 'night belongs to the night rules, not the handover');
});

test('lines advance in order as the exchange plays', () => {
  const at = craterHandoverAt(dawn, dawn);
  assert.ok(at);
  assert.equal(handoverLineAt(at.exchange, 0)?.speaker, '孙小山');
  assert.equal(handoverLineAt(at.exchange, 4_500)?.speaker, '罗大年');
  assert.equal(handoverLineAt(at.exchange, 99_000), undefined);
});
