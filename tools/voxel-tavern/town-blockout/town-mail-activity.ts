import { BoxGeometry, Color, Group, InstancedMesh, MeshLambertMaterial, Object3D } from 'three';
import type { TownActivityContext, TownActivitySpot } from './town-activity';
import { layout } from './terrain';
import {
  createTownMailStore, townMailLimits, townMailNpcNames, townMailRecipients, townMailTextLength, UNLOCK_AT,
} from './town-mail-store';
import './town-mail.css';

type Mailbox = 'main' | 'branch';
type XYZ = [number, number, number];
type Part = { center: XYZ; size: XYZ; color: string };
const [east, north, elevation] = layout.plots.find(plot => plot.id === 'post-office')!.origin;
const annex = { x: 416.49, n: 335.08 };
export const townMailStands = {
  main: { x: east + 3.26, n: north - 8.9 },
  wall: { x: east - 2.4, n: north, ground: elevation + .3 },
  branch: { x: 417.7, n: 334.1 },
};
const legacyDraftKey = 'unwritten:snow-town-letter';
const pageSize = 8;
const storageMessage = '浏览器未允许本地保存，请再试一次。';
const errors = {
  empty: '请填写有效文字，纯空白或纯标点无法提交。', length: '超出字数上限，请缩短后重试。',
  blocked: '这句话不太合适，换个说法吧', duplicate: '同样的正文已经提交过。',
  cooldown: '请间隔 3 秒再提交。', locked: '未到开启时间', missing: '未找到该信件或收信人。',
  storage: storageMessage, capacity: '已达本地保存上限。',
};
const localDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const plazaRoute = '出邮局沿灯路走到主街，向西前往钟楼广场。';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}
function line(title: string, field: HTMLElement) {
  const label = node('label');
  label.append(node('span', title), field);
  return label;
}
function action(container: HTMLElement, label: string, handler: () => void) {
  const button = node('button', label);
  button.type = 'button';
  button.onclick = handler;
  container.append(button);
  return button;
}
function counter(input: HTMLInputElement | HTMLTextAreaElement, limit: number) {
  const count = node('small');
  const refresh = () => {
    const length = townMailTextLength(input.value);
    count.textContent = String(length) + ' / ' + String(limit);
    count.classList.toggle('town-mail-over-limit', length > limit);
  };
  input.addEventListener('input', refresh);
  refresh();
  return count;
}
function feedback() {
  const status = node('p');
  status.className = 'town-mail-feedback';
  status.setAttribute('role', 'status');
  return status;
}

function playLock(opening: boolean) {
  if (typeof AudioContext === 'undefined') return;
  try {
    const audio = new AudioContext();
    void audio.resume().catch(() => { void audio.close().catch(() => {}); });
    const now = audio.currentTime;
    const notes = opening ? [329.6, 523.2] : [392, 196];
    for (const [index, frequency] of notes.entries()) {
      const tone = audio.createOscillator();
      const volume = audio.createGain();
      const at = now + index * .082;
      const end = at + .095;
      tone.type = 'triangle';
      tone.frequency.setValueAtTime(frequency, at);
      volume.gain.setValueAtTime(.035, at);
      volume.gain.exponentialRampToValueAtTime(.001, end);
      tone.connect(volume).connect(audio.destination);
      tone.start(at);
      tone.stop(end);
      if (index === notes.length - 1) tone.onended = () => { void audio.close().catch(() => {}); };
    }
  } catch { /* Sound access varies by device and browser. */ }
}

