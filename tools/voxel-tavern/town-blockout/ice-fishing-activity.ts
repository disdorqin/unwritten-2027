import {
  BoxGeometry, CanvasTexture, Color, DynamicDrawUsage, InstancedMesh, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D, PlaneGeometry, SRGBColorSpace,
} from 'three';
import type { TownActivity, TownActivityContext } from './town-activity';

export const iceFishingStation = { x: 337, n: 87 } as const;
const hole = { x: 335.5, n: 85.5 };
const storageKey = 'unwritten:ice-fishing-log';
const biteSeconds = 1.6;
const species = [
  { id: 'crucian', name: '鲫鱼' },
  { id: 'perch', name: '鲈鱼' },
  { id: 'whitefish', name: '白鱼' },
] as const;
type FishId = (typeof species)[number]['id'];
type CatchLog = Record<FishId, number>;
type Phase = 'idle' | 'waiting' | 'bite' | 'caught' | 'missed';
type Session = {
  content: HTMLElement;
  dialog: HTMLDialogElement | null;
  status: HTMLElement;
  record: HTMLElement;
  action: HTMLButtonElement;
  phase: Phase;
  remaining: number;
  elapsed: number;
};

function readLog(): CatchLog {
  const initial: CatchLog = { crucian: 0, perch: 0, whitefish: 0 };
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
    if (!value || typeof value !== 'object') return initial;
    for (const { id } of species) {
      const count = (value as Record<string, unknown>)[id];
      if (typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) initial[id] = count;
    }
  } catch { /* The game still runs if this browser blocks storage. */ }
  return initial;
}

function buildFishingSpot(context: TownActivityContext, heightAt: (x: number, n: number) => number) {
  const waterLevel = heightAt(hole.x, hole.n);
  const { x, n } = iceFishingStation;
  const postX = x - .55;
  const postN = n + .9;
  const postY = heightAt(postX, postN);
  const pieces = [
    [hole.x, waterLevel + .013, hole.n, 1.12, .023, .90, '#122f48'],
    [hole.x, waterLevel + .023, hole.n, .90, .023, 1.13, '#152f49'],
    [hole.x + .55, waterLevel + .036, hole.n + .13, .19, .066, .77, '#9acfe5'],
    [hole.x - .54, waterLevel + .045, hole.n - .12, .20, .084, .77, '#c0e8f5'],
    [hole.x + .10, waterLevel + .043, hole.n + .55, .78, .071, .18, '#a7dded'],
    [hole.x - .14, waterLevel + .038, hole.n - .55, .78, .061, .17, '#8abbd4'],
    [hole.x + .38, waterLevel + .072, hole.n + .45, .23, .14, .24, '#e4f5fc'],
    [hole.x - .43, waterLevel + .064, hole.n - .49, .22, .11, .19, '#cbebf6'],
    [postX, postY + .55, postN, .14, 1.10, .14, '#6a473d'],
    [postX, postY + 1.13, postN, .11, .50, 1.20, '#64423c'],
    [postX, postY + 1.40, postN, .15, .07, 1.24, '#e4f3fa'],
  ] as const;
  const floatSize = [
    { h: .12, w: .10, tint: '#e78853' },
    { h: .10, w: .10, tint: '#ffeab4' },
  ] as const;
  const model = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshLambertMaterial(),
    pieces.length + floatSize.length);
  model.name = 'ice-fishing-spot';
  model.instanceMatrix.setUsage(DynamicDrawUsage);
  const pose = new Object3D();
  pieces.forEach(([east, y, north, w, h, d, tint], index) => {
    pose.position.set(east, y, -north);
    pose.scale.set(w, h, d);
    pose.updateMatrix();
    model.setMatrixAt(index, pose.matrix);
    model.setColorAt(index, new Color(tint));
  });
  floatSize.forEach(({ tint }, index) => model.setColorAt(pieces.length + index, new Color(tint)));
  context.scene.add(model);

  function moveFloat(offset: number) {
    let height = waterLevel + offset;
    floatSize.forEach(({ h, w }, index) => {
      pose.position.set(hole.x + .17, height + h / 2, -hole.n);
      pose.scale.set(w, h, w);
      pose.updateMatrix();
      model.setMatrixAt(pieces.length + index, pose.matrix);
      height += h;
    });
    model.instanceMatrix.needsUpdate = true;
  }
  moveFloat(.026);
  model.computeBoundingSphere();

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 112;
  const ink = canvas.getContext('2d');
  if (ink) {
    ink.fillStyle = '#38202e';
    ink.fillRect(0, 0, 256, 112);
    ink.strokeStyle = '#bd946a';
    ink.lineWidth = 5;
    ink.strokeRect(7, 7, 242, 98);
    ink.textAlign = 'center';
    ink.textBaseline = 'middle';
    ink.fillStyle = '#fff0d3';
    ink.font = '700 47px "Microsoft YaHei", sans-serif';
    ink.fillText('冰钓', 128, 58);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const sign = new Mesh(new PlaneGeometry(1.13, .46), new MeshBasicMaterial({ map: texture }));
    sign.name = 'ice-fishing-sign';
    sign.rotation.y = Math.PI / 2;
    sign.position.set(postX + .057, postY + 1.13, -postN);
    context.scene.add(sign);
  }
  return { waterLevel, moveFloat };
}

