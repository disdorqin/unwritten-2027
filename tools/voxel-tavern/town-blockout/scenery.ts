import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PointLight, Vector3,
  Points, PointsMaterial, SRGBColorSpace, type BufferGeometry as Geometry, type Material,
} from 'three';
import { canEnter, layout } from './terrain';
import { roadCorridorKeepClear } from './road-clearance';
import { publicFireworksStand } from '../../../src/presence/firework-sites';

type Position = [x: number, y: number, z: number];
type Instance = { at: Position; scale: Position; tint?: string };
type Ground = ReturnType<typeof import('./terrain').createTerrainGrid>;

function instances(group: Group, geometry: Geometry, material: Material, items: Instance[]) {
  const mesh = new InstancedMesh(geometry, material, items.length);
  const dummy = new Object3D();
  items.forEach(({ at, scale, tint }, index) => {
    dummy.position.set(...at);
    dummy.scale.set(...scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (tint) mesh.setColorAt(index, new Color(tint));
  });
  group.add(mesh);
  return mesh;
}

function makeGlows(group: Group, positions: Position[]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255, 204, 125, 0.95)');
  gradient.addColorStop(.3, 'rgba(255, 161, 71, 0.32)');
  gradient.addColorStop(1, 'rgba(255, 139, 58, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const material = new PointsMaterial({
    map: texture, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: .85,
    size: 5 / Math.tan(58 * Math.PI / 360),
  });
  const buffer = new BufferGeometry();
  buffer.setAttribute('position', new Float32BufferAttribute(positions.flat(), 3));
  const glow = new Points(buffer, material);
  glow.name = 'Street lamp glows';
  group.add(glow);
  return material;
}

