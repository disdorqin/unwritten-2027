import { Box3, BoxGeometry, Group, InstancedMesh, MeshLambertMaterial, Object3D, Vector3 } from 'three';

type Size = readonly [number, number, number];
type Part = { centre: Size; size: Size; finish: keyof typeof palette };
type HeightAt = (east: number, north: number) => number | undefined;

const palette = {
  slate: '#62666b', stone: '#87898a', lightStone: '#a3a4a0',
  oak: '#846348', grain: '#9a7958', darkOak: '#533e30',
  iron: '#403c37', brass: '#ad8245', gold: '#d4a963', glass: '#293e4a', glint: '#5c798c',
} as const;

export const summitOutlookAnchor = { east: 81, north: 998, height: 800 } as const;
export const summitOutlookStand = { east: 80, north: 998, height: 800 } as const;
const deckBounds = { west: 77.5, east: 84.5, south: 995.5, north: 1000.5 } as const;
const railEast = 84.12;
const railSouth = 995.7;
const railNorth = 1000.3;
const railReturn = 81.1;

function summitPart(east: number, north: number, lift: number, size: Size, finish: Part['finish']): Part {
  return { centre: [east, summitOutlookAnchor.height + lift, -north], size, finish };
}

function deckParts() {
  const parts: Part[] = [
    summitPart(81, 998, -.15, [7, .30, 5], 'slate'),
    summitPart(81, deckBounds.south + .13, .014, [7, .056, .26], 'stone'),
    summitPart(81, deckBounds.north - .13, .014, [7, .056, .26], 'stone'),
    summitPart(deckBounds.west + .13, 998, .014, [.26, .056, 4.48], 'lightStone'),
    summitPart(deckBounds.east - .13, 998, .014, [.26, .056, 4.48], 'stone'),
  ];
  for (let row = 0; row < 14; row++) {
    const north = 995.92 + .32 * row;
    const seam = row % 2 === 0 ? 80.9 : 81.9;
    parts.push(
      summitPart((77.76 + seam) / 2, north, .012, [seam - 77.77, .044, .308], row % 3 === 0 ? 'grain' : 'oak'),
      summitPart((seam + 84.24) / 2, north, .012, [84.23 - seam, .044, .308], row % 3 === 1 ? 'grain' : 'oak'),
    );
  }
  return parts;
}

function railingParts() {
  const parts: Part[] = [];
  for (const [east, north] of [[railEast, railSouth], [railEast, 998], [railEast, railNorth],
    [railReturn, railSouth], [railReturn, railNorth]]) {
    parts.push(
      summitPart(east, north, .12, [.32, .24, .32], 'stone'),
      summitPart(east, north, .68, [.20, 1.12, .20], 'darkOak'),
      summitPart(east, north, 1.28, [.27, .10, .27], 'grain'),
      summitPart(east, north, .97, [.219, .075, .219], 'iron'),
    );
  }
  for (const lift of [.45, 1.09]) {
    const finish = lift > 1 ? 'grain' : 'oak';
    parts.push(summitPart(railEast, 998, lift, [.15, .15, railNorth - railSouth], finish));
    for (const north of [railSouth, railNorth]) {
      parts.push(summitPart((railEast + railReturn) / 2, north, lift,
        [railEast - railReturn, .15, .15], finish));
    }
  }
  for (const north of [996.25, 996.83, 997.42, 998.58, 999.17, 999.75]) {
    parts.push(summitPart(railEast, north, .76, [.10, .57, .10], 'darkOak'));
  }
  for (const north of [railSouth, railNorth]) {
    for (const east of [81.70, 82.3, 82.9, 83.5]) {
      parts.push(summitPart(east, north, .76, [.10, .57, .10], 'darkOak'));
    }
  }
  return parts;
}

/** Build an octagonal voxel tube from horizontal courses. Its local +X axis faces the sunrise. */
function tubeCourse(east: number, length: number, radius: number, finish: Part['finish']): Part[] {
  return [-2, -1, 0, 1, 2].map(row => ({
    centre: [east, row * radius * .4, 0],
    size: [length, radius * .4, radius * (2 - Math.abs(row) * .32)],
    finish,
  }));
}

