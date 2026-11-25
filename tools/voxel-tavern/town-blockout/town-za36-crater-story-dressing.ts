import {
  BoxGeometry, Color, ConeGeometry, DataTexture, DodecahedronGeometry, Group, InstancedMesh,
  MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace,
} from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
type Piece = 'scorch' | 'black-rock' | 'timber' | 'rust' | 'ice' | 'prop' | 'marker' | 'plate' | 'lamp';
type Band = 'rim' | 'trail' | 'floor' | 'terrace';
export type Za36ScenePiece = Readonly<{
  kind: Piece; band: Band; cluster: string; east: number; north: number; height: number;
}>;
const fixture = createMeteorCrater(meteorCraterFixturePlan);
const tau = 2 * Math.PI;
const geometry = {
  scorch: new BoxGeometry(),
  'black-rock': new DodecahedronGeometry(1, 0),
  timber: new BoxGeometry(),
  rust: new ConeGeometry(1, 1, 5),
  ice: new ConeGeometry(1, 1, 5),
  prop: new BoxGeometry(),
  marker: new BoxGeometry(),
  plate: new BoxGeometry(),
  lamp: new BoxGeometry(),
};
const sizes: Record<Piece, readonly [number, number, number]> = {
  scorch: [1.25, .09, .72],
  'black-rock': [.53, .55, .43],
  timber: [.9, .14, .23],
  rust: [.24, .42, .23],
  ice: [.19, .69, .19],
  prop: [.17, 1.5, .17],
  marker: [.1, .55, .1],
  plate: [2.6, .07, 1.9],
  lamp: [.16, 1.25, .16],
};

function grain(base: number, fleck: number, streak: number) {
  const size = 16;
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const pattern = (x * 11 + y * 7 + Math.floor(x / 3) * y * 3) % 31;
    const color = pattern < 4 ? fleck : x % 7 === 1 && y % 3 !== 0 ? streak : base;
    rgba.set([color >> 16, color >> 8 & 255, color & 255, 255], 4 * (x + size * y));
  }
  const map = new DataTexture(rgba, size, size);
  map.colorSpace = SRGBColorSpace;
  map.minFilter = map.magFilter = NearestFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}
const createMaterial = (base: number, fleck: number, streak: number) =>
  new MeshStandardMaterial({ map: grain(base, fleck, streak), flatShading: true, roughness: 1 });
const materials: Record<Piece, MeshStandardMaterial> = {
  scorch: createMaterial(0x38302a, 0x5d4630, 0x8a4a34),
  'black-rock': createMaterial(0x3a332c, 0x9a8a76, 0x5d4630),
  timber: createMaterial(0x5d4630, 0xa98a56, 0x2c3648),
  rust: createMaterial(0x8a4a34, 0x2c3648, 0x5d4630),
  ice: new MeshStandardMaterial({ color: 0x7fd4c8, emissive: 0x7fd4c8,
    emissiveIntensity: .18, roughness: 1, flatShading: true }),
  prop: createMaterial(0x5d4630, 0xa98a56, 0x8a4a34),
  marker: createMaterial(0xb8b0a0, 0x8a8378, 0x5d4630),
  // Band plates carry a light worked-earth base; the band family arrives
  // per instance as a colour tint, so one batch serves every terrace band.
  plate: createMaterial(0xb9a88f, 0x8a7a5f, 0x6e5a40),
  // Warm-chain lamp posts: dark iron with an amber emissive body — a lit
  // line at night without spending a real light from the crater budget.
  lamp: new MeshStandardMaterial({ color: 0x59462a, emissive: 0xffb45e,
    emissiveIntensity: .5, roughness: 1, flatShading: true }),
};

