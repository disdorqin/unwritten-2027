import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, LatheGeometry, Matrix4,
  Mesh, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createClayMetalPanel } from './clay-metal-panel.js';
import { createTownChronicleDoorRing } from './town-chronicle-door-ring.js';
import {skyCityInscribedPlate} from './sky-city-inscribed-plate';

type Point = readonly [x: number, y: number, z: number];
type Box = { x: number; y: number; z: number; width: number; height: number; depth: number };

const centerZ = -35;
const deckY = 13.8;
const deckRadius = 9.25;
const drumRadius = 5.35;
const stairInner = 6.48;
const stairOuter = 9.20;
const stairCenter = (stairInner + stairOuter) / 2;
const stairStart = -.14;
const stairEnd = 5.46;
const notchStart = 4.45;
const stairCount = 46;
const stairRise = deckY / stairCount;
const stairTurn = stairEnd / stairCount;
const bodyHeight = 1.76;
const stepHeight = .42;
const twoPi = 2 * Math.PI;
const gate: Point = [0, deckY, -36.75];

export const skyCityObservatory = { z: -40.2, domeBase: deckY + 3.21, dishPivot: deckY + 6.95 };
const dishRadius = 1.47;
const dishRim = .57;
const dishVector = new Vector3(.24, .69, .68).normalize();
const dishRotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dishVector);
const dishOrigin = new Vector3(0, skyCityObservatory.dishPivot, skyCityObservatory.z);

export function createSkyCitySignalDish(segments: number) {
  // Curve both faces of the shell so the rim and curvature read from either side.
  const profile = [
    [0, -.10], [.50, -.04], [1.01, .13], [dishRadius, .46],
    [dishRadius, dishRim], [1.01, .24], [.50, .07], [0, 0],
  ];
  const reflector = new LatheGeometry(profile.map(([radius, y]) => new Vector2(radius, y)), segments);
  return reflector.applyQuaternion(dishRotation).translate(...dishOrigin.toArray());
}

function polar(radius: number, theta: number, height: number): Point {
  return [radius * Math.sin(theta), height, centerZ + radius * Math.cos(theta)];
}

function thetaAt(x: number, z: number) {
  const theta = Math.atan2(x, z - centerZ);
  return theta < stairStart ? theta + twoPi : theta;
}

function treadAt(theta: number) {
  if (theta >= stairStart && theta <= stairEnd) {
    return Math.min(stairCount, Math.max(0, Math.floor((theta + .000001) / stairTurn) + 1)) * stairRise;
  }
}

/** One stone slab in the staircase's polar frame. Keeping the treads flat matches walk support. */
function wedge(inner: number, outer: number, from: number, to: number, top: number, thickness: number) {
  const corners = [polar(inner, from, top), polar(inner, to, top), polar(outer, to, top), polar(outer, from, top)];
  const vertices = [...corners, ...corners.map(([x, y, z]): Point => [x, y - thickness, z])];
  const triangles = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices.flat(), 3));
  geometry.setIndex(triangles);
  geometry.computeVertexNormals();
  return geometry;
}

