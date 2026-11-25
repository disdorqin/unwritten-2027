import {
  BoxGeometry, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DataTexture, Group,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, PlaneGeometry, PointLight,
  SRGBColorSpace, type Object3D,
} from 'three';
import type { Box } from './landmark-kit';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { hydrologySignLines } from '../../../src/shared/underground-water.js';

type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;

/**
 * 卡06 · the shaft-head lamp room (design: crater volume card 06;
 * build assigned to window C, 2026-11-24). A wood-iron hut at the
 * winch workface: a rack wall of miners' lamps with visibly empty
 * slots, the take-lamp registration grid, an oil corner, rope hooks
 * and the vent stub to the shaft. It hosts the lamp ledger's physical
 * end (issue/return wiring is the presence package) and carries the
 * hydrology sign — tonight's river water, posted before a descent.
 *
 * Local frame matches the winch group: x = fixture east, z = fixture
 * south, origin at the hut centre on the ground. The door faces +x,
 * toward the winch and the shaft.
 */

const fixtureCentre = { east: -10, south: 10 };
const hutWidth = 4.6;   // fixture east
const hutDepth = 3.4;   // fixture south
const wallHeight = 2.3;
const wallThick = .18;

const palette = {
  timber: 0x4a3826, timberDark: 0x3a2c1e, stone: 0x6d6562, iron: 0x3c4148,
  rust: 0x8a5a34, glass: 0xffc37a, duct: 0x4a6b52, rope: 0xa98f63,
  paper: 0xd8d2c2, oil: 0x1f1a14, book: 0x6e2f26,
};

function pixelMaterial(base: number, fleck: number, seed: number) {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  const b = new Color(base), f = new Color(fleck), out = new Color();
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = (x * 7 + y * 13 + seed) % 11;
    out.copy(b).lerp(f, grain <= 1 ? .5 : grain <= 4 ? .18 : 0);
    pixels.set([out.r * 255, out.g * 255, out.b * 255, 255], (y * size + x) * 4);
  }
  const map = new DataTexture(pixels, size, size);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 1 });
}

const timber = pixelMaterial(palette.timber, palette.rust, 31);
const timberDark = pixelMaterial(palette.timberDark, palette.timber, 47);
const stone = pixelMaterial(palette.stone, palette.timber, 71);
const iron = pixelMaterial(palette.iron, palette.rust, 97);
const ductMat = pixelMaterial(palette.duct, palette.iron, 113);
const glassMat = new MeshStandardMaterial({
  color: palette.glass, emissive: palette.glass, emissiveIntensity: 1.15, roughness: .4,
});
const darkGlass = new MeshStandardMaterial({ color: 0x5a5148, roughness: .6 });

function box(parent: Object3D, material: MeshStandardMaterial, w: number, h: number, d: number,
  x: number, y: number, z: number, ry = 0) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}

function lamp(parent: Group, x: number, y: number, z: number, lit: boolean) {
  const g = new Group();
  g.position.set(x, y, z);
  const body = new Mesh(new CylinderGeometry(.075, .085, .17, 8), iron);
  body.position.y = -.02;
  g.add(body);
  const shade = new Mesh(new CylinderGeometry(.055, .062, .1, 8), lit ? glassMat : darkGlass);
  shade.position.y = -.02;
  g.add(shade);
  box(g, iron, .03, .09, .03, -.05, .1, 0);
  box(g, iron, .03, .09, .03, .05, .1, 0);
  box(g, iron, .13, .03, .03, 0, .15, 0);
  parent.add(g);
  return g;
}

