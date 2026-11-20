import { Mesh, MeshStandardMaterial, RingGeometry } from 'three';

const gapRadians = 40 * Math.PI / 180;
const gapCenter = Math.PI / 4;

export function createTownChronicleDoorRing(inner: number, outer: number) {
  const geometry = new RingGeometry(inner, outer, 48, 1, gapCenter + gapRadians / 2, 2 * Math.PI - gapRadians);
  const material = new MeshStandardMaterial({ color: 0x68867e, roughness: .96, metalness: .08 });
  const mark = new Mesh(geometry, material);
  mark.name = 'town-chronicle-ring';
  return mark;
}
