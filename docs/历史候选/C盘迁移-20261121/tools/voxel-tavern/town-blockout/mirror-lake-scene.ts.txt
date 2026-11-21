import { BoxGeometry, Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D } from 'three';
import { mirrorLake } from '../../../src/shared/mirror-lake';
import type { Box } from './landmark-kit';
import { addLandmarkNameplate } from './landmark-label';
import { mirrorFishingSites, mirrorLakeServices } from './mirror-lake-site';

type Point = [east: number, height: number, north: number];
type Size = [width: number, height: number, depth: number];
type Part = { at: Point; size: Size; color: string; yaw?: number };
type HeightAt = (east: number, north: number) => number;
type FishingSite = (typeof mirrorFishingSites)[number];

const larch = '#775849';
const cedar = '#a6815b';
const slate = '#466278';
const snow = '#d0e4f1';

export function mirrorFishingPropAnchors(site: FishingSite) {
  const [east, north] = mirrorLake.center;
  const length = Math.hypot(east - site.x, north - site.n);
  const dx = (east - site.x) / length;
  const dn = (north - site.n) / length;
  // Workstations always face into the sheet, including the western entrance.
  return {
    yaw: Math.atan2(-dx, dn),
    at: (inward: number, side: number) => ({
      east: site.x + dx * inward + dn * side,
      north: site.n + dn * inward - dx * side,
    }),
    hole: { east: site.x + dx, north: site.n + dn },
    float: { east: site.x + dx * 1.16, north: site.n + dn * 1.16 },
    bubble: { east: site.x + dx * 1.1 - dn * .16, north: site.n + dn * 1.1 + dx * .16 },
    fishOrbit: { east: site.x + dx, north: site.n + dn },
  };
}

function addFishingProps(parts: Part[], site: FishingSite, heightAt: HeightAt) {
  const station = mirrorFishingPropAnchors(site);
  const at = (inward: number, side: number, dz: number, size: Size, color: string) => {
    const { east, north } = station.at(inward, side);
    parts.push({ at: [east, heightAt(east, north) + dz, north], size, color, yaw: station.yaw });
  };
  // Ice hole and chipped lip. Keep the standing point and cast lane clear.
  at(1, 0, .017, [.9, .025, 1.08], '#193d57');
  at(1, 0, .018, [1.08, .026, .88], '#193d57');
  at(1, -.51, .03, [.12, .065, .70], '#a1d2e7');
  at(1, .51, .035, [.12, .075, .70], '#dbf3fa');
  at(.47, 0, .035, [.72, .085, .13], '#add9ec');
  at(1.53, 0, .025, [.71, .063, .13], '#8bc2d9');

  // Movable wooden seat, open two-post rod rack and tackle chest.
  at(-.50, -.83, .43, [.57, .10, .47], cedar);
  at(-.50, -.83, .20, [.35, .40, .30], larch);
  at(-.47, .90, .36, [.72, .72, .09], larch);
  at(-.47, 1.17, .40, [.09, .80, .31], cedar);
  at(-.47, .63, .40, [.09, .80, .31], cedar);
  at(-.44, .90, .76, [.68, .06, .13], slate);
  at(.17, 1.32, .19, [.63, .38, .38], larch);
  at(.17, 1.32, .39, [.67, .06, .42], cedar);
  at(.33, 1.32, .33, [.08, .08, .04], '#b7b4a1');
}

