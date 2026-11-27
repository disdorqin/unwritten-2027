import {
  Box3, BoxGeometry, DataTexture, DodecahedronGeometry, Group, InstancedMesh,
  MeshStandardMaterial, NearestFilter, Object3D, SRGBColorSpace, Vector3,
} from 'three';
import { createMeteorCrater, meteorCraterFixturePlan } from './meteor-crater';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import type { Box } from './landmark-kit';
import { surveyZa31CraterWinch } from './town-za31-crater-winch';
import { buildBR30CrystalForm, buildBR30RailFragment, buildBR30TimberFragment } from './town-b-r30-crater-remnant-forms';
import { surveyBR30RelicView, type BR30RelicView } from './town-b-r30-crater-relic-view';
import { buildBR30BrokenTrestle } from './town-b-r30-broken-trestle';

type Ground = Pick<ReturnType<typeof mountWestCraterRoad>, 'anchor' | 'lip' | 'heightAt'>;
type Piece = 'scorch' | 'black-rock' | 'timber' | 'rust' | 'ice';

export type CraterMidgroundPiece = Readonly<{
  kind: Piece; cluster: string; east: number; north: number; height: number;
}>;

/**
 * C3 fifth segment — the mid-ground layer (transferred from window C
 * to branch window B, batch 92; construction ordered batch 103).
 * Window C's za36 dressing covers the descent lane ribbon, the rim
 * scatter, the terrace work faces, the floor rings and the shaft
 * ring; what stayed bare is the bowl's MIDDLE band between those
 * set pieces — the distances a player actually reads while walking
 * the spiral. This module fills that band with the same stopped-
 * workday language (boulder clusters, scorch patches, timber
 * traces, cold glints), under the same placement guards.
 *
 * Deliberately NOT here: the central mound's charred forest and
 * wind flags. The mound is C2's body (ruled E-120/N196, r21, h7.5);
 * its disc is reserved below and the planting waits for the
 * measured mound surface, per the batch-95/103 interface ruling.
 *
 * Placement is deterministic (seeded), so the coordinator's
 * ground-batch accounting can pin this layer's counts.
 */

const fixture = createMeteorCrater(meteorCraterFixturePlan);
const tau = 2 * Math.PI;
const geometry = {
  scorch: new BoxGeometry(),
  'black-rock': new DodecahedronGeometry(1, 0),
  timber: buildBR30TimberFragment(),
  rust: buildBR30RailFragment(),
  ice: buildBR30CrystalForm(),
};
const sizes: Record<Piece, readonly [number, number, number]> = {
  scorch: [1.25, .09, .72],
  'black-rock': [.53, .55, .43],
  timber: [1.12, .92, .74],
  rust: [.56, 1.05, .52],
  ice: [.49, 1.12, .49],
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
  ice: new MeshStandardMaterial({ color: 0x8acccf, emissive: 0x4c8995,
    emissiveIntensity: .15, roughness: .42, metalness: .12, flatShading: true }),
};

/** The ruled mound disc (batch 95): centre E-120/N196, r21 — plus margin. */
export const moundReservation = { east: -120, north: 196, radius: 23 } as const;

