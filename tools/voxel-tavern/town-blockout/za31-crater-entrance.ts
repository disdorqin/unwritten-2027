import {
  BoxGeometry, CanvasTexture, DataTexture, Group, InstancedMesh, Mesh,
  MeshBasicMaterial, MeshStandardMaterial, NearestFilter, Object3D, PlaneGeometry,
  SRGBColorSpace,
} from 'three';
import type { mountWestCraterRoad } from './town-za22-crater-road';

type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'group' | 'lip'>;
type Box = Readonly<{
  east: number;
  north: number;
  height: number;
  size: readonly [number, number, number];
}>;

const wood = '#5d4630';
const ochre = '#a98a56';
const snow = '#e8ecf0';

const notices = [
  { side: -1, id: 'warning', title: '坑沿松动', detail: '沿栅口下行' },
  { side: 1, id: 'closure-notice', title: '封矿告示', detail: '井口封存' },
] as const;

function woodGrain() {
  const width = 16;
  const texels = new Uint8Array(width * width * 4);
  for (let z = 0; z < width; z++) {
    for (let x = 0; x < width; x++) {
      const score = (x * 17 + z * z + (z >> 2) * 7) % 31;
      const tone = score < 4 ? [169, 138, 86] : score < 10 ? [138, 74, 52] : [93, 70, 48];
      texels.set([...tone, 255], (z * width + x) * 4);
    }
  }
  const texture = new DataTexture(texels, width, width);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function noticeTexture(title: string, detail: string) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const pen = canvas.getContext('2d');
  if (!pen) return;
  pen.fillStyle = wood;
  pen.fillRect(0, 0, canvas.width, canvas.height);
  pen.strokeStyle = ochre;
  pen.strokeRect(3.5, 3.5, 121, 57);
  pen.fillStyle = snow;
  pen.textAlign = 'center';
  pen.textBaseline = 'middle';
  pen.font = 'bold 22px sans-serif';
  pen.fillText(title, 64, 24);
  pen.font = '14px sans-serif';
  pen.fillText(detail, 64, 47);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

/** Dress the two existing fence flanks while leaving their opening and collision in the road owner. */
export function mountZa31CraterEntrance(road: Road) {
  const group = new Group();
  group.name = 'za31-crater-entrance';
  const boxes: Box[] = [];
  const noticesFaces: Mesh<PlaneGeometry, MeshBasicMaterial>[] = [];
  const fenceEast = road.lip.east + 1;
  for (const notice of notices) {
    const north = road.lip.north + notice.side * 3.25;
    for (const offset of [.5, 1.4]) {
      boxes.push({ east: fenceEast + .055, north, height: road.lip.height + offset,
        size: [.048, .20, 2.17] });
    }
    const signHeight = road.lip.height + 1.10;
    boxes.push({ east: fenceEast + .029, north, height: signHeight,
      size: [.086, .66, 1.35] });
    for (const offset of [-.58, .58]) {
      boxes.push({ east: fenceEast + .071, north: north + offset, height: signHeight,
        size: [.014, .68, .08] });
    }

    const map = noticeTexture(notice.title, notice.detail);
    const faceMaterial = map ? new MeshBasicMaterial({ map }) : new MeshBasicMaterial({ color: wood });
    const face = new Mesh(new PlaneGeometry(1.04, .50), faceMaterial);
    face.name = `za31-crater-${notice.id}`;
    face.userData.text = [notice.title, notice.detail];
    face.position.set(fenceEast + .076, signHeight, -north);
    face.rotation.y = Math.PI / 2;
    group.add(face);
    noticesFaces.push(face);
  }

  const geometry = new BoxGeometry();
  const grain = woodGrain();
  const material = new MeshStandardMaterial({ map: grain, roughness: 1 });
  const timbers = new InstancedMesh(geometry, material, boxes.length);
  timbers.name = 'za31-crater-fence-timbers';
  const transform = new Object3D();
  for (const [index, box] of boxes.entries()) {
    transform.position.set(box.east, box.height, -box.north);
    transform.scale.set(...box.size);
    transform.updateMatrix();
    timbers.setMatrixAt(index, transform.matrix);
  }
  group.add(timbers);
  road.group.add(group);

  return {
    group,
    dispose() {
      group.removeFromParent();
      timbers.dispose();
      geometry.dispose();
      grain.dispose();
      material.dispose();
      for (const face of noticesFaces) {
        face.geometry.dispose();
        face.material.map?.dispose();
        face.material.dispose();
      }
    },
  };
}
