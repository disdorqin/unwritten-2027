import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedMesh, Mesh, MeshLambertMaterial, Object3D } from 'three';
import { fireWarmthRadius } from './town-campfires';
import { forestChopRange } from './town-forest-campfire';
import type { Box, Ramp } from './landmark-kit';
import { addLandmarkNameplate } from './landmark-label';

type Point = readonly [east: number, north: number];
type Ground = { heightAt(east: number, north: number): number };
type Rect = { west: number; east: number; south: number; north: number };
type Piece = { x: number; y: number; n: number; w: number; h: number; d: number; color: string };

export const pineCampSites = {
  northGate: [425, 243, 26],
  westGate: [399, 189],
  fire: [418, 225],
  cabin: [424, 233],
  supplies: [426, 172],
  formation: [415, 165],
  northSign: [419, 238],
  treasureSign: [428, 305],
  treasure: [430, 320],
} as const;

// §1.4: six evenly spaced sites on the north edge; three along the north gate display row.
export const pineDisplaySnowmen: readonly Point[] = [
  ...Array.from({ length: 6 }, (_, index) => [406 + (424 - 406) * index / 5, 176] as const),
  [423, 238], [421.5, 234], [420, 230],
];
const formationBounds: Rect = { west: 404, east: 428, south: 152, north: 178 };
const treasureTrail: readonly Point[] = [[418, 225], [420, 250], [424, 275], [427, 298], [430, 320]];
const gateEntry: readonly Point[] = [[425, 243], [419, 238], [418, 225]];

// Match the village cabin and plaza board/arch timber, snow and rough stone palettes.
const wood = '#744737', beam = '#422e2e', lighterWood = '#975745', snow = '#e4edf6';
const slate = '#4b5066', stone = '#777d8a', paper = '#c5a57a';
const board = { width: 3.15, height: .63, cap: 3.26, post: .18 };
const [fireX, fireN] = pineCampSites.fire;
// Keep the old dwelling to the southwest. The southern edge starts at the approved woodpile's east coordinate.
const fireDeck: readonly Rect[] = [
  { west: fireX - fireWarmthRadius, east: fireX + fireWarmthRadius, south: fireN, north: fireN + fireWarmthRadius },
  { west: fireX - 1.50, east: fireX + fireWarmthRadius, south: fireN - fireWarmthRadius, north: fireN },
];

function inRect(x: number, n: number, radius: number, rect: Rect) {
  return Math.hypot(Math.max(rect.west - x, x - rect.east, 0),
    Math.max(rect.south - n, n - rect.north, 0)) <= radius;
}

function lineDistance(x: number, north: number, a: Point, b: Point) {
  const dx = b[0] - a[0], dn = b[1] - a[1];
  const progress = Math.max(0, Math.min(1, ((x - a[0]) * dx + (north - a[1]) * dn) / (dx * dx + dn * dn)));
  return Math.hypot(x - a[0] - progress * dx, north - a[1] - progress * dn);
}

function groundExtremes(grid: Ground, { west, east, south, north }: Rect) {
  const axes = (lo: number, hi: number) =>
    [lo, ...Array.from({ length: Math.max(0, Math.ceil(hi) - Math.ceil(lo)) }, (_, i) => Math.ceil(lo) + i), hi];
  let low = Infinity, high = -Infinity;
  for (const x of axes(west, east)) for (const n of axes(south, north)) {
    const y = grid.heightAt(x, n);
    low = Math.min(low, y);
    high = Math.max(high, y);
  }
  return { low, high };
}

function makeBatch(group: Group, name: string, pieces: readonly Piece[]) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), pieces.length);
  mesh.name = name;
  const pose = new Object3D();
  const color = new Color();
  pieces.forEach(({ x, y, n, w, h, d, color: tint }, index) => {
    pose.position.set(x, y, -n);
    pose.scale.set(w, h, d);
    pose.updateMatrix();
    mesh.setMatrixAt(index, pose.matrix);
    mesh.setColorAt(index, color.set(tint));
  });
  mesh.computeBoundingSphere();
  group.add(mesh);
  return mesh;
}

function disposeModel(group: Group) {
  group.traverse(node => {
    if (!(node instanceof Mesh)) return;
    node.geometry.dispose();
    if (node instanceof InstancedMesh) node.dispose();
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if ('map' in material) (material as MeshLambertMaterial).map?.dispose();
      material.dispose();
    }
  });
  group.clear();
}

