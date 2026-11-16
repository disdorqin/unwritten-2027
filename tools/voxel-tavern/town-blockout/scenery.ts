import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  ConeGeometry, CylinderGeometry, Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PointLight, Points, PointsMaterial, Vector3,
  Sprite, SpriteMaterial, SRGBColorSpace, type BufferGeometry as Geometry, type Material,
} from 'three';
import { canEnter, layout } from './terrain';

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
  const material = new SpriteMaterial({
    map: texture, blending: AdditiveBlending, transparent: true, depthWrite: false, opacity: .85,
  });
  for (const spot of positions) {
    const glow = new Sprite(material);
    glow.position.set(...spot);
    glow.scale.set(5, 5, 1);
    group.add(glow);
  }
  return material;
}

type Blocker = { x: number; n: number; radius: number };
export function addScenery(group: Group, grid: Ground) {
  let seed = 271;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const foliage: Instance[] = [];
  const branches: Instance[] = [];
  const trunks: Instance[] = [];
  const pillars: Instance[] = [];
  const lights: Instance[] = [];
  const caps: Instance[] = [];
  const pavers: Instance[] = [];
  const glowPositions: Position[] = [];
  const blockers: Blocker[] = [];
  const [w, s, e, n] = layout.plaza.bounds;
  const lamp = (x: number, y: number, north: number) => {
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
  for (const x of [w - 1.1, e + 1.1]) {
    for (const north of [s + 2, s + 18, s + 32, n - 2]) {
      if (layout.roads.some(road => road.points.some(([rx, rn]) => Math.hypot(x - rx, north - rn) < 5))) continue;
      lamp(x, grid.heightAt(x, north), north);
    }
  }
  for (const bridge of layout.bridges) {
    for (const x of [bridge.west + 1, bridge.east - 1]) {
      for (const north of [bridge.north - 3.7, bridge.north + 3.7]) lamp(x, bridge.height, north);
    }
  }

  for (const road of layout.roads) {
    if (road.id.endsWith('-loop')) continue;
    let nextLamp = 15;
    let side = 1;
    for (let i = 1; i < road.points.length; i++) {
      const [a, b] = [road.points[i - 1], road.points[i]];
      const dx = b[0] - a[0];
      const dn = b[1] - a[1];
      const length = Math.hypot(dx, dn);
      while (nextLamp <= length) {
        const offset = (road.width / 2 + 1) * side;
        const x = a[0] + (dx * nextLamp - dn * offset) / length;
        const north = a[1] + (dn * nextLamp + dx * offset) / length;
        const cell = Math.round(north) * grid.gridWidth + Math.round(x);
        const inPlot = layout.plots.some(({ origin, footprint }) =>
          Math.abs(x - origin[0]) <= footprint[0] / 2 + .7 && Math.abs(north - origin[1]) <= footprint[1] / 2 + .7);
        if (grid.surfaces[cell] === 0 && canEnter(x, north) && !inPlot
          && blockers.every(b => Math.hypot(x - b.x, north - b.n) > 4)) {
          lamp(x, grid.heightAt(x, north), north);
        }
        nextLamp += 25;
        side *= -1;
      }
      nextLamp -= length;
    }
  }

  const forests = [
    { x: 73, n: 321, rx: 57, rn: 56 },
    { x: 149, n: 342, rx: 54, rn: 30 },
    { x: 368, n: 353, rx: 57, rn: 33 },
    { x: 426, n: 246, rx: 17, rn: 82 },
    { x: 54, n: 152, rx: 25, rn: 81 },
    { x: 407, n: 44, rx: 25, rn: 25 },
  ];
  for (const patch of forests) {
    for (let i = 0; i < 64; i++) {
      const angle = random() * 2 * Math.PI;
      const radius = Math.sqrt(random());
      const x = patch.x + Math.cos(angle) * radius * patch.rx;
      const north = patch.n + Math.sin(angle) * radius * patch.rn;
      const cell = Math.round(north) * grid.gridWidth + Math.round(x);
      if (!canEnter(x, north) || grid.surfaces[cell] !== 0) continue;
      if (layout.plots.some(({ origin, footprint }) =>
        Math.abs(x - origin[0]) < footprint[0] / 2 + 4 && Math.abs(north - origin[1]) < footprint[1] / 2 + 4)) continue;
      if (blockers.some(b => Math.hypot(x - b.x, north - b.n) < 3.7)) continue;
      const y = grid.heightAt(x, north);
      const size = 4 + random() * 5;
      const z = -north;
      trunks.push({ at: [x, y + size * .23, z], scale: [size * .13, size * .46, size * .13] });
      for (let tier = 0; tier < 3; tier++) {
        const spread = size * (.72 - tier * .16);
        const base = y + size * (.34 + tier * .22);
        branches.push({ at: [x, base, z], scale: [spread, size * .47, spread], tint: tier % 2 ? '#355568' : '#274658' });
        foliage.push({ at: [x, base + size * .076, z], scale: [spread * .87, size * .41, spread * .87], tint: '#bbd0e7' });
      }
      blockers.push({ x, n: north, radius: size * .07 });
    }
  }

  const box = new BoxGeometry();
  const neutral = new MeshLambertMaterial();
  const pine = new ConeGeometry(.5, 1, 5);
  instances(group, box, neutral, pavers);
  instances(group, box, neutral, [...pillars, ...caps]);
  instances(group, box, new MeshBasicMaterial({ color: '#ffb969' }), lights);
  instances(group, new CylinderGeometry(.5, .65, 1, 5), new MeshLambertMaterial({ color: '#514653' }), trunks);
  instances(group, pine, neutral, [...branches, ...foliage]);
  const glow = makeGlows(group, glowPositions);
  const lampLightPool = Array.from({ length: 3 }, () => new PointLight('#ffb469', 0, 13, 2));
  const lampLocations = glowPositions.map(at => new Vector3(...at));
  group.add(...lampLightPool);
  let night = true;
  let nextLightUpdate = 0;

  const particles = new BufferGeometry();
  const positions = new Float32Array(750 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = random() * 62 - 31;
    positions[i + 1] = random() * 26 - 5;
    positions[i + 2] = random() * 62 - 31;
  }
  const vertices = new BufferAttribute(positions, 3);
  particles.setAttribute('position', vertices);
  const snow = new Points(particles, new PointsMaterial({
    color: '#e9f4ff', size: .095, transparent: true, opacity: .65, depthWrite: false,
  }));
  snow.frustumCulled = false;
  group.add(snow);
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
      snow.visible = walking;
      if (!walking) return;
      snow.position.set(x, y, z);
      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += dt * .34;
        if (positions[i] > 31) positions[i] -= 62;
        positions[i + 1] -= dt * 1.75;
        if (positions[i + 1] < -5) positions[i + 1] += 26;
      }
      vertices.needsUpdate = true;
    },
  };
}
