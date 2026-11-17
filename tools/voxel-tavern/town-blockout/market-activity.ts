import {
  BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial,
} from 'three';
import { makeSign } from './landmark-market';
import { layout } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

const patterns = [
  { name: '朱砂六角灯', corners: 6, paper: '#b73534', light: '#ff452c', radius: .33, height: .58 },
  { name: '松青八角灯', corners: 8, paper: '#397f75', light: '#63e9c1', radius: .29, height: .69 },
  { name: '金穗方灯', corners: 4, paper: '#bc802c', light: '#ffb844', radius: .37, height: .51 },
] as const;

const key = 'unwritten:workshop-lantern';
type Selection = { pattern: number; lit: boolean };

function savedSelection(): Selection {
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Selection> | null;
    const pattern = stored?.pattern;
    if (typeof pattern === 'number' && Number.isInteger(pattern) && patterns[pattern]) {
      return { pattern, lit: stored?.lit === true };
    }
  } catch { /* The workshop remains usable when browser storage is unavailable. */ }
  return { pattern: 0, lit: false };
}

function makeLantern({ corners, paper, light, radius, height }: typeof patterns[number]) {
  const lantern = new Group();
  const wood = new MeshStandardMaterial({ color: '#59362c', roughness: .83 });
  const brass = new MeshStandardMaterial({ color: '#ce9b55', roughness: .77 });
  const ricePaper = new MeshStandardMaterial({ color: paper, emissive: light, emissiveIntensity: .05, roughness: .9 });
  const knot = new MeshStandardMaterial({ color: paper, roughness: .93 });
  const body = height - .16;
  function add(geometry: BoxGeometry | CylinderGeometry, material: MeshStandardMaterial, x: number, y: number, z: number) {
    const item = new Mesh(geometry, material);
    item.position.set(x, y, z);
    lantern.add(item);
    return item;
  }
  add(new CylinderGeometry(radius, radius, body, corners), ricePaper, 0, 0, 0);
  for (const side of [-1, 1]) {
    add(new CylinderGeometry(radius * 1.06, radius * 1.06, .04, corners), brass, 0, side * body / 2, 0);
    add(new CylinderGeometry(radius * .59, radius * .59, .065, corners), wood, 0, side * height / 2, 0);
    const down = side < 0;
    add(new CylinderGeometry(down ? .028 : .052, down ? .052 : .035, .065, corners),
      brass, 0, side * (height / 2 + .061), 0);
  }
  for (let i = 0; i < corners; i++) {
    const angle = i * 2 * Math.PI / corners;
    add(new BoxGeometry(.026, body, .026), brass,
      Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
  }
  for (const x of [-.036, 0, .036]) {
    add(new BoxGeometry(.022, .084, .022), knot, x, -height / 2 - .112, 0);
  }
  return { lantern, ricePaper };
}

export function createMarketActivity(context: TownActivityContext): TownActivity {
  const plot = layout.plots.find(({ id }) => id === 'lantern-workshop')!;
  const [east, north, base] = plot.origin;
  const stand = new Group();
  stand.name = 'workshop-handmade-lantern';
  stand.position.set(east - 1.55, base + 1.33, -(north + 4.12));
  const frameMaterial = new MeshStandardMaterial({ color: '#614033', roughness: .89 });
  const goldMaterial = new MeshStandardMaterial({ color: '#b38049', roughness: .78 });
  function support(size: [number, number, number], x: number, y: number, material: MeshStandardMaterial) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.position.set(x, y, 0);
    stand.add(mesh);
  }
  support([.77, .075, .43], .16, .04, frameMaterial);
  support([.075, 1.1, .075], .48, .55, frameMaterial);
  support([.58, .062, .075], .22, 1.07, goldMaterial);
  support([.035, .10, .035], 0, .99, frameMaterial);
  const models = patterns.map(makeLantern);
  for (const { lantern } of models) {
    lantern.position.set(0, .61, 0);
    stand.add(lantern);
  }
  context.scene.add(stand, makeSign('手作春灯', 1.02, .24, east - 1.6, base + 1.0, -(north + 2.56)));

  let selection = savedSelection();
  let elapsed = 0;
  function updateModel() {
    models.forEach(({ lantern, ricePaper }, pattern) => {
      lantern.visible = pattern === selection.pattern;
      ricePaper.emissiveIntensity = selection.lit ? 1.0 : .05;
      lantern.rotation.set(0, 0, 0);
    });
  }

  function apply(next: Selection) {
    selection = next;
    elapsed = 0;
    updateModel();
    try { localStorage.setItem(key, JSON.stringify(selection)); } catch { /* The session keeps the chosen lantern. */ }
  }
  updateModel();

  function craft() {
    const panel = context.open('春灯工坊', '选一款灯样，为工作台上那盏灯换好纸面，再点亮它。');
    const swatches = document.createElement('div');
    swatches.className = 'museum-options';
    swatches.setAttribute('role', 'group');
    swatches.setAttribute('aria-label', '挑选灯样');
    const feedback = document.createElement('p');
    feedback.setAttribute('aria-live', 'polite');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    const buttons = patterns.map(({ name }, pattern) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.onclick = () => {
        if (selection.pattern === pattern) return;
        apply({ pattern, lit: false });
        refresh();
      };
      swatches.append(button);
      return button;
    });
    function refresh() {
      buttons.forEach((button, pattern) =>
        button.setAttribute('aria-pressed', String(pattern === selection.pattern)));
      const { name } = patterns[selection.pattern];
      feedback.textContent = selection.lit ? `${name}已经点亮。` : `${name}的灯面已装好，等你点亮。`;
      toggle.textContent = selection.lit ? '熄灯' : '点亮并查看';
    }
    toggle.onclick = () => {
      apply({ ...selection, lit: !selection.lit });
      refresh();
      if (selection.lit) {
        const dialog = panel.closest('dialog');
        if (dialog?.open) dialog.close();
        context.face(east - 1.55, north + 4.12, base + 1.94);
        context.announce(`${patterns[selection.pattern].name}已在工作台点亮`);
      } else {
        context.announce('工作台的春灯已熄灭');
      }
    };
    panel.append(swatches, feedback, toggle);
    refresh();
  }

  return {
    spots: [{ x: east - 2, n: north + 2, ground: base + .15, range: 1.5, label: '制作春灯', run: craft }],
    update(dt) {
      if (!selection.lit) return;
      elapsed += dt;
      const { lantern, ricePaper } = models[selection.pattern];
      lantern.rotation.z = Math.sin(elapsed * 1.8) * .047;
      ricePaper.emissiveIntensity = 1.04 + Math.sin(elapsed * 3.1) * .09;
    },
  };
}
