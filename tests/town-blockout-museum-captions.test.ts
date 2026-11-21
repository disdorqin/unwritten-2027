import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  museumFoundingCaptions, museumHeartStoneCaption, museumSandTableCaption,
  museumSpecimenCaptions, museumShiftBoardCaption,
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
test('ZA-06 zone two eight mine specimens and full five-line shift board remain verbatim', () => {
  assert.deepEqual(museumSpecimenCaptions, [
    '星尘矿\n越深越亮，矿工说它自己会发热',
    '石英\n老钟楼的摆，就是这一块切的',
    '铜矿\n铸过三口钟，两口在镇上，一口没找到',
    '煤矿\n冬里取暖全靠它，灰能堆到房檐',
    '石灰石\n砌镇公所的灰，就是它烧的',
    '陨铁\n沉得反常，老铁匠说它不像地里的东西',
    '砂岩\n最软的石头，孩子们在上面刻满了名字',
    '深层岩芯\n从最底下取的，再往下不挖了',
  ]);
  assert.deepEqual(museumShiftBoardCaption, [
    '班次牌',
    '一班 辰入午出 六人 · 班头 石沉',
    '二班 午入酉出 六人 · 班头 石沉',
    '三班 夜里不入',
    '（三班那一栏，年年空着）',
  ]);
  assert.ok(museumSpecimenCaptions.every(text => text.split('\n').length === 2));
});
