import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, IcosahedronGeometry, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, PlaneGeometry, SRGBColorSpace, Vector3,
} from 'three';
import type { TownActivity, TownActivityContext } from './town-activity';

const throwPoint = { x: 350, n: 89, ground: 5.5 };
const targetNorth = 79;
const attempts = 5;
const highScoreKey = 'unwritten:ice-target-best';
const laneOrder = [0, 1, 2, 1] as const;
const beat = 1.1;

export function createIceActivity(context: TownActivityContext): TownActivity {
  const lane = new Group();
  lane.name = 'ice-snowball-lane';
  lane.position.set(throwPoint.x, throwPoint.ground, -throwPoint.n);
  context.scene.add(lane);

  const timber = new MeshLambertMaterial({ color: '#603538' });
  const snow = new MeshLambertMaterial({ color: '#e5f7ff', flatShading: true });
  const trim = new MeshLambertMaterial({ color: '#c69459' });
  const rimmedIce = new MeshLambertMaterial({ color: '#70b7d4' });
  const guide = new MeshBasicMaterial({ color: '#9ddbf0' });
  const pale = new MeshBasicMaterial({ color: '#f9dfb6' });
  const red = new MeshBasicMaterial({ color: '#973d51' });
  const bolt = new MeshLambertMaterial({ color: '#9c704e' });
  const box = new BoxGeometry(1, 1, 1);
  const disc = new CylinderGeometry(1, 1, 1, 12);
  const targetDistance = throwPoint.n - targetNorth;

  function block(parent: Group, material: MeshLambertMaterial | MeshBasicMaterial,
    x: number, y: number, z: number, w: number, h: number, d: number) {
    const piece = new Mesh(box, material);
    piece.position.set(x, y, z);
    piece.scale.set(w, h, d);
    parent.add(piece);
    return piece;
  }
  function round(parent: Group, material: MeshLambertMaterial | MeshBasicMaterial,
    y: number, z: number, r: number, depth: number) {
    const piece = new Mesh(disc, material);
    piece.position.set(0, y, z);
    piece.scale.set(r, depth, r);
    piece.rotation.x = Math.PI / 2;
    parent.add(piece);
  }
  function sign(parent: Group, top: string, bottom: string, y: number, width: number, height: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 416;
    canvas.height = 160;
    const ink = canvas.getContext('2d');
    if (!ink) return;
    ink.fillStyle = '#351e29';
    ink.fillRect(0, 0, canvas.width, canvas.height);
    ink.strokeStyle = '#bd8d58';
    ink.lineWidth = 7;
    ink.strokeRect(10, 10, 396, 140);
    ink.textAlign = 'center';
    ink.fillStyle = '#fff3d5';
    ink.font = '700 56px "Microsoft YaHei", sans-serif';
    ink.fillText(top, 208, 79);
    ink.fillStyle = '#e8bd84';
    ink.font = '600 28px "Microsoft YaHei", sans-serif';
    ink.fillText(bottom, 208, 124);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const board = new Mesh(new PlaneGeometry(width, height), new MeshBasicMaterial({ map: texture }));
    board.position.set(0, y, -.19);
    board.rotation.y = Math.PI;
    parent.add(board);
  }

  block(lane, timber, 0, -.02, 0, 3.8, .08, 1.75);
  block(lane, rimmedIce, 0, .028, 0, 3.72, .023, 1.61);
  for (const x of [-1.8, 1.8]) {
    block(lane, guide, x, .049, 0, .037, .014, 1.57);
    for (const z of [1.9, 3.4, 4.9]) block(lane, pale, x, .029, z, .10, .025, .43);
  }
  block(lane, pale, 0, .049, .74, 3.59, .014, .055);
  const board = new Group();
  board.position.set(-2.45, 0, .65);
  block(board, timber, -.62, .75, 0, .14, 1.52, .22);
  block(board, timber, .62, .75, 0, .14, 1.52, .22);
  block(board, trim, 0, 1.47, 0, 1.88, .84, .29);
  block(board, snow, 0, 1.93, 0, 1.92, .10, .31);
  sign(board, '冰湖雪球赛', '金灯亮起时投掷', 1.47, 1.72, .67);
  lane.add(board);
  const pile = new IcosahedronGeometry(.22, 0);
  for (const x of [2.15, 2.48, 2.81]) {
    block(lane, timber, x, .25, 0, .31, .49, .48);
    const spare = new Mesh(pile, snow);
    spare.position.set(x, .6 + (x === 2.48 ? .16 : 0), 0);
    lane.add(spare);
  }

  const slots = [-1.8, 0, 1.8].map((x, index) => {
    const target = new Group();
    target.name = `snowball-target-${index + 1}`;
    target.position.set(x, 0, targetDistance);
    lane.add(target);
    const y = index === 1 ? 1.85 : 1.53;
    const radius = index === 1 ? .62 : .73;
    const lamp = new MeshBasicMaterial({ color: '#aa715a' });
    block(target, timber, 0, .06, 0, 1.55, .12, 1.10);
    block(target, snow, 0, .15, .32, 1.43, .08, .63);
    for (const side of [-1, 1]) {
      block(target, timber, side * .46, (y + .6) / 2, .04, .19, y + .4, .25);
      block(target, bolt, side * .46, .42, -.10, .27, .16, .16);
    }
    block(target, trim, 0, y, .02, 1.5, .26, .24);
    round(target, trim, y, -.08, radius + .11, .22);
    round(target, red, y, -.197, radius, .035);
    round(target, pale, y, -.218, radius * .67, .02);
    round(target, red, y, -.231, radius * .38, .018);
    round(target, lamp, y, -.246, radius * .20, .018);
    block(target, timber, 0, y + radius + .21, -.03, .39, .29, .32);
    block(target, lamp, 0, y + radius + .21, -.20, .25, .15, .036);
    for (let i = 0; i < (index === 1 ? 3 : 1); i++) {
      block(target, pale, (i - (index === 1 ? 1 : 0)) * .19, .30, -.19, .083, .11, .036);
    }
    return { x, y, lamp };
  });
  const ball = new Mesh(new IcosahedronGeometry(.25, 1), snow);
  ball.name = 'snowball-projectile';
  ball.visible = false;
  lane.add(ball);
  const sparkShape = new IcosahedronGeometry(.105, 0);
  const spark = new MeshBasicMaterial({ color: '#ffe590' });
  const sparks = new Group();
  sparks.name = 'snowball-impact';
  sparks.visible = false;
  lane.add(sparks);
  for (let i = 0; i < 10; i++) {
    const flake = new Mesh(sparkShape, spark);
    sparks.add(flake);
  }

  type Hit = { target: number; points: number; elapsed: number };
  let flight: Hit | undefined;
  let burst: Hit | undefined;
  let status: 'idle' | 'playing' | 'finished' = 'idle';
  let time = 0;
  let used = 0;
  let score = 0;
  let best = readBest();
  const destination = new Vector3();

  function readBest() {
    try {
      const score = Number(localStorage.getItem(highScoreKey));
      return Number.isInteger(score) && score >= 0 && score <= attempts * 3 ? score : 0;
    } catch {
      return 0;
    }
  }
  function start(panel: HTMLElement) {
    used = 0;
    score = 0;
    time = .27;
    flight = undefined;
    burst = undefined;
    ball.visible = false;
    sparks.visible = false;
    status = 'playing';
    panel.closest('dialog')?.close();
    context.face(throwPoint.x, targetNorth, throwPoint.ground + 1.6);
    context.announce('金靶亮起时投掷雪球 · 剩余 5 球');
  }
  function menu() {
    const finished = status === 'finished';
    const panel = context.open(finished ? '雪球赛成绩' : '冰湖雪球赛',
      finished
        ? `本轮 ${score} 分 · 本机最高 ${best} 分`
        : '有 5 个雪球。看准金灯亮起时投掷，中央靶值 3 分，两侧各 1 分。');
    const startButton = document.createElement('button');
    startButton.type = 'button';
    startButton.textContent = finished ? '再来一轮' : '开始挑战';
    startButton.addEventListener('click', () => start(panel));
    panel.append(startButton);
  }
  function aim() {
    const step = Math.floor(time / beat);
    const target = laneOrder[step % laneOrder.length];
    const phase = time % beat;
    return { target, lit: phase >= .14 && phase <= (target === 1 ? .72 : .89) };
  }
  function throwBall() {
    if (flight) return;
    const { target, lit } = aim();
    const points = lit ? target === 1 ? 3 : 1 : 0;
    flight = { target, elapsed: 0, points };
    const slot = slots[target];
    destination.set(slot.x + (points ? 0 : 1.07), slot.y - (points ? 0 : .48), targetDistance - .29);
    ball.position.set(.27, 1.24, .35);
    ball.visible = true;
    used++;
  }
  function impact(hit: Hit) {
    flight = undefined;
    ball.visible = false;
    burst = { ...hit, elapsed: 0 };
    sparks.position.copy(destination);
    sparks.visible = true;
    spark.color.set(hit.points ? '#ffe99d' : '#d5f0ff');
    score += hit.points;
    if (used === attempts) {
      status = 'finished';
      if (score > best) {
        best = score;
        try { localStorage.setItem(highScoreKey, String(best)); } catch { /* Session score stays available. */ }
      }
      context.announce(`雪球赛结束 · ${score} 分`);
    } else {
      const result = hit.points ? `命中 · +${hit.points} 分` : '没命中';
      context.announce(`${result} · 剩余 ${attempts - used} 球`);
    }
  }
  return {
    spots: [{
      ...throwPoint, range: 1.55,
      get label() {
        if (status === 'finished') return '查看雪球赛成绩';
        if (flight) return '雪球飞行中';
        if (status === 'playing') return aim().lit ? '投掷雪球 · 金灯亮起' : '投掷雪球';
        return '冰湖雪球赛';
      },
      run() { if (status === 'playing') throwBall(); else menu(); },
    }],
    blocked(x, n, ground) {
      if (Math.abs(ground - throwPoint.ground) > .75) return false;
      const localX = x - throwPoint.x;
      const localZ = throwPoint.n - n;
      const at = (centerX: number, centerZ: number, halfWidth: number, halfDepth: number) =>
        Math.abs(localX - centerX) < halfWidth + .27 && Math.abs(localZ - centerZ) < halfDepth + .27;
      return at(-2.45, .65, .96, .18) || at(2.48, 0, .5, .24) ||
        slots.some(slot => at(slot.x, targetDistance, .78, .55));
    },
    update(dt) {
      if (flight) {
        flight.elapsed += dt;
        const stage = Math.min(1, flight.elapsed / .55);
        ball.position.set(.27, 1.24, .35).lerp(destination, stage);
        ball.position.y += 4 * stage * (1 - stage) * .95;
        ball.rotation.x += dt * 6;
        if (stage === 1) impact(flight);
      } else if (status === 'playing') {
        time += dt;
      }
      if (burst) {
        burst.elapsed += dt;
        const stage = Math.min(1, burst.elapsed / .59);
        sparks.visible = stage < 1;
        sparks.children.forEach((flake, i) => {
          const angle = i * Math.PI * 2 / sparks.children.length;
          flake.position.set(Math.cos(angle) * stage, Math.sin(angle) * stage - .62 * stage ** 2, -stage * .52);
          flake.scale.setScalar(1 - stage * .78);
        });
        if (stage === 1) burst = undefined;
      }
      const active = status === 'playing' ? aim() : undefined;
      slots.forEach(({ lamp }, i) => {
        lamp.color.set(burst?.target === i && burst.points ? '#bff4a4'
          : active?.lit && active.target === i ? '#ffdc83' : '#a26951');
      });
    },
  };
}
