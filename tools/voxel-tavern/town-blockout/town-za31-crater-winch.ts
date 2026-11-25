import {
  BoxGeometry, BufferGeometry, CanvasTexture, CylinderGeometry, DataTexture, Group,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, NearestFilter, PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createMeteorCrater, meteorCraterFixturePlan, meteorCraterRimRadius } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'heightAt'>;
type Point = Readonly<{ east: number; north: number; height: number }>;

const fixture = createMeteorCrater(meteorCraterFixturePlan);
const shaftRadius = meteorCraterRimRadius / 30;
const sealedCoverRadius = shaftRadius + .03;
// Layout from the B-01 review: machinery origin, winch base and drum in east/south local axes.
const machineryEast = shaftRadius * 2.6;
const machinerySouth = shaftRadius * .5;
const winchEast = machineryEast - .62;
const winchSouth = machinerySouth + .72;
const drumHeight = .51;
const turn = Math.PI * 2;

/** The exterior survey uses the live terrain host. The shaft below its cover remains a separate registration. */
export function surveyZa31CraterWinch({ anchor, heightAt }: Road) {
  const c = Math.cos(anchor.yaw);
  const s = Math.sin(anchor.yaw);
  function onFloor(e: number, south: number): Point | undefined {
    const east = anchor.east + e * c - south * s;
    const north = anchor.north - south * c - e * s;
    const height = heightAt(east, north);
    if (height === undefined || !Number.isFinite(height) || Math.hypot(e, south) <= sealedCoverRadius) return;
    return { east, north, height };
  }

  const plinth = onFloor(winchEast, winchSouth);
  const crane = onFloor(machineryEast + .55, machinerySouth);
  const useFoot = onFloor(winchEast - 1.18, winchSouth + .10);
  // The story table specifies adjacency only. Preserve open ground for window B's eventual accepted point.
  const stoneSpace = onFloor(winchEast - .14, winchSouth + 1.91);
  const bend = onFloor(-3.4, 6);
  const trailEnd = fixture.mainTrailPoint(1);
  const outlet = onFloor(trailEnd.east, -trailEnd.north);
  if (!plinth || !crane || !useFoot || !stoneSpace || !bend || !outlet) return;

  // K-34 warning post (《设计-全图文字件总表》卡13): work-face edge
  // beside the descent approach (bend -> useFoot), 1.3 m off its
  // centreline, clear of the snake-stone reservation and the winch
  // foot. Optional: the winch never fails over a sign post.
  const warningPost = onFloor(-0.95, 2.79);

  return {
    plinth, crane, useFoot,
    axle: {
      ...plinth, height: plinth.height + drumHeight,
      bearing: ((anchor.yaw + Math.PI / 2) % turn + turn) % turn,
    },
    descentApproach: [outlet, bend, useFoot] as const,
    snakeStoneReservation: { ...stoneSpace, radius: 1.05 },
    warningPost,
  };
}

function pixelMetal(base: number, rust: number, pit: number) {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const patch = (Math.floor(x / 3) * 7 + Math.floor(y / 4) * 11) % 13;
    const streak = (x === 4 || x === 11) && (y + x) % 5 !== 0;
    const color = (x * 7 + y * 17) % 29 === 0 ? pit : patch <= 2 || streak ? rust : base;
    pixels.set([color >> 16, (color >> 8) & 255, color & 255, 255], 4 * (y * size + x));
  }
  const map = new DataTexture(pixels, size, size);
  map.minFilter = map.magFilter = NearestFilter;
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return new MeshStandardMaterial({ map, roughness: 1 });
}

