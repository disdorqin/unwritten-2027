import {
  BoxGeometry, BufferGeometry, CylinderGeometry, Group, Mesh, MeshLambertMaterial,
} from 'three';
import { cloudPavilionSites } from './main-summit-pavilion-site';
import { sampleTownD2R30Height } from './town-d2-r30-domain';

/**
 * D2-R03 foundations +落位核验 for the summit facilities on the R30 massif.
 * Facility heights themselves are canonical survey constants and are never
 * changed; this module only reports where a surveyed floor floats above the
 * R30 terrain and builds a solid stone pedestal down to it so pavilions,
 * shelters and markers never hang in mid-air.
 */
export type TownD2R30FacilityAnchor = Readonly<{
  id: string;
  east: number;
  north: number;
  height: number;
  /** Half-extent of the supported footprint. */
  radius: number;
}>;

export type TownD2R30FacilityReport = Readonly<{
  id: string;
  east: number;
  north: number;
  height: number;
  ground: number;
  delta: number;
  status: 'grounded' | 'cut' | 'pedestal';
}>;

export type TownD2R30FacilityFoundationsStats = Readonly<{
  anchors: number;
  grounded: number;
  cut: number;
  pedestals: number;
  maxDelta: number;
  draws: number;
  triangles: number;
}>;

export const townD2R30FacilityAnchors: readonly TownD2R30FacilityAnchor[] = Object.freeze([
  ...cloudPavilionSites.map(site => Object.freeze({
    id: `pavilion-${site.id}`, east: site.east, north: site.north, height: site.height, radius: 4,
  })),
  Object.freeze({ id: 'summit-hut', east: 62.5, north: 1011, height: 800, radius: 7 }),
  Object.freeze({ id: 'm7-stone-circle', east: 62.5, north: 1003.6, height: 800, radius: 2 }),
  Object.freeze({ id: 'skywatch-relic', east: 390, north: 1120, height: 640, radius: 6 }),
  Object.freeze({ id: 'glide-launch', east: 62.5, north: 975, height: 800, radius: 3 }),
]);

const DEFAULTS = Object.freeze({ groundedBand: 1.5, maxPedestalHeight: 120, stoneColor: '#7d7266' });

export function createTownD2R30FacilityFoundations(options: {
  anchors?: readonly TownD2R30FacilityAnchor[];
  arrivalHeight?: number;
  heightAt?: (east: number, north: number, arrivalHeight?: number) => number | undefined;
} = {}) {
  const arrivalHeight = options.arrivalHeight ?? 347;
  const anchors = options.anchors ?? townD2R30FacilityAnchors;
  const heightAt = options.heightAt ?? ((east, north) => sampleTownD2R30Height(east, north, arrivalHeight));
  if (!Number.isFinite(arrivalHeight) || !Array.isArray(anchors)) {
    throw new RangeError('Invalid D2-R03 facility foundation parameters.');
  }
  const group = new Group();
  group.name = 'town-d2-r30-facility-foundations';
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<MeshLambertMaterial>();
  const stone = new MeshLambertMaterial({ color: DEFAULTS.stoneColor });
  stone.name = 'town-d2-r30-facility-stone';
  materials.add(stone);

  const reports: TownD2R30FacilityReport[] = [];
  for (const anchor of anchors) {
    if (!anchor || !Number.isFinite(anchor.east) || !Number.isFinite(anchor.north) ||
        !Number.isFinite(anchor.height) || !Number.isFinite(anchor.radius) || anchor.radius <= 0) {
      throw new RangeError('D2-R03 facility anchors must be finite with positive radius.');
    }
    const value = heightAt(anchor.east, anchor.north, arrivalHeight);
    if (value === undefined || !Number.isFinite(value)) {
      throw new RangeError(`D2-R03 facility ${anchor.id} has no R30 ground beneath it.`);
    }
    const ground = value;
    const delta = anchor.height - ground;
    const status = delta > DEFAULTS.groundedBand ? 'pedestal'
      : delta < -DEFAULTS.groundedBand ? 'cut' : 'grounded';
    reports.push(Object.freeze({ id: anchor.id, east: anchor.east, north: anchor.north,
      height: anchor.height, ground, delta, status }));
    if (status === 'grounded' || delta > DEFAULTS.maxPedestalHeight) continue;

    const tower = new Group();
    tower.name = `town-d2-r30-foundation-${anchor.id}`;
    tower.position.set(anchor.east, 0, -anchor.north);
    if (status === 'pedestal') {
      const pillar = new CylinderGeometry(anchor.radius, anchor.radius * 1.15, delta, 8);
      pillar.translate(0, ground + delta / 2, 0);
      geometries.add(pillar);
      tower.add(new Mesh(pillar, stone));
      const cap = new BoxGeometry(anchor.radius * 2.1, .4, anchor.radius * 2.1);
      cap.translate(0, anchor.height - .2, 0);
      geometries.add(cap);
      tower.add(new Mesh(cap, stone));
    } else {
      // Cut: a shallow collar that seats the floor into a raised terrain pad.
      const collar = new CylinderGeometry(anchor.radius * 1.2, anchor.radius * 1.35, .6, 8);
      collar.translate(0, anchor.height - .3, 0);
      geometries.add(collar);
      tower.add(new Mesh(collar, stone));
    }
    group.add(tower);
  }

  let triangles = 0;
  for (const geometry of geometries) {
    triangles += (geometry.getIndex()?.count ?? geometry.getAttribute('position').count) / 3;
  }
  const stats: TownD2R30FacilityFoundationsStats = Object.freeze({
    anchors: reports.length,
    grounded: reports.filter(report => report.status === 'grounded').length,
    cut: reports.filter(report => report.status === 'cut').length,
    pedestals: reports.filter(report => report.status === 'pedestal').length,
    maxDelta: Math.max(0, ...reports.map(report => Math.abs(report.delta))),
    draws: geometries.size,
    triangles,
  });
  group.userData = {
    owner: 'D2-R03', visualOnly: true, includesWorldCollision: false,
    modifiesHeightAt: false, modifiesFacilityHeight: false,
    reports: Object.freeze(reports), stats,
    coordinateConvention: 'x=east,y=height,z=-north',
  };

  let disposed = false;
  return {
    group,
    reports: () => Object.freeze(reports.map(report => ({ ...report }))),
    stats: () => stats,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
      group.userData.disposed = true;
    },
  };
}
