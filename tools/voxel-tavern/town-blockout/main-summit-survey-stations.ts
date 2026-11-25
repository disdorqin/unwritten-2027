import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import type { MainSummitTrailPoint } from './main-summit-trail';
import {surveyPlateLines} from './town-survey';
import {createSummitSurveyInscription} from './main-summit-survey-inscription';

export type SurveyStation = {
  id: 'M4' | 'M5' | 'M6' | 'M7';
  east: number; north: number; height: number;
  /** Rubbing interaction radius in metres; B window's rubbing system consumes this registry. */
  rubRadius: number;
  /** The B rule leaf is the sole text authority; all three lines are exact. */
  plateLines: readonly [string,string,string];
  built: boolean;
  note: string;
};

export type SurveyStationSites = {
  /** M4: cloud terrace edge by the cloud-deck stamp point (assembly-local frame). */
  cloudTerrace: { east: number; north: number; height: number };
  trailPoints: readonly MainSummitTrailPoint[];
  /** M6: the icefall top anchor. */
  icefallTop: { east: number; north: number; height: number };
  heightAt(east: number, north: number): number | undefined;
};

const pillarHeight = 1.05;

/**
 * Survey-line mountain section (revised chapter 1): waist-high stone pillars
 * with brass triangle plates. M4 cloud terrace edge, M5 where trail 2 leaves
 * the cloud band, M6 icefall top. M7 is the summit stone circle's brass
 * marker from design book §4.17 — registered here for alignment, not rebuilt.
 * Plate readings derive from B window's beacon drift table and are engraved
 * when that file lands; plates carry the station id today.
 */
export function createMainSummitSurveyStations(sites: SurveyStationSites) {
  const group = new Group();
  group.name = 'main-summit-survey-stations';
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const brass = new MeshLambertMaterial({ color: '#b08d4f' });
  const disposers: (() => void)[] = [];
  const stations: SurveyStation[] = [];
  const pillars: { east: number; north: number; height: number }[] = [];

  function buildStation(id: SurveyStation['id'], east: number, north: number, height: number, note: string) {
    const stationGroup = new Group();
    stationGroup.name = `survey-station-${id.toLowerCase()}`;
    const base = new Mesh(new BoxGeometry(.8, .18, .8), stone);
    base.position.set(east, height + .09, -north);
    const pillar = new Mesh(new BoxGeometry(.42, pillarHeight, .42), stone);
    pillar.position.set(east, height + .18 + pillarHeight / 2, -north);
    const plate = new Mesh(new CylinderGeometry(.27, .27, .05, 3), brass);
    plate.position.set(east, height + .18 + pillarHeight + .1, -north);
    plate.rotation.set(-.5, 0, Math.PI);
    stationGroup.add(base, pillar, plate);
    disposers.push(() => { base.geometry.dispose(); pillar.geometry.dispose(); plate.geometry.dispose(); });

    // R4/R5: replace the ID-only placeholder and two fake underscores with
    // the exact B-window three-line survey inscription at native resolution.
    const inscription = createSummitSurveyInscription(id);
    if (inscription.texture) {
      const face = new Mesh(new PlaneGeometry(.86, .60),
        new MeshBasicMaterial({ map: inscription.texture, transparent: false, side: 2 }));
      face.name = 'survey-engraved-plate-' + id.toLowerCase();
      face.userData.inscription = [...inscription.lines];
      face.position.set(east, height + .18 + pillarHeight + .20, -north + .24);
      face.rotation.x = -.42;
      stationGroup.add(face);
      disposers.push(() => {
        face.geometry.dispose(); face.material.dispose(); inscription.texture?.dispose();
      });
    }
    group.add(stationGroup);
    stations.push({ id, east, north, height, rubRadius: 1.6,
      plateLines: surveyPlateLines(id), built: true, note });
    pillars.push({ east, north, height });
  }

  buildStation('M4', sites.cloudTerrace.east, sites.cloudTerrace.north, sites.cloudTerrace.height,
    '云海台边缘');
  const exit = sites.trailPoints.find(point => point.height >= 560) ?? sites.trailPoints.at(-1)!;
  const exitHeight = sites.heightAt(exit.east + 3, exit.north) ?? exit.height;
  buildStation('M5', exit.east + 3, exit.north, exitHeight, '步道二线云海段出云处');
  buildStation('M6', sites.icefallTop.east + 2, sites.icefallTop.north, sites.icefallTop.height, '冰瀑顶');
  stations.push({
    id: 'M7', east: 62.5, north: 1003.6, height: 800, rubRadius: 1.6,
    plateLines: surveyPlateLines('M7'), built: false,
    note: '绝顶石圈中心黄铜三角标石（全本§四.17）：石圈与中心牌随§三.12陈设落地，本表登记对齐不另立柱站',
  });

  let disposed = false;
  return {
    group, stations,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      return pillars.some(pillar =>
        feet + bodyHeight > pillar.height && feet < pillar.height + 1.4 &&
        Math.hypot(east - pillar.east, north - pillar.north) < .45 + radius);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposers) dispose();
      stone.dispose();
      brass.dispose();
    },
  };
}
