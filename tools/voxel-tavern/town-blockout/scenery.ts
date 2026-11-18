import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PointLight, Vector3,
  Points, PointsMaterial, SRGBColorSpace, type BufferGeometry as Geometry, type Material,
} from 'three';
import { canEnter, layout } from './terrain';
import { roadCorridorKeepClear } from './road-clearance';
import { publicFireworksStand } from '../../../src/presence/firework-sites';

type Position = [x: number, y: number, z: number];
type Instance = { at: Position; scale: Position; tint?: string; turn?: number };
type Ground = ReturnType<typeof import('./terrain').createTerrainGrid>;

function instances(group: Group, geometry: Geometry, material: Material, items: Instance[]) {
  const mesh = new InstancedMesh(geometry, material, items.length);
  const dummy = new Object3D();
  items.forEach(({ at, scale, tint, turn = 0 }, index) => {
    dummy.position.set(...at);
    dummy.rotation.y = turn;
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

  const plazaHeight = layout.plaza.height;
  function inlay(x: number, north: number, width: number, depth: number, tint: string, turn = 0) {
    pavers.push({ at: [x, plazaHeight + .022, -north], scale: [width, .012, depth], tint, turn });
  }
  for (const [west, east] of [[w, 219], [219, 229], [229, e]]) {
    for (let x = west; x < east; x += 4) {
      for (let north = s; north < n; north += 4) {
        const width = Math.min(4, east - x), depth = Math.min(4, n - north);
        const seam = x === west || north === s || north + depth === n;
        const tint = west === 219
          ? ['#a8988a', '#b3a295'][Math.floor(random() * 2)]
          : seam ? '#6f7887' : ['#87919d', '#aab3ba', '#959daa', '#a3a7a7'][Math.floor(random() * 4)];
        pavers.push({ at: [x + width / 2, plazaHeight - .025, -north - depth / 2],
          scale: [width - .035, .085, depth - .035], tint });
        if (west !== 219 && (north - s) % 12 === 0) inlay(x + width / 2, north + .10, width - .08, .08, '#aabfcf');
      }
    }
  }
  const centreEast = 224, centreNorth = 188;
  for (const radius of [4, 7, 10]) {
    const pieces = radius * 8;
    for (let i = 0; i < pieces; i++) {
      const angle = i * 2 * Math.PI / pieces;
      inlay(centreEast + Math.cos(angle) * radius, centreNorth + Math.sin(angle) * radius,
        2 * Math.PI * radius / pieces + .05, radius === 4 ? .18 : .12,
        radius === 4 ? '#c6e2ed' : '#8fa7bb', angle + Math.PI / 2);
    }
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3;
    inlay(centreEast + Math.cos(angle) * 1.9, centreNorth + Math.sin(angle) * 1.9, 3.4, .18, '#d5e8f4', angle);
    for (const side of [-1, 1]) {
      const fork = angle + side * Math.PI / 3;
      inlay(centreEast + Math.cos(angle) * 2.5 + Math.cos(fork) * .46,
        centreNorth + Math.sin(angle) * 2.5 + Math.sin(fork) * .46,
        1.03, .14, '#d5e8f4', fork);
    }
  }
  // Keep the non-colliding edge lights in the existing emissive batch.
  for (const north of [s + 2, n - 2]) {
    lights.push({ at: [(w + e) / 2, plazaHeight + .023, -north], scale: [e - w - 4, .01, .095] });
  }
  for (const east of [w + 2, e - 2]) {
    lights.push({ at: [east, plazaHeight + .023, -(s + n) / 2], scale: [.095, .01, n - s - 4] });
  }
  for (const east of [216.5, 231.5]) {
    for (let north = 157; north <= 212; north += 11) {
      lamp(east, plazaHeight, north);
      for (const sign of [-1, 1]) {
        pillars.push({ at: [east + sign * .063, plazaHeight + 1.5, -north + .112],
          scale: [.09, .035, .032], tint: '#d2a56c', turn: sign * Math.PI / 4 });
        pillars.push({ at: [east + sign * .089, plazaHeight + 1.56, -north + .114],
          scale: [.032, .102, .033], tint: '#d2a56c' });
      }
    }
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