type Blocker = { x: number; n: number; radius: number };
export function addScenery(group: Group, grid: Ground) {
  let seed = 271;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const pillars: Instance[] = [];
  const lights: Instance[] = [];
  const caps: Instance[] = [];
  const pavers: Instance[] = [];
  const glowPositions: Position[] = [];
  const blockers: Blocker[] = [];
  const [w, s, e, n] = layout.plaza.bounds;
  function nearEntrance(x: number, north: number, margin: number) {
    return layout.plots.some(({ connect: [ax, an], door: [bx, bn] }) => {
      const dx = bx - ax;
      const dn = bn - an;
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (north - an) * dn) / (dx * dx + dn * dn)));
      return Math.hypot(x - ax - t * dx, north - an - t * dn) < margin;
    });
  }
  const lamp = (x: number, y: number, north: number) => {
    if (nearEntrance(x, north, 1.35)) return;
    const z = -north;
    pillars.push({ at: [x, y + 1.3, z], scale: [.21, 2.6, .21], tint: '#453f48' });
    pillars.push({ at: [x, y + .21, z], scale: [.48, .42, .48], tint: '#78869b' });
    lights.push({ at: [x, y + 2.72, z], scale: [.46, .55, .46] });
    caps.push({ at: [x, y + 3.04, z], scale: [.65, .13, .65], tint: '#602b32' });
    caps.push({ at: [x, y + 3.14, z], scale: [.54, .09, .54], tint: '#c3d8ec' });
    glowPositions.push([x, y + 2.72, z]);
    blockers.push({ x, n: north, radius: .25 });
  };

  for (let x = w + 1; x < e; x += 2) {
    for (let north = s + 1; north < n; north += 1.5) {
      const edge = x < w + 4 || x > e - 4 || north < s + 3 || north > n - 3;
      const tint = edge ? '#6f7887' : ['#a08b82', '#a79997', '#a5958a', '#968782'][Math.floor(random() * 4)];
      pavers.push({ at: [x, layout.plaza.height - .025, -north], scale: [1.965, .085, 1.466], tint });
    }
  }
  const plazaBox = (x: number, north: number, y: number, scale: Position, tint: string) => {
    caps.push({ at: [x, grid.heightAt(x, north) + y, -north], scale, tint });
  };

  const snowFamily = [[240.5, 200.5, .87], [244.8, 200.5, .65], [247.6, 204.8, .79], [247.6, 208.0, .52]];
  for (const [x, north, size] of snowFamily) {
    for (const [y, width] of [[.34, 1.02], [.82, .76], [1.22, .59]]) {
      plazaBox(x, north, y * size, [width * size, width * .66 * size, width * size], '#e1eef9');
      plazaBox(x, north, (y + width * .32) * size,
        [width * .72 * size, width * .18 * size, width * .72 * size], '#f0f6ff');
    }
    plazaBox(x, north, 1.03 * size, [.62 * size, .11 * size, .64 * size], '#933e37');
    plazaBox(x + .18 * size, north - .34 * size, .89 * size, [.16 * size, .24 * size, .075], '#b65043');
    for (const side of [-1, 1]) {
      plazaBox(x + side * .13 * size, north - .31 * size, 1.30 * size, [.07 * size, .07 * size, .05], '#354454');
    }
    plazaBox(x, north - .37 * size, 1.17 * size, [.08 * size, .075 * size, .18 * size], '#b97442');
    plazaBox(x, north, 1.49 * size, [.67 * size, .09 * size, .67 * size], '#3f5268');
    plazaBox(x, north, 1.60 * size, [.44 * size, .18 * size, .44 * size], '#3f5268');
    blockers.push({ x, n: north, radius: .49 * size });
  }

  const horseEast = 242.5, horseNorth = 207.5;
  const iceHorseBox = (x: number, z: number, y: number, scale: Position, tint: string) => {
    plazaBox(horseEast + x, horseNorth - z, y, scale, tint);
  };
  iceHorseBox(0, 0, .13, [2.70, .26, 1.62], '#6f96b3');
  iceHorseBox(0, 0, .34, [2.38, .16, 1.31], '#abcce0');
  for (const side of [-1, 1]) {
    const z = side * .31;
    iceHorseBox(-.69, z, .75, [.24, .71, .24], '#87bbd8');
    iceHorseBox(-.56, z, 1.15, [.32, .51, .26], '#a6d3eb');
    iceHorseBox(.61, z, .78, [.20, .67, .23], '#8ebfdb');
    iceHorseBox(.79, z, 1.08, [.32, .20, .23], '#afd8ed');
    iceHorseBox(side * .72, z, .46, [.32, .12, .27], '#b9e3f1');
    iceHorseBox(.83, z * .57, 2.37, [.13, .29, .13], '#cdebf3');
  }
  iceHorseBox(-.05, 0, 1.38, [1.53, .53, .81], '#93c8e1');
  iceHorseBox(-.05, 0, 1.65, [1.31, .23, .66], '#c0e3f0');
  iceHorseBox(.55, 0, 1.79, [.46, .69, .55], '#9fcde6');
  iceHorseBox(.76, 0, 2.17, [.48, .32, .46], '#bbdfee');
  iceHorseBox(1.05, 0, 2.02, [.38, .23, .41], '#a2cfe5');
  iceHorseBox(.88, -.24, 2.22, [.07, .07, .04], '#527e9a');
  iceHorseBox(-.86, 0, 1.5, [.23, .18, .26], '#b6dded');
  iceHorseBox(-1.02, 0, 1.29, [.20, .30, .21], '#abd9ee');
  blockers.push({ x: horseEast, n: horseNorth, radius: 1.36 });

  for (const [x, north] of [[218, 190], [246, 184], [246, 196]]) {
    for (const [y, width, depth, height, tint] of [
      [.08, .94, 1.38, .16, '#adbfd1'],
      [.24, .77, 1.13, .25, '#cad9e6'],
      [.41, .58, .82, .15, '#e0ecf6'],
      [.51, .44, .51, .075, '#edf5fb'],
    ] as const) plazaBox(x, north, y, [width, height, depth], tint);
  }

  for (const x of [w - 1.1, e + 1.1]) {
    for (const north of [s + 2, s + 18, s + 32, n - 2]) {
      if (layout.roads.some(road => road.points.some(([rx, rn]) => Math.hypot(x - rx, north - rn) < 5))) continue;
      lamp(x, grid.heightAt(x, north), north);
    }
  }
  for (const bridge of layout.bridges) {
    // Off the deck: on-deck lamps block the +-3.5 m edge lanes at the heads.
    // R4-D1 (2026-11-18, scheme (b) round 2): lamps moved 0.35 m further OUT
    // LATERALLY (north +-4.05, longitudinal back to west-1.2 / east+1.2).
    // dn=4.05 >= 3.75 clears bridgeMouthKeepClear outright, and the lateral
    // gap to the +-3.5 m lane is 0.55 >= 0.52. (Round 1's +0.35 m longitudinal
    // move failed both checks; see reports/r4d1-lamp-move.md §8.)
    for (const x of [bridge.west - 1.2, bridge.east + 1.2]) {
      for (const north of [bridge.north - 4.05, bridge.north + 4.05]) lamp(x, grid.heightAt(x, north), north);
    }
  }

  for (const road of layout.roads) {
    let nextLamp = 15;
    let side = 1;
    for (let i = 1; i < road.points.length; i++) {
      const [a, b] = [road.points[i - 1], road.points[i]];
      const dx = b[0] - a[0];
      const dn = b[1] - a[1];
      const length = Math.hypot(dx, dn);
      while (nextLamp <= length) {
        const offset = (road.width / 2 + 1) * side;
        let x = a[0] + (dx * nextLamp - dn * offset) / length;
        let north = a[1] + (dn * nextLamp + dx * offset) / length;
        if (roadCorridorKeepClear(x, north, .75)) {
          // Try the shoulder before dropping a lamp at a junction or bridge approach.
          x -= dn * side / length;
          north += dx * side / length;
        }
        const cell = Math.round(north) * grid.gridWidth + Math.round(x);
        const inPlot = layout.plots.some(({ origin, footprint }) =>
          Math.abs(x - origin[0]) <= footprint[0] / 2 + .7 && Math.abs(north - origin[1]) <= footprint[1] / 2 + .7);
        if (grid.surfaces[cell] === 0 && canEnter(x, north) && !inPlot
          && !roadCorridorKeepClear(x, north, .75)
          && blockers.every(b => Math.hypot(x - b.x, north - b.n) > 4)) {
          lamp(x, grid.heightAt(x, north), north);
        }
        nextLamp += 25;
        side *= -1;
      }
      nextLamp -= length;
    }
  }

  const { east: fireworkX, fixtureNorth: fireworkNorth } = publicFireworksStand;
  const fireworkGround = grid.heightAt(fireworkX, fireworkNorth);
  const standPiece = (dx: number, dy: number, dz: number, scale: Position, tint: string) => {
    caps.push({ at: [fireworkX + dx, fireworkGround + dy, -fireworkNorth + dz], scale, tint });
  };
  standPiece(0, .09, 0, [1.66, .18, 1.10], '#596679');
  standPiece(0, .20, 0, [1.56, .08, 1.02], '#8791a2');
  standPiece(0, .36, 0, [1.30, .25, .92], '#455166');
  for (const dx of [-.60, .60]) for (const dz of [-.37, .37]) {
    standPiece(dx, .36, dz, [.13, .25, .13], '#98704e');
  }
  standPiece(0, .51, 0, [1.42, .08, .98], '#8f969f');
  standPiece(0, .562, -.42, [1.3, .032, .09], '#c39556');
  standPiece(-.50, .73, -.16, [.08, .36, .09], '#6e4d3e');
  standPiece(-.50, .91, -.16, [.20, .13, .15], '#bd8e55');
  for (const dx of [-.36, 0, .36]) {
    standPiece(dx, .69, .13, [.22, .24, .22], '#7f4a43');
    standPiece(dx, .83, .13, [.26, .07, .26], '#a87549');
    standPiece(dx, .865, .13, [.147, .021, .147], '#362631');
  }
  blockers.push({ x: fireworkX, n: fireworkNorth, radius: 1.0 });

  const box = new BoxGeometry();
  const neutral = new MeshLambertMaterial();
  instances(group, box, neutral, pavers);
  instances(group, box, neutral, [...pillars, ...caps]);
  instances(group, box, new MeshBasicMaterial({ color: '#ffb969' }), lights);
  const glow = makeGlows(group, glowPositions);
  const lampLightPool = Array.from({ length: 3 }, () => new PointLight('#ffb469', 0, 13, 2));
  const lampLocations = glowPositions.map(at => new Vector3(...at));
  group.add(...lampLightPool);
  let night = true;
  let nextLightUpdate = 0;

  return {
    blocked: (x: number, north: number) => blockers.some(b => Math.hypot(x - b.x, north - b.n) < b.radius + .27),
    setNight: (enabled: boolean) => {
      night = enabled;
      glow.opacity = night ? .85 : .18;
      nextLightUpdate = 0;
    },
    update: (dt: number, walking: boolean, x: number, y: number, z: number) => {
      nextLightUpdate -= dt;
      if (nextLightUpdate <= 0) {
        const nearby = lampLocations
          .map(at => ({ at, distance: Math.hypot(x - at.x, y - at.y, z - at.z) }))
          .filter(({ distance }) => distance < 46)
          .sort((a, b) => a.distance - b.distance);
        lampLightPool.forEach((light, index) => {
          const candidate = nearby[index];
          light.intensity = night && walking && candidate ? 62 : 0;
          if (candidate) light.position.copy(candidate.at);
        });
        nextLightUpdate = .22;
      }
    },
  };
}