/** Outdoor casing and handle only. No cover, collider, pickup, state or interaction listener. */
export function mountZa31CraterWinch(road: Road) {
  const survey = surveyZa31CraterWinch(road);
  if (!survey) return;
  const group = new Group();
  group.name = 'za31-crater-freestanding-winch';
  group.rotation.y = -road.anchor.yaw;
  group.position.set(survey.plinth.east, survey.plinth.height, -survey.plinth.north);
  const crank = new Group();
  crank.name = 'za31-crater-winch-crank';
  crank.position.y = drumHeight;
  group.add(crank);
  const iron = pixelMetal(0x2c3648, 0x8a4a34, 0x5d4630);
  const oldRust = pixelMetal(0x8a4a34, 0x5d4630, 0xa98a56);
  const stone = pixelMetal(0x8a8378, 0x5d4630, 0x2c3648);
  const darkWood = pixelMetal(0x5d4630, 0x44503c, 0x2c3648);
  const batches = new Map<Group, Map<MeshStandardMaterial, BufferGeometry[]>>();

  function piece(parent: Group, source: BufferGeometry, material: MeshStandardMaterial,
    x: number, y: number, z: number, tilt = 0) {
    const geometry = source.index ? source.toNonIndexed() : source;
    geometry.rotateZ(tilt).translate(x, y, z);
    let materials = batches.get(parent);
    if (!materials) batches.set(parent, materials = new Map());
    let parts = materials.get(material);
    if (!parts) materials.set(material, parts = []);
    parts.push(geometry);
    if (source !== geometry) source.dispose();
  }

  function box(parent: Group, material: MeshStandardMaterial, width: number, height: number, depth: number,
    x: number, y: number, z: number, tilt = 0) {
    piece(parent, new BoxGeometry(width, height, depth), material, x, y, z, tilt);
  }

  for (const x of [-.29, .29]) box(group, darkWood, .19, .07, .61, x, .035, 0);
  box(group, iron, .79, .19, .48, 0, .145, 0);
  for (const x of [-.27, .27]) {
    box(group, oldRust, .11, .43, .34, x, .39, 0);
    for (const z of [-.17, .17]) box(group, oldRust, .059, .04, .061, x, .25, z);
    piece(crank, new CylinderGeometry(.232, .232, .054, 12), oldRust, x * .86, 0, 0, Math.PI / 2);
  }
  piece(crank, new CylinderGeometry(.173, .173, .43, 12), iron, 0, 0, 0, Math.PI / 2);
  for (let i = 0; i < 6; i++) {
    piece(crank, new CylinderGeometry(.189, .189, .043, 10), oldRust, (i - 2.5) * .062, 0, 0, Math.PI / 2);
  }
  box(crank, oldRust, .11, .35, .10, -.35, .105, -.025);
  piece(crank, new CylinderGeometry(.054, .054, .29, 8), darkWood, -.46, .25, -.06, Math.PI / 2);

  const craneEast = .55 + .62, craneSouth = -.72;
  const craneRise = survey.crane.height - survey.plinth.height;
  box(group, stone, 1.10, .45, 1.25, craneEast, craneRise + .225, craneSouth);
  box(group, oldRust, .28, 1.50, .29, craneEast, craneRise + 1.14, craneSouth, .15);
  box(group, oldRust, 1.23, .25, .31, craneEast - .43, craneRise + 1.71, craneSouth, -.34);
  box(group, iron, .69, .20, .05, craneEast, craneRise + .37, craneSouth + .62);

  // Sign faces (K-34/K-35, 《设计-全图文字件总表》卡13): same
  // document-guarded textBoard pattern as the lamp room — browser-only
  // like drawSign; node tests see the blank boards.
  function textBoard(text: string, w: number, h: number, x: number, y: number, z: number,
    ry: number, bg: string, fg: string, border: string) {
    if (typeof document === 'undefined') return;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = Math.round(512 * h / w);
    const pen = canvas.getContext('2d');
    if (!pen) return;
    pen.fillStyle = bg;
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.strokeStyle = border;
    pen.lineWidth = 6;
    pen.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    pen.fillStyle = fg;
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
    group.add(face);
  }

  // K-34: warning post + board at the work-face edge. The post merges
  // into the winch's darkWood batch (no new draw); the board faces the
  // descent approach (toward the bend). Local coords: x = e - winchEast,
  // z = south - winchSouth (same frame as the crane above).
  if (survey.warningPost) {
    const postRise = survey.warningPost.height - survey.plinth.height;
    const postLX = -0.95 - winchEast, postLZ = 2.79 - winchSouth;
    box(group, darkWood, .12, 1.5, .12, postLX, postRise + .75, postLZ);
    const bendLX = -3.4 - winchEast, bendLZ = 6 - winchSouth;
    const postYaw = Math.atan2(bendLX - postLX, bendLZ - postLZ);
    const bx = postLX + Math.sin(postYaw) * .08, bz = postLZ + Math.cos(postYaw) * .08;
    textBoard('井口重地 · 稳绳慢放', .9, .3, bx, postRise + 1.18, bz, postYaw,
      '#d9c69c', '#3d2c1c', '#5d4630');
  }
  // K-35: cast letters on the winch body — a dark iron plate with pale
  // brass letters on the base box's approach face (local -x, toward the
  // useFoot where the player stands to turn the crank).
  textBoard('开井', .34, .12, -.40, .145, 0, -Math.PI / 2,
    '#2c3648', '#c8a86a', '#5d4630');
  for (const [parent, materials] of batches) {
    for (const [material, parts] of materials) {
      const merged = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
      parent.add(new Mesh(merged, material));
    }
  }
  return {
    group, survey,
    setCrankTurns(turns: number) {
      if (Number.isFinite(turns)) crank.rotation.x = -turns * turn;
    },
  };
}