/** Deterministic LCG so placement is stable across runs and machines. */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function buildCraterMidgroundS5(road: Ground,
  options: {
    /** Existing dressing placements to keep clear of (e.g. za36's). */
    avoid?: readonly { east: number; north: number }[];
    extraReserved?: readonly { east: number; north: number; radius: number }[];
  } = {}) {
  const { east: originE, north: originN, yaw } = road.anchor;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const group = new Group();
  group.name = 'crater-midground-s5';
  const placements: CraterMidgroundPiece[] = [];
  const crystalViews: {cluster:string;view:BR30RelicView}[]=[];
  const colliders:Box[]=[];
  const stamps = new Map<Piece, Object3D[]>();
  const trail = Array.from({ length: 801 }, (_, i) => {
    const at = fixture.mainTrailPoint(i / 800);
    return { east: originE + at.east * c + at.north * s,
      north: originN + at.north * c - at.east * s };
  });
  const survey = surveyZa31CraterWinch(road);
  const reserved = [
    moundReservation,
    ...(survey ? [
      { east: survey.useFoot.east, north: survey.useFoot.north, radius: 1.45 },
      survey.snakeStoneReservation,
      { east: survey.plinth.east, north: survey.plinth.north, radius: 1.2 },
    ] : []),
    ...(options.extraReserved ?? []),
  ];
  const avoid = options.avoid ?? [];

  function add(kind: Piece, cluster: string, east: number, north: number,
    angle: number, scale = 1, tilt = 0) {
    const height = road.heightAt(east, north);
    if (height === undefined || !Number.isFinite(height)) return;
    if (Math.hypot(east - originE, north - originN) < 8) return;
    if (Math.hypot(east - road.lip.east, north - road.lip.north) < 9.8) return;
    const [sx, sy, sz] = sizes[kind];
    const footprint=(Math.hypot(sx,sz)*.62+sy*Math.abs(Math.sin(tilt))*.5)*scale;
    const radius=Math.hypot(east-originE,north-originN);
    if(radius-footprint<20||radius+footprint>53)return;
    if (reserved.some(site => Math.hypot(east - site.east, north - site.north) < site.radius + footprint + .15)) return;
    if (trail.some(p => Math.hypot(east - p.east, north - p.north) < 3.1+footprint)) return;
    if (placements.some(p => Math.hypot(east - p.east, north - p.north) < .72)) return;
    if (avoid.some(p => Math.hypot(east - p.east, north - p.north) < .72)) return;
    const samples=[height,...[-1,1].flatMap(x=>[-1,1].map(z=>road.heightAt(east+x*footprint*.55,north+z*footprint*.55)))];
    if(samples.some(h=>h===undefined||!Number.isFinite(h)))return;
    const low=Math.min(...samples as number[]),high=Math.max(...samples as number[]);
    if(high-low>sy*scale*.85+.18)return;
    const part = new Object3D();
    part.position.set(east,low+sy*scale*.40,-north);
    part.rotation.set(tilt, angle, 0);
    part.scale.set(sx * scale, sy * scale, sz * scale);
    part.updateMatrix();
    // Exact transformed vertices, not the placement keep-out disk. Only
    // protruding solids block a player; low shards remain traversable.
    const bounds=new Box3(),vertex=new Vector3();
    const positions=geometry[kind].getAttribute('position');
    for(let i=0;i<positions.count;i++)bounds.expandByPoint(vertex.fromBufferAttribute(positions,i).applyMatrix4(part.matrix));
    const base=Math.max(bounds.min.y,low);
    const exposed=bounds.max.y-base;
    const solid=kind!=='scorch'&&exposed>.46;
    if(solid&&trail.some(p=>Math.hypot(Math.max(bounds.min.x-p.east,0,p.east-bounds.max.x),
      Math.max(bounds.min.z+p.north,0,-p.north-bounds.max.z))<2.1))return;
    if(kind==='ice'){
      // Aim at the real asymmetric tip, not a stale fixture height.
      const tip=new Vector3(.12,.5,-.035).applyMatrix4(part.matrix);
      const view=surveyBR30RelicView(road.heightAt,trail,{east:tip.x,north:-tip.z,height:tip.y});
      if(!view)return;
      crystalViews.push({cluster,view});
    }
    const entries = stamps.get(kind) ?? [];
    entries.push(part);
    stamps.set(kind, entries);
    placements.push({ kind, cluster, east, north, height });
    if(solid)colliders.push({min:[bounds.min.x,base,bounds.min.z],max:bounds.max.toArray()});
    return true;
  }

  // Cluster angles are chosen in the widest gaps between the spiral
  // lane's own crossings of each band (the za36 workface method): the
  // lane winds through every radius, so evenly spaced clusters would
  // be culled by the lane guard faster than they land.
  function gapAngles(radius: number, count: number, random: () => number) {
    const near = trail.filter(p =>
      Math.abs(Math.hypot(p.east - originE, p.north - originN) - radius) < 6);
    const chosen: number[] = [];
    for (let pick = 0; pick < count; pick++) {
      let best = 0;
      let bestClearance = -1;
      for (let step = 0; step < 126; step++) {
        const angle = step * tau / 126 + random() * .02;
        if (chosen.some(other => Math.abs(Math.sin(angle - other)) < .3)) continue;
        const east = originE + radius * Math.sin(angle);
        const north = originN + radius * Math.cos(angle);
        if (Math.hypot(east - moundReservation.east, north - moundReservation.north) < moundReservation.radius + 2) continue;
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

  // Sparse themed outcrops rather than uniform rings of decorative objects.
  // Existing route, mound, story and work-face reservations are unchanged.
  const bands = [
    { radius: 47.5, clusters: 2, theme:'rail' },
    { radius: 40.5, clusters: 3, theme:'crystal' },
    { radius: 33.2, clusters: 3, theme:'timber' },
    { radius: 27.8, clusters: 2, theme:'crystal' },
  ] as const;
  bands.forEach((band, bandIndex) => {
    const random = seeded(0xC350 + bandIndex * 977);
    const angles = gapAngles(band.radius, band.clusters, random);
    for (let cluster = 0; cluster < band.clusters; cluster++) {
      const name = 'r30-'+band.theme+'-'+(bandIndex+1)+'-'+(cluster+1);
      // gapAngles selects in the world frame; place() works in the
      // fixture's local frame — the two differ by the anchor yaw.
      const angle = angles[cluster]! - yaw;
      const radius = band.radius + (random() - .5) * 3;
      const place = (kind: Piece, radialShift: number, tangent: number, scale: number, tilt = 0) => {
        // Survey a tiny neighborhood on the real slope, not a global random
        // scattering pass. Keep the thematic pieces together; reject each
        // full footprint if it crosses a path or story reservation.
        const turn=angle+yaw+random()*.6;
        for(const [dr,dt] of [[0,0],[.7,0],[-.7,0],[0,.65],[0,-.65],[1.25,.65],[-1.25,-.65],[1.25,-.65],[-1.25,.65]]){
          const r=radius+radialShift+dr,t=tangent+dt;
          const localE=r*Math.sin(angle)+t*Math.cos(angle);
          const localN=r*Math.cos(angle)-t*Math.sin(angle);
          if(add(kind,name,originE+localE*c+localN*s,
            originN+localN*c-localE*s,turn,scale,tilt))return true;
        }
        return false;
      };
      // Place the signature object first; loose rock is subordinate.
      if(band.theme==='crystal'){
        if(!place('ice',-.3,0,1.55,.13))continue;
        place('ice',.2,-1.25,.82,-.24);
        place('ice',.15,1.4,.65,.18);
      }else if(band.theme==='rail'){
        if(!place('rust',0,0,1.02,.65))continue;
        place('rust',.25,1.45,.82,-.63);
      }else{
        if(!place('timber',0,0,.92,.06))continue;
        place('rust',.25,1.45,.65,.60);
      }
      place('black-rock',.4,-1.45,1.35);
      place('black-rock',-.4,1.65,1.05);
    }
  });

  // Surveyed mining benches on the south haul and eastern cut. If the
  // thematic search missed an industrial relic, try these local pads with
  // the same footprint and grade checks; never override a reservation.
  const workBenches = [
    { kind:'rust', cluster:'r30-south-haul-rail', e:33.5, n:-36.5, tilt:.55, scale:.87 },
    { kind:'timber', cluster:'r30-east-cut-timber', e:48.5, n:13.75, tilt:.03, scale:.88 },
  ] as const;
  for(const bench of workBenches){
    if(placements.some(p=>p.kind===bench.kind))continue;
    for(const [de,dn] of [[0,0],[.75,0],[-.75,0],[0,.75],[0,-.75],[1.5,.75],[-1.5,-.75]]){
      const e=originE+bench.e+de,n=originN+bench.n+dn;
      if(!add(bench.kind,bench.cluster,e,n,.84,bench.scale,bench.tilt))continue;
      add(bench.kind,bench.cluster,e-.95,n+.7,1.24,.62,-.18);
      add('black-rock',bench.cluster,e+1.05,n+.3,.7,.73);
      break;
    }
  }

  const batches: string[] = [];
  for (const [kind, parts] of stamps) {
    if (!parts.length) continue;
    const batch = new InstancedMesh(geometry[kind], materials[kind], parts.length);
    batch.name = 'midground-s5-' + kind;
    parts.forEach((part, index) => batch.setMatrixAt(index, part.matrix));
    batch.computeBoundingSphere();
    group.add(batch);
    batches.push(kind);
  }
  const trestle=buildBR30BrokenTrestle(originE+14.75,originN-46.75,road.heightAt,trail,[...avoid,...placements],reserved,materials.timber,materials.rust);
  if(trestle){group.add(trestle.group);colliders.push(...trestle.colliders);}
  const trestleView=trestle?surveyBR30RelicView(road.heightAt,trail,trestle.target):undefined;
  return { group, placements, batches, crystalViews, colliders, trestle, trestleView };
}
