import {
  BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshLambertMaterial, Object3D, Shape,
  ShapeGeometry, type BufferGeometry,
} from 'three';
import { fittedStarportAssemblyLayout, starportAssemblyParts, type StarportAssemblyPart } from '../../../src/shared/starport-assembly';
import { createClayMetalPanel } from './clay-metal-panel';
import { createFlightBoosterVisual, createSnowWingVisual } from './flight-equipment-visuals';

type Plate = readonly [x: number, y: number, z: number, w: number, h: number, d: number, color: string, rotation?: number];
type Point = readonly [number, number];

const socketCenters = fittedStarportAssemblyLayout.sockets;

const silhouettes = {
  'snow-wing': [[-.78, -.16], [-.69, .09], [-.42, .20], [-.16, .26], [-.12, .34],
    [.12, .34], [.16, .26], [.42, .20], [.69, .09], [.78, -.16],
    [.43, -.21], [.16, -.17], [.12, -.28], [-.12, -.28], [-.16, -.17], [-.43, -.21]],
  booster: [[-.50, -.32], [-.50, .17], [-.36, .31], [-.20, .31], [-.20, .38],
    [.20, .38], [.20, .31], [.36, .31], [.50, .17], [.50, -.32], [.29, -.32],
    [.29, -.25], [-.29, -.25], [-.29, -.32]],
  'navigation-core': [[-.45, -.29], [-.45, .22], [-.32, .35], [.33, .35],
    [.45, .24], [.45, -.29], [.22, -.29], [.22, -.35], [-.34, -.35]],
} as const satisfies Record<StarportAssemblyPart, readonly Point[]>;

const white = '#e6e7e3';
const frost = '#ccd9da';
const shadow = '#263b44';
const steel = '#627a83';
const brass = '#b98d53';
const copper = '#d1a969';
const inactive = '#647782';
const seated = '#9dd9cf';
const framePaint: Readonly<Record<string, number>> = {
  [white]: 0x8a8378, [frost]: 0xe8ecf0, [steel]: 0x2c3648, [brass]: 0xa98a56, '#3c5660': 0x2c3648,
};

function shape(points: readonly Point[]) {
  const result = new Shape();
  result.moveTo(...points[0]!);
  for (const point of points.slice(1)) result.lineTo(...point);
  result.closePath();
  return result;
}