export function buildSkyCityTower() {
  const group = new Group();
  group.name = 'sky-city-observation-tower';
  const solids: Box[] = [];
  const ivory = new MeshStandardMaterial({ color: '#e5dcc6', roughness: .91 });
  const chalk = new MeshStandardMaterial({ color: '#f3ebda', roughness: .93 });
  const mortar = new MeshStandardMaterial({ color: '#bdb5a3', roughness: 1 });
  const iron = new MeshStandardMaterial({ color: '#4b5950', roughness: .85, metalness: .24 });
  const bronze = new MeshStandardMaterial({ color: '#8b7858', roughness: .88, metalness: .27 });
  const shadow = new MeshStandardMaterial({ color: '#313d3d', roughness: .93 });
  const moss = new MeshStandardMaterial({ color: '#6b8350', roughness: 1 });
  const batches = new Map<MeshStandardMaterial, BufferGeometry[]>();

  const dishMotion=new Group(); dishMotion.name='sky-city-dish-motion-axis';
  dishMotion.position.copy(dishOrigin); group.add(dishMotion);
  let movingDish=false;
  function add(geometry: BufferGeometry, material: MeshStandardMaterial) {
    if(movingDish){const mesh=new Mesh(geometry,material);mesh.position.copy(dishOrigin).multiplyScalar(-1);dishMotion.add(mesh);return;}
    geometry.deleteAttribute('uv');
    const batch = batches.get(material);
    if (batch) batch.push(geometry);
    else batches.set(material, [geometry]);
  }

  function cube(material: MeshStandardMaterial, box: Box, rotationY = 0) {
    const { x, y, z, width, height, depth } = box;
    const geometry = new BoxGeometry(width, height, depth);
    geometry.rotateY(rotationY).translate(x, y, z);
    add(geometry, material);
  }

  function drum(material: MeshStandardMaterial, radius: number, y: number, height: number, bottom = radius, z = centerZ) {
    add(new CylinderGeometry(radius, bottom, height, 48).translate(0, y, z), material);
  }

  function beam(material: MeshStandardMaterial, from: Point, to: Point, width: number, depth = width) {
    const start = new Vector3(...from), end = new Vector3(...to);
    const offset = end.clone().sub(start);
    const length = offset.length();
    const rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), offset.multiplyScalar(1 / length));
    const center = start.lerp(end, .5);
    const geometry = new BoxGeometry(width, length, depth);
    geometry.applyMatrix4(new Matrix4().compose(center, rotation, new Vector3(1, 1, 1)));
    add(geometry, material);
  }

  // The upper deck bears on a masonry drum with a continuous frieze and recessed window color.
  drum(mortar, 5.32, .29, .58, 5.55);
  drum(chalk, drumRadius, 6.62, 12.12, 5.18);
  for (const [height, reach, tall] of [[.83, 5.48, .25], [3.86, 5.39, .15], [6.94, 5.43, .20],
    [10.04, 5.43, .19], [12.62, 5.73, .38], [13.02, 5.92, .43]] as const) {
    drum(height > 12 ? ivory : mortar, reach, height, tall);
  }
  for (let index = 0; index < 12; index++) {
    const theta = index * twoPi / 12;
    const [x, , z] = polar(5.17, theta, 0);
    cube(ivory, { x, y: 5.58, z, width: .62, height: 9.83, depth: .55 }, theta);
    if (index % 2 !== 0) continue;
    const windowTheta = theta + twoPi / 24;
    const [windowX, , windowZ] = polar(5.37, windowTheta, 0);
    for (const y of [2.58, 5.44, 8.56, 11.25]) {
      cube(shadow, { x: windowX, y, z: windowZ, width: .52, height: 1.03, depth: .09 }, windowTheta);
      cube(mortar, { x: windowX, y: y - .57, z: windowZ, width: .78, height: .12, depth: .31 }, windowTheta);
    }
  }

  add(wedge(stairInner, stairOuter, stairStart, 0, 0, .19), mortar);
  for (let index = 0; index < stairCount; index++) {
    const from = index * stairTurn, to = (index + 1) * stairTurn;
    const y = (index + 1) * stairRise;
    add(wedge(stairInner, stairOuter, from - .0004, to, y, .32), index % 3 === 0 ? chalk : ivory);
    if (index % 5 !== 0) continue;
    const [x, , z] = polar(stairCenter, (from + to) / 2, y);
    const angle = (from + to) / 2;
    const buttress = polar(drumRadius - .14, angle, y - .86);
    beam(mortar, [x, y - .27, z], buttress, .48, .60);
    const outerPost = polar(stairOuter - .09, from, y);
    cube(ivory, { x: outerPost[0], y: y + .44, z: outerPost[2], width: .23, height: .94, depth: .23 });
    const innerPost = polar(stairInner + .08, from, y);
    cube(ivory, { x: innerPost[0], y: y + .44, z: innerPost[2], width: .23, height: .94, depth: .23 });
  }
  for (const radius of [stairInner + .08, stairOuter - .09]) {
    for (let index = 0; index < stairCount; index++) {
      const from = index * stairTurn, to = (index + 1) * stairTurn;
      const start = index * stairRise, end = (index + 1) * stairRise;
      beam(iron, polar(radius, from, start + .92), polar(radius, to, end + .92), .10);
      beam(iron, polar(radius, from, start + .47), polar(radius, to, end + .47), .045);
    }
  }

  // Leave a void over the last eight stairs, where the player rises through deck height.
  drum(chalk, 6.46, deckY - .20, .40);
  for (const [from, to] of [[0, notchStart], [stairEnd, twoPi]] as const) {
    const divisions = Math.ceil((to - from) / .13);
    for (let index = 0; index < divisions; index++) {
      const a = from + (to - from) * index / divisions, b = from + (to - from) * (index + 1) / divisions;
      add(wedge(6.40, deckRadius, a, b, deckY, .40), index % 4 === 0 ? chalk : ivory);
      if (a < stairEnd + .24 && b > stairEnd) continue;
      add(wedge(deckRadius - .24, deckRadius, a, b, deckY + .33, .33), ivory);
      if (index % 3 === 0) {
        const [x, , z] = polar(deckRadius - .13, a, deckY);
        cube(chalk, { x, y: deckY + .62, z, width: .32, height: .62, depth: .32 }, a);
      }
      beam(iron, polar(deckRadius - .13, a, deckY + .83), polar(deckRadius - .13, b, deckY + .83), .08);
    }
  }
  for (let index = 0; index < 8; index++) {
    const from = notchStart + (stairEnd - notchStart) * index / 8;
    const to = notchStart + (stairEnd - notchStart) * (index + 1) / 8;
    const [x, , z] = polar(6.38, from, deckY);
    cube(chalk, { x, y: deckY + .38, z, width: .18, height: .76, depth: .18 });
    beam(iron, polar(6.38, from, deckY + .78), polar(6.38, to, deckY + .78), .09);
  }

  // Observatory offices sit behind the portal facade. The top approach remains open to the sky.
  const { z: observatoryZ, domeBase, dishPivot } = skyCityObservatory;
  add(new CylinderGeometry(3.06, 3.23, 3, 36).translate(0, deckY + 1.56, observatoryZ), ivory);
  const dome = new SphereGeometry(3.22, 36, 12, 0, twoPi, 0, Math.PI / 2);
  dome.scale(1, .73, 1).translate(0, domeBase, observatoryZ);
  add(dome, chalk);
  drum(mortar, 3.30, deckY + 3.20, .24, 3.28, observatoryZ);
  drum(bronze, .40, deckY + 5.58, .43, .64, observatoryZ);
  drum(iron, .30, deckY + 5.97, .44, .38, observatoryZ);
  beam(bronze, [-.52, dishPivot - .28, observatoryZ], [.52, dishPivot - .28, observatoryZ], .22);
  for (const side of [-1, 1]) {
    beam(iron, [side * .29, deckY + 6, observatoryZ], [side * .52, dishPivot, observatoryZ], .18, .28);
  }
  movingDish=true;
  add(createSkyCitySignalDish(20), bronze);
  const rim = new TorusGeometry(dishRadius, .052, 5, 20).rotateX(Math.PI / 2).translate(0, dishRim - .03, 0);
  add(rim.applyQuaternion(dishRotation).translate(...dishOrigin.toArray()), iron);
  const feedHeight = .98;
  const feed = new CylinderGeometry(.10, .20, .28, 8).translate(0, feedHeight, 0);
  add(feed.applyQuaternion(dishRotation).translate(...dishOrigin.toArray()), ivory);
  const focus = dishOrigin.clone().addScaledVector(dishVector, feedHeight).toArray();
  for (let index = 0; index < 3; index++) {
    const angle = index * twoPi / 3;
    const mount = new Vector3(dishRadius * .92 * Math.cos(angle), dishRim - .06, dishRadius * .92 * Math.sin(angle));
    beam(iron, mount.applyQuaternion(dishRotation).add(dishOrigin).toArray(), focus, .065, .08);
  }
  movingDish=false;
  const indicatorMaterial=new MeshStandardMaterial({color:'#747e75',emissive:'#f5b477',emissiveIntensity:0});
  const indicators=new Group();indicators.name='sky-city-observatory-indicator-row';
  for(let i=0;i<5;i++){
    const lamp=new Mesh(new BoxGeometry(.16,.13,.07),indicatorMaterial);
    lamp.position.set((i-2)*.29,deckY+1.85,observatoryZ+3.08);indicators.add(lamp);
  }
  group.add(indicators);

  const door = new Group();
  door.name = 'sky-city-locked-gate';
  door.position.set(...gate);
  const gateHeight = 3.35;
  const gateWidth = 2.64;
  const gateDepth = .30;
  const gatePanel = createClayMetalPanel(gateWidth, gateHeight, gateDepth, 0x2c3648, 35);
  const slab = new Mesh(gatePanel.geometry, gatePanel.material);
  slab.name = 'solid-door-surface';
  slab.position.y = gateHeight / 2;
  door.add(slab);
  solids.push({ x: gate[0], y: gate[1] + gateHeight / 2, z: gate[2], width: gateWidth, height: gateHeight, depth: gateDepth });
  const mark = createTownChronicleDoorRing(.73, .86);
  mark.position.set(0, 1.69, gateDepth / 2 + .011);
  door.add(mark);
  const ringGlowMaterial=new MeshStandardMaterial({color:'#8baba2',emissive:'#82d8c8',emissiveIntensity:.04,roughness:.6});
  const ringGlow=new Mesh(new TorusGeometry(.82,.014,5,36),ringGlowMaterial);
  ringGlow.name='sky-city-door-ring-state-trace';ringGlow.position.set(0,1.69,gateDepth/2+.022);door.add(ringGlow);
  const inscription=skyCityInscribedPlate('T-02',2.28,.34);inscription.position.set(0,.38,gateDepth/2+.05);door.add(inscription);
  group.add(door);
  for (const x of [-1.64, 1.64]) {
    const jamb = { x, y: deckY + 1.58, z: gate[2] + .09, width: .55, height: 3.16, depth: .83 };
    cube(chalk, jamb);
    solids.push(jamb);
    cube(ivory, { ...jamb, y: deckY + .15, width: .75, height: .30 });
  }
  const lintel = { x: 0, y: deckY + 3.36, z: gate[2] + .11, width: 3.84, height: .51, depth: .86 };
  cube(chalk, lintel);
  solids.push(lintel);
  for (const x of [-1.15, -.75, -.35, .35, .75, 1.15]) {
    cube(bronze, { x, y: deckY + 3.37, z: gate[2] + .55, width: .16, height: .025, depth: .044 });
  }
  for (const [x, z, width, depth] of [[-4.08, -39.40, 1.50, .47], [-3.67, -39.72, 1.12, .55],
    [3.83, -37.4, .87, .62], [4.35, -37.74, 1.22, .42], [-4.72, -30.11, .64, .35]] as const) {
    cube(moss, { x, y: deckY + .026, z, width, height: .055, depth });
  }
  for (const [material, geometries] of batches) {
    const geometry = mergeGeometries(geometries)!;
    geometries.forEach(piece => piece.dispose());
    group.add(new Mesh(geometry, material));
  }

  function supportAt(x: number, z: number, feet: number) {
    const theta = thetaAt(x, z), radius = Math.hypot(x, z - centerZ);
    const reachableDeck = feet + stepHeight >= deckY && radius <= deckRadius - .02 &&
      (radius <= 6.46 || theta < notchStart || theta >= stairEnd);
    if (reachableDeck) return deckY;
    if (radius < stairInner + .01 || radius > stairOuter - .02) return;
    const tread = treadAt(theta);
    if (tread !== undefined && feet + stepHeight >= tread) return tread;
  }

  function blocked(x: number, z: number, feet: number, radius: number) {
    const theta = thetaAt(x, z), reach = Math.hypot(x, z - centerZ);
    const head = feet + bodyHeight;
    if (feet < deckY - .11 && reach < drumRadius + radius) return true;
    if (feet < deckY - .39 && head > deckY - .40 && reach < deckRadius + radius &&
        (reach < 6.46 + radius || theta < notchStart || theta >= stairEnd)) return true;
    if (feet < deckY + 3.12 && head > deckY + .06 && Math.hypot(x, z - observatoryZ) < 3.15 + radius) return true;
    const tread = treadAt(theta);
    if (theta >= 0 && tread !== undefined && feet < tread + .96 && head > tread - .29 &&
        (Math.abs(reach - stairOuter + .09) < radius + .07 || Math.abs(reach - stairInner - .08) < radius + .07)) return true;
    if (feet < deckY + .93 && head > deckY && Math.abs(reach - deckRadius + .13) < radius + .12 &&
        (theta < notchStart || theta >= stairEnd + .24)) return true;
    if (theta >= notchStart && theta < stairEnd && feet < deckY + .83 && head > deckY &&
        Math.abs(reach - 6.38) < radius + .10) return true;
    return solids.some(box => {
      if (feet >= box.y + box.height / 2 || head <= box.y - box.height / 2) return false;
      const dx = Math.max(0, Math.abs(x - box.x) - box.width / 2);
      const dz = Math.max(0, Math.abs(z - box.z) - box.depth / 2);
      return Math.hypot(dx, dz) < radius;
    });
  }

  const route: readonly Point[] = [[0, 0, -25], polar(stairCenter, -.08, 0), ...Array.from({ length: stairCount },
    (_unused, i) => polar(stairCenter, (i + .5) * stairTurn, (i + 1) * stairRise)),
  polar(stairCenter, stairEnd + .11, deckY), [-3.8, deckY, -29.65], [0, deckY, -29.65], [0, deckY, -34.65]];
  let dream=false;
  function setDreamPresentation(active:boolean){
    dream=active;indicatorMaterial.emissiveIntensity=active?.65:0;
    ringGlowMaterial.emissiveIntensity=active?.65:.04;
    if(!active){dishMotion.rotation.y=0;ringGlow.rotation.z=0;}
  }
  return { group, supportAt, blocked, route, gate, setDreamPresentation,
    update(seconds:number){if(dream){dishMotion.rotation.y=seconds*.12;indicatorMaterial.emissiveIntensity=.45+.2*Math.sin(seconds*2);ringGlow.rotation.z=seconds*.14;}}
  };
}
