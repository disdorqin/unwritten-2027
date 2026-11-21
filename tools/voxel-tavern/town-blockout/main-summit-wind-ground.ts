import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, DoubleSide, Group,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D,
  PlaneGeometry, PointLight, SRGBColorSpace,
} from 'three';
import { readTownOutdoorWeatherState, type TownOutdoorWeatherState } from '../../../src/shared/town-outdoor-weather';
import { summitGustFactorAt } from './town-summit-gust';

/**
 * D5 / mountain ref-m64: a full 18x12m wind-measurement station.
 *
 * The windsock and four turbine vanes are attached to the *accepted*
 * G-09/ZB-20 weather state. The old local sine-driven pretend wind is
 * deliberately removed. With no official weather the station visibly rests
 * still; no client is allowed to manufacture a racing tailwind.
 */
type Family = 'basalt' | 'moss' | 'wood' | 'bronze' | 'patina' | 'cloth' | 'snow' | 'glow';
type Voxel = Readonly<{
  family: Family; tint: string;
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  yaw?: number; pitch?: number; roll?: number;
}>;
type Point = Readonly<{ east: number; north: number; height: number }>;
type WindReport = Readonly<{
  accepted: boolean;
  visibleGustFactor: number;
  windEast: number;
  windNorth: number;
  source: 'official-zb20' | 'calm-no-authority';
  pulseAtMs: number | null;
}>;
export const summitWindGroundCopy = Object.freeze({
  title: '主峰测风台',
  ledger: '风从云海来。看布筒与铜叶，不要看数字。',
  calm: '铜叶静止，未接收到山风权威。',
  listen: '黄铜轮与布筒传来细响；现在仍须等正式山风。',
  touch: '石罗盘上的旧刻槽被擦得更清楚了。它只是方位装饰，不报实时风速。',
});

const palette: Record<Family, readonly string[]> = {
  basalt: ['#39464d', '#53615d', '#737773', '#837865', '#293842'],
  moss: ['#56674e', '#778266', '#9a9866'],
  wood: ['#543c2f', '#76513c', '#9b7050', '#b28a63'],
  bronze: ['#967247', '#c0a269', '#ddc18b'],
  patina: ['#4e9695', '#6aafab', '#a7d2c7', '#3a666e'],
  cloth: ['#c26336', '#eb8b4b', '#e7bb84', '#e0c9a7', '#a34530'],
  snow: ['#cbd7dc', '#e5eaeb', '#b7c7c9'],
  glow: ['#f5c582', '#ffe2b6'],
};

function acceptedWeather(state: TownOutdoorWeatherState | undefined): state is TownOutdoorWeatherState {
  // Only the shared G-09 protocol's complete, validated snapshot counts.
  // Magnitude, timestamp order and unit direction are owned by that reader.
  return Boolean(readTownOutdoorWeatherState(state));
}