function addService(parts: Part[], colliders: Box[], group: Group, site: (typeof mirrorLakeServices)[number]) {
  const { x, n, ground, width, depth } = site;
  const pavilion = site.id === 'shore-shelter';
  const part = (dx: number, dz: number, dy: number, size: Size, color: string, solid = false) => {
    const [w, h, d] = size;
    const at: Point = [x + dx, ground + dy, n + dz];
    parts.push({ at, size, color });
    if (!solid) return;
    const [e, y, north] = at;
    colliders.push({ min: [e - w / 2, y - h / 2, -north - d / 2],
      max: [e + w / 2, y + h / 2, -north + d / 2] });
  };
  const outerX = width / 2 - .16;
  const outerN = depth / 2 - .16;
  part(0, 0, -.09, [width, .18, depth], slate);
  for (const side of [-1, 1]) {
    part(-outerX, side * outerN, 1.18, [.27, 2.36, .27], cedar, true);
    part(outerX, side * outerN, 1.18, [.27, 2.36, .27], cedar, true);
    if (!pavilion) part(0, side * outerN, 1.14, [width, 2.28, .25], larch, true);
    part(0, side * (depth / 2 - 1.0), 2.66, [width + .55, .18, 1.25], slate);
    part(0, side * (depth / 2 - 1.0), 2.79, [width + .56, .12, 1.24], snow);
  }
  part(0, 0, 2.42, [width + .65, .19, depth + .70], slate);
  part(0, 0, 2.65, [width + .59, .10, depth + .64], snow);
  for (const side of [-1, 1]) {
    part(0, side * (depth / 2 + .29), 2.70, [width + .78, .15, .34], slate);
    part(0, side * (depth / 2 + .34), 2.81, [width + .73, .11, .25], snow);
  }

  if (pavilion) {
    part(outerX - .38, 0, .48, [.55, .14, depth - 1.55], cedar, true);
    part(outerX - .38, 0, .20, [.24, .43, depth - 1.6], larch, true);
  } else {
    // Western doors open directly toward the lake. The east end is the service
    // counter, so neither the floor nor the row of props fills the approach.
    part(outerX, 0, 1.13, [.25, 2.26, depth], larch, true);
    const door = 1.35;
    for (const side of [-1, 1]) {
      const panel = (depth - door) / 2;
      part(-outerX, side * (door / 2 + panel / 2), 1.05, [.25, 2.1, panel], larch, true);
    }
    part(-outerX, 0, 2.22, [.25, .30, depth], cedar, true);
    part(width * .22, 0, .48, [.73, .96, depth - 1.16], larch, true);
    part(width * .22, 0, 1.00, [.87, .14, depth - 1], cedar);
  }
  addLandmarkNameplate(group, site.name, x - width / 2 - .13, ground + 2.25, -n,
    Math.min(depth - .5, 2.5), .32, -Math.PI / 2,
    { color: '#eef6ff', background: '#334b68', accent: '#b4d6ec' });
}

function addPartBatch(group: Group, parts: Part[], name: string) {
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(), parts.length);
  mesh.name = name;
  const transform = new Object3D();
  const tint = new Color();
  parts.forEach(({ at: [east, y, north], size, color, yaw = 0 }, index) => {
    transform.position.set(east, y, -north);
    transform.scale.set(...size);
    transform.rotation.y = yaw;
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    mesh.setColorAt(index, tint.set(color));
  });
  mesh.computeBoundingSphere();
  group.add(mesh);
}

export function buildMirrorLakeScene(heightAt: HeightAt) {
  const group = new Group();
  group.name = 'mirror-lake-shore';
  const colliders: Box[] = [];
  group.userData.colliders = colliders;

  const fishingParts: Part[] = [];
  mirrorFishingSites.forEach(site => addFishingProps(fishingParts, site, heightAt));
  addPartBatch(group, fishingParts, 'mirror-lake-fishing-props');

  const serviceParts: Part[] = [];
  mirrorLakeServices.forEach(site => addService(serviceParts, colliders, group, site));
  addPartBatch(group, serviceParts, 'mirror-lake-service-buildings');
  return {
    group,
    dispose() {
      group.removeFromParent();
      group.traverse(child => {
        if (!(child instanceof Mesh)) return;
        if (child instanceof InstancedMesh) child.dispose();
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          if (material instanceof MeshBasicMaterial) material.map?.dispose();
          material.dispose();
        });
      });
      group.clear();
      colliders.length = 0;
    },
  };
}
