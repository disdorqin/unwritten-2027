import { BoxGeometry, Color, Group, InstancedMesh, Matrix4, MeshLambertMaterial } from 'three';
import type { Box } from './landmark-kit';
import type { TownActivity, TownActivityContext, TownActivitySpot } from './town-activity';
import { browserTextStorage, readCollection, writeCollection } from './town-text-store';

export const plazaChronicleStele = { x: 229.7, n: 188, standNorth: 186.65, range: .85 } as const;
const openingPage = { number: 1, title: '开镇记', body: '' } as const;
const storageKey = 'unwritten.chronicle-fragments.v1';

export function buildPlazaChronicleStele(groundAt: (x: number, n: number) => number) {
  const { x, n } = plazaChronicleStele;
  const group = new Group();
  group.name = '广场碑';
  group.position.set(x, groundAt(x, n), -n);
  const pieces = [
    [0, .10, 0, 1.60, .20, 1.00, '#5a6372'],
    [0, .25, 0, 1.41, .14, .82, '#8796a2'],
    [0, .40, 0, 1.20, .16, .67, '#6d7787'],
    [0, 1.11, 0, 1.08, 1.26, .46, '#8493a1'],
    [0, 1.13, .24, .86, 1.02, .045, '#5d6c7a'],
    [0, 1.55, .27, .67, .022, .017, '#a59a7f'],
    [0, .71, .27, .67, .022, .017, '#a59a7f'],
    [0, 1.78, 0, 1.22, .14, .56, '#728091'],
    [0, 1.88, 0, .93, .09, .49, '#d5e1ed'],
  ] as const;
  const mesh = new InstancedMesh(new BoxGeometry(), new MeshLambertMaterial(), pieces.length);
  const matrix = new Matrix4();
  const color = new Color();
  pieces.forEach(([east, y, z, width, height, depth, tint], index) => {
    matrix.makeScale(width, height, depth).setPosition(east, y, z);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.set(tint));
  });
  group.add(mesh);
  group.userData.colliders = [
    { min: [-.8, 0, -.5], max: [.8, .32, .5] },
    { min: [-.61, .32, -.28], max: [.61, 1.925, .28] },
  ] satisfies Box[];
  return group;
}

export function createOpeningChronicleActivity(
  { open }: Pick<TownActivityContext, 'open'>,
  groundAt: (x: number, n: number) => number,
  storage = browserTextStorage(),
): TownActivity {
  const readPages = () => readCollection(storage, storageKey, (item): item is 1 => item === openingPage.number);
  let collected = readPages().includes(openingPage.number);
  let saved = collected;
  const { x, standNorth, range } = plazaChronicleStele;
  const spot: TownActivitySpot = {
    x, n: standNorth, ground: groundAt(x, standNorth), range,
    label: collected ? '打开个人镇志' : '拓印广场碑',
    run() {
      if (readPages().includes(openingPage.number)) collected = saved = true;
      if (collected) {
        spot.label = '打开个人镇志';
        showPage();
        return;
      }
      const panel = open('广场碑', '');
      const rub = document.createElement('button');
      rub.type = 'button';
      rub.textContent = '拓印并入册';
      rub.onclick = () => {
        saved = writeCollection(storage, storageKey, [openingPage.number]);
        collected = true;
        spot.label = '打开个人镇志';
        showPage();
      };
      panel.append(rub);
    },
  };

  function showPage() {
    const panel = open('个人镇志', '');
    const page = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = `第 ${openingPage.number} 页 · ${openingPage.title}`;
    const body = document.createElement('p');
    body.textContent = openingPage.body;
    page.append(heading, body);
    panel.append(page);
    if (!saved) {
      const status = document.createElement('p');
      status.textContent = '本机存储不可用，本次游玩仍可查看。';
      panel.append(status);
    }
  }
  return { spots: [spot] };
}
