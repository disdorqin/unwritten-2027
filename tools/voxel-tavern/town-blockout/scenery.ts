import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PointLight, Vector3,
  Points, PointsMaterial, SRGBColorSpace, type BufferGeometry as Geometry, type Material,
} from 'three';
import { canEnter, layout } from './terrain';
import { roadCorridorKeepClear } from './road-clearance';
import { campfirePartsPerSite, maxCampfireSites, type CampfirePiece } from './town-campfires';
import { publicFireworksStand } from '../../../src/presence/firework-sites';

type Position = [x: number, y: number, z: number];
type Instance = { at: Position; scale: Position; tint?: string; turn?: number };
type Ground = ReturnType<typeof import('./terrain').createTerrainGrid>;

function instances(group: Group, geometry: Geometry, material: Material, items: Instance[], reserve = 0) {
  const mesh = new InstancedMesh(geometry, material, items.length + reserve);
  mesh.count = items.length;
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

  if (w === 161 && s === 152 && e === 251 && n === 212) {
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
      for (let north = 157; north <= n; north += 11) {
        pillars.push({ at: [east, plazaHeight + .36, -north], scale: [.21, .72, .21], tint: '#453f48' });
        pillars.push({ at: [east, plazaHeight + .10, -north], scale: [.42, .20, .42], tint: '#78869b' });
        lights.push({ at: [east, plazaHeight + .87, -north], scale: [.36, .30, .36] });
        caps.push({ at: [east, plazaHeight + 1.05, -north], scale: [.49, .11, .49], tint: '#602b32' });
        caps.push({ at: [east, plazaHeight + 1.15, -north], scale: [.32, .08, .32], tint: '#c3d8ec' });
        glowPositions.push([east, plazaHeight + .87, -north]);
        blockers.push({ x: east, n: north, radius: .25 });
        for (const sign of [-1, 1]) {
          pillars.push({ at: [east + sign * .063, plazaHeight + .51, -north + .112],
            scale: [.09, .035, .032], tint: '#d2a56c', turn: sign * Math.PI / 4 });
          pillars.push({ at: [east + sign * .089, plazaHeight + .57, -north + .114],
            scale: [.032, .102, .033], tint: '#d2a56c' });
        }
      }
    }
    const plazaBox = (x: number, north: number, y: number, scale: Position, tint: string, turn = 0) => {
      caps.push({ at: [x, plazaHeight + y, -north], scale, tint, turn });
    };
    const plazaGlow = (x: number, north: number, y: number, scale: Position) => {
      lights.push({ at: [x, plazaHeight + y, -north], scale });
    };
    const yearTreeEast = 208, yearTreeNorth = 198;
    for (let index = 0; index < 24; index++) {
      const angle = index * Math.PI / 12;
      const x = yearTreeEast + 7 * Math.cos(angle);
      const north = yearTreeNorth + 7 * Math.sin(angle);
      inlay(x, north, 1.86, .5, '#b9a881', angle + Math.PI / 2);
      if (index % 3 === 0) {
        plazaBox(x, north, .28, [1.36, .22, .54], '#835c44', angle + Math.PI / 2);
        plazaBox(x, north, .11, [.42, .22, .42], '#5b4741');
      }
      if (index % 4 === 2) plazaGlow(x, north, .04, [.22, .04, .22]);
    }
    for (const [x, north] of [[199.7, 209.7], [203.1, 209.7]]) {
      plazaBox(x, north, .36, [.18, .72, .18], '#62463a');
      plazaGlow(x, north, .82, [.3, .26, .3]);
      plazaBox(x, north, 1.01, [.42, .12, .42], '#8c3f39');
    }
    // The west-facing resting nook leaves the wishing-tree interaction approach open.
    const nookEast = 198.3, nookNorth = 208.6;
    plazaBox(nookEast, nookNorth, .045, [1.30, .09, .78], '#b18a52');
    for (const north of [208.05, 209.15]) {
      plazaBox(nookEast - .70, north, .25, [.13, .50, .13], '#805c4a');
      plazaBox(nookEast - .70, north, .23, [.09, .10, .90], '#805c4a');
    }
    plazaBox(nookEast + .70, nookNorth, .12, [.32, .24, .42], '#765140');
    const boardEast = 234, boardNorth = 208;
    for (const x of [boardEast - 1.4, boardEast + 1.4]) {
      plazaBox(x, boardNorth, .44, [.18, .88, .25], '#5e4035');
    }
    plazaBox(boardEast, boardNorth, .84, [3.15, .63, .14], '#653e37');
    plazaBox(boardEast, boardNorth, 1.16, [3.26, .08, .28], '#97453b');
    for (let index = 0; index < 4; index++) {
      plazaBox(boardEast + (index - 1.5) * .74, boardNorth - .083, .84, [.66, .45, .012], '#d2b58b');
    }
    blockers.push({ x: boardEast, n: boardNorth, radius: 1.55 });

    for (const [x, north] of [[238, 205], [240, 173]]) {
      plazaBox(x, north, .20, [.77, .40, .77], '#655252');
      plazaBox(x, north, .42, [1.02, .18, 1.02], '#453c43');
      plazaGlow(x, north, .54, [.59, .12, .59]);
      blockers.push({ x, n: north, radius: .50 });
      for (const angle of [Math.PI * .17, Math.PI / 2, Math.PI * .83]) {
        const seatX = x + 1.62 * Math.cos(angle);
        const seatNorth = north + 1.62 * Math.sin(angle);
        plazaBox(seatX, seatNorth, .28, [.95, .18, .45], '#78544a', angle + Math.PI / 2);
        plazaBox(seatX, seatNorth, .10, [.48, .20, .40], '#53545d');
      }
    }
    for (const north of [186, 191, 196]) inlay(238, north, 1.40, 1.40, '#d1e3ed');
    inlay(242, 203, .64, .46, '#b58b5d');
  } else {
    for (let x = w + 1; x < e; x += 2) {
      for (let north = s + 1; north < n; north += 1.5) {
        const edge = x < w + 4 || x > e - 4 || north < s + 3 || north > n - 3;
        const tint = edge ? '#6f7887' : ['#a08b82', '#a79997', '#a5958a', '#968782'][Math.floor(random() * 4)];
        pavers.push({ at: [x, layout.plaza.height - .025, -north], scale: [1.965, .085, 1.466], tint });
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
  const sceneryPartCount = pillars.length + caps.length;
  const sceneryParts = instances(group, box, neutral, [...pillars, ...caps], campfirePartsPerSite * maxCampfireSites);
  instances(group, box, new MeshBasicMaterial({ color: '#ffb969' }), lights);
  const glow = makeGlows(group, glowPositions);
  const lampLightPool = Array.from({ length: 3 }, () => new PointLight('#ffb469', 0, 13, 2));
  const lampLocations = glowPositions.map(at => new Vector3(...at));
  group.add(...lampLightPool);
  let night = true;
  let nextLightUpdate = 0;

  return {
    setCampfirePieces(parts: readonly CampfirePiece[]) {
      const count = sceneryPartCount + parts.length;
      if (count > sceneryParts.instanceMatrix.count) throw new RangeError('Campfire scenery exceeds the world batch reserve');
      const pose = new Object3D();
      const tint = new Color();
      sceneryParts.count = count;
      parts.forEach(({ at, scale, tint: color, yaw = 0 }, index) => {
        pose.position.set(...at);
        pose.rotation.y = yaw;
        pose.scale.set(...scale);
        pose.updateMatrix();
        sceneryParts.setMatrixAt(sceneryPartCount + index, pose.matrix);
        sceneryParts.setColorAt(sceneryPartCount + index, tint.set(color));
      });
      sceneryParts.instanceMatrix.needsUpdate = true;
      sceneryParts.instanceColor!.needsUpdate = true;
      sceneryParts.computeBoundingSphere();
    },
    litAt(east: number, north: number, feet: number) {
      const radius = 7;
      return night && lampLocations.some(lamp => Math.abs(lamp.y - feet - 1.6) <= 3.6 &&
        (lamp.x - east) ** 2 + (lamp.z + north) ** 2 <= radius ** 2);
    },
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
