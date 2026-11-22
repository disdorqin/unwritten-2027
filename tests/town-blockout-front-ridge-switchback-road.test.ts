import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildSwitchbackCenterline, createFrontRidgeSwitchbackRoad, STATION_BOARD_TEXTS, hostGridAt,
} from '../tools/voxel-tavern/town-blockout/front-ridge-switchback-road';

test('switchback centreline meets the surveyed spec: >=2.75 km, grade <=12%', () => {
  const line = buildSwitchbackCenterline();
  const total = line.at(-1)!.cum;
  assert.ok(total >= 2750, `total length ${total.toFixed(0)} m must be >= 2750 m`);
  let maxGrade = 0;
  for (let i = 1; i < line.length; i++) {
    const plan = Math.hypot(line[i]!.east - line[i - 1]!.east, line[i]!.north - line[i - 1]!.north);
    if (plan < 0.5) continue;
    maxGrade = Math.max(maxGrade, Math.abs(line[i]!.height - line[i - 1]!.height) / plan);
  }
  assert.ok(maxGrade <= 0.12, `max grade ${(maxGrade * 100).toFixed(1)}% must be <= 12%`);
  // Anchors: pass meets the grid landing (12.8), base H18, mid terrace
  // H140, cloud terrace H347. D-6: the toe re-routes north (no longer
  // straight across the memorial hill).
  const near = (east: number, north: number) => line.reduce((best, point) =>
    Math.hypot(point.east - east, point.north - north) < Math.hypot(best.east - east, best.north - north) ? point : best);
  assert.ok(Math.abs(near(290, 300).height - 12.8) < 0.6, `pass anchor ${near(290, 300).height.toFixed(1)}`);
  assert.ok(Math.abs(near(526, 329).height - 18) < 1.5);
  assert.ok(Math.abs(near(440, 520).height - 140) < 1.5);
  assert.ok(Math.abs(near(336, 640).height - 347) < 1.5);
  // The re-routed toe passes the west valley, not the memorial hill:
  // no toe point (cum < 600) comes within 50 m of the hill crest
  // (400,304) that buried the old straight toe.
  const toeClearance = Math.min(...line.filter(p => p.cum < 600)
    .map(p => Math.hypot(p.east - 400, p.north - 304)));
  assert.ok(toeClearance > 50, `toe clearance from hill crest: ${toeClearance.toFixed(0)} m`);
});

test('switchback road overlay: height layer, lamps, signs, dispose', () => {
  const road = createFrontRidgeSwitchbackRoad();
  // D-6: pass start meets the grid landing (12.8, the 山口 teleport
  // height); terrace end meets the cloud terrace.
  const start = road.heightAt(290, 300);
  assert.ok(start !== undefined && Math.abs(start - 12.86) < 0.6, `pass heightAt ${start}`);
  const base = road.heightAt(526, 329);
  assert.ok(base !== undefined && Math.abs(base - 18.06) < 0.6, `base heightAt ${base}`);
  const top = road.heightAt(336, 640);
  assert.ok(top !== undefined && Math.abs(top - 347.06) < 0.75);
  // D-6: the toe is continuous now (A measured 73% holes on the old
  // 6-point toe). Sample the re-routed toe every ~3 m: no holes.
  const anchors: [number, number][] = [[290, 300], [270, 300], [270, 460], [530, 460], [530, 329], [526, 329]];
  let samples = 0, holes = 0, maxCut = 0;
  for (let s = 0; s < anchors.length - 1; s++) {
    const [e0, n0] = anchors[s]!, [e1, n1] = anchors[s + 1]!;
    const d = Math.hypot(e1 - e0, n1 - n0), k = Math.round(d / 3);
    for (let i = 0; i <= k; i++) {
      const e = e0 + (e1 - e0) * i / k, n = n0 + (n1 - n0) * i / k;
      samples++;
      const h = road.heightAt(e, n);
      if (h === undefined) { holes++; continue; }
      maxCut = Math.max(maxCut, hostGridAt(e, n) - h);
    }
  }
  assert.equal(holes, 0, `toe heightAt holes: ${holes}/${samples}`);
  // The only burial left is the declared station-apron cutting
  // (last ~24 m, depth <= 8 m): the road descends into the station
  // cut whose platform sits 8 m below its apron.
  assert.ok(maxCut <= 8.5, `max cut ${maxCut.toFixed(1)} m`);
  // D-6 entry spur: boundary (270,539) -> junction (270,460),
  // continuous, no holes, grade-legal.
  assert.equal(road.entryCentreline.at(0)!.east, 270);
  assert.equal(road.entryCentreline.at(0)!.north, 539);
  assert.equal(road.entryCentreline.at(-1)!.north, 460);
  let entryHoles = 0;
  for (let n = 300; n <= 539; n += 3) {
    if (road.heightAt(270, n) === undefined) entryHoles++;
  }
  assert.equal(entryHoles, 0, `entry spur holes: ${entryHoles}`);
  // Off-corridor ground is not the overlay's business.
  assert.equal(road.heightAt(100, 100), undefined);
  const names = road.group.children.map(child => child.name);
  assert.ok(names.includes('switchback-road-ribbon'));
  assert.ok(names.includes('switchback-fog-lamp-posts'));
  const lamps = road.group.children.filter(child => child.name === 'switchback-fog-lamp');
  assert.ok(lamps.length >= 30, `fog lamp chain has ${lamps.length} lamps`);
  // D-5 supplement (总控裁定批55): 250 m mileage stones, hairpin
  // benches, two wind-shelter rest points, the (300,400) lookout.
  const stones = road.group.children.filter(child => child.name.startsWith('switchback-mileage-'));
  assert.ok(stones.length >= 14, `mileage stones every 250 m: ${stones.length} posts`);
  assert.ok(road.benches.length >= 4, `hairpin benches: ${road.benches.length}`);
  assert.equal(road.shelters.length, 2);
  assert.equal(road.platform.name, 'switchback-lookout-300-400');
  assert.ok(Math.abs(road.platform.position.y - 76.9) < 2, `lookout deck height ${road.platform.position.y.toFixed(1)}`);
  // Station timetable boards: texts verbatim from 总控《文本-缆车三站
  // 时刻牌-2026-11-22》 (canvas meshes only exist in a browser, so
  // the test pins the text constant itself).
  assert.equal(STATION_BOARD_TEXTS.length, 3);
  assert.equal(STATION_BOARD_TEXTS[0]!.title, '上山车');
  assert.equal(STATION_BOARD_TEXTS[0]!.lines[1], '晨钟后首班 · 日落前末班 · 夜里不开');
  assert.equal(STATION_BOARD_TEXTS[1]!.title, '中山站 · 上下通停');
  assert.equal(STATION_BOARD_TEXTS[2]!.title, '下山车');
  assert.equal(STATION_BOARD_TEXTS[2]!.lines[2], '末班看日头 · 落山前准有一班');
  assert.equal(road.boards.name, 'cable-station-boards');
  road.setNight(true);
  road.setNight(false);
  road.dispose();
  road.dispose();
});
