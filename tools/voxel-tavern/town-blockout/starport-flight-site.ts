import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import type { AircraftPoint, AircraftRunway, AircraftSurface, AircraftWorld } from '../../../src/shared/aircraft-flight';
import { createFlightBoosterVisual, createSnowWingVisual, flightEquipmentMounts } from './flight-equipment-visuals';
import { northRidgeFrame, sampleNorthRidge350 } from './north-ridge-350-terrain';
import { createTerrainGrid, isWater, layout, waterHeight } from './terrain';

const point = (east: number, north: number, height: number): AircraftPoint => ({ east, north, height });

// Local proposals for the surveyed north terrace, independent of the unpinned C-01 production seam.
export const starportFlightSite = {
  pad: { east: 320, north: 670, height: 347, size: 24 },
  assembly: point(311, 675, 347),
  recovery: point(328, 675, 347),
  door: point(320, 675, 347),
  runway: { id: 'starport', start: point(331, 662, 347), end: point(288.5, 662, 347), width: 4.4 },
} as const satisfies { pad: AircraftPoint & { size: number }; assembly: AircraftPoint; recovery: AircraftPoint;
  door: AircraftPoint; runway: AircraftRunway };

export const townFlightRunwayCandidates = [
  { id: 'plaza-axis', start: point(174, 162, 12), end: point(238, 162, 12), width: 4.4 },
  { id: 'mirror-lake-ice', start: point(318, 64, 5.5), end: point(374, 64, 5.5), width: 4.4 },
  { id: 'ring-road', start: point(219.785, 85.525, 9), end: point(267.215, 99.475, 9), width: 4.4 },
] as const satisfies readonly AircraftRunway[];

const posts = [
  { ...starportFlightSite.assembly, width: 3.9, depth: 1.8, tall: .9 },
  { ...starportFlightSite.door, width: 2.7, depth: .6, tall: 2.8 },
];

/** Preview uses the existing town terrain, lake and plot envelopes, plus the 350 m design survey. */
export function createStarportReviewWorld() {
  const terrain = createTerrainGrid();
  const candidateGround = (east: number, north: number) => north >= 540
    ? sampleNorthRidge350(east, north)
    : terrain.heightAt(east, north);
  const envelopes = [
    ...posts,
    ...layout.plots.map(plot => ({ ...point(...plot.origin as [number, number, number]),
      width: plot.footprint[0], depth: plot.footprint[1], tall: plot.id === 'clocktower' ? 117.125 : 12 })),
  ];
  const solidAt = (east: number, north: number, height: number, clearance: number) => envelopes.some(box =>
    Math.abs(east - box.east) <= box.width / 2 + clearance &&
    Math.abs(north - box.north) <= box.depth / 2 + clearance && height < box.height + box.tall && height > box.height - .2);
  const contains = ({ east, north }: AircraftPoint) =>
    east >= 1 && east <= northRidgeFrame.width - 1 && north >= 1 && north <= northRidgeFrame.depth - 1;

  function surfaceAt(east: number, north: number, heading: number): AircraftSurface | undefined {
    if (!contains(point(east, north, 0))) return;
    const sample = candidateGround(east, north);
    const water = north < 540 && isWater(east, north);
    const ice = north < 540 && terrain.surfaces[Math.round(north) * terrain.gridWidth + Math.round(east)] === 4;
    const slope = Math.hypot((candidateGround(east + .5, north) - candidateGround(east - .5, north)),
      candidateGround(east, north + .5) - candidateGround(east, north - .5));
    let obstacleAhead = 0;
    for (let step = 0; step <= 8; step += .5) {
      const e = east + Math.sin(heading) * step;
      const n = north + Math.cos(heading) * step;
      if (solidAt(e, n, sample + 1.01, .7)) { obstacleAhead = 1.01; break; }
    }
    return { height: water ? waterHeight : sample, kind: water ? 'water' : ice ? 'ice' : 'snow',
      slopeDegrees: Math.atan(slope) * 180 / Math.PI, obstacleAhead };
  }

  const world: AircraftWorld = {
    contains,
    surfaceAt,
    sweep(from, to, clearance) {
      const steps = Math.max(1, Math.ceil(Math.hypot(to.east - from.east, to.north - from.north, to.height - from.height) / .45));
      for (let step = 0; step <= steps; step++) {
        const t = step / steps;
        const east = from.east + (to.east - from.east) * t;
        const north = from.north + (to.north - from.north) * t;
        const height = from.height + (to.height - from.height) * t;
        if (solidAt(east, north, height, clearance)) return 'wall';
      }
    },
    recoveryAt(from) {
      const candidates = [starportFlightSite.recovery, ...townFlightRunwayCandidates.map(site => site.start)];
      return candidates.filter(site => {
        const sample = surfaceAt(site.east, site.north, 0);
        return sample && sample.kind !== 'water' && sample.slopeDegrees < 25 && sample.obstacleAhead <= 1;
      }).sort((a, b) => Math.hypot(from.east - a.east, from.north - a.north) -
        Math.hypot(from.east - b.east, from.north - b.north))[0];
    },
  };

  return { world, terrain, groundAt: candidateGround };
}

