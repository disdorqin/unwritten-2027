import {
  BoxGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, Sphere, Vector3, type Scene,
} from 'three';

type BoxPart = [x: number, y: number, z: number, width: number, height: number, depth: number, color: string];

const cupX = .162;
const cupZ = .031;
const trayTop = .028;
const brass = '#c99961';
const ceramic = '#bf9474';
const glaze = '#e6c5a0';

const counterware: BoxPart[] = [
  [0, .014, 0, .774, .028, .378, '#443229'],
  [0, .033, .177, .774, .019, .026, '#986747'],
  [0, .033, -.177, .774, .019, .026, '#986747'],
  [-.378, .033, 0, .018, .019, .334, '#986747'],
  [.378, .033, 0, .018, .019, .334, '#986747'],
  [cupX, .040, cupZ, .184, .024, .156, ceramic],
  [cupX - .083, .104, cupZ, .018, .115, .156, ceramic],
  [cupX + .083, .104, cupZ, .018, .115, .156, ceramic],
  [cupX, .104, cupZ - .069, .155, .115, .018, '#c6a086'],
  [cupX, .104, cupZ + .069, .155, .115, .018, glaze],
  [cupX - .086, .165, cupZ, .024, .018, .171, glaze],
  [cupX + .086, .165, cupZ, .024, .018, .171, glaze],
  [cupX, .165, cupZ - .075, .154, .018, .023, glaze],
  [cupX, .165, cupZ + .075, .154, .018, .023, glaze],
  [cupX + .119, .13, cupZ, .068, .025, .026, glaze],
  [cupX + .119, .070, cupZ, .068, .025, .026, ceramic],
  [cupX + .151, .10, cupZ, .025, .068, .028, ceramic],
  [cupX - .033, .101, cupZ + .081, .030, .041, .009, '#a04145'],
  [cupX, .101, cupZ + .081, .030, .041, .009, '#a04145'],
  [cupX + .033, .101, cupZ + .081, .030, .041, .009, '#a04145'],
];

const shaker: BoxPart[] = [
  [0, .019, 0, .156, .038, .140, '#8d6444'],
  [0, .090, 0, .172, .116, .156, '#ac8055'],
  [0, .160, 0, .192, .029, .174, brass],
  [0, .196, 0, .147, .055, .134, '#dfb47c'],
  [0, .238, 0, .088, .035, .103, brass],
  [0, .259, 0, .100, .022, .109, '#dfb47c'],
  [0, .11, .083, .081, .050, .010, '#5f4132'],
  [0, .11, .090, .037, .023, .007, '#e8c18a'],
];

function ease(from: number, to: number, progress: number) {
  const value = Math.min(1, Math.max(0, (progress - from) / (to - from)));
  return value * value * (3 - 2 * value);
}

