import { museumMonths } from './museum-catalog';
import { monthStops } from './museum-timeline';
import { networkStops } from './museum-network';
import { terraceStop } from './museum-terrace';

type Progress = { months: number[]; launch: boolean; archive: boolean; terrace: boolean; stamp: boolean };
const key = 'unwritten:2026-museum-passport';
const monthNames = ['一','二','三','四','五','六','七','八','九','十','十一','十二'];
const initial: Progress = { months: [], launch: false, archive: false, terrace: false, stamp: false };

function readProgress(): Progress {
  try {
    const data = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Progress> | null;
    if (data && Array.isArray(data.months)) return {
      months: [...new Set(data.months.filter(month => Number.isInteger(month) && month >= 1 && month <= 12))],
      launch: data.launch === true, archive: data.archive === true, terrace: data.terrace === true, stamp: data.stamp === true,
    };
  } catch { /* File browsers can disable storage. */ }
  return { ...initial, months: [] };
}

export function createMuseumVisit(prepareOpen: () => void, cameraPhoto: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>('#museum-card')!;
  const title = dialog.querySelector<HTMLElement>('#museum-title')!;
  const subtitle = dialog.querySelector<HTMLElement>('#museum-subtitle')!;
  const content = dialog.querySelector<HTMLElement>('#museum-content')!;
  let progress = readProgress();

  function record(next: Partial<Progress>) {
    progress = { ...progress, ...next };
    try { localStorage.setItem(key, JSON.stringify(progress)); } catch { /* Progress stays available in this page. */ }
  }
  function line(value: string, className = '') {
    const p = document.createElement('p');
    p.textContent = value;
    if (className) p.className = className;
    content.append(p);
    return p;
  }
  function button(label: string, action: () => void, parent: HTMLElement = content) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = label;
    item.addEventListener('click', action);
    parent.append(item);
    return item;
  }
  function frame(heading: string, location: string) {
    title.textContent = heading;
    subtitle.textContent = location;
    content.replaceChildren();
    content.scrollTop = 0;
    if (!dialog.open) { prepareOpen(); dialog.showModal(); }
  }
  function monthCard(month: number) {
    const data = museumMonths.find(entry => entry.month === month);
    frame(`${monthNames[month - 1]}月`, '一楼 · 2026 公共年度展');
    if (!data?.items.length) {
      line('本月展位已预留，待内容发布并核对来源后上架。');
      return;
    }
    for (const item of data.items) {
      const exhibit = document.createElement('article');
      const date = document.createElement('small');
      const heading = document.createElement('h3');
      const text = document.createElement('p');
      const source = document.createElement('a');
      date.textContent = item.date;
      heading.textContent = item.title;
      text.textContent = item.text;
      source.href = item.url;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = `查看来源 · ${item.source}`;
      exhibit.append(date, heading, text);
      if (item.image) {
        const figure = document.createElement('figure');
        const photo = document.createElement('img');
        const credit = document.createElement('figcaption');
        const original = document.createElement('a');
        const license = document.createElement('a');
        photo.src = item.image.url;
        photo.alt = item.image.alt;
        photo.loading = 'lazy';
        for (const [link, href, label] of [[original, item.image.page, '原图'], [license, item.image.licenseUrl, '许可']] as const) {
          link.href = href;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = label;
        }
        credit.append(item.image.credit, ' · ', original, ' · ', license);
        figure.append(photo, credit);
        exhibit.append(figure);
      }
      exhibit.append(source);
      content.append(exhibit);
    }
    if (!progress.months.includes(month)) record({ months: [...progress.months, month] });
    if (month === 4) button('操作航天展台', showLaunch);
  }
  function showLaunch() {
    frame('给模型接上三段火箭', '一楼 · 四月航天展互动模型');
    line('把展台上的模型从下往上装好，再按发射。');
    const stage = document.createElement('div');
    stage.className = 'museum-rocket-stage';
    const rocket = document.createElement('div');
    rocket.className = 'museum-rocket';
    rocket.setAttribute('aria-hidden', 'true');
    stage.append(rocket);
    content.append(stage);
    const message = line('先装第一级。', 'museum-note');
    message.setAttribute('role', 'status');
    const controls = document.createElement('div');
    controls.className = 'museum-options';
    content.append(controls);
    const pieces = ['第一级', '第二级', '整流罩'];
    let count = 0;
    for (const part of [2, 0, 1]) {
      const choice = button(pieces[part], () => {
        if (part !== count) { message.textContent = `下一件是${pieces[count]}。`; return; }
        const shape = document.createElement('span');
        shape.dataset.part = String(part);
        rocket.prepend(shape);
        count++;
        choice.disabled = true;
        launch.disabled = count !== 3;
        message.textContent = count === 3 ? '装配完成，可以发射了。' : `现在装${pieces[count]}。`;
      }, controls);
    }
    const launch = button('点火发射', () => {
      record({ launch: true });
      rocket.classList.add('launched');
      launch.disabled = true;
      message.textContent = '模型发射成功，已记录航天展台体验。';
    }, controls);
    launch.disabled = true;
  }
  function passport() {
    frame('纪念馆参观护照', '一楼 · 服务台');
    line('读三个有内容的月份，再操作航天展台或完成网络档案检索，即可加盖年度纪念章。');
    line(`已读 ${progress.months.length} 个月 · ${progress.launch ? '已完成火箭装配' : progress.archive ? '已完成档案检索' : '还需完成一项互动'}`, 'museum-note');
    if (progress.stamp) { line('2026 年度纪念章 · 已加盖', 'museum-stamp'); return; }
    const stamp = button('加盖 2026 纪念章', () => { record({ stamp: true }); passport(); });
    stamp.disabled = progress.months.length < 3 || !(progress.launch || progress.archive);
  }
  function directory() {
    frame('2026 纪念馆', '一楼 · 入馆导览');
    line('从西侧读一月至六月，转到东侧读七月至十二月。从东侧楼梯上二楼，参观网络记忆展，再由西门到露台看钟楼。');
    line('年度展当前是公开事件候选展陈。标注来源的条目可打开原文。', 'museum-note');
    button('查看参观护照', passport);
  }
  function network(id: string) {
    if (id === 'terminal') {
      frame('网络记忆检索台', '二楼 · 网络档案');
      line('哪件档案的原始出处来自中央广播电视总台？');
      const feedback = line('选择档案卡。', 'museum-note');
      feedback.setAttribute('role', 'status');
      const controls = document.createElement('div');
      controls.className = 'museum-options';
      content.append(controls);
      for (const [label, correct] of [['冰雪节开幕公告', false], ['马年春晚节目', true], ['航天日活动公告', false]] as const) {
        button(label, () => {
          feedback.textContent = correct ? '答对了。马年春晚可从中央广播电视总台回查，已记录档案检索体验。' : '这份公告由活动主管部门发布。再找一张。';
          if (correct) record({ archive: true });
        }, controls);
      }
    } else if (id === 'screening') {
      frame('数字放映室', '二楼 · 网络记忆展');
      const slides = [
        ['002 · 节目公开视频', '节目画面是原始影像的一部分。找到首发页面，再读出处和日期。'],
        ['004 · 公共活动通告', '当截图和原文说法不同时，可以沿发布机构和日期找到原始通告。'],
        ['011 · 网络与城市', '线下展览、网上转发和新闻记录，是同一件事留下的不同材料。'],
      ];
      const label = line(slides[0][0], 'museum-slide');
      const caption = line(slides[0][1]);
      let offset = 0;
      button('下一张档案', () => { offset = (offset + 1) % slides.length; [label.textContent, caption.textContent] = slides[offset]; });
    } else {
      frame('网络记忆阅览桌', '二楼 · 纸本与数字档案');
      line('这里收录公开档案。二月的节目与十一月的网络展陈可在一楼月展中回查。');
      const actions = document.createElement('div');
      actions.className = 'museum-options';
      content.append(actions);
      button('打开二月档案', () => monthCard(2), actions);
      button('打开十一月档案', () => monthCard(11), actions);
    }
  }
  function terrace() {
    record({ terrace: true });
    frame('钟楼观景台', '二楼 · 西侧露台');
    line('往西南望，钟楼高出小镇，在桥和屋顶之后。');
    button('拍下钟楼与雪镇', () => { dialog.close(); cameraPhoto(); });
  }

  const stops = [
    { x: 0, z: 10.3, y: .28, range: 2.6, label: '查看入馆导览', run: directory },
    { x: 4.5, z: 10.4, y: .28, range: 1.9, label: '查看参观护照', run: passport },
    ...monthStops.map(({ month, x, z }) => ({ x, z, y: .28, range: 2.05, label: `查看${monthNames[month - 1]}月展`, run: () => monthCard(month) })),
    ...networkStops.map(({ id, x, z, label }) => ({ x, z, y: 5.65, range: 2.35, label, run: () => network(id) })),
    { ...terraceStop, y: 5.65, range: 2.8, label: '使用露台观景台', run: terrace },
  ];
  return { dialog, near(x: number, y: number, z: number) {
    let distance = Infinity;
    let nearest: (typeof stops)[number] | undefined;
    for (const stop of stops) {
      if (Math.abs(y - stop.y) > .8) continue;
      const gap = Math.hypot(x - stop.x, z - stop.z);
      if (gap < stop.range && gap < distance) { distance = gap; nearest = stop; }
    }
    return nearest;
  } };
}