function snowmanParts(x: number, n: number, ground: number, layers: 0 | 1 | 2 | 3,
  decorations?: { carrot: boolean; branches: boolean }, named = false) {
  // The three documented radii become square edge lengths of 2r.
  const completedTwoLayer = layers === 2 && (decorations !== undefined || named);
  const edges = completedTwoLayer ? [2 * 1.2, 2 * .5] : [2 * 1.2, 2 * .8, 2 * .5];
  const parts: Piece[] = [];
  const add = (dx: number, y: number, dn: number, w: number, h: number, d: number, color: string) =>
    parts.push({ x: x + dx, y: ground + y, n: n + dn, w, h, d, color });
  let top = 0;
  for (let i = 0; i < layers; i++) {
    const edge = edges[i];
    const pumpkin = i === edges.length - 1;
    add(0, top + edge / 2, 0, edge, edge, edge, pumpkin ? '#c66a24' : i === 1 ? '#edf4fa' : snow);
    if (pumpkin) {
      const pixel = edge / 8;
      const face = top + edge * .59;
      for (const side of [-1, 1]) add(side * edge * .24, face, edge / 2, pixel, pixel, pixel / 3, '#412e2e');
      add(0, face - .24 * edge, edge / 2, 3 * pixel, pixel, pixel / 3, '#613a26');
      add(0, top + edge + pixel / 2, 0, 2 * pixel, pixel, 2 * pixel, '#574f36');
    }
    top += edge;
  }
  if (layers >= 2) {
    const bodyBase = completedTwoLayer ? 0 : edges[0];
    const bodyRadius = edges[completedTwoLayer ? 0 : 1] / 2;
    for (const rise of [.40, .80]) add(0, bodyBase + rise, bodyRadius, .14, .14, .09, '#4e4651');
    if (decorations?.carrot) add(.32, bodyBase + .80, bodyRadius, .14, .14, .24, '#dc843b');
    if (decorations?.branches) {
      for (const side of [-1, 1]) {
        add(side * (bodyRadius + .12), bodyBase + .80, 0, .42, .09, .09, beam);
        add(side * (bodyRadius + .33), bodyBase + .93, 0, .09, .26, .09, wood);
      }
    }
  }
  return parts;
}

