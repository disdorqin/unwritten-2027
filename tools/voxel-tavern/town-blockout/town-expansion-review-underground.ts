import * as THREE from 'three';
import { createUndergroundEntry, type UndergroundEntryPoint } from '../../../src/presence/underground-entry.js';
import { createMeteorCrater, meteorCraterRimRadius } from './meteor-crater.js';
import { createUndergroundMineLayout, type UndergroundMineSpec } from './underground-mine-layout.js';
import type { ExpansionView } from './town-expansion-review-renderer.js';

// Relative review fixtures only. Production coordinates, grade limits, and dimensions come from the host.
const crater = createMeteorCrater({
  terraces: [
    { outerRadius: 50, innerRadius: 46, depth: 7 },
    { outerRadius: 41, innerRadius: 37, depth: 16 },
    { outerRadius: 32, innerRadius: 27, depth: 26 },
  ],
  mainTrail: { startBearing: .7, turns: 3.5, halfWidth: 1, shoulderWidth: 1, maxGrade: .1 },
});
const mineSpec: UndergroundMineSpec = {
  pool: { length: 4, width: 6, depth: 1.2 },
  shoreLength: 8,
  gallery: { length: 20, drop: 1, railGauge: 1, railWidth: .08 },
  collapse: { length: 3, width: 1.2, height: 1.3 },
  camp: { length: 10, side: 'right', extension: 5 },
  walker: { radius: .27, standingHeight: 1.8, crouchingHeight: 1.1, maxGrade: .2 },
};

function craterModel() {
  const group = new THREE.Group();
  const vertices: number[] = [];
  const faces: number[] = [];
  const rings = 60;
  const subdivisions = 128;
  for (let ring = 0; ring <= rings; ring++) {
    const radius = ring * meteorCraterRimRadius / rings;
    for (let spoke = 0; spoke < subdivisions; spoke++) {
      const angle = spoke * 2 * Math.PI / subdivisions;
      const east = radius * Math.sin(angle);
      const north = radius * Math.cos(angle);
      vertices.push(east, crater.heightOffsetAt(east, north) ?? 0, -north);
      if (ring <= 2) continue;
      const nextSpoke = (spoke + 1) % subdivisions;
      const a = (ring - 1) * subdivisions + spoke;
      const b = ring * subdivisions + spoke;
      const c = ring * subdivisions + nextSpoke;
      const d = (ring - 1) * subdivisions + nextSpoke;
      faces.push(a, c, b);
      if (ring > 1) faces.push(a, d, c);
    }
  }
  const bowl = new THREE.BufferGeometry();
  bowl.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  bowl.setIndex(faces);
  bowl.computeVertexNormals();
  group.add(new THREE.Mesh(bowl, new THREE.MeshStandardMaterial({ color: 0x7c8791, side: THREE.DoubleSide })));

  const path = Array.from({ length: 241 }, (_, index) => {
    const { east, north, heightOffset } = crater.mainTrailPoint(index / 240);
    return new THREE.Vector3(east, heightOffset + .4, -north);
  });
  group.add(new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(path),
    new THREE.LineBasicMaterial({ color: 0xf0bd73 }),
  ));
  const radius = 2 * meteorCraterRimRadius / rings;
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 5, subdivisions, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x26303a, side: THREE.DoubleSide }),
  );
  shaft.position.y = -37.5;
  group.add(shaft);
  return { group, radius };
}

function mineModel(mine: ReturnType<typeof createUndergroundMineLayout>) {
  const group = new THREE.Group();
  for (const [name, vertices] of Object.entries(mine.mesh)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const colors = { rock: 0x756d64, rail: 0xcab8a3, water: 0x477f9b };
    const water = name === 'water';
    const material = new THREE.MeshStandardMaterial({
      color: colors[name as keyof typeof colors], transparent: water, opacity: water ? .7 : 1,
    });
    group.add(new THREE.Mesh(geometry, material));
  }
  const fireMarker = new THREE.Mesh(new THREE.SphereGeometry(.38, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfcaa56 }));
  const [x, y, z] = mine.anchors.campRecovery.position;
  fireMarker.position.set(x, y + .38, z);
  group.add(fireMarker);
  return group;
}

