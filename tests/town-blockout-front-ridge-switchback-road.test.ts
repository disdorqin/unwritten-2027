import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Group, InstancedMesh, Mesh, type Material } from 'three';
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
  assert.equal(lamps.length, 1, 'all fog-lamp cores share one instanced render mesh');
  assert.ok(lamps[0] instanceof InstancedMesh && lamps[0].count >= 30,
    `fog lamp chain has ${lamps[0] instanceof InstancedMesh ? lamps[0].count : 0} lamps`);
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

test('switchback static batching preserves canvas landmarks and cuts render meshes below 60', () => {
  const previousDocument = globalThis.document;
  const drawnText: string[] = [];
  const context = {
    fillStyle: '', strokeStyle: '', lineWidth: 0, textAlign: '', font: '',
    fillRect() {}, strokeRect() {}, fillText(text: string) { drawnText.push(text); },
  };
  Reflect.set(globalThis, 'document', {
    createElement(tag: string) {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext: () => context };
    },
  });
  const road = (() => {
    try {
      return createFrontRidgeSwitchbackRoad();
    } finally {
      if (previousDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
      else Reflect.set(globalThis, 'document', previousDocument);
    }
  })();
  try {
    const meshes: Mesh[] = [];
    road.group.traverse(object => { if (object instanceof Mesh) meshes.push(object); });
    assert.ok(meshes.length < 60, `render mesh count is ${meshes.length}, expected < 60`);
    assert.equal(meshes.length, 27, 'two ribbons, two instanced lamp meshes, two static batches and 21 canvas faces');
    const hasMap = (material: Material) => 'map' in material && Boolean(material.map);
    const canvasFaces = meshes.filter(mesh => !Array.isArray(mesh.material) && hasMap(mesh.material));
    assert.equal(canvasFaces.length, 21, '16 mileage faces, two direction signs and three station boards stay separate');
    assert.equal(drawnText.filter(text => text === '公里').length, 16);
    assert.ok(drawnText.includes('盘山道'));
    assert.ok(drawnText.includes('云海台'));
    for (const board of STATION_BOARD_TEXTS) {
      assert.ok(road.boards.getObjectByName(`station-board-${board.id}`) instanceof Mesh);
      assert.ok(drawnText.includes(board.title));
      for (const line of board.lines) assert.ok(drawnText.includes(line));
    }
    assert.ok(road.group.getObjectByName('switchback-start-sign') instanceof Mesh);
    assert.ok(road.group.getObjectByName('switchback-top-sign') instanceof Mesh);
    road.boards.traverse(object => {
      if (object instanceof Mesh) assert.ok(!Array.isArray(object.material) && hasMap(object.material));
    });
    assert.equal(meshes.filter(mesh => mesh.name.startsWith('switchback-static-batch-')).length, 2);
    assert.equal(meshes.filter(mesh => mesh.name.endsWith('-ribbon')).length, 2);

    const mileposts = road.group.children.filter(child => child.name.startsWith('switchback-mileage-'));
    assert.equal(mileposts.length, 16);
    for (const milepost of mileposts) {
      assert.ok(milepost instanceof Group);
      assert.equal(milepost.children.length, 0);
    }
    for (const bench of road.benches) assert.equal(bench.children.length, 0);
    for (const shelter of road.shelters) assert.equal(shelter.children.length, 0);
    assert.equal(road.platform.children.length, 0);

    const lamps = meshes.filter(mesh => mesh.name === 'switchback-fog-lamp');
    assert.equal(lamps.length, 1);
    assert.ok(lamps[0] instanceof InstancedMesh && lamps[0].count >= 30);
    const lampMaterial = lamps[0]!.material as Material & { color: { getHexString(): string } };
    const otherColors = new Map<Material, string>();
    for (const mesh of meshes) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (material !== lampMaterial && 'color' in material) {
          otherColors.set(material, (material.color as { getHexString(): string }).getHexString());
        }
      }
    }
    assert.equal(lampMaterial.color.getHexString(), '3a3230');
    road.setNight(true);
    assert.equal(lampMaterial.color.getHexString(), 'ffb45c');
    for (const [material, color] of otherColors) {
      assert.equal((material as Material & { color: { getHexString(): string } }).color.getHexString(), color);
    }
    road.setNight(false);
    assert.equal(lampMaterial.color.getHexString(), '3a3230');

    const disposals = new Map(meshes.map(mesh => {
      let count = 0;
      mesh.geometry.addEventListener('dispose', () => { count++; });
      return [mesh, () => count] as const;
    }));
    road.dispose();
    road.dispose();
    for (const [mesh, count] of disposals) assert.equal(count(), 1, `${mesh.name} geometry disposed once`);
  } finally {
    road.dispose();
  }
});