export function buildPineCamp(grid: Ground) {
  const group = new Group();
  group.name = '松林营地';
  const colliders: Box[] = [], floors: Box[] = [], ramps: Ramp[] = [];
  group.userData.colliders = colliders;
  group.userData.floors = floors;
  group.userData.ramps = ramps;
  const pieces: Piece[] = [];
  const reserves: Rect[] = [formationBounds, ...fireDeck];
  const add = (x: number, y: number, n: number, w: number, h: number, d: number, color: string) => {
    pieces.push({ x, y, n, w, h, d, color });
  };
  const box = (x: number, bottom: number, n: number, w: number, h: number, d: number): Box =>
    ({ min: [x - w / 2, bottom, -n - d / 2], max: [x + w / 2, bottom + h, -n + d / 2] });
  const reserve = (x: number, n: number, w: number, d: number) =>
    reserves.push({ west: x - w / 2, east: x + w / 2, south: n - d / 2, north: n + d / 2 });
  const solid = (x: number, y: number, n: number, w: number, h: number, d: number, color: string) => {
    add(x, y, n, w, h, d, color);
    colliders.push(box(x, y - h / 2, n, w, h, d));
  };

  // R6 comes first. Keep the 8 m course opening around the Y26 anchor and ground the jambs in existing land.
  const [gx, gn, startY] = pineCampSites.northGate;
  const r6Width = 8;
  for (const side of [-1, 1]) {
    const x = gx + side * (r6Width + .66) / 2;
    const foot = grid.heightAt(x, gn);
    const top = startY + 3.7;
    solid(x, foot + .18, gn, .66, .36, .66, stone);
    solid(x, (top + foot + .36) / 2, gn, .41, top - foot - .36, .41, lighterWood);
    add(x, startY + 3.48, gn, .56, .19, .58, '#c59b55');
  }
  solid(gx, startY + 3.66, gn, r6Width + 2 * .66, .31, .57, beam);
  add(gx, startY + 3.91, gn, r6Width + 2 * .66, .19, .67, slate);
  add(gx, startY + 4.04, gn, r6Width + 2 * .66, .14, .49, snow);
  addLandmarkNameplate(group, 'R6 北口', gx, startY + 3.63, -gn - .31, 1.54, .34, Math.PI, { background: '#603c38' });
  reserve(gx, gn, r6Width + 2 * .66, .67);

  const deck = fireDeck.map(rect => ({ rect, ...groundExtremes(grid, rect) }));
  const fireGround = Math.max(...deck.map(({ high }) => high));
  for (const { rect, low } of deck) {
    const { west, east, south, north } = rect;
    const depth = north - south, width = east - west;
    const x = (east + west) / 2, n = (north + south) / 2;
    const foundationDepth = Math.max(.18, fireGround - low);
    add(x, fireGround - foundationDepth / 2, n, width, foundationDepth, depth, stone);
    floors.push(box(x, fireGround - foundationDepth, n, width, foundationDepth, depth));
    // Snow stone pavers, on the same support plane as the fire and seats.
    const strip = .32;
    for (let edge = west; edge < east - 1e-8; edge += strip) {
      const paverWidth = Math.min(strip, east - edge);
      add(edge + paverWidth / 2, fireGround - .012, n, paverWidth, .024, depth,
        edge % .64 < .32 ? '#b4bdc8' : '#a3acb9');
    }
  }

  // A mesh strip follows each ramp's traversable support plane. Heights come from existing terrain at its outer end.
  const rampVertices: number[] = [];
  function approach(axis: 'x' | 'z', from: number, to: number, center: number, top = fireGround, half = fireWarmthRadius / 2) {
    const sample = axis === 'x' ? grid.heightAt(from, center) : grid.heightAt(center, -from);
    const far = Math.min(sample, top);
    if (far >= top) return;
    const low = Math.min(from, to), high = Math.max(from, to);
    const start = center - half, end = center + half;
    ramps.push(axis === 'x' ? { min: [low, far, -end], max: [high, top, -start], axis, ascending: from < to ? 1 : -1 } :
      { min: [start, far, low], max: [end, top, high], axis, ascending: from < to ? 1 : -1 });
    const v = (long: number, across: number, y: number) => axis === 'x' ? [long, y, -across] : [across, y, long];
    const a = v(from, start, far), b = v(from, end, far), c = v(to, end, top), d = v(to, start, top);
    rampVertices.push(...a, ...b, ...c, ...a, ...c, ...d, ...c, ...b, ...a, ...d, ...c, ...a);
    if (axis === 'x') reserve((low + high) / 2, center, high - low, half * 2);
    else reserve(center, -(low + high) / 2, half * 2, high - low);
  }
  const [northDeck, southDeck] = fireDeck;
  approach('x', northDeck.west - fireWarmthRadius, northDeck.west, (northDeck.south + northDeck.north) / 2);
  approach('x', northDeck.east + fireWarmthRadius, northDeck.east, fireN);
  approach('z', -southDeck.south + fireWarmthRadius, -southDeck.south, fireX);
  approach('z', -northDeck.north - fireWarmthRadius, -northDeck.north, fireX);

  function sign(x: number, n: number, text: string, scale = 1, label = true) {
    const y = grid.heightAt(x, n);
    for (const side of [-1, 1]) solid(x + side * board.width * scale / 3, y + .44 * scale, n,
      board.post * scale, .88 * scale, board.post * scale, beam);
    add(x, y + .93 * scale, n, board.width * scale, board.height * scale, .18 * scale, wood);
    add(x, y + 1.26 * scale, n, board.cap * scale, .08 * scale, .21 * scale, slate);
    if (label) addLandmarkNameplate(group, text, x, y + .93 * scale, -n + .099 * scale,
      board.width * .8 * scale, board.height * .72 * scale, 0, { background: '#603c38' });
    reserve(x, n, board.cap * scale, .21 * scale);
  }
  // Preserve the east-loop crossing. The two signposts beside the road are its visual entry jambs.
  const [entryX, entryN] = pineCampSites.westGate;
  for (const side of [-1, 1]) {
    const n = entryN + side * (7 + .66) / 2;
    const y = grid.heightAt(entryX, n);
    solid(entryX, y + .18, n, .66, .36, .66, stone);
    solid(entryX, y + 1.43, n, .41, 2.15, .41, wood);
  }
  // The entry plaque is raised above the walkable road rather than leaving a blocking sign in its middle.
  const entranceGround = grid.heightAt(entryX, entryN);
  add(entryX, entranceGround + 2.51, entryN, .49, .19, 7 + 2 * .66, beam);
  addLandmarkNameplate(group, '松林营地', entryX - .26, entranceGround + 2.51, -entryN, 1.54, .34,
    -Math.PI / 2, { background: '#603c38' });
  const [sx, sn] = pineCampSites.northSign;
  sign(sx, sn, '火塘 · 宝点', .5);
  sign(...pineCampSites.treasureSign, '宝点 · 回营', .5);
  sign(gx + r6Width / 2 + .66, gn, '', .5, false);

  function shelter([x, n]: Point, width: number, depth: number, h: number, storage: boolean) {
    const area = { west: x - width / 2, east: x + width / 2, south: n - depth / 2, north: n + depth / 2 };
    const { low, high } = groundExtremes(grid, area);
    const floor = Math.max(.18, high - low);
    add(x, high - floor / 2, n, width, floor, depth, stone);
    floors.push(box(x, high - floor, n, width, floor, depth));
    const [doorWidth, boardDepth] = [1.64, .24]; // Existing village timber opening and frame.
    const front = n - depth / 2;
    for (let offset = 0; offset < h; offset += .35) {
      const rise = Math.min(.34, h - offset), y = high + offset + rise / 2;
      const tint = offset % .7 < .35 ? wood : lighterWood;
      add(x, y, n + depth / 2 - boardDepth / 2, width, rise, boardDepth, tint);
      for (const side of [-1, 1]) add(x + side * (width - boardDepth) / 2, y, n, boardDepth, rise, depth, tint);
      if (offset > 2.26) add(x, y, front + boardDepth / 2, width, rise, boardDepth, tint);
      else for (const side of [-1, 1]) {
        const sideWidth = (width - doorWidth) / 2;
        add(x + side * (sideWidth + doorWidth) / 2, y, front + boardDepth / 2, sideWidth, rise, boardDepth, tint);
      }
    }
    colliders.push(box(x, high, n + depth / 2 - boardDepth / 2, width, h, boardDepth));
    for (const side of [-1, 1]) {
      colliders.push(box(x + side * (width - boardDepth) / 2, high, n, boardDepth, h, depth));
      const sideWidth = (width - doorWidth) / 2;
      colliders.push(box(x + side * (doorWidth + sideWidth) / 2, high, front + boardDepth / 2, sideWidth, h, boardDepth));
      for (const end of [-1, 1]) add(x + side * width / 2, high + h / 2, n + end * depth / 2, .24, h, .24, beam);
    }
    for (let step = 0; step < width / 2; step += .32) {
      const span = width + .46 - 2 * step;
      const y = high + h + .32 * (Math.round(step / .32) + .5);
      add(x, y, n, span, .32, depth + .54, slate);
      add(x, y + .21, n, span - .05, .13, depth + .59, snow);
    }
    // Walk-in use: lodge workbench or supply bins face out to the unobstructed centre aisle.
    const benchW = width - .48, benchDepth = .86;
    solid(x, high + .51, n + depth / 2 - benchDepth, benchW, 1.02, benchDepth, wood);
    add(x, high + 1.06, n + depth / 2 - benchDepth, benchW + .06, .13, benchDepth + .05, beam);
    for (const offset of [-benchW / 3, 0, benchW / 3]) {
      add(x + offset, high + 1.25, n + depth / 2 - benchDepth, .33, .25, .27, storage ? paper : slate);
    }
    if (!storage) {
      add(x + width / 3, high + h + width / 2, n + depth / 4, .55, 1.24, .55, stone);
      add(x + width / 3, high + h + width / 2 + .68, n + depth / 4, .68, .14, .68, snow);
    }
    // Two existing .9 m entry-tread lengths give a continuous approach instead of a tall first step.
    approach('z', -front + 2 * .9, -front, x, high, .98);
    addLandmarkNameplate(group, storage ? '物料棚' : '守火小屋', x, high + 2.43, -front + .14,
      1.54, .34, 0, { background: '#603c38' });
    reserve(x, n, width + .46, depth + .59);
  }
  // Use smaller bays of the existing 7.5 × 8.5 m village cabin kit to keep the R6 handoff lane unobstructed.
  shelter(pineCampSites.cabin, 7.5 / 3, 8.5 / 2, 3.2, false);
  shelter(pineCampSites.supplies, 7.5 / 2, 8.5 / 2, 3.2, true);
  if (rampVertices.length) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(rampVertices, 3));
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: '#afbac7' }));
    mesh.name = '营地火塘与木屋接坡';
    group.add(mesh);
  }

  const grillE = pineCampSites.fire[0] + 1.3, grillN = pineCampSites.fire[1];
  // Two forked stakes support the spit on the existing flame, leaving the sit approach free of a solid wall.
  for (const side of [-1, 1]) {
    const n = grillN + side * .42;
    add(grillE, fireGround + .44, n, .09, .88, .09, beam);
    for (const fork of [-1, 1]) add(grillE + fork * .07, fireGround + .95, n, .09, .19, .12, wood);
  }
  add(grillE, fireGround + .91, grillN, .06, .06, .99, paper);
  add(grillE, fireGround + .98, grillN, .25, .22, .42, '#bc7858');
  add(grillE, fireGround + .96, grillN - .25, .13, .17, .13, '#c98e61');
  add(grillE, fireGround + 1.02, grillN + .22, .15, .13, .14, '#c98e61');
  add(grillE + .115, fireGround + 1.018, grillN - .18, .02, .035, .039, beam);
  for (const offset of [-.15, 0, .15]) add(415, fireGround + .11, 227 + offset, .20, .22, .15, stone);

  for (const [x, n] of pineDisplaySnowmen) {
    const ground = grid.heightAt(x, n);
    pieces.push(...snowmanParts(x, n, ground, 3, { branches: true, carrot: false }));
    colliders.push(box(x, ground, n, 2.4, 5, 2.4));
    reserve(x, n, 2.4, 2.4);
    const labelNorth = n + 1.2 + .5;
    const plateGround = grid.heightAt(x, labelNorth);
    add(x, plateGround + .35, labelNorth, .18, .7, .18, beam);
    add(x, plateGround + .72, labelNorth, board.width / 3, board.height / 2, .12, paper);
    reserve(x, labelNorth, board.width / 3, .12);
  }
  makeBatch(group, '松林 · 方块设施与九座南瓜雪人', pieces);

  const prints: Piece[] = [];
  let travelled = 0, nextPrint = 6;
  for (let i = 1; i < treasureTrail.length; i++) {
    const a = treasureTrail[i - 1], b = treasureTrail[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (nextPrint <= travelled + length) {
      const fraction = (nextPrint - travelled) / length;
      const x = a[0] + (b[0] - a[0]) * fraction, n = a[1] + (b[1] - a[1]) * fraction;
      for (const side of [-1, 1]) {
        const px = x + side * .14, pn = n + side * .20;
        prints.push({ x: px, n: pn, y: grid.heightAt(px, pn) + .015, w: .17, h: .025, d: .27, color: '#a1b0be' });
      }
      nextPrint += 6;
    }
    travelled += length;
  }
  const footprints = makeBatch(group, '松林藏宝脚印', prints);
  footprints.visible = false;

  const formationGroup = new Group();
  formationGroup.name = '营地正在堆的雪人';
  group.add(formationGroup);
  const [playerX, playerN] = pineCampSites.formation;
  const playerGround = grid.heightAt(playerX, playerN);
  function setFormation(layers: 0 | 1 | 2 | 3, name?: string, decorations?: { carrot: boolean; branches: boolean }) {
    disposeModel(formationGroup);
    if (!layers) return;
    // A growing decoration must not trap the player standing where it appears.
    makeBatch(formationGroup, '成型方块雪人', snowmanParts(playerX, playerN, playerGround, layers, decorations, Boolean(name)));
    if (name && layers >= 2) {
      const n = playerN + 1.2 + .5;
      const y = grid.heightAt(playerX, n);
      makeBatch(formationGroup, '玩家雪人留名牌', [
        { x: playerX, y: y + .35, n, w: .18, h: .7, d: .18, color: beam },
        { x: playerX, y: y + .72, n, w: board.width / 3, h: board.height / 2, d: .12, color: paper },
      ]);
      addLandmarkNameplate(formationGroup, name, playerX, y + .72, -n - .07,
        board.width * .30, board.height * .45, Math.PI, { background: '#603c38' });
    }
  }

  return {
    group, sites: pineCampSites, snowmen: pineDisplaySnowmen, trailLength: travelled, footprintPairs: prints.length / 2,
    fireGroundAt(east: number, north: number) {
      return fireDeck.some(rect => inRect(east, north, 0, rect)) ? fireGround : undefined;
    },
    keepClear(east: number, north: number, radius: number) {
      if (reserves.some(rect => inRect(east, north, radius, rect))) return true;
      return [gateEntry, treasureTrail].some(route => route.slice(1).some((b, i) =>
        lineDistance(east, north, route[i], b) < radius + forestChopRange));
    },
    setFormation,
    setTreasureTrailVisible(visible: boolean) { footprints.visible = visible; },
  };
}
