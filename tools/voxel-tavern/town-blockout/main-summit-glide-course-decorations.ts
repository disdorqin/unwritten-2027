import {
  BoxGeometry, BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, Group, InstancedMesh,
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, PointLight, SRGBColorSpace,
} from 'three';
import type { SummitGlideRing } from './main-summit-glide-rings';
import type { SummitGlideTarget } from './main-summit-glide-target';

export const summitGlideCourseSignText = Object.freeze({
  launch: ['九环试飞', '领雪翼 · 南崖起跳', '穿环计半分 · 漏环断连击', '天风改道，留心回旋'],
  finish: ['南坡落靶', '对准雪纹正中心', '轻收翼，触雪结算', '此为绝顶独立试飞场'],
} as const);

type Landing = Readonly<{ east: number; north: number; height: number }>;

function signTexture(lines: readonly string[]) {
  if (typeof document === 'undefined') return;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 260;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#4a3a32';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#e2bc7c';
  ctx.lineWidth = 9;
  ctx.strokeRect(17, 15, 478, 230);
  ctx.fillStyle = '#f8e4be';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 38px sans-serif';
  ctx.fillText(lines[0]!, 256, 53);
  ctx.font = '26px sans-serif';
  for (let index = 1; index < lines.length; index++) {
    ctx.fillText(lines[index]!, 256, 47 + index * 55, 460);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/** An isolated decorated nine-ring review route; source geometry is the official surveyed line.
 * No invented wind source, identity, scoreboard, or movement permissions live in this view.
 */
export function mountSummitGlideCourseDecorations(
  owner: Object3D,
  rings: readonly SummitGlideRing[],
  landing: SummitGlideTarget,
  launch: Landing,
) {
  if (rings.length !== 9 || !Number.isFinite(launch.height) ||
      rings.some(r => !Number.isFinite(r.east) || !Number.isFinite(r.north) ||
        !Number.isFinite(r.height) || !Number.isFinite(r.heading) || r.radius < 2)) {
    throw new RangeError('Only a surveyed nine-ring course can be decorated');
  }
  const group = new Group();
  group.name = 'summit-glide-nine-ring-course-furnishings';
  owner.add(group);
  const geometries: { dispose(): void }[] = [];
  const materials: { dispose(): void }[] = [];
  const textures: { dispose(): void }[] = [];
  const lights: PointLight[] = [];

  // The pennant triangle has a true folded silhouette. Reuse it across
  // three material families instead of one draw per individual pennant.
  const clothGeometry = new BufferGeometry();
  clothGeometry.setAttribute('position', new Float32BufferAttribute([
    -.17, .06, 0, .17, .06, 0, 0, -.48, -.10,
  ], 3));
  clothGeometry.computeVertexNormals();
  geometries.push(clothGeometry);

  const clothColors = [0xc26547, 0xddbc76, 0x6c9ca2];
  const clothMaterials = clothColors.map(color => new MeshLambertMaterial({
    color, side: DoubleSide, transparent: false,
  }));
  materials.push(...clothMaterials);
  const peg = new Object3D();
  for (let palette = 0; palette < clothMaterials.length; palette++) {
    const instances = new InstancedMesh(clothGeometry, clothMaterials[palette]!, rings.length * 4);
    instances.name = 'nine-ring-ribbon-' + palette;
    let index = 0;
    for (const ring of rings) {
      const eastSide = Math.cos(ring.heading);
      const northSide = -Math.sin(ring.heading);
      for (const angle of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) {
        const outer = ring.radius + .52;
        const lateral = Math.cos(angle) * outer;
        peg.position.set(ring.east + lateral * eastSide,
          ring.height + Math.sin(angle) * outer,
          -(ring.north + lateral * northSide));
        peg.rotation.set(0, Math.PI - ring.heading, 0);
        peg.scale.setScalar(palette === 0 ? .92 : palette === 1 ? .72 : .54);
        peg.updateMatrix();
        instances.setMatrixAt(index++, peg.matrix);
      }
    }
    instances.computeBoundingSphere();
    group.add(instances);
  }

  const wood = new MeshLambertMaterial({ color: '#765340' });
  const bronze = new MeshLambertMaterial({ color: '#c18c50' });
  const stone = new MeshLambertMaterial({ color: '#53616a' });
  materials.push(wood, bronze, stone);
  const footGeo = new BoxGeometry(3.6, .4, .8);
  const frameGeo = new BoxGeometry(4.2, 2.2, .23);
  const signGeo = new PlaneGeometry(3.8, 1.8);
  const poleGeo = new BoxGeometry(.2, 2.4, .25);
  geometries.push(footGeo, frameGeo, signGeo, poleGeo);
  const sites = [
    { pos: { east: launch.east + 10, north: launch.north + 7, height: launch.height },
      text: summitGlideCourseSignText.launch, name: 'glide-start-board' },
    { pos: { east: landing.east + 4, north: landing.north - 11, height: landing.height },
      text: summitGlideCourseSignText.finish, name: 'glide-finish-board' },
  ] as const;

  for (const site of sites) {
    const board = new Group();
    board.name = site.name;
    board.position.set(site.pos.east, site.pos.height, -site.pos.north);
    board.add(new Mesh(footGeo, stone));
    for (const side of [-1, 1]) {
      const post = new Mesh(poleGeo, wood);
      post.position.set(side * 1.65, 1.3, 0);
      board.add(post);
    }
    const plaque = new Mesh(frameGeo, wood);
    plaque.position.y = 2.55;
    board.add(plaque);
    const texture = signTexture(site.text);
    if (texture) textures.push(texture);
    const ink = new MeshBasicMaterial({ color: '#e3d9c8', side: DoubleSide,
      ...(texture ? { map: texture } : {}) });
    materials.push(ink);
    const face = new Mesh(signGeo, ink);
    face.position.set(0, 2.55, -.14);
    face.name = 'readable-course-sign';
    board.add(face);
    const rivets = new Mesh(new BoxGeometry(4.16, .09, .31), bronze);
    rivets.position.set(0, 3.52, 0);
    board.add(rivets);
    geometries.push(rivets.geometry);
    const warm = new PointLight('#ffd19a', 4, 14, 2);
    warm.position.set(0, 3.4, -.65);
    board.add(warm);
    lights.push(warm);
    group.add(board);
  }

  let disposed = false;
  return {
    group, lights,
    signText: summitGlideCourseSignText,
    drawCount: 3 + sites.length * 6,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.traverse(object => { if (object instanceof InstancedMesh) object.dispose(); });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      for (const texture of textures) texture.dispose();
      group.clear();
    },
  };
}
