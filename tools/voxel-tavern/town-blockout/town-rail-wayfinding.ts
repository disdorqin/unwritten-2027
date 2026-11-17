import {
  BoxGeometry, BufferGeometry, CanvasTexture, Color, Float32BufferAttribute,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, SRGBColorSpace, type Scene,
} from 'three';
import { extensionRoads } from './town-extension';

const stationRoad = extensionRoads.find(road => road.id === 'station-approach')!;
const markers = [
  { leg: 3, along: .28, title: '环镇列车站', direction: '沿主路前行', arrow: '↑' },
  { leg: 2, along: .40, title: '环镇列车站', direction: '从铁路桥下通过', arrow: '↑' },
  { leg: 0, along: .80, title: '环镇列车站', direction: '前方路口左转', arrow: '↰' },
] as const;
const sheetWidth = 512;
const tileHeight = 192;
const boardWidth = 2.42;
const boardHeight = .91;

export function addTownRailWayfinding(scene: Scene, heightAt: (east: number, north: number) => number) {
  const canvas = document.createElement('canvas');
  canvas.width = sheetWidth;
  // Power-of-two texture leaves padding between the last tile and its mipmaps.
  canvas.height = 1024;
  const ink = canvas.getContext('2d');
  if (!ink) return;
  const borders = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), markers.length * 2);
  borders.name = 'Railway wayfinding posts';
  const transform = new Object3D();
  const posts = new Color('#6c5053');
  const backing = new Color('#a9815b');
  const vertices: number[] = [];
  const uv: number[] = [];

  for (const [i, marker] of markers.entries()) {
    const tileY = i * tileHeight;
    ink.fillStyle = '#a98a62';
    ink.fillRect(0, tileY, sheetWidth, tileHeight);
    ink.fillStyle = '#253846';
    ink.fillRect(9, tileY + 9, sheetWidth - 18, tileHeight - 18);
    ink.fillStyle = '#f1d8a7';
    ink.font = 'bold 77px system-ui, sans-serif';
    ink.fillText(marker.arrow, 25, tileY + 117);
    ink.fillStyle = '#eff4f7';
    ink.font = 'bold 48px system-ui, sans-serif';
    ink.fillText(marker.title, 126, tileY + 83);
    ink.fillStyle = '#cbdce8';
    ink.font = '34px system-ui, sans-serif';
    ink.fillText(marker.direction, 127, tileY + 141);

    const [ax, an] = stationRoad.points[marker.leg + 1];
    const [bx, bn] = stationRoad.points[marker.leg];
    const length = Math.hypot(bx - ax, bn - an);
    const dx = (bx - ax) / length;
    const dn = (bn - an) / length;
    const shoulder = stationRoad.width / 2 + 1.3;
    const east = ax + (bx - ax) * marker.along - dn * shoulder;
    const north = an + (bn - an) * marker.along + dx * shoulder;
    const y = heightAt(east, north);
    const z = -north;
    const panelY = y + 1.78;
    const faceX = -dx, faceZ = dn;

    transform.rotation.y = Math.atan2(faceX, faceZ);
    transform.position.set(east, y + .89, z);
    transform.scale.set(.16, 1.78, .17);
    transform.updateMatrix();
    borders.setMatrixAt(i * 2, transform.matrix);
    borders.setColorAt(i * 2, posts);
    transform.position.y = panelY;
    transform.scale.set(boardWidth + .08, boardHeight + .08, .16);
    transform.updateMatrix();
    borders.setMatrixAt(i * 2 + 1, transform.matrix);
    borders.setColorAt(i * 2 + 1, backing);

    const low = 1 - (tileY + tileHeight - 2) / canvas.height;
    const high = 1 - (tileY + 2) / canvas.height;
    const left = 2 / sheetWidth, right = 1 - left;
    for (const [side, top] of [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]) {
      vertices.push(east + faceX * .085 + faceZ * side * boardWidth / 2, panelY + top * boardHeight / 2,
        z + faceZ * .085 - faceX * side * boardWidth / 2);
      uv.push(side < 0 ? left : right, top < 0 ? low : high);
    }
  }
  borders.computeBoundingSphere();
  scene.add(borders);
  const atlas = new CanvasTexture(canvas);
  atlas.colorSpace = SRGBColorSpace;
  const faces = new BufferGeometry();
  faces.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  faces.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  const signs = new Mesh(faces, new MeshBasicMaterial({ map: atlas }));
  signs.name = 'Railway wayfinding faces';
  scene.add(signs);
}
