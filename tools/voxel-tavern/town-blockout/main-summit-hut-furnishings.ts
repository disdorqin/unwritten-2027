import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Euler, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, PointLight, Quaternion, SRGBColorSpace, TorusGeometry, Vector3,
} from 'three';
import { surveyPlateLines } from './town-survey';

const floor = 800;
// Hut interior frame (registration landmarks): west 56, east 69,
// south 1007, north 1019; door on the south wall at east 62.5.
const hut = { west: 56, east: 69, south: 1007, north: 1019 } as const;

/**
 * Summit hut furnishings (§3.9): the shell and register desk already stand
 * in the registration landmarks; this fills the checklist — stove with a
 * firebox mouth and wood pile, a bed, the summit log book on the desk
 * (this year's page left blank), a shelf of dry food / rope / spare lamp,
 * and the window landmark light. Outside: the stone circle by the door
 * (§3.12 dressing for the pig stone, no stone placed) whose centre brass
 * plate is survey station M7 (§4.17) — registered, not a separate pillar.
 */
export function createMainSummitHutFurnishings() {
  const group = new Group();
  group.name = 'main-summit-hut-furnishings';
  const disposers: (() => void)[] = [];
  const timber = new MeshLambertMaterial({ color: '#6d4c33' });
  const warmTimber = new MeshLambertMaterial({ color: '#8a6a42' });
  const cloth = new MeshLambertMaterial({ color: '#a33b2e' });
  const bedding = new MeshLambertMaterial({ color: '#d8d2c4' });
  const iron = new MeshLambertMaterial({ color: '#33373c' });
  const brass = new MeshLambertMaterial({ color: '#b08d4f' });
  const stone = new MeshLambertMaterial({ color: '#6d7276' });
  disposers.push(() => { timber.dispose(); warmTimber.dispose(); cloth.dispose(); bedding.dispose(); iron.dispose(); brass.dispose(); stone.dispose(); });

  function box(name: string, material: MeshLambertMaterial, size: [number, number, number],
    east: number, lift: number, north: number) {
    const mesh = new Mesh(new BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(east, floor + lift, -north);
    group.add(mesh);
    disposers.push(() => mesh.geometry.dispose());
    return mesh;
  }

  // Bed along the west wall, south end (sleep anchor for the summit).
  box('hut-bed-frame', timber, [1.05, .3, 2.1], 57.02, .35, 1009.4);
  box('hut-bed-mattress', bedding, [.98, .18, 2.0], 57.02, .59, 1009.4);
  box('hut-bed-blanket', cloth, [.98, .1, 1.25], 57.02, .66, 1009.85);
  box('hut-bed-pillow', bedding, [.7, .14, .4], 57.02, .7, 1008.6);

  // Stove dressing on the existing stone block (57.53, 1017.14): firebox
  // mouth with ember glow, plus the wood pile by its side.
  box('stove-firebox', iron, [.5, .42, .06], 57.53, .62, 1016.42);
  const ember = new Mesh(new PlaneGeometry(.34, .2),
    new MeshBasicMaterial({ color: '#ff7a26' }));
  ember.name = 'stove-ember-glow';
  ember.position.set(57.53, floor + .6, -1016.38);
  group.add(ember);
  disposers.push(() => { ember.geometry.dispose(); ember.material.dispose(); });
  {
    const logGeometry = new CylinderGeometry(.07, .07, .8, 6);
    const logs = new InstancedMesh(logGeometry, warmTimber, 5);
    logs.name = 'stove-wood-pile';
    const matrix = new Matrix4();
    const unit = new Vector3(1, 1, 1);
    for (let i = 0; i < 5; i++) {
      const rotation = new Quaternion().setFromEuler(new Euler(0, (i % 3) * .22, Math.PI / 2));
      matrix.compose(new Vector3(58.35, floor + .12 + Math.floor(i / 3) * .15, -1017.2), rotation, unit);
      logs.setMatrixAt(i, matrix);
    }
    logs.instanceMatrix.needsUpdate = true;
    group.add(logs);
    disposers.push(() => logGeometry.dispose());
  }

  // Shelf on the east wall: dry-food sacks, a rope coil, a spare oil lamp.
  box('hut-shelf-board', timber, [.5, .06, 2.2], 68.35, 1.5, 1016.2);
  box('hut-shelf-board-upper', timber, [.5, .06, 2.2], 68.35, 2.05, 1016.2);
  box('shelf-food-sack', cloth, [.34, .4, .34], 68.35, 1.73, 1015.5);
  box('shelf-food-sack-2', warmTimber, [.3, .34, .3], 68.35, 1.7, 1016.05);
  const rope = new Mesh(new TorusGeometry(.17, .055, 6, 14), warmTimber);
  rope.name = 'shelf-rope-coil';
  rope.position.set(68.35, floor + 1.72, -1016.75);
  group.add(rope);
  disposers.push(() => rope.geometry.dispose());
  box('shelf-lamp-base', iron, [.16, .2, .16], 68.35, 2.18, 1015.7);
  const lampGlow = new Mesh(new PlaneGeometry(.1, .14), new MeshBasicMaterial({ color: '#ffc46b' }));
  lampGlow.name = 'shelf-lamp-glow';
  lampGlow.position.set(68.35, floor + 2.3, -1015.7);
  group.add(lampGlow);
  disposers.push(() => { lampGlow.geometry.dispose(); lampGlow.material.dispose(); });

  // Summit log book on the register desk (62.5, 1016.14, top near +1.06):
  // left page carries past entries, right page is this year's blank lines.
  box('logbook-cover', cloth, [.62, .04, .44], 62.5, 1.1, 1016.14);
  const pages = new Mesh(new BoxGeometry(.58, .03, .4),
    new MeshLambertMaterial({ color: '#efe8d6' }));
  pages.name = 'summit-logbook';
  pages.position.set(62.5, floor + 1.13, -1016.14);
  group.add(pages);
  disposers.push(() => pages.geometry.dispose());
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 352;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#efe8d6';
      ctx.fillRect(0, 0, 512, 352);
      ctx.strokeStyle = '#9a8f76';
      ctx.lineWidth = 2;
      for (let row = 0; row < 8; row++) {
        const y = 52 + row * 38;
        ctx.beginPath(); ctx.moveTo(24, y); ctx.lineTo(238, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(274, y); ctx.lineTo(488, y); ctx.stroke();
      }
      ctx.fillStyle = '#4a4234';
      ctx.font = '26px system-ui, sans-serif';
      ctx.fillText('除夕前五日 · 雪 · 登顶', 28, 44);
      ctx.fillText('除夕前二日 · 晴 · 登顶', 28, 120);
      ctx.fillText('昨夜 · 风大 · 宿绝顶', 28, 196);
      ctx.strokeStyle = '#7a6f58';
      ctx.beginPath(); ctx.moveTo(256, 12); ctx.lineTo(256, 340); ctx.stroke();
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const face = new Mesh(new PlaneGeometry(.56, .38), new MeshBasicMaterial({ map: texture }));
      face.rotation.x = -Math.PI / 2;
      face.position.set(62.5, floor + 1.147, -1016.14);
      face.name = 'summit-logbook-pages';
      group.add(face);
      disposers.push(() => { face.geometry.dispose(); face.material.dispose(); texture.dispose(); });
    }
  }

  // Window landmark light: warm pane on the south wall, west of the door,
  // lit from inside at night. §3.9 hard metric: the one warm point the town
  // can see on a clear night (the skyline-side dot lives in the viewer).
  const pane = new Mesh(new PlaneGeometry(.92, 1.05),
    new MeshBasicMaterial({ color: '#ffb45c' }));
  pane.name = 'hut-window-landmark-light';
  pane.position.set(59.2, floor + 1.95, -(hut.south - .22));
  group.add(pane);
  disposers.push(() => { pane.geometry.dispose(); pane.material.dispose(); });
  box('hut-window-frame', timber, [1.1, .09, .1], 59.2, 2.52, hut.south - .18);
  box('hut-window-sill', timber, [1.1, .09, .1], 59.2, 1.38, hut.south - .18);
  const lamp = new PointLight('#ffa050', 14, 20, 1.6);
  lamp.name = 'hut-interior-lamp';
  lamp.position.set(60.5, floor + 2, -1013);
  group.add(lamp);

  // Stone circle by the door (§3.12): nine stones, centre brass plate = M7.
  const circle = { east: 62.5, north: 1003.6, radius: 1.7 };
  {
    const stoneGeometry = new BoxGeometry(.42, .3, .34);
    const stones = new InstancedMesh(stoneGeometry, stone, 9);
    stones.name = 'summit-stone-circle';
    const matrix = new Matrix4();
    const unit = new Vector3(1, 1, 1);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const rotation = new Quaternion().setFromEuler(new Euler(0, -angle, 0));
      matrix.compose(new Vector3(
        circle.east + Math.cos(angle) * circle.radius, floor + .15,
        -(circle.north + Math.sin(angle) * circle.radius)), rotation, unit);
      stones.setMatrixAt(i, matrix);
    }
    stones.instanceMatrix.needsUpdate = true;
    group.add(stones);
    disposers.push(() => stoneGeometry.dispose());
  }
  const marker = new Mesh(new CylinderGeometry(.3, .3, .05, 3), brass);
  marker.name = 'survey-station-m7-marker';
  marker.position.set(circle.east, floor + .03, -circle.north);
  group.add(marker);
  disposers.push(() => marker.geometry.dispose());
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#b08d4f';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#2e2413';
      ctx.textAlign = 'center';
      // M7 plate: exactly the three derived lines (town-survey.ts).
      const lines = surveyPlateLines('M7');
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillText(lines[0], 128, 78);
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.fillText(lines[1], 128, 148);
      ctx.fillText(lines[2], 128, 208);
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      const face = new Mesh(new PlaneGeometry(.44, .44), new MeshBasicMaterial({ map: texture, transparent: true }));
      face.name = 'survey-station-m7-face';
      face.rotation.x = -Math.PI / 2;
      face.rotation.z = Math.PI / 3;
      face.position.set(circle.east, floor + .062, -circle.north);
      group.add(face);
      disposers.push(() => { face.geometry.dispose(); face.material.dispose(); texture.dispose(); });
    }
  }

  let disposed = false;
  return {
    group,
    circle,
    windowLight: pane,
    blocked(east: number, north: number, feet: number, radius: number, bodyHeight: number) {
      if (feet + bodyHeight <= floor || feet >= floor + 1.2) return false;
      const near = (e: number, n: number, r: number) => Math.hypot(east - e, north - n) < r + radius;
      return near(57.02, 1009.4, .95) || near(68.35, 1016.2, .55);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      group.clear();
      for (const dispose of disposers) dispose();
    },
  };
}
