import {
  BoxGeometry, ConeGeometry, Group, InstancedMesh, MeshStandardMaterial, Object3D,
} from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import { createZa36StrataTexture } from './town-za36-crater-ejecta';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
export type Za36MidgroundPiece = Readonly<{
  kind: 'dead-pine' | 'fallen-pine' | 'lava-column';
  cluster: string;
  east: number;
  north: number;
  ground: number;
  height: number;
  radius: number;
}>;
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const trunkShape = new BoxGeometry();
const columnShape = new ConeGeometry(1, 1, 6);
const ashShape = new BoxGeometry();
const tau = Math.PI * 2;

const bark = new MeshStandardMaterial({
  map: createZa36StrataTexture(0x5d4630, 0x5d564c, 0x8a8378, 11), flatShading: true, roughness: 1,
});
const burntGround = new MeshStandardMaterial({
  map: createZa36StrataTexture(0x5d4630, 0x8a8378, 0xa98a56, 13, 0x8a4a34), flatShading: true, roughness: 1,
});
const basalt = new MeshStandardMaterial({
  map: createZa36StrataTexture(0x8a8378, 0x5d4630, 0xa98a56, 17), flatShading: true, roughness: 1,
});
const cinder = new MeshStandardMaterial({
  map: createZa36StrataTexture(0xa98a56, 0x8a8378, 0x5d4630, 19, 0x8a4a34), flatShading: true, roughness: 1,
});
const cyan = new MeshStandardMaterial({
  color: 0x7fd4c8, emissive: 0x7fd4c8, emissiveIntensity: .12, flatShading: true, roughness: 1,
});

