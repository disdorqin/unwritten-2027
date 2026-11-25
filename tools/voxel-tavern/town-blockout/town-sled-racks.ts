import { mirrorLakeSignedDistance } from '../../../src/shared/mirror-lake';
import { icePalaceSite } from './ice-palace-site';
import { roadCorridorKeepClear } from './road-clearance';
import type { SledRack } from './sled-visuals';
import { layout } from './terrain';
import { extensionPlots } from './town-extension';
import { pineCampSites } from './town-pine-camp';
import { za22StationApproach } from './town-za22-cloud-route';
import { craterWestSurvey } from './town-za22-crater-road';
import { za22GateSeamNorth } from './town-za22-mountain-gate';

export type SledRackDomain = 'town' | 'summit';
type Pad = readonly [east: number, north: number, yaw: number];
type Site = Readonly<{ id: string; domain: SledRackDomain; pads: readonly Pad[] }>;
type DryFooting = (east: number, north: number) => number | undefined;
type CraterLip = Readonly<{ east: number; north: number }>;

const west = -Math.PI / 2;
const east = Math.PI / 2;
const south = Math.PI;
const tavernDoor = layout.plots.find(plot => plot.id === 'tavern')!.door;
const townOfficeDoor = layout.plots.find(plot => plot.id === 'town-office')!.door;
const [stationEast, stationNorth] = extensionPlots.find(plot => plot.id === 'railway-station')!.origin;
const [palaceEndEast, palaceEndNorth] = icePalaceSite.stationTrail.at(-1)!;
const [pineFireEast, pineFireNorth] = pineCampSites.fire;

export const townSledRackSites: readonly Site[] = [
  { id: 'plaza', domain: 'town', pads: [[234, 174, 0], [236, 174, 0], [232, 174, 0]] },
  { id: 'cable-base', domain: 'town', pads: [
    [za22StationApproach.east + 2.4, za22StationApproach.north - 1.15, south],
    [za22StationApproach.east + 3.2, za22StationApproach.north - 2.1, south],
    [za22StationApproach.east - 3.1, za22StationApproach.north - 1.65, south],
  ] },
  { id: 'mirror-lake', domain: 'town', pads: [[22, 174, 0], [24, 172, 0], [23, 169, 0], [32, 155, 0]] },
  { id: 'pine-chop', domain: 'town', pads: [
    [pineFireEast - 13.5, pineFireNorth + .5, south], [pineFireEast - 13.5, pineFireNorth + 1, south],
    [pineFireEast - 14.5, pineFireNorth + .5, south],
  ] },
  { id: 'station', domain: 'town', pads: [
    [stationEast + 6.5, stationNorth - 12, south],
    [stationEast - 6.5, stationNorth - 12, south],
    [stationEast + 12, stationNorth - 14, south],
  ] },
  { id: 'tavern', domain: 'town', pads: [
    [tavernDoor[0] - 4, tavernDoor[1] - 2, south], [tavernDoor[0] + 4, tavernDoor[1] - 2, south],
    [tavernDoor[0] - 5, tavernDoor[1] - 3.5, south],
  ] },
  { id: 'town-hall', domain: 'town', pads: [
    [townOfficeDoor[0] + 4.5, townOfficeDoor[1] - 2.25, south],
    [townOfficeDoor[0] - 4.5, townOfficeDoor[1] - 2.25, south],
  ] },
  { id: 'ice-palace', domain: 'town', pads: [
    [palaceEndEast + 4, palaceEndNorth - 1, 0], [palaceEndEast + 4, palaceEndNorth + 1, 0],
    [palaceEndEast + 1, palaceEndNorth - 4, 0], [palaceEndEast + 3, palaceEndNorth - 3, 0],
  ] },
  { id: 'mountain-gate', domain: 'summit', pads: [
    [295.5, za22GateSeamNorth - 3.55, east], [304.5, za22GateSeamNorth - 3.55, west],
    [305.5, za22GateSeamNorth - 3.55, west],
  ] },
  { id: 'cloud-terrace', domain: 'summit', pads: [[333, 660.6, west], [331, 660.5, west], [329, 660.5, west]] },
];

export const townSledRackMissingSites = ['old-home'] as const;
export const townSledRackLegacySites: readonly Site[] = [
  { id: 'north-slope', domain: 'town', pads: [[378, 303, south]] },
  { id: 'memorial', domain: 'town', pads: [[347.5, 255, 0], [348, 255, 0], [348.5, 255, 0]] },
  { id: 'market', domain: 'town', pads: [[150.5, 90, 0], [151.5, 90.5, 0], [151, 90, 0]] },
];

// A full rack footprint is checked for a dry, level surface before an entity is made available.
const footprint = Array.from({ length: 8 }, (_, index) => {
  const angle = index * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)] as const;
});
const radius = 1.05;
const heightDelta = .22;

function footing(pad: Pad, sample: DryFooting) {
  const [x, n] = pad;
  const y = sample(x, n);
  if (y === undefined || !Number.isFinite(y)) return;
  const safe = footprint.every(([dx, dn]) => {
    const edge = sample(x + dx * radius, n + dn * radius);
    return edge !== undefined && Number.isFinite(edge) && Math.abs(edge - y) <= heightDelta;
  });
  if (safe) return y;
}

export function resolveTownSledRacks(
  domain: SledRackDomain,
  sample: DryFooting,
  craterLip?: CraterLip,
): (SledRack & { id: string })[] {
  const sites = townSledRackSites.filter(site => site.domain === domain);
  if (domain === 'town' && craterLip) {
    const { east: lipEast, north: lipNorth } = craterLip;
    sites.push({ id: 'crater-mouth', domain, pads: [
      [lipEast + 7, lipNorth - 4.5, west], [lipEast + 9, lipNorth - 4.5, west],
      [lipEast + 7, lipNorth + 4.5, west],
    ] });
  }
  if (domain === 'town') sites.push(...townSledRackLegacySites);
  return sites.flatMap(({ id, pads }) => {
    for (const pad of pads) {
      const [x, n, yaw] = pad;
      if ((id === 'mirror-lake' && mirrorLakeSignedDistance(x, n) < radius) ||
          (id !== 'plaza' && id !== 'north-slope' && domain === 'town' && x >= 0 && roadCorridorKeepClear(x, n, radius)) ||
          (id === 'crater-mouth' && x < craterWestSurvey.west + radius)) continue;
      const y = footing(pad, sample);
      if (y !== undefined) return [{ id, x, n, y, yaw }];
    }
    return [];
  });
}