test('D-6 repair: hint-coherent heightAt never flips legs on stacked sections', () => {
  const road = createFrontRidgeSwitchbackRoad();
  // Resample a path (centreline or spur) at 0.25 m steps and walk it
  // with a hint chain, exactly like the fold-in re-measure: a flip is
  // a successive-sample jump over the 0.43 m walkable step.
  const walk = (
    points: readonly { east: number; north: number; height: number; cum: number }[],
    lateralOffset: number,
  ) => {
    let flips = 0, samples = 0, namedFlips = 0, centreFlips = 0;
    let hint: number | undefined;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!, b = points[i + 1]!;
      const segLen = b.cum - a.cum;
      const steps = Math.max(1, Math.round(segLen / 0.25));
      let dirE = b.east - a.east, dirN = b.north - a.north;
      const len = Math.hypot(dirE, dirN) || 1; dirE /= len; dirN /= len;
      for (let sIdx = (i === 0 ? 0 : 1); sIdx <= steps; sIdx++) {
        const t = sIdx / steps;
        const e = a.east + (b.east - a.east) * t - dirN * lateralOffset;
        const n = a.north + (b.north - a.north) * t + dirE * lateralOffset;
        const h = road.heightAt(e, n, hint);
        assert.notEqual(h, undefined, `hole at (${e.toFixed(1)}, ${n.toFixed(1)})`);
        if (hint !== undefined) {
          const step = Math.abs(h! - hint);
          if (step > 0.43) {
            flips++;
            if (lateralOffset === 0) centreFlips++;
            const nearToeCross = Math.hypot(e - 420.9, n - 460) < 8;
            const nearBaseLeg = e > 524 && e < 536 && n > 335 && n < 382;
            if (nearToeCross || nearBaseLeg) namedFlips++;
          }
        }
        hint = h;
        samples++;
      }
    }
    return { flips, samples, namedFlips, centreFlips };
  };
  let totalFlips = 0, totalSamples = 0, namedFlips = 0, centreFlips = 0;
  for (const offset of [-1.2, 0, 1.2]) {
    const main = walk(road.centreline, offset);
    totalFlips += main.flips; totalSamples += main.samples;
    namedFlips += main.namedFlips; centreFlips += main.centreFlips;
    const entry = walk(road.entryCentreline, offset);
    totalFlips += entry.flips; totalSamples += entry.samples;
    namedFlips += entry.namedFlips; centreFlips += entry.centreFlips;
  }
  // The fold-in acceptance walks the centreline: zero flips, and the
  // two sections A named ((420.9,460) crossing, E530 base leg) are
  // flip-free on the +-1.2 m band walks too. The band walks retain a
  // small residual at the tightest upper hairpins, where the offset
  // path itself leaves the walked leg's shoulder band and enters
  // the adjacent traverse's -- guarded here as a rate ceiling.
  assert.equal(centreFlips, 0, `centreline walk still flips ${centreFlips} times`);
  assert.equal(namedFlips, 0, 'named sections (420.9,460) / E530 leg still flip');
  assert.ok(totalFlips / totalSamples < 0.005,
    `band flip rate ${(100 * totalFlips / totalSamples).toFixed(3)}% over the 0.5% ceiling`);
  road.dispose();
});
