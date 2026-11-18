import { Vector3, type PerspectiveCamera } from 'three';
import {
  inPlazaPhotoArc, plazaPhotoCountdownMs, plazaPhotoGatherMs, plazaPhotoLockMs,
  type PlazaPhotoNotice, type PlazaPhotoPerson,
} from '../../../src/presence/plaza-photo';
import { downloadTownCanvas } from './town-photo-download';
import { recordTownChroniclePlazaPhoto } from './town-chronicle';


type Round = { id: number; captureAt: number; shared: boolean; entered: boolean; optedOut: boolean; lineup?: PlazaPhotoPerson[] };
type Placement = { east: number; north: number; height: number; active: boolean };
type PhotoFrame = { round: Round; people: PlazaPhotoPerson[]; showNames: boolean; shutter: boolean };

const lineupGraceMs = 500;

export function createPlazaGroupPhoto(options: {
  now(): number;
  ownId(): number;
  request(): boolean;
  leave(id: number): void;
  nearby(): PlazaPhotoPerson[];
  announce(message: string): void;
  open(title: string, description: string): HTMLElement;
}) {
  let round: Round | undefined;
  let eligible = false;
  let unlockTimer: ReturnType<typeof setTimeout> | undefined;
  let lastPanelText = '';
  let previewNames = true;
  let pendingUntil = 0;

  const panel = document.createElement('section');
  panel.className = 'plaza-photo-controls';
  panel.hidden = true;
  panel.setAttribute('aria-label', '广场合影');
  const count = document.createElement('p');
  count.dataset.photoCountdown = '';
  const directions = document.createElement('p');
  directions.textContent = '走到出生点以北的两道合影弧线附近，按站位自由排队。';
  const guide = document.createElement('div');
  guide.className = 'plaza-photo-lineup-guide';
  guide.setAttribute('aria-hidden', 'true');
  const enter = document.createElement('button');
  enter.type = 'button';
  enter.textContent = '进入合影机位';
  enter.onclick = () => { if (round && eligible && !round.optedOut) round.entered = true; };
  const leave = document.createElement('button');
  leave.type = 'button';
  leave.textContent = '退出合影';
  leave.onclick = () => {
    if (!round || locked()) return;
    if (round.shared) options.leave(round.id);
    round.optedOut = true;
    round.entered = false;
    panel.hidden = true;
  };
  const plateToggle = document.createElement('label');
  const plate = document.createElement('input');
  plate.type = 'checkbox';
  plate.checked = true;
  plate.onchange = () => { previewNames = plate.checked; };
  plateToggle.append(plate, ' 显示铭牌');
  panel.append(count, directions, guide, enter, leave, plateToggle);
  document.body.append(panel);

  function locked() {
    return unlockTimer !== undefined;
  }

  function unlock() {
    clearTimeout(unlockTimer);
    unlockTimer = undefined;
    leave.disabled = false;
  }

  function finish() {
    round = undefined;
    unlock();
    panel.hidden = true;
  }

  function request() {
    if (round || options.now() < pendingUntil) return;
    pendingUntil = options.now() + 800;
    if (options.request()) return;
    const now = Math.round(options.now());
    round = { id: now, captureAt: now + plazaPhotoGatherMs + plazaPhotoCountdownMs, shared: false, entered: false, optedOut: false };
    options.announce('本机合影。30 秒后进入机位。');
  }

  function receive(notice: PlazaPhotoNotice) {
    if (notice.captureAt <= options.now() - lineupGraceMs) return;
    if (notice.kind === 'plaza-photo-invite') {
      if (round?.shared && round.id === notice.id && round.captureAt === notice.captureAt) return;
      unlock();
      round = { id: notice.id, captureAt: notice.captureAt, shared: true, entered: false, optedOut: false };
      options.announce('广场合影，30 秒内到站位集合');
    } else if (round?.shared && round.id === notice.id && round.captureAt === notice.captureAt) {
      round.lineup = notice.people;
    }
  }

  function update({ east, north, height, active }: Placement): PhotoFrame | undefined {
    eligible = active && inPlazaPhotoArc(east, north, height);
    const current = round;
    if (!current) return;
    const time = options.now();
    const remaining = current.captureAt - time;
    if (remaining < -lineupGraceMs || (remaining <= 0 && (current.optedOut || !current.entered))) {
      finish();
      return;
    }
    if (current.optedOut) return;
    const standing = remaining > plazaPhotoCountdownMs;
    if (!standing && remaining <= plazaPhotoCountdownMs - 3000 && eligible) current.entered = true;
    if (!eligible && remaining > plazaPhotoLockMs) current.entered = false;
    if (!panel.hidden || standing || eligible || current.entered) {
      const nextText = standing ? `集合还有 ${Math.ceil((remaining - plazaPhotoCountdownMs) / 1000)} 秒` :
        `合影倒数 ${Math.max(1, Math.ceil(remaining / 1000))}`;
      if (nextText !== lastPanelText) { count.textContent = nextText; lastPanelText = nextText; }
      panel.hidden = false;
      guide.hidden = current.entered;
      directions.hidden = current.entered;
      enter.hidden = standing || current.entered || !eligible;
      plateToggle.hidden = standing;
    }
    if (current.entered && remaining <= plazaPhotoLockMs) {
      if (!locked()) {
        // Movement must unlock even when no lineup arrives and animation frames stop.
        unlockTimer = setTimeout(finish, Math.max(0, remaining + lineupGraceMs));
        leave.disabled = true;
      }
    } else if (locked()) {
      unlock();
    }
    if (!current.entered || standing) return;
    if (!current.shared && remaining <= plazaPhotoLockMs && !current.lineup) {
      current.lineup = options.nearby().filter(person => person.id === options.ownId());
    }
    const own = options.ownId();
    if (current.lineup && !current.lineup.some(person => person.id === own)) {
      finish();
      options.announce('本次已锁定名单，请到合影站位参加下一场。');
      return;
    }
    const people = current.lineup ?? (current.shared ? options.nearby() : options.nearby().filter(person => person.id === own));
    return { round: current, people, showNames: previewNames, shutter: remaining <= 0 && !!current.lineup };
  }

  function record(frame: PhotoFrame) {
    const entry = {
      id: `plaza-photo-${frame.round.captureAt}-${frame.round.id}`,
      at: frame.round.captureAt, names: frame.people.map(person => person.name), occasion: '日常合影',
    };
    return recordTownChroniclePlazaPhoto(entry);
  }

  function capture(source: HTMLCanvasElement, camera: PerspectiveCamera, frame: PhotoFrame) {
    if (round !== frame.round) return;
    finish();
    const raw = document.createElement('canvas');
    raw.width = source.width;
    raw.height = source.height;
    const rawContext = raw.getContext('2d');
    if (!rawContext || !raw.width || !raw.height) return;
    rawContext.drawImage(source, 0, 0);
    const point = new Vector3();
    const labels = frame.people.map(person => {
      point.set(person.east, person.height + 2.15, -person.north).project(camera);
      return { name: person.name, x: (point.x + 1) * .5, y: (1 - point.y) * .5, z: point.z };
    }).filter(label => label.x > 0 && label.x < 1 && label.y > 0 && label.y < 1 && label.z >= -1 && label.z <= 1);
    const body = options.open('广场合影', `参与者 ${frame.people.length} 人 · ${frame.people.map(person => person.name).join('、')}`);
    const wrapper = document.createElement('div');
    wrapper.className = 'plaza-photo-preview';
    const output = document.createElement('canvas');
    output.setAttribute('aria-label', '广场合影预览');
    output.width = raw.width;
    output.height = raw.height;
    const ctx = output.getContext('2d');
    if (!ctx) return;
    const names = document.createElement('input');
    names.type = 'checkbox';
    names.checked = frame.showNames;
    const nameLabel = document.createElement('label');
    nameLabel.append(names, ' 显示铭牌');
    const style = document.createElement('select');
    style.setAttribute('aria-label', '相框');
    style.add(new Option('测试纪念', 'test'));
    style.add(new Option('无框', 'none'));
    const now = new Date(frame.round.captureAt);
    const captionDate = now.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const unit = Math.max(12, Math.round(raw.width / 58));
    function compose() {
      ctx!.drawImage(raw, 0, 0);
      if (names.checked) {
        ctx!.font = `600 ${unit}px sans-serif`;
        ctx!.textAlign = 'center';
        for (const label of labels) {
          const x = label.x * raw.width, y = label.y * raw.height - 5;
          const width = ctx!.measureText(label.name).width + unit;
          ctx!.fillStyle = '#132338e8';
          ctx!.fillRect(x - width / 2, y - unit, width, unit * 1.35);
          ctx!.fillStyle = '#fff6de';
          ctx!.fillText(label.name, x, y);
        }
      }
      if (style.value !== 'test') return;
      ctx!.strokeStyle = '#f3cd81';
      ctx!.lineWidth = 4;
      ctx!.strokeRect(5, 5, raw.width - 10, raw.height - 10);
      const captionHeight = unit * 2.6;
      ctx!.fillStyle = '#162437e9';
      ctx!.fillRect(0, raw.height - captionHeight, raw.width, captionHeight);
      ctx!.fillStyle = '#ffe6ae';
      ctx!.font = `600 ${unit}px sans-serif`;
      ctx!.textAlign = 'center';
      ctx!.fillText(`未写镇 · 测试之夜　${captionDate}`, raw.width / 2, raw.height - unit);
    }
    names.onchange = style.onchange = compose;
    compose();
    const save = document.createElement('button');
    save.type = 'button';
    save.textContent = '下载 PNG';
    save.onclick = () => downloadTownCanvas(output, `UNWRITTEN-2027-plaza-group-${now.toISOString().slice(0, 19).replace(/:/g, '-')}.png`);
    const chronicle = document.createElement('button');
    chronicle.type = 'button';
    chronicle.textContent = '入镇志';
    chronicle.onclick = () => {
      chronicle.textContent = record(frame) ? '已写入本机镇志' : '本机存储不可用';
    };
    const retake = document.createElement('button');
    retake.type = 'button';
    retake.textContent = '重拍';
    retake.onclick = () => {
      wrapper.closest('dialog')?.close();
      setTimeout(request, 1_100);
    };
    wrapper.append(output, nameLabel, style, save, chronicle, retake);
    body.append(wrapper);
  }

  return { request, receive, update, capture, active: () => !!round, locked };
}