export function createUndergroundReview(show: (view: ExpansionView) => void) {
  const outside = craterModel();
  const mine = createUndergroundMineLayout(mineSpec);
  const inside = mineModel(mine);
  const player = 'review';
  const dryShaft: UndergroundEntryPoint = { east: 0, north: 0, height: -35 };
  const [poolEast, poolHeight, poolZ] = mine.anchors.poolLanding;
  const pool: UndergroundEntryPoint = { east: poolEast, north: -poolZ, height: poolHeight };
  const depthLine = (dryShaft.height + pool.height) / 2;
  const cover = new THREE.Mesh(
    new THREE.CylinderGeometry(outside.radius + .03, outside.radius + .03, .22, 128),
    new THREE.MeshStandardMaterial({ color: 0x514539 }),
  );
  cover.position.y = dryShaft.height + .12;
  outside.group.add(cover);

  let atWinch = false;
  let atPool = false;
  let status = '沿标线查看三层坑体与螺旋下行路线。';
  const entry = createUndergroundEntry({
    depthLine, firstFallLanding: pool,
    canUseWinch: () => atWinch,
    canBoardCage: (_, direction) => direction === 'down' ? atWinch : atPool,
    isDepthLineCrossing: point => Math.hypot(point.east, point.north) <= 2,
    isFirstFallPool: point => point.east === pool.east && point.north === pool.north && point.height === pool.height,
    save: () => undefined,
  });

  function descend(first: boolean) {
    if (!first && entry.requestCageRide(player, 'down').kind !== 'ride-cage') return;
    const changed = entry.confirmDepthCrossing(player, dryShaft, pool);
    if (!changed) {
      status = '深度线未通过，位置维持原层。';
      render();
      return;
    }
    const landed = first ? entry.confirmFirstFallLanding(player, pool) : undefined;
    atPool = true;
    status = landed ? '已过深度线。首坠抵达井底潭，坠落伤害 0。' : '吊笼下行已过深度线，回到井底潭。';
    render();
  }

  function ascend() {
    if (entry.requestCageRide(player, 'up').kind !== 'ride-cage') return;
    if (!entry.confirmDepthCrossing(player, pool, dryShaft)) return;
    atPool = false;
    status = '吊笼上行已过深度线，回到坑底，盖板保持开启。';
    render();
  }

  function walkToCamp() {
    const { radius, standingHeight, crouchingHeight } = mineSpec.walker;
    const [crouchFrom, crouchTo] = mine.crouchInterval;
    const sampleSteps = 32;
    let sampled = 0;
    const pass = mine.route.every(({ from, to }) => {
      for (let step = 0; step <= sampleSteps; step++) {
        const t = step / sampleSteps;
        const x = from[0] + (to[0] - from[0]) * t;
        const z = from[2] + (to[2] - from[2]) * t;
        const height = z >= crouchFrom && z <= crouchTo ? crouchingHeight : standingHeight;
        if (!mine.queryPassage(x, z, radius, height)) return false;
        sampled++;
      }
      return true;
    });
    if (pass) atPool = false;
    status = pass ? '首段 ' + sampled + ' 个脚点通过，低缝蹲行，终点为营地恢复点。' : '首段碰撞校验发现阻塞。';
    render();
  }

  function render() {
    if (entry.modeOf(player) === 'survival') {
      const followed = atPool ? mine.anchors.poolLanding : mine.anchors.campRecovery.position;
      show({
        group: inside, target: new THREE.Vector3(followed[0], followed[1], followed[2]), span: atPool ? 20 : 16,
        location: atPool ? '矿洞首段 · 井底潭' : '矿洞首段 · 营地', status,
        actions: atPool ? [['检查主巷至营地', walkToCamp], ['乘吊笼返回坑底', ascend]]
          : [['返回井底潭走查点', () => { atPool = true; status = '已切回井底潭走查点。'; render(); }]],
      });
      return;
    }
    const { coverVisible } = entry.sceneState();
    cover.visible = coverVisible;
    show({
      group: outside.group, target: new THREE.Vector3(0, atWinch ? -26 : -14, 0), span: atWinch ? 54 : 129,
      location: atWinch ? '陨星原坑底 · 井口' : '陨星原 · 三层环台', status,
      actions: !atWinch ? [['查看坑底绞盘', () => { atWinch = true; status = '已选择坑底绞盘走查点，地面仍为和平模式。'; render(); }]]
        : coverVisible ? [['转绞盘并走查首坠', () => { if (entry.openWell(player).kind === 'opened') descend(true); }]]
        : [['乘吊笼下井', () => descend(false)]],
    });
  }

  return { show: render };
}