/** The original F-7 parts share their published socket without changing either asset. */
export function mountStarportFlightSite(owner: Group) {
  const group = new Group();
  group.name = 'starport-flight-site';
  owner.add(group);
  const geometry = new BoxGeometry(1, 1, 1);
  const stone = new MeshLambertMaterial({ color: '#597487' });
  const wood = new MeshLambertMaterial({ color: '#685545' });
  const copper = new MeshLambertMaterial({ color: '#b99460' });
  const pale = new MeshLambertMaterial({ color: '#d0e0e9' });
  function box(material: MeshLambertMaterial, at: AircraftPoint, width: number, height: number, depth: number) {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(at.east, at.height, -at.north);
    mesh.scale.set(width, height, depth);
    group.add(mesh);
  }
  const { pad, runway, assembly, door, recovery } = starportFlightSite;
  for (const side of [-1, 1]) {
    box(stone, point(pad.east + side * 12, pad.north, 347.035), .18, .06, 24);
    box(stone, point(pad.east, pad.north + side * 12, 347.035), 24, .06, .18);
    box(wood, point(assembly.east + side * 1.52, assembly.north, 347.36), .26, .72, 1.5);
    box(stone, point(door.east + side * 1.14, door.north, 348.25), .42, 2.5, .58);
    box(copper, point(recovery.east + side * 1.7, recovery.north, 347.04), .16, .08, 3.4);
    box(copper, point(recovery.east, recovery.north + side * 1.7, 347.04), 3.4, .08, .16);
  }
  box(wood, point(assembly.east, assembly.north, 347.79), 3.9, .18, 1.8);
  box(copper, point(assembly.east, assembly.north, 347.90), 2.35, .05, .85);
  box(stone, point(door.east, door.north, 349.63), 2.7, .32, .64);
  // Locked current-chapter face. The separate S-1/S-11 package owns ring and insignia art.
  box(stone, point(door.east, door.north, 348.31), 1.9, 2.6, .17);
  for (let east = runway.start.east - 2; east > runway.end.east; east -= 4) {
    box(pale, point(east, runway.start.north, 347.06), 1.6, .07, .18);
  }
  for (const east of [runway.start.east, runway.end.east]) box(copper, point(east, runway.start.north, 347.065), .28, .08, 4.4);

  const wing = createSnowWingVisual();
  const booster = createFlightBoosterVisual();
  const craft = new Group();
  craft.name = 'assembled-aircraft';
  craft.add(wing.group, booster.group);
  const bay = flightEquipmentMounts.snowWing.boosterBay.position;
  const socket = flightEquipmentMounts.booster.wingSocket.position;
  booster.group.position.set(bay[0] - socket[0], bay[1] - socket[1], bay[2] - socket[2]);
  craft.position.set(assembly.east, assembly.height + 1.38, -assembly.north);
  craft.visible = false;
  group.add(craft);

  return { craft, group, dispose() {
    wing.dispose();
    booster.dispose();
    geometry.dispose();
    [stone, wood, copper, pale].forEach(material => material.dispose());
    group.removeFromParent();
  } };
}