export function mountMainSummitOutlook(owner: Group, heightAt: HeightAt) {
  const floor = summitOutlookAnchor.height;
  for (const east of [deckBounds.west, summitOutlookAnchor.east, deckBounds.east]) {
    for (const north of [deckBounds.south, summitOutlookAnchor.north, deckBounds.north]) {
      if (heightAt(east, north) !== floor) throw new RangeError('The summit lookout requires the surveyed 800 m plateau.');
    }
  }

  const group = new Group();
  group.name = 'main-summit-outlook';
  const geometry = new BoxGeometry();
  const materials = new Map<Part['finish'], MeshLambertMaterial>();
  const meshes: InstancedMesh[] = [];
  const transform = new Object3D();

  function section(parent: Group, name: string, parts: readonly Part[]) {
    const object = new Group();
    object.name = name;
    parent.add(object);
    for (const finish of Object.keys(palette) as Part['finish'][]) {
      const matching = parts.filter(part => part.finish === finish);
      if (matching.length === 0) continue;
      let material = materials.get(finish);
      if (!material) {
        material = new MeshLambertMaterial({ color: palette[finish] });
        materials.set(finish, material);
      }
      const mesh = new InstancedMesh(geometry, material, matching.length);
      mesh.name = name + '-' + finish;
      matching.forEach(({ centre, size }, index) => {
        transform.position.set(...centre);
        transform.scale.set(...size);
        transform.updateMatrix();
        mesh.setMatrixAt(index, transform.matrix);
      });
      mesh.computeBoundingBox();
      mesh.computeBoundingSphere();
      object.add(mesh);
      meshes.push(mesh);
    }
    return object;
  }

  section(group, 'summit-outlook-deck', deckParts());
  section(group, 'summit-outlook-rail', railingParts());
  const telescope = new Group();
  telescope.name = 'summit-outlook-telescope';
  group.add(telescope);
  const pedestalParts = [
    summitPart(82, 998, .14, [.90, .28, .86], 'slate'),
    summitPart(82, 998, .31, [.72, .12, .69], 'lightStone'),
    summitPart(82, 998, .89, [.35, 1.10, .35], 'darkOak'),
    summitPart(82, 998, .43, [.45, .16, .45], 'oak'),
    summitPart(82, 998, 1.29, [.42, .16, .43], 'brass'),
    summitPart(82, 998, 1.41, [.44, .15, .52], 'iron'),
  ];
  for (const north of [997.75, 998.25]) {
    pedestalParts.push(
      summitPart(82, north, 1.58, [.27, .30, .084], 'iron'),
      summitPart(82, north + (north - 998) * .20, 1.64, [.13, .13, .037], 'gold'),
    );
  }
  const pedestal = section(telescope, 'outlook-telescope-pedestal', pedestalParts);
  const barrel = section(telescope, 'outlook-telescope-barrel', [
    ...tubeCourse(-.39, .83, .173, 'brass'),
    ...tubeCourse(.31, .73, .212, 'brass'),
    ...tubeCourse(-.72, .085, .195, 'gold'),
    ...tubeCourse(.02, .078, .237, 'gold'),
    ...tubeCourse(.58, .078, .247, 'gold'),
    { centre: [-.35, .183, 0], size: [.37, .025, .085], finish: 'gold' },
  ]);
  barrel.position.set(82, floor + 1.65, -998);
  barrel.rotation.z = Math.PI / 32;
  const objective = section(barrel, 'outlook-telescope-objective', [
    ...tubeCourse(-.02, .36, .272, 'brass'),
    ...tubeCourse(.153, .10, .299, 'gold'),
    ...tubeCourse(.207, .021, .240, 'iron'),
    ...tubeCourse(.221, .021, .192, 'glass'),
    { centre: [.234, .065, -.052], size: [.011, .047, .073], finish: 'glint' },
  ]);
  objective.position.x = .83;
  const eyepiece = section(barrel, 'outlook-telescope-eyepiece', [
    ...tubeCourse(.04, .26, .122, 'iron'),
    ...tubeCourse(-.10, .09, .145, 'brass'),
    ...tubeCourse(-.153, .022, .090, 'glass'),
  ]);
  eyepiece.position.x = -.91;

  const solids = [
    new Box3(new Vector3(railEast - .14, floor, -railNorth), new Vector3(railEast + .14, floor + 1.33, -railSouth)),
    ...[railSouth, railNorth].map(north => new Box3(
      new Vector3(railReturn - .14, floor, -north - .14), new Vector3(railEast + .14, floor + 1.33, -north + .14),
    )),
    new Box3().setFromObject(pedestal), new Box3().setFromObject(barrel),
  ];
  owner.add(group);
  let disposed = false;

  return {
    group, anchor: summitOutlookAnchor, stand: summitOutlookStand,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (disposed) return false;
      return solids.some(({ min, max }) => {
        if (feet + bodyHeight - .025 <= min.y || feet + .025 >= max.y) return false;
        const dx = Math.max(min.x - east, east - max.x, 0);
        const dz = Math.max(min.z + north, -north - max.z, 0);
        return Math.hypot(dx, dz) < radius;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const material of materials.values()) material.dispose();
      geometry.dispose();
      group.clear();
    },
  };
}
