import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  museumFoundingCaptions, museumHeartStoneCaption, museumSandTableCaption,
} from '../tools/voxel-tavern/town-blockout/museum-zones';

test('ZA-06 zone one uses the controller-approved public texts verbatim', () => {
  assert.deepEqual(museumFoundingCaptions, {
    pot: '第一口锅\n开镇那年烧的，煮化了第一场雪',
    lamp: '第一盏灯\n羊油点的，点了一冬没灭过',
    cloth: '第一匹布\n羊毛织的，够全镇做一身',
    books: '镇志底稿\n前三页是三个人的字，第四页起没人认领',
    tool: '第一把锤\n镇公所的第一块基石，就是它凿的',
  });
  assert.equal(museumHeartStoneCaption, '镇心石\n开镇之年坠在镇北，抬回来那天全镇停工');
  assert.equal(museumSandTableCaption, '建镇聚落 · 沙盘\n一户一屋，多出来的那间至今空着');
  for (const label of [...Object.values(museumFoundingCaptions), museumHeartStoneCaption, museumSandTableCaption]) {
    assert.equal(label.split('\n').length, 2, label);
    assert.ok(label.length > 7);
  }
});