function makeMailboxFurniture(groundAt: (east: number, north: number) => number) {
  const group = new Group();
  group.name = 'Postal branch mailbox';
  const geometry = new BoxGeometry();
  const material = new MeshLambertMaterial();
  const transform = new Object3D();
  const barnRed = '#a5443a', brass = '#e7ad65', dark = '#4a3037';
  function furniture(name: string, origin: XYZ, parts: readonly Part[]) {
    const mesh = new InstancedMesh(geometry, material, parts.length);
    mesh.name = name;
    mesh.position.set(...origin);
    parts.forEach(({ center, size, color }, index) => {
      transform.position.set(...center);
      transform.scale.set(...size);
      transform.updateMatrix();
      mesh.setMatrixAt(index, transform.matrix);
      mesh.setColorAt(index, new Color(color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }
  const origin: XYZ = [annex.x, groundAt(annex.x, annex.n), -annex.n];
  furniture('Memorial branch mailbox', origin, [
    { center: [0, .105, 0], size: [.70, .21, .64], color: '#8b97aa' },
    { center: [0, .79, 0], size: [.55, 1.22, .52], color: barnRed },
    { center: [0, 1.45, 0], size: [.66, .12, .64], color: '#d2e5f3' },
    { center: [0, 1.13, .27], size: [.36, .065, .03], color: dark },
    { center: [0, 1.13, -.27], size: [.36, .065, .03], color: dark },
    { center: [0, .88, .273], size: [.27, .19, .03], color: brass },
    { center: [0, .88, -.273], size: [.27, .19, .03], color: brass },
  ]);
  const ribbonPieces: Part[] = [
    { center: [0, 1.34, .27], size: [.48, .085, .04], color: '#fe6757' },
    { center: [0, 1.40, .29], size: [.09, .14, .04], color: brass },
  ];
  const markers = [furniture('Memorial timebox ribbon', origin, ribbonPieces),
    furniture('Post office timebox ribbon', [east + 3.26, elevation, -north + 7.68], ribbonPieces)];
  return {
    group,
    showRibbon(ready: boolean) { for (const marker of markers) marker.visible = ready; },
  };
}

export function createTownMailActivity(context: Pick<TownActivityContext, 'open' | 'announce'>,
  groundAt: (east: number, north: number) => number) {
  let storage: Storage | undefined;
  try { storage = globalThis.localStorage; }
  catch { /* Private browsing may deny reads and writes. */ }
  const mail = createTownMailStore(storage, Date.now, detail => {
    window.dispatchEvent(new CustomEvent('town-activity-event', { detail }));
  });
  const furniture = makeMailboxFurniture(groundAt);
  function syncRibbons() {
    const delay = new Date(UNLOCK_AT).getTime() - Date.now();
    furniture.showRibbon(mail.timeboxStatus().ready);
    if (delay > 0 && typeof window !== 'undefined') {
      window.setTimeout(syncRibbons, Math.min(delay, 2_147_000_000));
    }
  }
  syncRibbons();

  function panel(title: string, description: string) {
    const content = context.open(title, description);
    const root = node('div');
    root.className = 'town-mail';
    content.append(root);
    return root;
  }
  function playPanelAnimation(root: HTMLElement, name: 'town-mail-sealing' | 'town-mail-opening') {
    const flap = node('span');
    flap.className = name;
    flap.setAttribute('aria-hidden', 'true');
    flap.addEventListener('animationend', () => flap.remove(), { once: true });
    root.prepend(flap);
  }
  function mainWrite(body: HTMLTextAreaElement) {
    if (!storage) return;
    try { body.value = storage.getItem(legacyDraftKey) ?? ''; }
    catch { /* The old independent draft was optional. */ }
  }
  let legacyOffered = false;

  function openTimebox(source: Mailbox) {
    const title = source === 'main' ? '邮局时光信箱' : '纪念馆时光信箱';
    const root = panel(title, '开箱时间以设备本地时间为准。');
    const controls = node('div');
    controls.className = 'town-mail-controls';
    const content = node('section');
    const status = feedback();
    root.append(controls, status, content);
    let timer: number | undefined;
    let announcedPlazaRoute = false;
    function clearTimer() {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    }
    root.closest('dialog')?.addEventListener('close', clearTimer, { once: true });

    function showStatus(notice = '') {
      clearTimer();
      content.replaceChildren();
      status.textContent = notice;
      const state = mail.timeboxStatus(source === 'main');
      furniture.showRibbon(state.ready);
      const header = node('h3', state.opened ? '已开启' : state.ready ? '已到开启时间' : '未到开启时间');
      if (state.ready) header.className = 'town-mail-ready';
      content.append(header, node('p', '封存 ' + state.count + ' / ' + townMailLimits.sealed + ' 封'));
      if (!state.ready) {
        const hours = state.remainingHours;
        const remaining = hours % 24;
        content.append(node('p', '距开箱还有 ' + Math.floor(hours / 24) + ' 天 ' + remaining + ' 小时'));
        const boundary = new Date(UNLOCK_AT).getTime();
        const nextHour = boundary - (hours - 1) * 3_600_000;
        timer = window.setTimeout(() => {
          if (root.isConnected) showStatus();
        }, Math.max(1, nextHour - Date.now()));
      }
      if (source === 'branch') content.append(node('p', '开箱读信请回邮局主箱。'));
      if (source === 'main' && state.ready && !state.opened) {
        action(content, '开启时光信箱', () => {
          const result = mail.openTimebox();
          if (!result.ok) { status.textContent = errors[result.reason]; return; }
          playLock(true);
          showStatus();
          playPanelAnimation(content, 'town-mail-opening');
        });
      }
      const envelopes = node('ul');
      envelopes.className = 'town-mail-list';
      for (const envelope of state.envelopes) {
        const { id } = envelope;
        const row = node('li');
        if ('fromNpc' in envelope) {
          const text = envelope.title
            ? envelope.title + ' · ' + envelope.authorName + ' · ' + envelope.recipientName
            : envelope.authorName + ' · 封存中';
          row.append(node('span', text));
        } else {
          row.append(node('span', envelope.recipientName + ' · ' + localDate.format(envelope.sealedAt)));
        }
        if (!state.ready && !('fromNpc' in envelope)) action(row, '撤回', () => {
          const result = mail.retractLetter(id);
          showStatus(result.ok ? '已撤回，可重新写信。' : errors[result.reason]);
        });
        if (source === 'main' && state.ready && state.opened) action(row, '读信', () => {
          const { letter, reason } = mail.readLetter(id);
          if (!letter) { showStatus(errors[reason ?? 'missing']); return; }
          content.replaceChildren();
          const letterBody = node('p', letter.body);
          letterBody.className = 'town-mail-letter';
          if ('title' in letter) {
            content.append(node('h3', letter.title), node('p', letter.recipientName));
          } else {
            content.append(node('h3', letter.recipientName));
          }
          content.append(letterBody, node('p', letter.authorName), node('p', plazaRoute));
          if (!announcedPlazaRoute) {
            announcedPlazaRoute = true;
            context.announce(plazaRoute);
          }
          action(content, '返回信封列表', () => showStatus());
        });
        envelopes.append(row);
      }
      content.append(envelopes);
    }

    const write = action(controls, '写信', () => {
      clearTimer();
      status.textContent = '';
      content.replaceChildren();
      const form = node('form');
      form.className = 'town-mail-form';
      const type = node('select');
      type.name = 'recipientType';
      for (const [key, label] of Object.entries(townMailRecipients)) type.add(new Option(label, key));
      const name = node('input');
      name.name = 'recipientName';
      name.autocomplete = 'off';
      const npc = node('select');
      npc.name = 'recipientName';
      for (const person of townMailNpcNames) npc.add(new Option(person, person));
      const nameLabel = line('称呼', name);
      const nameCount = counter(name, townMailLimits.recipient);
      const npcLabel = line('镇民', npc);
      const signature = node('input');
      signature.name = 'signature';
      signature.placeholder = '一位镇民';
      signature.autocomplete = 'off';
      const body = node('textarea');
      body.name = 'body';
      body.rows = 5;
      if (source === 'main' && !legacyOffered) { mainWrite(body); legacyOffered = true; }
      const submit = node('button', '封存投递');
      submit.type = 'submit';
      function changeRecipient() {
        const friend = type.value === 'friend';
        const villager = type.value === 'npc';
        nameLabel.hidden = !friend;
        nameCount.hidden = !friend;
        name.disabled = !friend;
        npcLabel.hidden = !villager;
        npc.disabled = !villager;
      }
      type.onchange = changeRecipient;
      changeRecipient();
      form.append(line('收信人', type), nameLabel, nameCount, npcLabel, line('正文', body),
        counter(body, townMailLimits.letter), line('落款（可空）', signature), counter(signature, townMailLimits.signature), submit);
      form.onsubmit = event => {
        event.preventDefault();
        const recipientType = type.value as keyof typeof townMailRecipients;
        const result = mail.sealLetter({
          recipientType, recipientName: recipientType === 'npc' ? npc.value : name.value, body: body.value, signature: signature.value,
        });
        if (!result.ok) {
          status.textContent = result.reason === 'capacity' ? '最多封存 5 封，请先撤回一封再写。' : errors[result.reason];
          return;
        }
        playLock(false);
        showStatus('已封存');
        playPanelAnimation(content, 'town-mail-sealing');
      };
      content.append(form);
      body.focus();
    });
    const show = action(controls, '封存状态', () => showStatus());
    write.setAttribute('aria-controls', 'town-mail-box-content');
    show.setAttribute('aria-controls', 'town-mail-box-content');
    content.id = 'town-mail-box-content';
    showStatus();
  }

  function openWall() {
    const root = panel('邮局留言墙', '');
    const controls = node('div');
    controls.className = 'town-mail-controls';
    const content = node('section');
    const status = feedback();
    root.append(controls, status, content);
    const show = (publicSection: boolean, page = 0) => {
      content.replaceChildren();
      if (!publicSection) {
        const form = node('form');
        form.className = 'town-mail-form';
        const body = node('textarea');
        body.name = 'body';
        body.rows = 3;
        const submit = node('button', '发布留言');
        submit.type = 'submit';
        form.append(line('留言', body), counter(body, townMailLimits.wall), submit);
        form.onsubmit = event => {
          event.preventDefault();
          const result = mail.postMessage(body.value);
          if (!result.ok) { status.textContent = errors[result.reason]; return; }
          status.textContent = '留言已发布。';
          show(false);
        };
        content.append(form);
      }
      const items = publicSection ? mail.publicLetters() : mail.wallMessages();
      const pages = Math.max(1, Math.ceil(items.length / pageSize));
      const list = node('ul');
      list.className = 'town-mail-list';
      for (const item of items.slice(page * pageSize, (page + 1) * pageSize)) {
        const row = node('li');
        row.append(node('p', item.body), node('small', item.authorName + ' · ' + localDate.format(item.createdAt)));
        list.append(row);
      }
      if (!items.length) content.append(node('p', publicSection ? '暂无已开启的公开信。' : '暂无留言。'));
      content.append(list);
      if (pages > 1) {
        const navigation = node('div');
        navigation.className = 'town-mail-controls';
        action(navigation, '上一页', () => show(publicSection, page - 1)).disabled = page === 0;
        navigation.append(node('span', String(page + 1) + ' / ' + String(pages)));
        action(navigation, '下一页', () => show(publicSection, page + 1)).disabled = page + 1 === pages;
        content.append(navigation);
      }
    };
    action(controls, '留言墙', () => { status.textContent = ''; show(false); });
    action(controls, '公开信', () => { status.textContent = ''; show(true); });
    show(false);
  }

  const { main, wall, branch } = townMailStands;
  const spots: TownActivitySpot[] = [
    { ...main, ground: groundAt(main.x, main.n), range: 1.25, label: '邮局时光信箱', run: () => openTimebox('main') },
    { ...wall, range: 1.25, label: '写留言', run: openWall },
    { ...branch, ground: groundAt(branch.x, branch.n), range: 1.25, label: '纪念馆时光信箱', run: () => openTimebox('branch') },
  ];
  return { group: furniture.group, spots };
}