function plates(geometry: BoxGeometry, material: MeshLambertMaterial, parts: readonly Plate[], name: string) {
  const mesh = new InstancedMesh(geometry, material, parts.length);
  mesh.name = name;
  const transform = new Object3D();
  const tint = new Color();
  parts.forEach(([x, y, z, width, height, depth, color, rotation = 0], index) => {
    transform.position.set(x, y, z);
    transform.scale.set(width, height, depth);
    transform.rotation.z = rotation;
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.needsUpdate = true;
  mesh.computeBoundingSphere();
  return mesh;
}

function navigationCore(geometry: BoxGeometry, material: MeshLambertMaterial) {
  const parts: Plate[] = [
    [0, 0, -.027, .81, .55, .15, '#254750'],
    [0, .014, .054, .77, .50, .032, '#4d867e'],
    [-.28, .17, .077, .13, .09, .026, steel],
    [.25, -.13, .077, .16, .11, .026, steel],
    [0, .01, .084, .32, .32, .061, shadow, Math.PI / 4],
    [0, .01, .122, .205, .205, .032, copper, Math.PI / 4],
    [0, .01, .148, .128, .128, .032, '#9ed9d2', Math.PI / 4],
  ];
  for (const x of [-.32, -.20, -.08, .04, .16, .28]) {
    parts.push([x, -.287, .046, .046, .125, .047, copper]);
    parts.push([x, -.19, .077, .018, .087, .012, brass]);
  }
  for (const y of [-.18, .18]) {
    parts.push([-.35, y, .094, .05, .05, .035, frost]);
    parts.push([.35, y, .094, .05, .05, .035, frost]);
  }
  return plates(geometry, material, parts, 'navigation-core');
}

/** A local model with its sockets facing +Z. The host owns inventory and the accepted fit result. */
export function buildStarportAssemblyRack() {
  const group = new Group();
  group.name = 'starport-assembly-rack';
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const backing = new MeshLambertMaterial({ color: '#182c37' });
  const bezel = new MeshLambertMaterial({ color: brass });
  const silhouetteGeometries: BufferGeometry[] = [];
  const frame: Plate[] = [
    [0, 1.18, -.13, 5.82, 1.65, .53, white],
    [0, 1.19, -.40, 5.49, 1.55, .18, steel],
    [0, 2.04, -.08, 6.01, .14, .62, white],
    [0, 2.126, -.08, 5.72, .043, .51, frost],
    [0, .34, -.04, 6.05, .15, .72, white],
    [0, .26, -.04, 5.88, .046, .66, brass],
    [0, .985, .245, 5.77, .034, .052, frost],
  ];
  for (const x of [-2.87, -.95, .95, 2.87]) {
    frame.push([x, 1.19, .166, .07, 1.45, .14, steel]);
    frame.push([x, 1.19, .251, .026, 1.37, .045, brass]);
  }
  for (const x of [-2.69, 2.69]) {
    frame.push([x, .18, -.09, .17, .36, .54, steel]);
    frame.push([x, .042, -.04, .46, .084, .93, shadow]);
    frame.push([x, .091, -.037, .36, .05, .78, frost]);
  }

  for (const { x } of Object.values(socketCenters)) {
    frame.push([x, 1.29, .172, 1.71, 1.19, .076, '#3c5660']);
    frame.push([x, .56, .239, .71, .12, .082, shadow]);
    frame.push([x, 1.904, .23, .76, .06, .054, brass]);
    for (const dx of [-.78, .78]) for (const y of [.74, 1.84]) {
      frame.push([x + dx, y, .234, .075, .075, .066, white, Math.PI / 4]);
    }
  }
  // Paired recesses identify the booster and edge contacts distinguish the chip.
  for (const dx of [-.254, .254]) frame.push([dx, 1.15, .303, .16, .18, .084, steel]);
  for (const dx of [-.30, -.18, -.06, .06, .18, .30]) {
    frame.push([socketCenters['navigation-core'].x + dx, .97, .30, .033, .096, .078, copper]);
  }
  const shortHardware: Plate[] = [];
  const panels: Mesh<BoxGeometry, MeshLambertMaterial>[] = [];
  for (const [index, part] of frame.entries()) {
    const [x, y, z, width, height, depth, color, rotation = 0] = part;
    if (Math.max(width * height, width * depth, height * depth) < 1) {
      shortHardware.push(part);
      continue;
    }
    const finish = createClayMetalPanel(width, height, depth, framePaint[color] ?? 0x8a8378, index + 210);
    const panel = new Mesh(finish.geometry, finish.material);
    panel.name = 'rack-worn-panel';
    panel.position.set(x, y, z);
    panel.rotation.z = rotation;
    panels.push(panel);
  }
  const rack = plates(geometry, material, shortHardware, 'rack-frame');
  group.add(rack, ...panels);

  const fittedWing = createSnowWingVisual();
  const fittedBooster = createFlightBoosterVisual();
  const booster = new Group();
  booster.name = 'booster';
  booster.add(fittedBooster.group);
  const chip = navigationCore(geometry, material);
  const ledMeshes = new Map<StarportAssemblyPart, Mesh<BoxGeometry, MeshLambertMaterial>>();
  const mounted = {
    'snow-wing': fittedWing.group,
    booster,
    'navigation-core': chip,
  };
  // The cloth side and keyed leading edge face visitors at the rack.
  fittedWing.group.rotation.set(Math.PI / 2, 0, Math.PI, 'ZYX');
  fittedWing.group.scale.setScalar(.40);
  fittedBooster.group.rotation.x = -1.20;
  fittedBooster.group.scale.setScalar(.96);
  fittedBooster.group.position.z = .23;

  for (const part of starportAssemblyParts) {
    const { x, y, z } = socketCenters[part];
    const outline = new ShapeGeometry(shape(silhouettes[part]));
    silhouetteGeometries.push(outline);
    const lip = new Mesh(outline, bezel);
    const recess = new Mesh(outline, backing);
    lip.name = `${part}-socket-edge`;
    recess.name = `${part}-socket-recess`;
    lip.position.set(x, y, .228);
    recess.position.set(x, y, .231);
    recess.scale.setScalar(.91);
    const led = new Mesh(geometry, new MeshLambertMaterial({ color: inactive }));
    led.position.set(x, .559, .291);
    led.scale.set(.50, .039, .028);
    led.name = `${part}-socket-state`;
    ledMeshes.set(part, led);
    mounted[part].position.set(x, y, z + .105);
    group.add(lip, recess, led, mounted[part]);
  }

  function showParts(parts: readonly StarportAssemblyPart[]) {
    for (const part of starportAssemblyParts) {
      const present = parts.includes(part);
      mounted[part].visible = present;
      ledMeshes.get(part)!.material.color.set(present ? seated : inactive);
    }
  }
  showParts([]);
  let disposed = false;
  return {
    group,
    sockets: socketCenters,
    showParts,
    dispose() {
      if (disposed) return;
      disposed = true;
      fittedWing.dispose();
      fittedBooster.dispose();
      rack.dispose();
      chip.dispose();
      geometry.dispose();
      material.dispose();
      for (const panel of panels) {
        panel.geometry.dispose();
        panel.material.map?.dispose();
        panel.material.dispose();
      }
      backing.dispose();
      bezel.dispose();
      for (const shapeGeometry of silhouetteGeometries) shapeGeometry.dispose();
      for (const led of ledMeshes.values()) led.material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
