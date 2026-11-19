import {
  AdditiveBlending, BoxGeometry, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  Group, InstancedMesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PointLight, Vector3,
  Points, PointsMaterial, SRGBColorSpace, type BufferGeometry as Geometry, type Material,
} from 'three';
import { canEnter, gridStep, layout, plazaCoreBounds, plazaPavingAllowed } from './terrain';
import { roadCorridorKeepClear } from './road-clearance';
import { addLandmarkNameplate } from './landmark-label';
import type { Box } from './landmark-kit';
import { campfirePartsPerSite, maxCampfireSites, type CampfirePiece } from './town-campfires';
import { plazaInformationSites } from './plaza-information-activity';
import { plazaSnowSupplySites, plazaSnowSupplySize, type PlazaSnowSupplySite } from './plaza-snow-supply';
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

function sceneryRandom() {
  let seed = 271;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function addScenery(group: Group, grid: Ground) {
  const random = sceneryRandom();
  const pillars: Instance[] = [];
  const lights: Instance[] = [];
  const caps: Instance[] = [];
  const pavers: Instance[] = [];
  const glowPositions: Position[] = [];
  const blockers: Blocker[] = [];
  const plazaCoverBoxes: Box[] = [];
  const supplyMounds: {
    site: PlazaSnowSupplySite; firstCap: number; ground: number; parts: Instance[]; heightScale: number;
  }[] = [];
  const [w, s, e, n] = layout.plaza.bounds;
  const [coreWest, coreSouth, coreEast, coreNorth] = plazaCoreBounds;
  const hasPlazaCore = w <= coreWest && s <= coreSouth && e >= coreEast && n >= coreNorth;
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
  const plazaBox = (x: number, north: number, y: number, scale: Position, tint: string, turn = 0) => {
    caps.push({ at: [x, plazaHeight + y, -north], scale, tint, turn });
  };

  const pavingColors = ['#87919d', '#aab3ba', '#959daa', '#a3a7a7'] as const;
  function pave(x: number, north: number, width: number, depth: number, tint: string) {
    const centreEast = x + width / 2, centreNorth = north + depth / 2;
    const tileRadius = Math.hypot(width, depth) / 2;
    if (plazaPavingAllowed(centreEast, centreNorth, tileRadius) &&
        grid.heightAt(centreEast, centreNorth) === plazaHeight &&
        grid.heightAt(x, north) === plazaHeight &&
        grid.heightAt(x + width, north) === plazaHeight &&
        grid.heightAt(x, north + depth) === plazaHeight &&
        grid.heightAt(x + width, north + depth) === plazaHeight) {
      pavers.push({ at: [centreEast, plazaHeight - .025, -centreNorth],
        scale: [width - .035, .085, depth - .035], tint });
      return;
    }
    // Split only at cuts and sloping edges; the full-size stone stays everywhere else.
    if (Math.max(width, depth) <= gridStep) return;
    if (width >= depth) {
      const first = Math.max(gridStep, Math.floor(width / (2 * gridStep)) * gridStep);
      pave(x, north, first, depth, tint);
      pave(x + first, north, width - first, depth, tint);
    } else {
      const first = Math.max(gridStep, Math.floor(depth / (2 * gridStep)) * gridStep);
      pave(x, north, width, first, tint);
      pave(x, north + first, width, depth - first, tint);
    }
  }

  if (hasPlazaCore) {
    function inlay(x: number, north: number, width: number, depth: number, tint: string, turn = 0) {
      if (plazaPavingAllowed(x, north, Math.hypot(width, depth) / 2)) {
        pavers.push({ at: [x, plazaHeight + .022, -north], scale: [width, .012, depth], tint, turn });
      }
    }
    for (const [west, east] of [[coreWest, 219], [219, 229], [229, coreEast]]) {
      for (let x = west; x < east; x += 4) {
        for (let north = coreSouth; north < coreNorth; north += 4) {
          const width = Math.min(4, east - x), depth = Math.min(4, coreNorth - north);
          const seam = x === west || north === coreSouth || north + depth === coreNorth;
          const tint = west === 219
            ? ['#a8988a', '#b3a295'][Math.floor(random() * 2)]
            : seam ? '#6f7887' : pavingColors[Math.floor(random() * pavingColors.length)];
          pave(x, north, width, depth, tint);
          if (west !== 219 && (north - coreSouth) % 12 === 0) inlay(x + width / 2, north + .10, width - .08, .08, '#aabfcf');
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
    // Leave breaks at road cuts and keep each continuous run in one emissive instance.
    function edgeLight(x: number, north: number, span: number, alongEast: boolean) {
      const stripeWidth = .095;
      const dx = alongEast ? 1 : 0, dn = alongEast ? 0 : 1;
      let start = 0;
      function placeRun(end: number) {
        if (end <= start) return;
        const length = end - start, mid = (start + end) / 2;
        lights.push({ at: [x + dx * mid, plazaHeight + .023, -north - dn * mid],
          scale: [alongEast ? length : stripeWidth, .01, alongEast ? stripeWidth : length] });
      }
      for (let along = 0; along < span; along += gridStep) {
        const step = Math.min(gridStep, span - along);
        const mid = along + step / 2;
        if (plazaPavingAllowed(x + dx * mid, north + dn * mid, Math.hypot(step, stripeWidth) / 2)) continue;
        placeRun(along);
        start = along + step;
      }
      placeRun(span);
    }
    for (const north of [coreSouth + 2, coreNorth - 2]) edgeLight(coreWest + 2, north, coreEast - coreWest - 4, true);
    for (const east of [coreWest + 2, coreEast - 2]) edgeLight(east, coreSouth + 2, coreNorth - coreSouth - 4, false);
    for (const east of [216.5, 231.5]) {
      for (let north = 157; north <= coreNorth; north += 11) {
        pillars.push({ at: [east, plazaHeight + .18, -north], scale: [.21, .36, .21], tint: '#453f48' });
        pillars.push({ at: [east, plazaHeight + .07, -north], scale: [.42, .14, .42], tint: '#78869b' });
        lights.push({ at: [east, plazaHeight + .44, -north], scale: [.36, .16, .36] });
        caps.push({ at: [east, plazaHeight + .55, -north], scale: [.49, .06, .49], tint: '#602b32' });
        caps.push({ at: [east, plazaHeight + .60, -north], scale: [.32, .04, .32], tint: '#c3d8ec' });
        glowPositions.push([east, plazaHeight + .44, -north]);
        blockers.push({ x: east, n: north, radius: .25 });
        for (const sign of [-1, 1]) {
          pillars.push({ at: [east + sign * .063, plazaHeight + .25, -north + .112],
            scale: [.09, .035, .032], tint: '#d2a56c', turn: sign * Math.PI / 4 });
          pillars.push({ at: [east + sign * .089, plazaHeight + .30, -north + .114],
            scale: [.032, .102, .033], tint: '#d2a56c' });
        }
      }
    }
    const plazaGlow = (x: number, north: number, y: number, scale: Position) => {
      lights.push({ at: [x, plazaHeight + y, -north], scale });
    };
    const gateEast = 161, gateNorth = 190;
    for (const north of [187.85, 192.15]) {
      plazaBox(gateEast, north, .18, [.66, .36, .66], '#8b8b94');
      plazaBox(gateEast, north, 1.94, [.41, 3.32, .41], '#7e423e');
      plazaBox(gateEast, north, 3.48, [.56, .19, .58], '#c59b55');
      plazaGlow(gateEast, north, 3.06, [.28, .39, .28]);
      blockers.push({ x: gateEast, n: north, radius: .35 });
    }
    plazaBox(gateEast, gateNorth, 3.66, [.57, .31, 5.16], '#5f3f3b');
    plazaBox(gateEast, gateNorth, 3.91, [.67, .19, 5.42], '#414b61');
    plazaBox(gateEast, gateNorth, 4.04, [.49, .14, 4.73], '#cfddeb');
    addLandmarkNameplate(group, '迎未', gateEast - .31, plazaHeight + 3.62, -gateNorth,
      1.54, .34, -Math.PI / 2, { background: '#603c38' });

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
    const { x: countdownEast, n: countdownNorth } = plazaInformationSites.countdown;
    plazaBox(countdownEast, countdownNorth, .073, [.62, .146, .34], '#8b898f');
    plazaBox(countdownEast, countdownNorth, .40, [.24, .65, .20], '#583d32');
    plazaBox(countdownEast, countdownNorth, .83, [1.12, .45, .16], '#693e33');
    plazaBox(countdownEast, countdownNorth - .088, .83, [.95, .31, .031], '#e3ca98');
    plazaBox(countdownEast, countdownNorth, 1.08, [1.19, .07, .22], '#924c3b');
    plazaBox(countdownEast, countdownNorth - .108, .846, [.61, .027, .011], '#9c7760');
    blockers.push({ x: countdownEast, n: countdownNorth, radius: .24 });
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
      for (const side of [-1, 1]) {
        plazaBox(boardEast + (index - 1.5) * .74, boardNorth + side * .083, .84, [.66, .45, .012], '#d2b58b');
      }
    }
    blockers.push({ x: boardEast, n: boardNorth, radius: 1.55 });

    const moundWidth = plazaSnowSupplySize.halfWidth * 2;
    for (const site of plazaSnowSupplySites) {
      const { east, north } = site;
      const firstCap = caps.length;
      plazaBox(east, north, .073, [moundWidth, .146, moundWidth], '#9bbbd0');
      plazaBox(east - .04, north + .035, .185, [1.17, .16, 1.16], '#c3ddea');
      plazaBox(east + .043, north - .07, .30, [.91, .16, .89], '#d9e9f4');
      plazaBox(east + .17, north + .10, .365, [.57, .14, .55], '#e4f1f9');
      plazaBox(east - .08, north - .06, plazaSnowSupplySize.height - .028,
        [.44, .056, .37], '#f1f8fc');
      supplyMounds.push({ site, firstCap, ground: plazaHeight, parts: caps.slice(firstCap), heightScale: 1 });
    }
    // The E226 covers stay removed to preserve the plaza's north–south route.
    const coverEast = 240;
    for (const coverNorth of [198.8, 166]) {
      plazaBox(coverEast, coverNorth, .41, [3, .82, .48], '#9db4c6');
      plazaBox(coverEast, coverNorth, .91, [3, .18, .5], '#e1eef8');
      for (const [index, eastOffset] of [-.99, 0, .99].entries()) {
        plazaBox(coverEast + eastOffset, coverNorth, .26, [.94, .34, .5],
          index % 2 === 0 ? '#bcd0df' : '#c4d6e4');
        plazaBox(coverEast - eastOffset, coverNorth, .61, [.94, .27, .5],
          index % 2 === 0 ? '#c4d6e4' : '#bcd0df');
      }
      plazaCoverBoxes.push({
        min: [coverEast - 1.5, plazaHeight, -coverNorth - .25],
        max: [coverEast + 1.5, plazaHeight + 1, -coverNorth + .25],
      });
    }
    for (const north of [186, 191, 196]) inlay(238, north, 1.40, 1.40, '#d1e3ed');
    inlay(242, 203, .64, .46, '#b58b5d');
    const annexRandom = sceneryRandom();
    for (const [west, south, east, top] of [
      [w, s, e, coreSouth], [w, coreSouth, coreWest, coreNorth],
      [coreEast, coreSouth, e, coreNorth], [w, coreNorth, e, n],
    ]) {
      for (let x = west; x < east; x += 4) {
        for (let north = south; north < top; north += 4) {
          const width = Math.min(4, east - x), depth = Math.min(4, top - north);
          const seam = x === w || north === s || x + width === e || north + depth === n;
          const tint = seam ? '#6f7887' : pavingColors[Math.floor(annexRandom() * pavingColors.length)];
          pave(x, north, width, depth, tint);
        }
      }
    }
  } else {
    for (let x = w + 1; x < e; x += 2) {
      for (let north = s + 1; north < n; north += 1.5) {
        const edge = x < w + 4 || x > e - 4 || north < s + 3 || north > n - 3;
        const tint = edge ? '#6f7887' : ['#a08b82', '#a79997', '#a5958a', '#968782'][Math.floor(random() * 4)];
        pavers.push({ at: [x, layout.plaza.height - .025, -north], scale: [1.965, .085, 1.466], tint });
      }
    }
  }

  // These approved northeast decorations remain on both plaza footprints.
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

  // Retain the approved east light line inside the annex; the station side stays clear.
  const perimeterLamps = [[w - 1.1, s, n], hasPlazaCore
    ? [coreEast + 1.1, coreSouth, coreNorth] : [e + 1.1, s, n]];
  for (const [x, south, top] of perimeterLamps) {
    for (const north of [south + 2, south + 18, south + 32, top - 2]) {
      if (layout.roads.some(road => road.points.some(([rx, rn]) => Math.hypot(x - rx, north - rn) < 5)) ||
          roadCorridorKeepClear(x, north, .75) || layout.plots.some(({ origin, footprint }) =>
            Math.abs(x - origin[0]) <= footprint[0] / 2 + .7 && Math.abs(north - origin[1]) <= footprint[1] / 2 + .7)) continue;
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
        const freeSnowfightField = hasPlazaCore && w <= x && x < coreWest && north >= 166 && north <= n;
        if (grid.surfaces[cell] === 0 && canEnter(x, north) && !inPlot && !freeSnowfightField
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
  const sceneryCapOffset = pavers.length + pillars.length;
  const sceneryPartCount = sceneryCapOffset + caps.length;
  const sceneryParts = instances(group, box, neutral, [...pavers, ...pillars, ...caps], campfirePartsPerSite * maxCampfireSites);
  instances(group, box, new MeshBasicMaterial({ color: '#ffb969' }), lights);
  const glow = makeGlows(group, glowPositions);
  const lampLightPool = Array.from({ length: 3 }, () => new PointLight('#ffb469', 0, 13, 2));
  const lampLocations = glowPositions.map(at => new Vector3(...at));
  group.add(...lampLightPool);
  let night = true;
  let nextLightUpdate = 0;
  const moundPose = new Object3D();

  return {
    updatePlazaSnowSupply(heightScale: (site: PlazaSnowSupplySite) => number, east: number, north: number) {
      if (east < w - 18 || east > e + 18 || north < s - 18 || north > n + 18) return;
      let changed = false;
      for (const mound of supplyMounds) {
        const height = heightScale(mound.site);
        if (!Number.isFinite(height) || height === mound.heightScale ||
            (height !== 1 && Math.abs(height - mound.heightScale) < .01)) continue;
        mound.heightScale = height;
        for (let i = 0; i < mound.parts.length; i++) {
          const { at: [x, y, z], scale: [width, size, depth] } = mound.parts[i];
          moundPose.position.set(x, mound.ground + (y - mound.ground) * height, z);
          moundPose.scale.set(width, size * height, depth);
          moundPose.updateMatrix();
          const index = sceneryCapOffset + mound.firstCap + i;
          sceneryParts.setMatrixAt(index, moundPose.matrix);
          sceneryParts.instanceMatrix.addUpdateRange(index * 16, 16);
        }
        changed = true;
      }
      if (changed) sceneryParts.instanceMatrix.needsUpdate = true;
    },
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
      // Campfires and plaza snow can both change before the next render.
      if (parts.length) sceneryParts.instanceMatrix.addUpdateRange(sceneryPartCount * 16, parts.length * 16);
      sceneryParts.instanceMatrix.needsUpdate = true;
      sceneryParts.instanceColor!.needsUpdate = true;
      sceneryParts.computeBoundingSphere();
    },
    litAt(east: number, north: number, feet: number) {
      const radius = 7;
      return night && lampLocations.some(lamp => Math.abs(lamp.y - feet - 1.6) <= 3.6 &&
        (lamp.x - east) ** 2 + (lamp.z + north) ** 2 <= radius ** 2);
    },
    plazaCoverBoxes,
    plazaCoverBlocks(east: number, north: number, radius: number) {
      return plazaCoverBoxes.some(({ min, max }) => {
        const dx = Math.max(min[0] - east, east - max[0], 0);
        const dn = Math.max(min[2] + north, -north - max[2], 0);
        return dx * dx + dn * dn < radius * radius;
      });
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
