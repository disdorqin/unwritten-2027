import {
  BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, InstancedMesh, Line,
  LineBasicMaterial, Matrix4, Mesh, MeshLambertMaterial, Quaternion, Vector3,
} from 'three';

type HeightAt = (east: number, north: number) => number | undefined;

// Surveyed placement (§2.6): the frozen fall drapes the steep face below the
// summit plateau on the saddle side, centre line east -60, running north
// 660 -> 800 (about 55 m of rise), 15 m wide. The top anchor is where the
// fall meets the upper trail side; ZB-31b climbing mechanics land later.
export const icefallSpec = {
  centreEast: -60, northFrom: 660, northTo: 800, width: 15, stakeCount: 6,
} as const;

const iceLight = new Color('#cfeef5');
const iceDeep = new Color('#7fc4d8');
const iceWhite = new Color('#f4fbfd');

/** Frozen waterfall (§2.6): terrain-draped ice sheet, icicle teeth, rope stakes. */
export function createMainSummitIcefall(heightAt: HeightAt) {
  const group = new Group();
  group.name = 'main-summit-icefall';
  const { centreEast, northFrom, northTo, width, stakeCount } = icefallSpec;
  let seed = 13;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const alongSteps = 28, acrossSteps = 4;
  const positions: number[] = [];
  const colors: number[] = [];
  const tint = new Color();
  for (let i = 0; i <= alongSteps; i++) {
    const north = northFrom + (northTo - northFrom) * (i / alongSteps);
    for (let j = 0; j <= acrossSteps; j++) {
      const east = centreEast - width / 2 + width * (j / acrossSteps);
      const height = (heightAt(east, north) ?? 600) + .35;
      positions.push(east, height, -north);
      // Bubble streaks run downhill: mix by a fixed east streak plus noise.
      const streak = .5 + .5 * Math.sin(east * 2.1 + north * .05);
      tint.copy(iceDeep).lerp(iceLight, streak * .7 + rand() * .3);
      if (rand() > .93) tint.lerp(iceWhite, .6);
      colors.push(tint.r, tint.g, tint.b);
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < alongSteps; i++) {
    for (let j = 0; j < acrossSteps; j++) {
      const here = i * (acrossSteps + 1) + j;
      const next = here + acrossSteps + 1;
      indices.push(here, next, here + 1, here + 1, next, next + 1);
    }
  }
  const sheetGeometry = new BufferGeometry();
  sheetGeometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  sheetGeometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  sheetGeometry.setIndex(indices);
  sheetGeometry.computeVertexNormals();
  const sheetMaterial = new MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: .94 });
  const sheet = new Mesh(sheetGeometry, sheetMaterial);
  sheet.name = 'icefall-sheet';
  group.add(sheet);

  const toothMaterial = new MeshLambertMaterial({ color: '#cfeef5' });
  const toothGeometry = new ConeGeometry(.5, 1, 6);
  const teeth = new InstancedMesh(toothGeometry, toothMaterial, 7);
  teeth.name = 'icefall-teeth';
  {
    const matrix = new Matrix4();
    const flip = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
    for (let j = 0; j < 7; j++) {
      const east = centreEast - width / 2 + 1 + j * (width - 2) / 6;
      const base = (heightAt(east, northFrom) ?? 600) + .3;
      const length = 2 + rand() * 2.5;
      matrix.compose(new Vector3(east, base - length / 2 + .4, -northFrom), flip, new Vector3(1, length, 1));
      teeth.setMatrixAt(j, matrix);
    }
    teeth.instanceMatrix.needsUpdate = true;
  }
  group.add(teeth);

  const stakeMaterial = new MeshLambertMaterial({ color: '#3c4147' });
  const stakeGeometry = new CylinderGeometry(.06, .09, 1.1, 6);
  const stakeMeshes = new InstancedMesh(stakeGeometry, stakeMaterial, stakeCount);
  stakeMeshes.name = 'icefall-rope-stakes';
  const stakes: { east: number; north: number; height: number }[] = [];
  const ropePoints: Vector3[] = [];
  {
    const matrix = new Matrix4();
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), .35);
    const unit = new Vector3(1, 1, 1);
    for (let i = 0; i < stakeCount; i++) {
      const fraction = .08 + .84 * (i / (stakeCount - 1));
      const north = northFrom + (northTo - northFrom) * fraction;
      const east = centreEast + (i % 2 === 0 ? -1.5 : 1.5);
      const height = (heightAt(east, north) ?? 600) + .35;
      matrix.compose(new Vector3(east, height + .35, -north), tilt, unit);
      stakeMeshes.setMatrixAt(i, matrix);
      stakes.push({ east, north, height });
      ropePoints.push(new Vector3(east, height + .85, -north));
    }
    stakeMeshes.instanceMatrix.needsUpdate = true;
  }
  group.add(stakeMeshes);
  const ropeGeometry = new BufferGeometry().setFromPoints(ropePoints);
  const ropeMaterial = new LineBasicMaterial({ color: '#7a4b2a' });
  const rope = new Line(ropeGeometry, ropeMaterial);
  rope.name = 'icefall-rope';
  group.add(rope);

  const topAnchor = { east: centreEast, north: northTo, height: (heightAt(centreEast, northTo) ?? 690) + .35 };
  let disposed = false;
  return {
    group, stakes, topAnchor,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      sheetGeometry.dispose();
      sheetMaterial.dispose();
      toothGeometry.dispose();
      toothMaterial.dispose();
      stakeGeometry.dispose();
      stakeMaterial.dispose();
      ropeGeometry.dispose();
      ropeMaterial.dispose();
    },
  };
}