export function mountZa31CraterLampRoom(road: Road) {
  const survey = surveyZa31CraterWinch(road);
  if (!survey) return;
  const { anchor } = road;
  const c = Math.cos(anchor.yaw), s = Math.sin(anchor.yaw);
  const centreEast = anchor.east + fixtureCentre.east * c - fixtureCentre.south * s;
  const centreNorth = anchor.north - fixtureCentre.south * c - fixtureCentre.east * s;
  const ground = road.heightAt(centreEast, centreNorth);
  if (ground === undefined) return;

  const group = new Group();
  group.name = 'za31-crater-lamp-room';
  group.position.set(centreEast, ground, -centreNorth);
  group.rotation.y = -anchor.yaw;

  // Stone base and timber walls. The east wall carries the door
  // (1.2 m, z -1.25..-0.05) and the issue window (z 0.35..1.65,
  // sill at 1.0) — the gaps below stay open in the collider set too.
  box(group, stone, hutWidth + .3, .18, hutDepth + .3, 0, .09, 0);
  box(group, timber, wallThick, wallHeight, hutDepth, -hutWidth / 2, wallHeight / 2 + .18, 0);
  box(group, timber, hutWidth, wallHeight, wallThick, 0, wallHeight / 2 + .18, -hutDepth / 2);
  box(group, timber, hutWidth, wallHeight, wallThick, 0, wallHeight / 2 + .18, hutDepth / 2);
  const ex = hutWidth / 2;
  box(group, timber, wallThick, wallHeight, .45, ex, wallHeight / 2 + .18, -1.475);
  box(group, timber, wallThick, wallHeight, .4, ex, wallHeight / 2 + .18, .15);
  box(group, timber, wallThick, wallHeight, .05, ex, wallHeight / 2 + .18, 1.675);
  box(group, timber, wallThick, .25, 1.2, ex, 2.18 + .18, -.65);       // door lintel
  box(group, timber, wallThick, 1.0, 1.3, ex, .5 + .18, 1.0);          // window sill wall
  box(group, timber, wallThick, .4, 1.3, ex, 2.1 + .18, 1.0);          // window header
  box(group, iron, .06, 1.9, .05, ex, 1.13 + .18, .35);
  box(group, iron, .06, 1.9, .05, ex, 1.13 + .18, 1.65);
  // Open door leaf, swung out against the front wall.
  const leaf = box(group, timberDark, .08, 2.0, 1.15, ex + .34, 1.18, -1.62, .5);
  box(leaf, iron, .09, .08, 1.0, 0, .5, 0);
  box(leaf, iron, .09, .08, 1.0, 0, -.5, 0);
  // Issue counter shelf with a ready lamp and the registration book.
  box(group, timberDark, .5, .06, 1.4, ex - .1, 1.02, 1.0);
  lamp(group, ex - .1, 1.32, .62, true);
  box(group, new MeshStandardMaterial({ color: palette.book, roughness: .9 }),
    .34, .05, .26, ex - .12, 1.08, 1.35, .3);

  // Gabled roof: two iron-sheet slabs, ridge along x, snow streak on
  // the north slope only (ref-01: snow lies in streaks, never a coat).
  const roofMat = pixelMaterial(0x4c443c, palette.rust, 131);
  for (const side of [-1, 1]) {
    const slab = box(group, roofMat, hutWidth + .5, .07, 2.15, 0, 2.86, side * .92);
    slab.rotation.x = side * .42;
  }
  box(group, timberDark, hutWidth + .54, .09, .12, 0, 3.32, 0);
  for (const end of [-1, 1]) {
    // Stepped gable infill under the ridge.
    box(group, timber, .12, .55, 1.7, end * (hutWidth / 2), 2.55, 0);
    box(group, timber, .12, .5, .9, end * (hutWidth / 2), 3.0, 0);
  }
  const snowStrip = box(group, new MeshStandardMaterial({ color: 0xdfe6ee, roughness: 1 }),
    hutWidth * .6, .03, .5, -.4, 3.06, -1.28);
  snowStrip.rotation.x = -.42;

  // Window A fill (K-21/22/23, 《设计-全图文字件总表》): text faces on
  // the three boards left blank above. Same board style as the
  // hydrology sign below (dark timber, brass border, off-white text);
  // browser-only like drawSign — node tests see the blank boards.
  function textBoard(parent: Object3D, text: string, w: number, h: number,
    x: number, y: number, z: number, ry = 0) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.round(512 * h / w);
    const pen = canvas.getContext('2d');
    if (!pen) return;
    pen.fillStyle = '#4a3826';
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.strokeStyle = '#a98a56';
    pen.lineWidth = 6;
    pen.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    pen.fillStyle = '#e8ecf0';
    pen.textAlign = 'center';
    pen.textBaseline = 'middle';
    pen.font = `bold ${Math.round(canvas.height * .52)}px "Noto Sans SC", sans-serif`;
    pen.fillText(text, canvas.width / 2, canvas.height / 2 + 2, canvas.width - 48);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    const face = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: texture }));
    face.position.set(x, y, z);
    face.rotation.y = ry;
    parent.add(face);
  }

  // The rack wall (west interior): two shelves, ten slots — six lamps
  // in, four visibly out. Empty slots keep their peg and dust mark.
  const rack = new Group();
  rack.position.set(-hutWidth / 2 + .16, 0, 0);
  group.add(rack);
  box(rack, timberDark, .08, 1.85, 3.0, 0, 1.25, 0);
  const filled = [true, true, false, true, false, true, false, true, true, false];
  for (let row = 0; row < 2; row++) {
    const y = row === 0 ? 1.98 : 1.18;
    box(rack, timberDark, .22, .05, 3.0, .1, y - .3, 0);
    for (let col = 0; col < 5; col++) {
      const z = -1.2 + col * .6;
      box(rack, iron, .05, .12, .05, .12, y + .12, z);
      if (filled[row * 5 + col]) lamp(rack, .14, y, z, true);
      else box(rack, new MeshStandardMaterial({ color: 0x2e2822, roughness: 1 }),
        .02, .3, .34, .045, y - .02, z);
    }
  }
  // Rack sign board — face left blank for window A's K-23.
  box(rack, timberDark, .04, .22, .62, .06, 2.32, 0);
  textBoard(rack, '灯不离手', .58, .18, .085, 2.32, 0, Math.PI / 2);

  // Registration grid (north interior): framed cells, one paper sheet,
  // header board above left blank for window A's K-22.
  const grid = new Group();
  grid.position.set(-.4, 0, -hutDepth / 2 + .13);
  group.add(grid);
  box(grid, timberDark, 1.5, .95, .04, 0, 1.45, 0);
  const paperMat = new MeshStandardMaterial({ color: palette.paper, roughness: 1 });
  for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) {
    box(grid, paperMat, .32, .24, .015, -.55 + col * .37, 1.18 + row * .29, .03);
  }
  box(grid, timberDark, .82, .24, .04, 0, 2.12, 0);
  textBoard(grid, '取灯登记', .78, .2, 0, 2.12, .026);
  // Room sign board over the door (outside) — blank for A's K-21. The
  // board projects east above the door, broad faces north/south, so
  // K-21 is lettered on both faces.
  box(group, timberDark, .95, .36, .05, ex + .06, 2.62, -.65);
  textBoard(group, '灯房', .9, .31, ex + .06, 2.62, -.65 + .028);
  textBoard(group, '灯房', .9, .31, ex + .06, 2.62, -.65 - .028, Math.PI);

  // Oil corner (south interior): pots, wick jar, bench, floor stain.
  const oilMat = pixelMaterial(0x44503e, palette.rust, 149);
  box(group, timberDark, 1.1, .08, .5, 1.55, .5, hutDepth / 2 - .42);
  for (const [px, pz] of [[1.3, 1.28], [1.75, 1.22]] as const) {
    const pot = new Mesh(new CylinderGeometry(.15, .17, .32, 10), oilMat);
    pot.position.set(px, .7, pz);
    group.add(pot);
  }
  const jar = new Mesh(new CylinderGeometry(.09, .09, .16, 8), darkGlass);
  jar.position.set(1.55, .62, 1.02);
  group.add(jar);
  const stain = new Mesh(new CircleGeometry(.55, 20),
    new MeshStandardMaterial({ color: palette.oil, roughness: 1 }));
  stain.rotation.x = -Math.PI / 2;
  stain.position.set(1.5, .185, 1.15);
  group.add(stain);
  const stain2 = stain.clone();
  stain2.scale.setScalar(.6);
  stain2.position.set(-1.7, .185, .3);
  group.add(stain2);

  // Rope hooks + one coil (south interior wall).
  for (let i = 0; i < 3; i++) box(group, iron, .05, .18, .12, -.9 + i * .5, 1.7, hutDepth / 2 - .16);
  const coil = new Mesh(new CylinderGeometry(.27, .27, .09, 14, 1, true),
    new MeshStandardMaterial({ color: palette.rope, roughness: 1 }));
  coil.position.set(-.4, 1.52, hutDepth / 2 - .2);
  group.add(coil);

  // Vent stub on the east exterior, pointing at the shaft: an interface,
  // not a run — the duct proper belongs to the shaft-head facility.
  const flange = box(group, iron, .3, .5, .5, ex + .1, 1.5, -.65);
  flange.rotation.z = 0;
  const stub = new Mesh(new CylinderGeometry(.13, .13, .55, 10), ductMat);
  stub.rotation.z = Math.PI / 2;
  stub.position.set(ex + .42, 1.5, -.65);
  group.add(stub);

  // The warm end of the crater light chain: one real light at the door.
  const doorLight = new PointLight(0xffb45e, 7, 7.5, 1.8);
  doorLight.position.set(ex + .7, 2.1, -.65);
  group.add(doorLight);

  // Hydrology sign outside the door: tonight's water, tomorrow's
  // forecast — the text is generated, the board redraws per night.
  let nightOrdinal = 0;
  const signGroup = new Group();
  signGroup.position.set(ex + 1.5, 0, -.65);
  group.add(signGroup);
  box(signGroup, timberDark, .09, 1.7, .09, 0, .85, -.55);
  box(signGroup, timberDark, .09, 1.7, .09, 0, .85, .55);
  const signBoard = box(signGroup, timber, 1.34, .98, .06, 0, 1.32, 0);
  signBoard.rotation.y = Math.PI / 2;
  let signFace: Mesh<PlaneGeometry, MeshBasicMaterial> | undefined;
  function drawSign() {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 192;
    const pen = canvas.getContext('2d');
    if (!pen) return;
    pen.fillStyle = '#4a3826';
    pen.fillRect(0, 0, 256, 192);
    pen.strokeStyle = '#a98a56';
    pen.lineWidth = 4;
    pen.strokeRect(6, 6, 244, 180);
    pen.fillStyle = '#e8ecf0';
    pen.textAlign = 'center';
    const lines = hydrologySignLines(nightOrdinal);
    pen.font = 'bold 34px sans-serif';
    pen.fillText(lines[0]!, 128, 48);
    pen.font = '24px sans-serif';
    pen.fillText(lines[1]!, 128, 92);
    pen.fillText(lines[2]!, 128, 128);
    pen.font = '20px sans-serif';
    pen.fillText(lines[3]!, 128, 164);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = texture.magFilter = NearestFilter;
    texture.generateMipmaps = false;
    if (!signFace) {
      signFace = new Mesh(new PlaneGeometry(1.26, .9),
        new MeshBasicMaterial({ map: texture }));
      signFace.position.set(.045, 1.32, 0);
      signFace.rotation.y = Math.PI / 2;
      signGroup.add(signFace);
    } else {
      signFace.material.map = texture;
      signFace.material.needsUpdate = true;
    }
  }
  drawSign();

  // Wall colliders in the road frame, from the same segment layout as
  // the visual walls (door gap and window opening stay open).
  const boxes: Box[] = [];
  const seg = (lx: number, lz: number, w: number, d: number, h: number, base = 0) => {
    const wx = centreEast + lx * c - lz * s;
    const wz = centreNorth - lz * c - lx * s;
    const ac = Math.abs(c), as = Math.abs(s);
    const ww = ac * w + as * d, dd = as * w + ac * d;
    boxes.push({
      min: [wx - ww / 2, ground + base, -wz - dd / 2],
      max: [wx + ww / 2, ground + base + h, -wz + dd / 2],
    });
  };
  seg(-hutWidth / 2, -.85, wallThick, 1.7, wallHeight);
  seg(-hutWidth / 2, .85, wallThick, 1.7, wallHeight);
  seg(-1.15, -hutDepth / 2, 2.3, wallThick, wallHeight);
  seg(1.15, -hutDepth / 2, 2.3, wallThick, wallHeight);
  seg(-1.15, hutDepth / 2, 2.3, wallThick, wallHeight);
  seg(1.15, hutDepth / 2, 2.3, wallThick, wallHeight);
  seg(ex, -1.475, wallThick, .45, wallHeight);
  seg(ex, .15, wallThick, .4, wallHeight);
  seg(ex, 1.0, wallThick, 1.3, 1.0);            // window sill
  seg(ex + 1.5, -.65, .5, 1.3, 1.7);            // hydrology sign

  return {
    group,
    site: { east: centreEast, north: centreNorth, height: ground },
    footprint: { east: centreEast, north: centreNorth, radius: 3.3 },
    boxes,
    setNightOrdinal(next: number) { nightOrdinal = next; drawSign(); },
    signLines: () => hydrologySignLines(nightOrdinal),
  };
}