export function createIceFishingActivity(
  context: TownActivityContext, heightAt: (x: number, n: number) => number,
): TownActivity {
  const spot = buildFishingSpot(context, heightAt);
  const catches = readLog();
  let session: Session | undefined;

  const canPlay = (current: Session) =>
    session === current && current.content.isConnected && current.dialog?.open !== false;

  function showRecord(current: Session) {
    current.record.textContent = `本机收获 · ${species.map(({ id, name }) => `${name} ${catches[id]} 条`).join(' · ')}`;
  }

  function setPhase(current: Session, phase: Phase, message: string) {
    current.phase = phase;
    current.elapsed = 0;
    current.status.dataset.iceFishingStatus = phase;
    current.status.textContent = message;
    current.action.disabled = phase === 'waiting';
    current.action.textContent = phase === 'waiting' ? '等鱼咬钩' : phase === 'bite' ? '收线' : '抛竿';
  }

  function open() {
    spot.moveFloat(.026);
    context.face(hole.x, hole.n, spot.waterLevel + .15);
    const panel = context.open('冰湖冰钓', '抛竿后等浮标下沉，看到「收线」亮起时及时按下。');
    const content = document.createElement('section');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const record = document.createElement('p');
    record.className = 'ice-fishing-record';
    const action = document.createElement('button');
    action.type = 'button';
    content.style.display = 'grid';
    content.style.gap = '10px';
    content.append(status, action, record);
    panel.append(content);
    const current: Session = {
      content, dialog: panel.closest('dialog'), status, record, action,
      phase: 'idle', remaining: 0, elapsed: 0,
    };
    session = current;
    showRecord(current);
    setPhase(current, 'idle', '可以抛竿了。');
    action.addEventListener('click', () => {
      if (!canPlay(current) || current.phase === 'waiting') return;
      if (current.phase === 'bite') {
        const fish = species[Math.floor(Math.random() * species.length)];
        const saved = readLog();
        for (const { id } of species) catches[id] = Math.max(catches[id], saved[id]);
        catches[fish.id] = Math.min(Number.MAX_SAFE_INTEGER, catches[fish.id] + 1);
        let stored = true;
        try { localStorage.setItem(storageKey, JSON.stringify(catches)); }
        catch { stored = false; }
        showRecord(current);
        setPhase(current, 'caught', `钓上了${fish.name}！${stored ? '' : '收获保留在本次试玩。'}`);
        spot.moveFloat(.026);
        return;
      }
      current.remaining = 1.65 + Math.random() * 1.6;
      setPhase(current, 'waiting', '浮标漂着，等鱼咬钩。');
    });
  }

  return {
    spots: [{ ...iceFishingStation, ground: heightAt(iceFishingStation.x, iceFishingStation.n),
      range: 1.55, label: '冰湖冰钓', run: open }],
    update(dt: number) {
      const current = session;
      if (!current) return;
      if (!canPlay(current)) {
        session = undefined;
        spot.moveFloat(.026);
        return;
      }
      if (!Number.isFinite(dt) || dt <= 0 || (current.phase !== 'waiting' && current.phase !== 'bite')) return;
      const step = Math.min(dt, .1);
      current.elapsed += step;
      current.remaining -= step;
      if (current.phase === 'waiting' && current.remaining <= 0) {
        current.remaining = biteSeconds;
        setPhase(current, 'bite', '浮标下沉了，快收线！');
        const focus = document.activeElement;
        if (focus === document.body || focus === current.dialog || focus === current.action) {
          current.action.focus({ preventScroll: true });
        }
      } else if (current.phase === 'bite' && current.remaining <= 0) {
        setPhase(current, 'missed', '鱼溜走了，再抛一竿。');
      }
      const ripple = current.phase === 'bite' ? -.16 - Math.sin(current.elapsed * 20) * .03 :
        current.phase === 'waiting' ? .023 + Math.sin(current.elapsed * 4) * .025 : .026;
      spot.moveFloat(ripple);
    },
  };
}