function createTitleTexture(): CanvasTexture | undefined {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 176;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = '#392c27';
  context.fillRect(0, 0, 384, 176);
  context.strokeStyle = '#be9864';
  context.lineWidth = 7;
  context.strokeRect(12, 12, 360, 152);
  context.fillStyle = '#efe5ce';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = 'bold 41px system-ui, sans-serif';
  context.fillText(summitWindGroundCopy.title, 192, 61, 350);
  context.font = '20px system-ui, sans-serif';
  context.fillText('风从云海来 · 看布筒与铜叶', 192, 120, 350);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

export function createMainSummitWindGround(
  launch: Point, groundAt?: (east: number, north: number) => number | undefined,
) {
  if (![launch.east, launch.north, launch.height].every(Number.isFinite)) {
    throw new RangeError('Wind station requires one finite surveyed summit anchor');
  }
  const group = new Group();
  group.name = 'main-summit-wind-ground';
  group.position.set(launch.east, launch.height, -launch.north);
  const pieces: Voxel[] = [];
  const materialGroups: InstancedMesh[] = [];
  const geometries: (BoxGeometry | CylinderGeometry | PlaneGeometry)[] = [];
  const materials: (MeshLambertMaterial | MeshBasicMaterial)[] = [];
  const lights: PointLight[] = [];
  const obstacles: { x: number; z: number; w: number; d: number; high: number }[] = [];

  function voxel(family: Family, tint: string, x: number, y: number, z: number,
    w: number, h: number, d: number, yaw = 0, pitch = 0, roll = 0) {
    if (![x,y,z,w,h,d,yaw,pitch,roll].every(Number.isFinite) ||
        w <= 0 || h <= 0 || d <= 0) throw new RangeError('Bad wind-station geometry');
    pieces.push({ family, tint, x, y, z, w, h, d, yaw, pitch, roll });
  }
  function solid(x: number, z: number, w: number, d: number, high: number) {
    obstacles.push({ x, z, w, d, high });
  }
  // R1: built stone platform, not a 1-rectangle floating prop. Jagged rims,
  // irregular shale flags, limestone caps and repeated lichen patches echo
  // the ref-m64 broad pebbled vantage slab.
  for (let row = -11; row <= 11; row++) for (let column = -17; column <= 17; column++) {
    const x = column * .48, z = row * .49;
    const edge = Math.pow(Math.abs(x) / 8.4, 4) + Math.pow(Math.abs(z) / 5.45, 4);
    if (edge > 1.06) continue;
    const chip = (row * 17 + column * 31) % 11;
    const base = -.28 - (chip === 0 ? .12 : 0);
    voxel('basalt', palette.basalt[Math.abs(row * 13 + column) % 5]!,
      x, base + .17, z, .47, .36, .47);
    if (edge < .82 && (row + column * 3) % 9 === 0) {
      voxel('moss', palette.moss[Math.abs(row + column) % 3]!,
        x, .012, z, .38, .04, .36);
    }
    if (edge > .78 && chip % 4 === 0) {
      voxel('snow', palette.snow[Math.abs(column) % 3]!,
        x, .045, z, .39, .08, .35);
    }
  }
  // R3 cross-check against the *actual* P-1 plateau: south of N975 the
  // mountain drops over 2.8 m across the pad. Deep stone pier columns are
  // mandatory there; otherwise the whole square visibly floats over snow.
  // The northern lip remains at P-1 Y800 for unbroken walking arrival.
  let supportCount = 0;
  if (groundAt) {
    for (const z of [2.6, 4.2, 5.3]) for (const x of [-6.0, -3.0, 0, 3.0, 6.0]) {
      const absoluteGround = groundAt(launch.east + x, launch.north - z);
      if (absoluteGround === undefined || !Number.isFinite(absoluteGround)) {
        throw new RangeError('Wind station cannot invent a foundation below P-1 survey');
      }
      const depth = launch.height - absoluteGround;
      if (depth > .25) {
        voxel('basalt', palette.basalt[(supportCount * 3) % palette.basalt.length]!,
          x, -(depth + .18) / 2, z, .69, depth + .18, .72);
        voxel('moss', palette.moss[supportCount % palette.moss.length]!,
          x, -(depth + .12), z, .72, .16, .73);
        supportCount++;
      }
    }
  }

  // Perimeter is interrupted on the south approach, so the player can walk
  // up to the central compass without an impossible invisible collision.
  for (const side of [-1, 1]) for (let index = 0; index < 10; index++) {
    const x = side * (7.23 + (index % 2) * .13);
    const z = -3.8 + index * .81;
    voxel('basalt', palette.basalt[index % 4]!, x, .32, z, .91, .56, .79);
    if (index % 3 === 0) {
      voxel('basalt', palette.basalt[2], x, .74, z, .83, .27, .74);
      solid(x, z, .96, .83, .88);
    }
    if (index % 4 === 1) voxel('snow', palette.snow[0], x, .81, z, .88, .11, .71);
  }
  for (let index = 0; index < 16; index++) {
    const theta = index * Math.PI / 8;
    const r = 1.55;
    voxel('basalt', palette.basalt[index % 4]!,
      Math.cos(theta) * r, .15, 1.8 + Math.sin(theta) * r,
      .48, .29, .52, -theta);
    voxel('bronze', palette.bronze[index % 3]!,
      Math.cos(theta) * 1.46, .32, 1.8 + Math.sin(theta) * 1.46,
      .16, .045, .29, -theta);
  }
  voxel('basalt', palette.basalt[3], 0, .045, 1.8, 2.25, .10, 2.25);
  for (let line = 0; line < 24; line++) {
    const angle = line * Math.PI / 12;
    voxel('bronze', palette.bronze[1],
      Math.cos(angle) * .91, .11, 1.8 + Math.sin(angle) * .91,
      .11, .047, .49, -angle);
  }
  voxel('bronze', palette.bronze[2], 0, .16, 1.8, .32, .09, .32);
  const compassSeal = new Group();
  compassSeal.name = 'stone-compass-burnished-engraving';
  compassSeal.position.set(0, .19, 1.8);
  const pointerGeometry = new BoxGeometry(.92, .09, .20);
  const pointerMaterial = new MeshLambertMaterial({ color: '#e0ba77' });
  geometries.push(pointerGeometry);
  materials.push(pointerMaterial);
  const pointer = new Mesh(pointerGeometry, pointerMaterial);
  pointer.name = 'compass-burnished-moving-needle';
  pointer.position.set(.30, .10, 0);
  compassSeal.add(pointer);
  group.add(compassSeal);
  for (const sign of [-1, 1]) {
    voxel('bronze', palette.bronze[0], sign * .53, .15, 1.8, .33, .028, .12);
    voxel('bronze', palette.bronze[0], 0, .15, 1.8 + sign * .53, .12, .028, .33);
  }

  // R1/R2: a completely framed observation gallery around three/four
  // turquoise wind turbines, with independent feet and slatted supports.
  const rotorAnchors = [
    { x: -3.25, z: -1.55, radius: .79 },
    { x: -.98, z: -1.82, radius: 1.03 },
    { x: 1.58, z: -1.72, radius: 1.12 },
    { x: 4.23, z: -1.48, radius: .88 },
  ] as const;
  for (const [index, rotor] of rotorAnchors.entries()) {
    const y = 3.28 + (index % 2) * .25;
    voxel('basalt', palette.basalt[index % 4]!, rotor.x, .28, rotor.z,
      .94, .52, .93);
    voxel('wood', palette.wood[0], rotor.x, y / 2, rotor.z,
      .26, y, .29);
    voxel('bronze', palette.bronze[1], rotor.x, y, rotor.z + .18,
      .37, .41, .44);
    for (let point = 0; point < 24; point++) {
      const angle = point * Math.PI / 12;
      const ringX = rotor.x + Math.cos(angle) * rotor.radius;
      const ringY = y + Math.sin(angle) * rotor.radius;
      voxel('patina', palette.patina[(point + index) % 4]!, ringX, ringY, rotor.z + .25,
        .37, .13, .21, 0, 0, angle + Math.PI / 2);
      if (point % 4 === 0) voxel('bronze', palette.bronze[point % 3]!,
        ringX, ringY, rotor.z + .37, .14, .18, .14);
    }
  }
  // R1: long contiguous stone parapet and useful leaning points, deliberately
  // broken into many readable chiseled blocks rather than one smooth gray bar.
  for (let i = 0; i < 16; i++) {
    const x = 3.25 + (i % 4) * .77, z = -4.35 + Math.floor(i / 4) * .77;
    voxel('basalt', palette.basalt[(i * 3) % 5]!,
      x, .35 + Math.floor(i / 8) * .12, z, .74, .66, .75);
    if (i % 3 === 0) voxel('snow', palette.snow[0], x, .79, z, .76, .07, .71);
  }
  for (let index = 0; index < 8; index++) {
    const x = -6.0 + index * 1.67;
    const z = 4.18 + .22 * Math.sin(index * .8);
    voxel('wood', palette.wood[0], x, .79, z, .17, 1.56, .18);
    voxel('bronze', palette.bronze[1], x, 1.57, z, .27, .15, .28);
    if (index < 7) {
      voxel('wood', palette.wood[1], x + .84, 1.23, z,
        1.71, .12, .10);
    }
    if (index % 2 === 0) voxel('cloth', palette.cloth[index % 5]!, x + .31, 1.24, z + .08,
      .54, .23, .065);
    solid(x, z, .18, .18, 1.62);
  }

  // R2: 6m wood mast with hooped orange cloth windsock. Mouth is genuinely
  // hollow: 12 longitudinal courses x 10 circular facets taper toward the
  // tail, with rust-gold erosion and layered seams.
  const frameWood = new MeshLambertMaterial({ color: '#624432' });
  materials.push(frameWood);
  const mastShape = new CylinderGeometry(.12, .16, 6.1, 8);
  geometries.push(mastShape);
  const mast = new Mesh(mastShape, frameWood);
  mast.name = 'wind-sock-frame';
  mast.position.set(-5.23, 3.07, -2.56);
  group.add(mast);
  solid(-5.23, -2.56, .32, .32, 6.2);
  for (let i = 0; i < 5; i++) {
    const y = .27 + i * .22;
    voxel('basalt', palette.basalt[i % 5], -5.23, y, -2.56,
      1.23 - i * .12, .18, 1.13 - i * .10);
  }
  const sock = new Group();
  sock.name = 'wind-sock-cloth';
  sock.position.set(-5.23, 5.43, -2.56);
  group.add(sock);
  voxel('bronze', palette.bronze[2], -5.23, 5.48, -2.56,
    .46, .22, .49);
  for (let link = 0; link < 5; link++) {
    voxel('wood', palette.wood[0], -5.23 + link * .20, 5.41, -2.56,
      .24, .15, .15);
  }
  const sockShape = new BoxGeometry(1, 1, 1);
  geometries.push(sockShape);
  const sockMaterial = new MeshLambertMaterial({ color: '#ffffff', side: DoubleSide });
  materials.push(sockMaterial);
  const sockFacets = new InstancedMesh(sockShape, sockMaterial, 12 * 10);
  sockFacets.name = 'windsock-layered-original-cloth';
  const shapePose = new Object3D();
  const tint = new Color();
  let clothIndex = 0;
  for (let course = 0; course < 12; course++) {
    const x = .25 + course * .31;
    const radius = Math.max(.11, .61 - course * .041);
    for (let side = 0; side < 10; side++) {
      const theta = 2 * Math.PI * side / 10;
      shapePose.position.set(x, radius * Math.cos(theta),
        radius * Math.sin(theta));
      shapePose.rotation.set(theta, 0, 0);
      shapePose.scale.set(.33, .077, radius * .68);
      shapePose.updateMatrix();
      sockFacets.setMatrixAt(clothIndex, shapePose.matrix);
      const worn = (course * 17 + side * 7) % 11;
      sockFacets.setColorAt(clothIndex,
        tint.set(palette.cloth[worn === 0 ? 3 : (course % 4 === 3 ? 2 : (course + side) % 2)]!));
      clothIndex++;
    }
  }
  sockFacets.computeBoundingSphere();
  sock.add(sockFacets);
  materialGroups.push(sockFacets);
  // R4 native image audit: the facets alone read as a broken orange snake
  // against the m64 reference. Add a continuous hollow tapered fabric shell
  // underneath, open at both ends. The coloured facets remain as seams and
  // faded repairs, not substitutes for a physically complete windsock.
  const sockBodyGeometry = new CylinderGeometry(.19, .72, 3.7, 16, 14, true);
  const sockBodyMaterial = new MeshLambertMaterial({
    color: '#d88645', side: DoubleSide,
  });
  geometries.push(sockBodyGeometry);
  materials.push(sockBodyMaterial);
  const sockBody = new Mesh(sockBodyGeometry, sockBodyMaterial);
  sockBody.name = 'windsock-continuous-open-cloth-shell';
  sockBody.rotation.z = -Math.PI / 2;
  sockBody.position.set(2.13, 0, 0);
  sock.add(sockBody);
  const lipGeometry = new CylinderGeometry(.73, .73, .085, 16, 1, true);
  const lipMaterial = new MeshLambertMaterial({ color: '#a65d32', side: DoubleSide });
  geometries.push(lipGeometry);
  materials.push(lipMaterial);
  const lip = new Mesh(lipGeometry, lipMaterial);
  lip.name = 'windsock-hollow-reinforced-intake';
  lip.rotation.z = -Math.PI / 2;
  lip.position.set(.25, 0, 0);
  sock.add(lip);
  const clothSeams = new InstancedMesh(
    new BoxGeometry(.035,.07,.18),
    new MeshLambertMaterial({color:'#ca9258'}), 7 * 16);
  geometries.push(clothSeams.geometry as BoxGeometry);
  materials.push(clothSeams.material as MeshLambertMaterial);
  clothSeams.name = 'windsock-stitched-wear-bands';
  const seamTransform = new Object3D();
  let seamIndex = 0;
  for (let stripe = 0; stripe < 7; stripe++) {
    const x = .42 + stripe * .50;
    const radius = Math.max(.19,.72 - stripe * .074);
    for (let facet = 0; facet < 16; facet++) {
      const angle = facet * Math.PI / 8;
      seamTransform.position.set(x,radius * Math.cos(angle),radius * Math.sin(angle));
      seamTransform.rotation.set(angle,0,0);
      seamTransform.scale.set(1, 1, .3 + radius * .6);
      seamTransform.updateMatrix();
      clothSeams.setMatrixAt(seamIndex++,seamTransform.matrix);
    }
  }
  clothSeams.computeBoundingSphere();
  sock.add(clothSeams);
  materialGroups.push(clothSeams);

  // R2: a fifth gauge family, a small rectangular provenance marker plate.
  const signShape = new PlaneGeometry(2.82, 1.1);
  geometries.push(signShape);
  const texture = createTitleTexture();
  const signMaterial = new MeshBasicMaterial({
    side: DoubleSide, color: '#f1e6d3', ...(texture ? { map: texture } : {}),
  });
  materials.push(signMaterial);
  const sign = new Mesh(signShape, signMaterial);
  sign.name = 'summit-wind-ground-finished-sign';
  sign.position.set(6.15, 1.83, 2.8);
  sign.rotation.y = -.21;
  group.add(sign);
  voxel('wood', palette.wood[0], 6.15, 1.82, 2.86, 3.02, 1.26, .23);
  for (const x of [4.9, 7.4]) {
    voxel('wood', palette.wood[0], x, .95, 2.87, .14, 1.85, .14);
  }

  // R5: 120 individual brass gears behind four moving copper leaf wheels.
  // One instanced batch for all four moving wind indicators: 72 vanes,
  // independent wheel heights, no per-rotor draw call explosion.
  const vaneMaterial = new MeshLambertMaterial({ color: '#ffffff' });
  materials.push(vaneMaterial);
  const vaneShape = new BoxGeometry(1, 1, 1);
  geometries.push(vaneShape);
  const bladeBatch = new InstancedMesh(vaneShape, vaneMaterial,
    rotorAnchors.length * 6 * 3);
  bladeBatch.name = 'weather-synchronous-brass-vanes';
  const vanePose = new Object3D();
  for (let index = 0; index < bladeBatch.count; index++) {
    bladeBatch.setColorAt(index,
      tint.set(palette.patina[index % 4]!));
  }
  group.add(bladeBatch);
  materialGroups.push(bladeBatch);

  // Keep the approved named flag pole and all five individual prayer flags
  // for the existing host and regression tests. These are also visible
  // movable models, not empty aliases or a second synthetic weather source.
  const pennantPoleGeometry = new CylinderGeometry(.072, .12, 5.5, 8);
  const pennantPoleMaterial = new MeshLambertMaterial({ color: '#694a31' });
  geometries.push(pennantPoleGeometry);
  materials.push(pennantPoleMaterial);
  const pennantPole = new Mesh(pennantPoleGeometry, pennantPoleMaterial);
  pennantPole.name = 'wind-measure-flag-pole';
  pennantPole.position.set(3.92, 2.78, 2.93);
  group.add(pennantPole);
  solid(3.92, 2.93, .25, .25, 5.65);
  const namedPennants: Mesh[] = [];
  const pennantGeometry = new BoxGeometry(.65, .34, .058);
  const pennantMaterial = new MeshLambertMaterial({ color: '#ffffff', side: DoubleSide });
  geometries.push(pennantGeometry);
  materials.push(pennantMaterial);
  for (let index = 0; index < 5; index++) {
    const pennant = new Mesh(pennantGeometry, pennantMaterial.clone());
    materials.push(pennant.material as MeshLambertMaterial);
    (pennant.material as MeshLambertMaterial).color.set(['#5477a8','#efe7c9','#b44b3e','#669074','#d5ac5f'][index]!);
    pennant.name = 'wind-measure-flag-' + index;
    pennant.position.set(4.34, 5.1 - index * .68, 2.95);
    group.add(pennant);
    namedPennants.push(pennant);
  }

  // R5: a string of colorful but *discrete* flags; one actual moving mesh
  // handles the whole string. Set flutter from the same accepted gust factor.
  const flags = new InstancedMesh(new BoxGeometry(1,1,1),
    new MeshLambertMaterial({ color: '#ffffff', side: DoubleSide }), 12);
  geometries.push(flags.geometry as BoxGeometry);
  materials.push(flags.material as MeshLambertMaterial);
  flags.name = 'wind-measure-festival-pennants';
  for (let i = 0; i < flags.count; i++) flags.setColorAt(i,
    tint.set(palette.cloth[i % palette.cloth.length]!));
  group.add(flags);
  materialGroups.push(flags);

  // R5: stone-mounted, physically sourced dual oil lamps and exposed brass
  // sockets, without a row of arbitrary cost-free lighting effects.
  for (const x of [-5.7, 5.7]) {
    for (let tier = 0; tier < 5; tier++) voxel('wood', palette.wood[0], x,
      .18 + tier * .29, 3.54, .24, .30, .24);
    voxel('bronze', palette.bronze[1], x, 1.63, 3.54, .58, .15, .45);
    voxel('glow', palette.glow[1], x, 1.84, 3.54, .26, .29, .27);
    voxel('bronze', palette.bronze[2], x, 2.08, 3.54, .48, .12, .43);
    const lamp = new PointLight('#f9cc98', 1.8, 9, 2);
    lamp.position.set(x, 1.89, 3.54);
    lamp.name = 'summit-wind-ground-real-lantern';
    lights.push(lamp);
    group.add(lamp);
  }

  // R3/R5 batching, each base material a single draw no matter how many
  // individual rocks, mortar seams and snow caps the reference requires.
  const voxelShape = new BoxGeometry(1,1,1);
  geometries.push(voxelShape);
  const affine = new Object3D();
  for (const family of Object.keys(palette) as Family[]) {
    const belonging = pieces.filter(part => part.family === family);
    if (!belonging.length) continue;
    const material = family === 'glow'
      ? new MeshBasicMaterial({ color: '#ffffff' })
      : new MeshLambertMaterial({ color: '#ffffff' });
    materials.push(material);
    const batch = new InstancedMesh(voxelShape, material, belonging.length);
    batch.name = 'wind-ground-blocks-' + family;
    for (const [index, block] of belonging.entries()) {
      affine.position.set(block.x, block.y, block.z);
      affine.rotation.set(block.pitch ?? 0, block.yaw ?? 0, block.roll ?? 0);
      affine.scale.set(block.w, block.h, block.d);
      affine.updateMatrix();
      batch.setMatrixAt(index, affine.matrix);
      batch.setColorAt(index, tint.set(block.tint));
    }
    batch.computeBoundingSphere();
    materialGroups.push(batch);
    group.add(batch);
  }

  let weather: TownOutdoorWeatherState | undefined;
  let speedMs: number | undefined;
  let lastPulse: number | null = null;
  let visiblyGusting = 0;
  let compassTouched = 0;
  let disposed = false;
  const update = (seconds: number) => {
    if (disposed) return;
    if (!Number.isFinite(seconds) || seconds < 0) return;
    const nowMs = Math.round(seconds * 1000);
    // After the official snapshot expires, the model returns to calm. A
    // disconnected client must not keep waving flags under stale weather.
    if (weather && nowMs >= weather.nextChangeAt) {
      weather = undefined;
      speedMs = undefined;
    }
    const gust = weather ? summitGustFactorAt(weather, nowMs, speedMs) : 0;
    visiblyGusting = gust;
    const direction = weather ? Math.atan2(weather.windNorth, weather.windEast) : 0;
    sock.rotation.y = direction;
    sock.rotation.z = -(0.6 - gust * .54);
    for (const [index, rotor] of rotorAnchors.entries()) {
      const y = 3.28 + (index % 2) * .25;
      const spin = weather ? (seconds / 8.8 + index * .29) * gust : 0;
      for (let blade = 0; blade < 6; blade++) {
        const angle = blade * Math.PI / 3 + spin;
        for (let segment = 0; segment < 3; segment++) {
          const distance = rotor.radius * (.25 + segment * .25);
          const offset = (index * 6 + blade) * 3 + segment;
          vanePose.position.set(rotor.x + Math.cos(angle) * distance,
            y + Math.sin(angle) * distance, rotor.z + .46);
          vanePose.rotation.set(0,0,angle);
          vanePose.scale.set(.17 + .12 * segment, .1, .18);
          vanePose.updateMatrix();
          bladeBatch.setMatrixAt(offset, vanePose.matrix);
        }
      }
    }
    bladeBatch.instanceMatrix.needsUpdate = true;
    const flagPose = new Object3D();
    for (let index = 0; index < flags.count; index++) {
      flagPose.position.set(-5.7 + index * 1.02, 1.15, 4.29);
      flagPose.rotation.set(0, 0, gust > 0 ?
        -Math.sin(seconds * 2.8 + index * .58) * gust * .36 : -.15);
      flagPose.scale.set(.78, .30 + .10 * gust, .065);
      flagPose.updateMatrix();
      flags.setMatrixAt(index, flagPose.matrix);
    }
    flags.instanceMatrix.needsUpdate = true;
    for (const [index, pennant] of namedPennants.entries()) {
      pennant.rotation.y = direction;
      pennant.rotation.z = gust > 0 ? -Math.sin(seconds * 2.3 + index * .61) * gust * .33 : 0;
    }
  };
  update(0);

  function setOfficialWind(state: TownOutdoorWeatherState | undefined,
    atMs: number, measuredWindMs?: number): boolean {
    if (disposed || !acceptedWeather(state) || !Number.isSafeInteger(atMs) ||
        (lastPulse !== null && atMs <= lastPulse) ||
        atMs < state.startedAt || atMs >= state.nextChangeAt ||
        (measuredWindMs !== undefined &&
          (!Number.isFinite(measuredWindMs) || measuredWindMs < 0 || measuredWindMs > 35))) {
      return false;
    }
    weather = state;
    speedMs = measuredWindMs;
    lastPulse = atMs;
    update(atMs / 1000);
    return true;
  }

  const surfaceAt = (east: number, north: number, radius = .27) => {
    if (![east,north,radius].every(Number.isFinite) || radius < 0 || radius > .5) return undefined;
    const x = east - launch.east, z = -(north - launch.north);
    return Math.pow(Math.abs(x) / 8.4, 4) + Math.pow(Math.abs(z) / 5.45, 4) <= .75
      ? launch.height + .03 : undefined;
  };
  const blocked = (east: number, north: number, feet: number, radius: number, bodyHeight: number) => {
    if (![east,north,feet,radius,bodyHeight].every(Number.isFinite)) return true;
    if (feet + bodyHeight < launch.height || feet > launch.height + 6.2) return false;
    const x = east - launch.east, z = -(north - launch.north);
    return obstacles.some(solid => Math.abs(x - solid.x) < radius + solid.w / 2 &&
      Math.abs(z - solid.z) < radius + solid.d / 2 &&
      feet + bodyHeight > launch.height && feet < launch.height + solid.high);
  };

  function interact(args: Readonly<{
    kind: 'view' | 'listen' | 'touch'; player: Point; authorized: boolean;
  }>) {
    if (!args.authorized || disposed) return { accepted: false as const, message: '尚未授权触碰测风台。' };
    if (![args.player?.east,args.player?.north,args.player?.height].every(Number.isFinite) ||
      Math.hypot(args.player.east - launch.east, args.player.north - launch.north) > 3.5 ||
      Math.abs(args.player.height - launch.height) > 2.0) {
      return { accepted: false as const, message: '请走到石罗盘旁再尝试。' };
    }
    if (args.kind === 'view') {
      return { accepted: true as const, message: summitWindGroundCopy.ledger };
    }
    if (args.kind === 'listen') {
      return { accepted: true as const, message: weather ?
        '铜叶转动，风声与眼前布筒同步。' : summitWindGroundCopy.listen };
    }
    if (args.kind === 'touch') {
      compassTouched++;
      compassSeal.rotation.y += Math.PI / 12;
      lights.forEach(light => { light.intensity = 1.8 + Math.min(1.0, compassTouched * .16); });
      return { accepted: true as const, message: summitWindGroundCopy.touch };
    }
    return { accepted: false as const, message: '未知的测风台操作。' };
  }
  return {
    group, sock, flags, lights, setOfficialWind, update, interact,
    surfaceAt, blocked, compassSeal,
    get report(): WindReport {
      return {
        accepted: Boolean(weather),
        visibleGustFactor: visiblyGusting,
        windEast: weather?.windEast ?? 0, windNorth: weather?.windNorth ?? 0,
        source: weather ? 'official-zb20' : 'calm-no-authority',
        pulseAtMs: lastPulse,
      };
    },
    pieceCount: pieces.length + sockFacets.count + bladeBatch.count + flags.count,
    // Exact new scene draw calls; counts each visible Mesh or InstancedMesh
    // once, excluding the host, its original P-1 mountain and the two lights.
    drawBudget: (() => { let draws = 0; group.traverse(object => {
      if (object instanceof Mesh) draws += Array.isArray(object.material) ? object.material.length : 1;
    }); return draws; })(),
    stationSize: { eastMetres: 18, northMetres: 12 },
    supportCount,
    get compassTouches() { return compassTouched; },
    hasTextTexture: Boolean(texture),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const item of materialGroups) item.dispose();
      for (const shape of geometries) shape.dispose();
      for (const material of materials) material.dispose();
      texture?.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