export function createTavernMixProps(scene: Scene, at: { x: number; y: number; n: number }, scale = 1) {
  const group = new Group();
  group.name = '未写酒馆 · 吧台调制器具';
  group.position.set(at.x, at.y, -at.n);
  group.scale.setScalar(scale);
  group.updateMatrix();
  group.matrixAutoUpdate = false;
  group.visible = false;

  const geometry = new BoxGeometry();
  const ware = new InstancedMesh(geometry, new MeshLambertMaterial(), counterware.length + shaker.length + 2);
  ware.name = '吧台 · 托盘、陶杯和调酒壶';
  ware.instanceMatrix.setUsage(DynamicDrawUsage);
  const liquid = new InstancedMesh(geometry, new MeshBasicMaterial({ toneMapped: false }), 7);
  liquid.name = '吧台 · 酒液与杯面';
  liquid.instanceMatrix.setUsage(DynamicDrawUsage);
  for (const batch of [ware, liquid]) {
    batch.boundingSphere = new Sphere(new Vector3(0, .18, 0), .65);
  }
  group.add(ware, liquid);
  scene.add(group);

  const pose = new Object3D();
  const scratchColor = new Color();
  const drinkColor = new Color();
  const highlight = new Color('#fff0d0');
  const garnish = new Color('#9cb484');
  const direction = new Vector3();
  const start = new Vector3();
  const end = new Vector3();
  const point = new Vector3();
  const up = new Vector3(0, 1, 0);
  const origin = new Vector3();
  let liquidCount = 0;

  function placeBox(
    batch: InstancedMesh, index: number, x: number, y: number, z: number,
    width: number, height: number, depth: number, color?: Color, rotation = 0,
  ) {
    pose.position.set(x, y, z);
    pose.scale.set(width, height, depth);
    pose.rotation.set(0, 0, rotation);
    pose.updateMatrix();
    batch.setMatrixAt(index, pose.matrix);
    if (color) batch.setColorAt(index, color);
  }

  for (const [index, [x, y, z, width, height, depth, color]] of counterware.entries()) {
    placeBox(ware, index, x, y, z, width, height, depth, scratchColor.set(color));
  }
  for (const [index, [, , , , , , color]] of shaker.entries()) {
    ware.setColorAt(counterware.length + index, scratchColor.set(color));
  }
  ware.setColorAt(counterware.length + shaker.length, scratchColor.set(brass));
  ware.setColorAt(counterware.length + shaker.length + 1, scratchColor.set('#d5a35f'));
  ware.instanceColor!.needsUpdate = true;

  function addLiquidBox(x: number, y: number, z: number, width: number, height: number, depth: number, color: Color) {
    placeBox(liquid, liquidCount++, x, y, z, width, height, depth, color);
  }

  function pourSegment(from: Vector3, to: Vector3) {
    direction.subVectors(to, from);
    const length = direction.length();
    if (length <= .001) return;
    pose.position.copy(from).lerp(to, .5);
    pose.scale.set(.017, length + .003, .019);
    pose.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / length));
    pose.updateMatrix();
    liquid.setMatrixAt(liquidCount, pose.matrix);
    liquid.setColorAt(liquidCount++, scratchColor.copy(drinkColor).lerp(highlight, .18));
  }

  let previousColor = '';
  let previousProgress = -1;

  function update(color: string, progress: number) {
    if (!Number.isFinite(progress)) return;
    const time = Math.min(1, Math.max(0, progress));
    if (group.visible && time === previousProgress && color === previousColor) return;
    group.visible = true;
    previousProgress = time;
    if (color !== previousColor) {
      previousColor = color;
      drinkColor.set(color);
    }

    const lift = ease(.06, .25, time) * (1 - ease(.63, .82, time));
    const tilt = -1.27 * ease(.17, .28, time) * (1 - ease(.58, .72, time));
    origin.set(-.216 + .103 * lift, trayTop + .251 * lift, -.030 + .061 * lift);
    const sine = Math.sin(tilt);
    const cosine = Math.cos(tilt);
    let wareCount = counterware.length;
    for (const [x, y, z, width, height, depth] of shaker) {
      placeBox(ware, wareCount++, origin.x + x * cosine - y * sine,
        origin.y + x * sine + y * cosine, origin.z + z, width, height, depth, undefined, tilt);
    }

    liquidCount = 0;
    const fill = ease(.27, .63, time);
    const drinkTop = .052 + .096 * fill;
    if (fill > .015) {
      addLiquidBox(cupX, .052 + .048 * fill, cupZ, .142, .096 * fill, .116, drinkColor);
      addLiquidBox(cupX - .034, drinkTop + .002, cupZ - .023, .047, .005, .019,
        scratchColor.copy(drinkColor).lerp(highlight, .38));
    }
    if (time >= .29 && time < .62) {
      start.set(origin.x - .274 * sine, origin.y + .274 * cosine, origin.z);
      end.set(cupX, drinkTop + .004, cupZ);
      point.copy(start).lerp(end, .38);
      point.y += .025;
      pourSegment(start, point);
      pourSegment(point, end);
    }

    const stir = ease(.66, .74, time) * (1 - ease(.87, .96, time));
    if (stir > .008) {
      const phase = time * Math.PI * 24;
      const spoonX = cupX + Math.sin(phase) * .038 * stir;
      const spoonZ = cupZ + Math.cos(phase) * .034 * stir;
      placeBox(ware, wareCount++, spoonX, .177 + .054 * stir, spoonZ, .022, .182, .019,
        undefined, Math.cos(phase) * .22);
      placeBox(ware, wareCount++, spoonX, .109 + .054 * stir, spoonZ, .036, .028, .024);
      addLiquidBox(cupX - Math.sin(phase) * .04, drinkTop + .004, spoonZ, .019, .011, .026,
        scratchColor.copy(drinkColor).lerp(highlight, .53));
    }
    if (time >= .96) {
      addLiquidBox(cupX + .034, drinkTop + .012, cupZ - .024, .042, .020, .035,
        scratchColor.copy(drinkColor).lerp(highlight, .67));
      addLiquidBox(cupX + .044, drinkTop + .029, cupZ - .020, .025, .018, .042, garnish);
    }

    ware.count = wareCount;
    ware.instanceMatrix.needsUpdate = true;
    liquid.count = liquidCount;
    liquid.visible = liquidCount > 0;
    if (liquid.visible) {
      liquid.instanceMatrix.needsUpdate = true;
      liquid.instanceColor!.needsUpdate = true;
    }
  }

  return { update, hide: () => { group.visible = false; } };
}