/** Approved §II.5–6: 36 burnt trees, 8 logs and 2×7 lava pillars. */
export function buildZa36CraterMidground(road: Ground,
  reserved: readonly { east: number; north: number; radius: number }[] = []) {
  const { east: originE, north: originN, yaw } = road.anchor;
  const group = new Group();
  group.name = 'za36-crater-midground';
  const placements: Za36MidgroundPiece[] = [];
  const stamps = new Map<string, Object3D[]>();
  const trail = Array.from({ length: 1301 }, (_, index) => {
    const q = fixture.mainTrailPoint(index / 1300);
    return { east: originE + q.east * Math.cos(yaw) + q.north * Math.sin(yaw),
      north: originN + q.north * Math.cos(yaw) - q.east * Math.sin(yaw) };
  });
  const push = (batch: string, east: number, north: number, y: number,
    width: number, height: number, depth: number, heading = 0, lean = 0) => {
    const mesh = new Object3D();
    mesh.position.set(east, y, -north);
    mesh.rotation.set(lean, heading, 0, 'YXZ');
    mesh.scale.set(width, height, depth);
    mesh.updateMatrix();
    const shapes = stamps.get(batch) ?? [];
    shapes.push(mesh);
    stamps.set(batch, shapes);
  };
  function place(kind: Za36MidgroundPiece['kind'], cluster: string,
    east: number, north: number, height: number, radius: number) {
    const ground = road.heightAt(east, north);
    if (ground === undefined || !Number.isFinite(ground)) return;
    if (east < -234 || east > -8 || north < 9 || north > 525) return;
    if (Math.hypot(east - road.lip.east, north - road.lip.north) < 11 + radius) return;
    if (trail.some(point => Math.hypot(east - point.east, north - point.north) < radius + 3.35)) return;
    if (reserved.some(piece => Math.hypot(east - piece.east, north - piece.north) <
      radius + piece.radius * .8)) return;
    if (placements.some(piece => Math.hypot(east - piece.east, north - piece.north) <
      (radius + piece.radius) * .8)) return;
    placements.push({ kind, cluster, east, north, ground, height, radius });
    return ground;
  }

  // Three signature silhouettes at the forest's westmost skyline; all 36
  // trunks are unleafed and have broken branches, never white snow crowns.
  const forestBearings = [4.14, 4.68, 5.20];
  for (let sector = 0; sector < 3; sector++) {
    const cluster = 'burnt-forest-' + (sector + 1);
    let planted = 0;
    for (let i = 0; i < 250 && planted < 12; i++) {
      const bearing = forestBearings[sector]! + (i % 23 - 11) * .029;
      const distance = 73 + Math.floor(i / 23) % 8 * 5.2 + (i % 3) * 1.1;
      const east = originE + distance * Math.sin(bearing);
      const north = originN + distance * Math.cos(bearing);
      const height = planted === 0 ? 16 : 8.1 + ((i * 5 + sector * 3) % 8) * .93;
      const base = place('dead-pine', cluster, east, north, height, 1.35);
      if (base === undefined) continue;
      push('bark', east, north, base + height * .48, .42, height * .96, .42, bearing, -.065);
      for (let arm = 0; arm < 3; arm++) {
        const h = height * (.31 + arm * .23);
        const len = 1.5 + (i + arm) % 3 * .48;
        const heading = bearing + arm * tau / 3;
        const de = Math.sin(heading) * len * .32;
        const dn = Math.cos(heading) * len * .32;
        push('bark', east + de, north + dn, base + h,
          .22, len, .22, heading, Math.PI / 2 - .20);
      }
      // Broad ash at selected roots reads as a burnt forest from the rim,
      // without placing free-floating dark specks across the snow.
      if (planted % 3 === 0) push('ash', east + 1.25, north + 1.0, base + .035, 5.8, .07, 4.3, bearing);
      planted++;
    }
  }

  // Eight large fallen charred logs inside the same west-facing burn scar.
  let logs = 0;
  for (let i = 0; i < 160 && logs < 8; i++) {
    const bearing = 4.19 + i % 16 * .079;
    const distance = 82 + Math.floor(i / 16) * 8.2;
    const e = originE + distance * Math.sin(bearing);
    const n = originN + distance * Math.cos(bearing);
    const ground = place('fallen-pine', 'fallen-carbon-wood', e, n, .68, 2.2);
    if (ground === undefined) continue;
    push('bark', e, n, ground + .37, .62, 6.2, .62, bearing + .62, Math.PI / 2 - .02);
    logs++;
  }

  // Two melts on separated crater-wall sectors. Scan the geometric pockets
  // between three-and-a-half spiral turns instead of obstructing a stair.
  for (let melt = 0; melt < 2; melt++) {
    const cluster = 'impact-melt-wall-' + (melt + 1);
    let admitted = 0;
    for (let i = 0; i < 1250 && admitted < 7; i++) {
      const bearing = yaw + (melt === 0 ? 2.22 : 4.9) + (i % 43 - 21) * .051;
      const distance = 34.3 + Math.floor(i / 43) % 10 * 1.95;
      const e = originE + distance * Math.sin(bearing);
      const n = originN + distance * Math.cos(bearing);
      const height = 3.1 + (i * 3 + melt * 2) % 8 * .49;
      const ground = place('lava-column', cluster, e, n, height, 1.15);
      if (ground === undefined) continue;
      push(melt === 0 ? 'basalt' : 'cinder', e, n,
        ground + height * .49, 1.12, height * .98, 1.05, bearing);
      // A-5 cyan chip has a separate world-space footprint on a tilted
      // wall. Sampling the big basalt column's centre instead of this
      // +.38/+13 offset left chips visibly suspended above the real slope.
      const cyanE = e + .38, cyanN = n + .13;
      const cyanFoot = road.heightAt(cyanE, cyanN);
      if (cyanFoot !== undefined && Number.isFinite(cyanFoot))
        push('cyan', cyanE, cyanN, cyanFoot + .17, .21, .34, .21, bearing);
      admitted++;
    }
  }

  const geometries = { bark: trunkShape, ash: ashShape, basalt: columnShape,
    cinder: columnShape, cyan: columnShape };
  const materials = { bark, ash: burntGround, basalt, cinder, cyan };
  for (const [key, pieces] of stamps) {
    const name = key as keyof typeof geometries;
    const mesh = new InstancedMesh(geometries[name], materials[name], pieces.length);
    mesh.name = 'za36-midground-' + name;
    pieces.forEach((piece, index) => mesh.setMatrixAt(index, piece.matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, placements };
}