export function buildZa36CraterStoryDressing(road: Ground,
  extraReserved: readonly { east: number; north: number; radius: number }[] = []) {
  const { east: originE, north: originN, yaw } = road.anchor;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const group = new Group();
  group.name = 'za36-crater-story-dressing';
  const placements: Za36ScenePiece[] = [];
  const stamps = new Map<string, { part: Object3D; tint?: Color }[]>();
  const trail = Array.from({ length: 801 }, (_, i) => {
    const at = fixture.mainTrailPoint(i / 800);
    return { east: originE + at.east * c + at.north * s,
      north: originN + at.north * c - at.east * s };
  });
  const survey = surveyZa31CraterWinch(road);
  const reserved = survey ? [
    { east: survey.useFoot.east, north: survey.useFoot.north, radius: 1.45 },
    survey.snakeStoneReservation,
    { east: survey.plinth.east, north: survey.plinth.north, radius: 1.2 },
    ...extraReserved,
  ] : [...extraReserved];
  function add(kind: Piece, band: Band, cluster: string, east: number, north: number,
    angle: number, scale = 1, tilt = 0, tint?: Color) {
    const height = road.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) return;
    if (Math.hypot(east - originE, north - originN) < 8) return;
    if (Math.hypot(east - road.lip.east, north - road.lip.north) < 9.8) return;
    if (reserved.some(site => Math.hypot(east - site.east, north - site.north) < site.radius + .55)) return;
    if (trail.some(p => Math.hypot(east - p.east, north - p.north) < 3.1)) return;
    if (placements.some(p => Math.hypot(east - p.east, north - p.north) < .72)) return;
    const [sx, sy, sz] = sizes[kind];
    const part = new Object3D();
    part.position.set(east, height + sy * scale * .52, -north);
    part.rotation.set(tilt, angle, 0);
    part.scale.set(sx * scale, sy * scale, sz * scale);
    part.updateMatrix();
    const key = band + ':' + kind;
    const entries = stamps.get(key) ?? [];
    entries.push({ part, tint });
    stamps.set(key, entries);
    placements.push({ kind, band, cluster, east, north, height });
  }

  // Twenty-eight named spiralling human/impact traces; every interval of the
  // 3.5-turn descent has a cluster in view, without putting objects on the lane.
  for (let cluster = 0; cluster < 28; cluster++) {
    const progress = (cluster + .5) / 28;
    const at = fixture.mainTrailPoint(progress);
    const radial = Math.hypot(at.east, at.north);
    const angle = Math.atan2(at.east, at.north);
    const worldAngle = angle + yaw;
    const kind: Piece[] = ['scorch', 'black-rock', 'black-rock', 'timber', 'rust',
      progress > .55 ? 'ice' : 'scorch', 'black-rock'];
    for (let part = 0; part < kind.length; part++) {
      const radialShift = 4.5 + Math.floor(part / 3) * .72;
      const transverse = ((part % 3) - 1) * 1.45;
      const localE = (radial + radialShift) * Math.sin(angle) + transverse * Math.cos(angle);
      const localN = (radial + radialShift) * Math.cos(angle) - transverse * Math.sin(angle);
      add(kind[part]!, 'trail', 'descent-' + String(cluster + 1).padStart(2, '0'),
        originE + localE * c + localN * s,
        originN + localN * c - localE * s,
        worldAngle + (part % 3) * .32,
        // C3 second segment: one boulder per cluster at mid scale, so the
        // terraces read from the rim and the far side, not only up close.
        (.78 + (part % 4) * .15) * (part === 1 ? 2.6 : 1));
    }
  }

  // Rim black-rock scatter: several signatures away from the guarded mouth.
  for (let cluster = 0; cluster < 16; cluster++) {
    const angle = meteorCraterFixturePlan.mainTrail.startBearing + cluster * tau / 16;
    const worldAngle = angle + yaw;
    for (let part = 0; part < 5; part++) {
      const radius = 56.5 + Math.floor(part / 3) * 1.4;
      const tangent = ((part % 3) - 1) * 1.42;
      const localE = radius * Math.sin(angle) + tangent * Math.cos(angle);
      const localN = radius * Math.cos(angle) - tangent * Math.sin(angle);
      add(part === 0 ? 'scorch' : part === 4 ? 'rust' : 'black-rock',
        'rim', 'ejecta-' + String(cluster + 1).padStart(2, '0'),
        originE + localE * c + localN * s,
        originN + localN * c - localE * s, worldAngle + part * .17, .88);
    }
  }

  // Broken engineering trace near the covered well, not a new shaft, ship
  // debris, snake stone, or pickup. All service/interaction footprints remain free.
  const workKinds: Piece[] = ['timber', 'rust', 'black-rock', 'timber', 'rust', 'ice'];
  for (let cluster = 0; cluster < 12; cluster++) {
    const angle = .23 + cluster * tau / 12;
    const radius = 11.5 + (cluster % 3) * 1.35;
    for (let part = 0; part < 2; part++) {
      const offsetAngle = angle + (part === 0 ? -.08 : .08);
      const localE = radius * Math.sin(offsetAngle);
      const localN = radius * Math.cos(offsetAngle);
      add(workKinds[(cluster + part) % workKinds.length]!, 'floor',
        'old-work-' + String(cluster + 1).padStart(2, '0'),
        originE + localE * c + localN * s, originN + localN * c - localE * s,
        angle + yaw, .83);
    }
  }

  // C3 work faces (branch window C): shoring props, survey markers and tool
  // traces on the three terrace treads away from the spiral lane — the dug
  // engineering surface reads as worked, never as scattered wreckage. The
  // add() guards keep every piece off the trail and out of reserved ground.
  // Cluster angles sit in the widest angular gaps between the spiral's own
  // crossings of each tread, so the lane guard culls almost nothing.
  function gapAngles(radius: number, count: number) {
    const near = trail.filter(p =>
      Math.abs(Math.hypot(p.east - originE, p.north - originN) - radius) < 6);
    const chosen: number[] = [];
    for (let pick = 0; pick < count; pick++) {
      let best = 0;
      let bestClearance = -1;
      for (let step = 0; step < 126; step++) {
        const angle = step * tau / 126;
        if (chosen.some(other => Math.abs(Math.sin(angle - other)) < .24)) continue;
        const east = originE + radius * Math.sin(angle);
        const north = originN + radius * Math.cos(angle);
        let clearance = Infinity;
        for (const p of near) {
          clearance = Math.min(clearance, Math.hypot(east - p.east, north - p.north));
        }
        if (clearance > bestClearance) { bestClearance = clearance; best = angle; }
      }
      chosen.push(best);
    }
    return chosen;
  }
  const treads = [48, 39, 29.5];
  for (let level = 0; level < treads.length; level++) {
    const tread = treads[level]!;
    const angles = gapAngles(tread, 6);
    for (let cluster = 0; cluster < angles.length; cluster++) {
      const angle = angles[cluster]!;
      const name = 'workface-L' + (level + 1) + '-' + (cluster + 1);
      const place = (kind: Piece, radialShift: number, tangent: number,
        pieceAngle: number, scale: number, tilt = 0) => {
        const radius = tread + radialShift;
        const localE = radius * Math.sin(angle) + tangent * Math.cos(angle);
        const localN = radius * Math.cos(angle) - tangent * Math.sin(angle);
        add(kind, 'terrace', name, originE + localE * c + localN * s,
          originN + localN * c - localE * s, angle + yaw + pieceAngle, scale, tilt);
      };
      const midScale = (level + cluster) % 3 === 0 ? 1.8 : 1;
      for (const tangent of [-.8, 0, .8]) place('prop', -.1, tangent, 0, midScale, .24);
      place('marker', -1.3, .3, .2, 1);
      // A fourth prop down: the fallen shore log shares the prop batch, so
      // the dressing stays inside its pinned draw budget (<=15 groups).
      place('prop', -.6, -1.9, .5, .95 * (midScale === 1 ? 1 : 2.2), 1.3);
      // Cold-glint chain point: emissive ice at the cluster's inner corner,
      // a mine-lamp glint line along the treads without any real light.
      place('ice', -1.9, 2.4, 0, .7);
    }
  }

  // C3 floor ring: the annulus between the old-work ring and the floor edge
  // was bare. Cable coils, timber stacks and melt ice at the shaded side —
  // still the same stopped-workday language, nothing scattered or ship-like.
  for (let cluster = 0; cluster < 8; cluster++) {
    const angle = cluster * tau / 8 + .4;
    const name = 'floor-ring-' + (cluster + 1);
    const place = (kind: Piece, radialShift: number, tangent: number,
      pieceAngle: number, scale: number) => {
      const radius = 16.8 + radialShift;
      const localE = radius * Math.sin(angle) + tangent * Math.cos(angle);
      const localN = radius * Math.cos(angle) - tangent * Math.sin(angle);
      add(kind, 'floor', name, originE + localE * c + localN * s,
        originN + localN * c - localE * s, angle + yaw + pieceAngle, scale);
    };
    place('rust', 0, 0, 0, 1.35);
    place('timber', .3, -1.2, .4, cluster % 2 === 0 ? 1.9 : .95);
    place('timber', -.5, -1.5, .9, .85);
    place('black-rock', .2, 1.3, .2, .9);
    if (cluster % 2 === 1) place('ice', -.3, 2.1, 0, 1);
  }

  // C3 frost edge: crystal glints on the lowest tread lip above the floor,
  // deepening toward the shaft — the underground crystal field's first hint.
  for (let cluster = 0; cluster < 3; cluster++) {
    const angle = gapAngles(22, 3)[cluster] ?? (0.9 + cluster * 2.1);
    const name = 'frost-edge-' + (cluster + 1);
    for (let part = 0; part < 3; part++) {
      const radius = 22 + part * .5;
      const tangent = (part - 1) * .8;
      const localE = radius * Math.sin(angle) + tangent * Math.cos(angle);
      const localN = radius * Math.cos(angle) - tangent * Math.sin(angle);
      add('ice', 'terrace', name, originE + localE * c + localN * s,
        originN + localN * c - localE * s, angle + yaw, .8 + part * .2);
    }
  }

  // C3 band strips (crater offensive order 2026-11-21 21:25): the treads
  // stop being scattered points and become worked BANDS. A fixed-radius
  // ring cannot work here — the spiral lane hugs every tread radius, so
  // the band instead runs as a wide plate ribbon parallel to the lane in
  // the same offset ribbon the descent clusters use, one material family
  // and colour register per depth third: scorched earth on the upper
  // descent, ore through the middle, worked engineering grey below. Big
  // plates (5.2 x 3.8 m at scale 2) keep the skin inside the triangle
  // budget; the lane guard still breaks it wherever the lane crosses.
  const bandFamilies: readonly (readonly number[])[] = [
    [0x8a5a3c, 0x6e4a30, 0x7d5233],
    [0x96703c, 0x7c5c30, 0xa87f45],
    [0x8f8578, 0x7a7268, 0x989082],
  ];
  for (let i = 0; i < 150; i++) {
    const t = (i + .5) / 150;
    const at = fixture.mainTrailPoint(t);
    const radial = Math.hypot(at.east, at.north);
    const angle = Math.atan2(at.east, at.north);
    const level = t < .34 ? 0 : t < .67 ? 1 : 2;
    const family = bandFamilies[level]!;
    const radius = radial + 5.5;
    const localE = radius * Math.sin(angle);
    const localN = radius * Math.cos(angle);
    add('plate', 'terrace', 'band-L' + (level + 1),
      originE + localE * c + localN * s, originN + localN * c - localE * s,
      angle + yaw, 2, 0, new Color(family[i % family.length]!));
  }

  // C3 warm chain — RETIRED by the batch-98 double-lamp ruling
  // (2026-11-24): the crater floor's real-light chain is GPT window
  // C's six-lamp system; this dressing's emissive ring posts formed a
  // second, parallel post system (measured 3.0–8.5 m from the six,
  // no coincidences), so the ring stands down. The two collar posts
  // below stay, re-registered as shaft-mouth markers.

  // C3 shaft ring (the 10.6 m2 shaft-mouth zone): flat stained boards and a
  // rust drum base around the collar — workface grime, never in the walk-up
  // sector, never under the winch, plinth or the snake stone reservation.
  if (survey) {
    const centre = { east: originE, north: originN };
    const approachBearing = Math.atan2(survey.useFoot.east - centre.east,
      survey.useFoot.north - centre.north);
    const shaftPlaced: { east: number; north: number }[] = [];
    const addShaft = (kind: Piece, radius: number, bearing: number, scale: number) => {
      const east = centre.east + radius * Math.sin(bearing);
      const north = centre.north + radius * Math.cos(bearing);
      const height = road.heightAt(east, north);
      if (height === undefined || !Number.isFinite(height)) return;
      if (Math.abs(Math.sin(bearing - approachBearing)) < .5 &&
        Math.cos(bearing - approachBearing) > 0) return;
      if (Math.hypot(east - survey.useFoot.east, north - survey.useFoot.north) < 2) return;
      if (Math.hypot(east - survey.plinth.east, north - survey.plinth.north) < 1.8) return;
      if (Math.hypot(east - survey.snakeStoneReservation.east,
        north - survey.snakeStoneReservation.north) <
        survey.snakeStoneReservation.radius + .55) return;
      if (shaftPlaced.some(p => Math.hypot(east - p.east, north - p.north) < .85)) return;
      const [sx, sy, sz] = sizes[kind];
      const part = new Object3D();
      part.position.set(east, height + sy * scale * .52, -north);
      part.rotation.set(0, bearing + yaw, 0);
      part.scale.set(sx * scale, sy * scale, sz * scale);
      part.updateMatrix();
      const key = 'floor:' + kind;
      const entries = stamps.get(key) ?? [];
      entries.push({ part });
      stamps.set(key, entries);
      shaftPlaced.push({ east, north });
      placements.push({ kind, band: 'floor', cluster: 'shaft-ring', east, north, height });
    };
    for (let i = 0; i < 7; i++) {
      addShaft(i === 3 ? 'rust' : 'timber', 2.4 + (i % 3) * .45,
        approachBearing + 1.15 + i * .78, i === 3 ? .95 : .8);
    }
    addShaft('lamp', 5.2, approachBearing + .95, .9);
    addShaft('lamp', 5.2, approachBearing - .95, .9);
  }

  const batches: string[] = [];
  for (const [key, parts] of stamps) {
    if (!parts.length) continue;
    const kind = key.split(':')[1] as Piece;
    const batch = new InstancedMesh(geometry[kind], materials[kind], parts.length);
    batch.name = 'za36-dressing-' + key;
    parts.forEach((entry, index) => {
      batch.setMatrixAt(index, entry.part.matrix);
      if (entry.tint) batch.setColorAt(index, entry.tint);
    });
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    batch.computeBoundingSphere();
    group.add(batch);
    batches.push(key);
  }
  return { group, placements, batches };
}
