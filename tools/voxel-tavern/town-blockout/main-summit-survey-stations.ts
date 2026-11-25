import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace,
  type BufferGeometry, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MainSummitTrailPoint } from './main-summit-trail';
import { surveyPlateLines } from './town-survey';

export type SurveyStation = {
  id: 'M4' | 'M5' | 'M6' | 'M7';
  east: number; north: number; height: number;
  /** Rubbing interaction radius in metres; B window's rubbing system consumes this registry. */
  rubRadius: number;
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
 * Plate readings are engraved from B window's drift-table derivation
 * (town-survey.ts surveyPlateLines — the single source; do not retype the
 * numbers anywhere else).
 */
export function createMainSummitSurveyStations(sites: SurveyStationSites) {
  const group = new Group();
  group.name = 'main-summit-survey-stations';
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  const brass = new MeshLambertMaterial({ color: '#b08d4f' });
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>([stone, brass]);
  const textures = new Set<CanvasTexture>();
  const batches = new Set<InstancedMesh>();
  const stations: SurveyStation[] = [];
  const pillars: { east: number; north: number; height: number }[] = [];
  const baseTransforms: Matrix4[] = [];
  const pillarTransforms: Matrix4[] = [];
  const plateTransforms: Matrix4[] = [];
  const faces: { id: SurveyStation['id']; east: number; height: number; north: number }[] = [];
  const transform = new Object3D();

  function buildStation(id: SurveyStation['id'], east: number, north: number, height: number, note: string) {
    // Each repeated component keeps its original dimensions and gets its own
    // material-family instance batch across M4-M6.
    transform.position.set(east, height + .09, -north);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(.8, .18, .8);
    transform.updateMatrix();
    baseTransforms.push(transform.matrix.clone());
    transform.position.set(east, height + .18 + pillarHeight / 2, -north);
    transform.scale.set(.42, pillarHeight, .42);
    transform.updateMatrix();
    pillarTransforms.push(transform.matrix.clone());
    transform.position.set(east, height + .18 + pillarHeight + .1, -north);
    transform.rotation.set(-.5, 0, Math.PI);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    plateTransforms.push(transform.matrix.clone());
    faces.push({ id, east, height, north });
    stations.push({ id, east, north, height, rubRadius: 1.6, built: true, note });
    pillars.push({ east, north, height });
  }

  buildStation('M4', sites.cloudTerrace.east, sites.cloudTerrace.north, sites.cloudTerrace.height,
    '云海台边缘');
  const exit = sites.trailPoints.find(point => point.height >= 560) ?? sites.trailPoints.at(-1)!;
  const exitHeight = sites.heightAt(exit.east + 3, exit.north) ?? exit.height;
  buildStation('M5', exit.east + 3, exit.north, exitHeight, '步道二线云海段出云处');
  buildStation('M6', sites.icefallTop.east + 2, sites.icefallTop.north, sites.icefallTop.height, '冰瀑顶');

  // Three structural draws: one for each repeated component type. Base and
  // pillar share their unit-cube geometry while retaining separate instance lists.
  const boxGeometry = new BoxGeometry(1, 1, 1);
  geometries.add(boxGeometry);
  function addBatch(name: string, geometry: BufferGeometry, material: MeshLambertMaterial, matrices: readonly Matrix4[]) {
    const batch = new InstancedMesh(geometry, material, matrices.length);
    batch.name = name;
    matrices.forEach((matrix, index) => batch.setMatrixAt(index, matrix));
    batch.computeBoundingSphere();
    group.add(batch);
    batches.add(batch);
    return batch;
  }
  addBatch('survey-station-base', boxGeometry, stone, baseTransforms);
  addBatch('survey-station-pillar', boxGeometry, stone, pillarTransforms);
  const plateGeometry = new CylinderGeometry(.27, .27, .05, 3);
  geometries.add(plateGeometry);
  addBatch('survey-station-plate', plateGeometry, brass, plateTransforms);

  // The three unchanged Canvas readings occupy one horizontal atlas. Their
  // original plane transforms are baked into a single static face mesh, so the
  // complete station still needs only four draws in a browser.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      faces.forEach((face, index) => {
        const offset = index * 256;
        ctx.fillStyle = '#b08d4f';
        ctx.fillRect(offset, 0, 256, 256);
        ctx.fillStyle = '#2e2413';
        ctx.textAlign = 'center';
        const lines = surveyPlateLines(face.id);
        ctx.font = 'bold 44px system-ui, sans-serif';
        ctx.fillText(lines[0], offset + 128, 78);
        ctx.font = 'bold 40px system-ui, sans-serif';
        ctx.fillText(lines[1], offset + 128, 148);
        ctx.fillText(lines[2], offset + 128, 208);
      });
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      textures.add(texture);
      const source = new PlaneGeometry(.4, .4);
      const tiles = faces.map((face, index) => {
        const tile = source.clone();
        tile.rotateX(-.5);
        tile.translate(face.east, face.height + .18 + pillarHeight + .16, -face.north + .1);
        const uv = tile.getAttribute('uv');
        for (let vertex = 0; vertex < uv.count; vertex++) {
          uv.setX(vertex, (uv.getX(vertex) + index) / faces.length);
        }
        return tile;
      });
      source.dispose();
      const faceGeometry = mergeGeometries(tiles, false)!;
      tiles.forEach(tile => tile.dispose());
      geometries.add(faceGeometry);
      const faceMaterial = new MeshBasicMaterial({ map: texture, transparent: true });
      materials.add(faceMaterial);
      const faceBatch = new Mesh(faceGeometry, faceMaterial);
      faceBatch.name = 'survey-station-canvas-faces';
      group.add(faceBatch);
    }
  }

  stations.push({
    id: 'M7', east: 62.5, north: 1003.6, height: 800, rubRadius: 1.6, built: false,
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
      batches.forEach(batch => batch.dispose());
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      textures.forEach(texture => texture.dispose());
    },
  };
}
