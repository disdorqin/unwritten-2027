import { museumMonths, type MuseumExhibit } from './museum-catalog';
import { monthStops, museumIndexStop } from './museum-timeline';
import { currentMuseumSlide, networkStops } from './museum-network';
import { terraceStop } from './museum-terrace';
import { museumMap, type MuseumPosition } from './museum-map';
import { downloadMuseumMemoryCard, downloadMuseumPostcard, type MuseumMemory } from './museum-postcard';
import { aprilMonth } from './museum-guide';

type Progress = { months: number[]; launch: boolean; archive: boolean; terrace: boolean; stamp: boolean };
const key = 'unwritten:2026-museum-passport';
const memoryKey = 'unwritten:2026-museum-memory';
const memoryLimit = 80;
const memoryLine = (value: string) => value.replace(/\s+/g, ' ').trim();

function readMemory(): MuseumMemory | undefined {
  try {
    const data = JSON.parse(localStorage.getItem(memoryKey) ?? 'null') as Partial<MuseumMemory> | null;
    if (!data || typeof data.note !== 'string' || data.note.length > memoryLimit || !Number.isInteger(data.month)) return;
    const exhibit = museumMonths.find(month => month.month === data.month)?.items
      .find(item => item.date === data.date && item.title === data.title);
    if (exhibit) return { month: data.month!, date: exhibit.date, title: exhibit.title, note: memoryLine(data.note) };
  } catch { /* A saved memory is optional. */ }
}
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

export function createMuseumVisit(
  prepareOpen: () => void, cameraPhoto: () => void, inspectModel: (month: number) => void,
  guideApril: (active: boolean) => void, openLaunch: (complete: () => void) => void,
) {
  const dialog = document.querySelector<HTMLDialogElement>('#museum-card')!;
  const title = dialog.querySelector<HTMLElement>('#museum-title')!;
  const subtitle = dialog.querySelector<HTMLElement>('#museum-subtitle')!;
  const content = dialog.querySelector<HTMLElement>('#museum-content')!;
  let progress = readProgress();
  let memory = readMemory();
  let memoryPersisted = Boolean(memory);

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
  function monthCard(month: number, atCabinet = false) {
    if (atCabinet && month === aprilMonth) guideApril(false);
    const data = museumMonths.find(entry => entry.month === month);
    frame(`${monthNames[month - 1]}月`, '一楼 · 2026 公共年度展');
    if (atCabinet) {
      const options = document.createElement('div');
      options.className = 'museum-options museum-exhibit-actions';
      content.append(options);
      button('近看展品模型', () => { dialog.close(); inspectModel(month); }, options);
      if (month === aprilMonth) button('操作航天展台', () => {
        dialog.close();
        openLaunch(() => record({ launch: true }));
      }, options);
    }
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
      const links = document.createElement('div');
      links.className = 'museum-memory-entry';
      links.append(source);
      button(matchesMemory(month, item) ? '查看这张回忆卡' : '留张回忆卡',
        () => memoryCard(month, item, () => monthCard(month, atCabinet), '返回月展'), links);
      exhibit.append(links);
      content.append(exhibit);
    }
    if (!progress.months.includes(month)) record({ months: [...progress.months, month] });
  }
  function matchesMemory(month: number, item: Pick<MuseumExhibit, 'date' | 'title'>) {
    return memory?.month === month && memory.date === item.date && memory.title === item.title;
  }
  function memoryCard(month: number, item: Pick<MuseumExhibit, 'date' | 'title'>, back: () => void, backLabel: string) {
    const saved = matchesMemory(month, item);
    frame('留一张回忆卡', '2026 纪念馆 · ' + monthNames[month - 1] + '月');
    const exhibit = document.createElement('header');
    exhibit.className = 'museum-memory-heading';
    const date = document.createElement('small');
    date.textContent = item.date;
    const name = document.createElement('h3');
    name.textContent = item.title;
    exhibit.append(date, name);
    content.append(exhibit);
    const field = document.createElement('label');
    field.className = 'museum-memory-field';
    field.textContent = '那天你在做什么？';
    const note = document.createElement('textarea');
    note.rows = 3;
    note.maxLength = memoryLimit;
    note.placeholder = '留给未来的自己，最多 80 字（可不填）';
    note.value = saved ? memory!.note : '';
    field.append(note);
    content.append(field);
    const status = line('', 'museum-note');
    status.setAttribute('role', 'status');
    const actions = document.createElement('div');
    actions.className = 'museum-options';
    content.append(actions);
    const save = button(memory && !saved ? '换成这张卡' : '保存这张卡', () => {
      const next = { month, date: item.date, title: item.title, note: memoryLine(note.value) };
      memory = next;
      memoryPersisted = false;
      try {
        localStorage.setItem(memoryKey, JSON.stringify(next));
        memoryPersisted = true;
      } catch { /* Export remains available for this visit. */ }
      note.value = next.note;
      save.textContent = '保存这张卡';
      refresh();
    }, actions);
    const download = button('下载回忆卡 PNG', () => {
      if (matchesMemory(month, item)) downloadMuseumMemoryCard(memory!);
    }, actions);
    button(backLabel, back, actions);
    function refresh() {
      const unchanged = matchesMemory(month, item) && memoryLine(note.value) === memory!.note;
      download.disabled = !unchanged;
      status.textContent = unchanged
        ? (memoryPersisted ? '已保存在当前浏览器。' : '已留在本次页面，下载即可带走。')
        : (memory && !matchesMemory(month, item) ? '保存后会把护照里的回忆卡换成这一张。' : '写好的文字随回忆卡一起保存在当前浏览器。');
    }
    note.addEventListener('input', refresh);
    refresh();
  }
  function passport() {
    frame('纪念馆参观护照', '一楼 · 服务台');
    line('读三个有内容的月份，再操作航天展台或完成网络档案检索，即可加盖年度纪念章。');
    line(`已读 ${progress.months.length} 个月 · ${progress.launch ? '已完成火箭装配' : progress.archive ? '已完成档案检索' : '还需完成一项互动'}`, 'museum-note');
    if (memory) {
      const savedCard = memory;
      button('查看我的回忆卡', () => memoryCard(savedCard.month, savedCard, passport, '返回护照'));
    }
    if (progress.stamp) {
      line('2026 年度纪念章 · 已加盖', 'museum-stamp');
      button('下载 2026 纪念票', downloadMuseumPostcard);
      return;
    }
    const stamp = button('加盖 2026 纪念章', () => { record({ stamp: true }); passport(); });
    stamp.disabled = progress.months.length < 3 || !(progress.launch || progress.archive);
  }
  function directory() {
    frame('2026 纪念馆', '一楼 · 入馆导览');
    line('从西侧读一月至六月，转到东侧读七月至十二月。从东侧楼梯上二楼，参观网络记忆展，再由西门到露台看钟楼。');
    line('年度展当前是公开事件候选展陈。标注来源的条目可打开原文。', 'museum-note');
    const options = document.createElement('div');
    options.className = 'museum-options';
    content.append(options);
    button('跟随灯标去四月航天展', () => { dialog.close(); guideApril(true); }, options);
    button('查看参观护照', passport, options);
  }
  function exhibitIndex() {
    frame('年度展陈索引', '一楼 · 年度长廊');
    line('沿西侧长廊参观一月至六月，沿东侧长廊参观七月至十二月。');
    for (const { month, items } of museumMonths) {
      const entry = document.createElement('article');
      const heading = document.createElement('h3');
      heading.textContent = `${monthNames[month - 1]}月${progress.months.includes(month) ? ' · 已读' : ''}`;
      const titles = document.createElement('p');
      titles.textContent = items.map(item => item.title).join('、') || '岁末预留展位';
      entry.append(heading, titles);
      content.append(entry);
    }
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
      const label = line('', 'museum-slide');
      label.setAttribute('aria-live', 'polite');
      const caption = line('');
      const sourceLink = document.createElement('a');
      sourceLink.target = '_blank';
      sourceLink.rel = 'noopener noreferrer';
      const credit = line('', 'museum-note');
      credit.append(sourceLink);
      function renderSlide(advance = false) {
        const slide = currentMuseumSlide(advance);
        const exhibit = museumMonths.find(entry => entry.month === slide.month)?.items.find(item => item.date === slide.date);
        label.textContent = slide.label;
        caption.textContent = `${slide.topic}。 ${slide.caption}`;
        credit.hidden = !exhibit;
        if (exhibit) {
          sourceLink.href = exhibit.url;
          sourceLink.textContent = `查看来源 · ${exhibit.source}`;
        }
      }
      renderSlide();
      button('下一张档案', () => renderSlide(true));
    } else {
      frame('网络记忆阅览桌', '二楼 · 纸本与数字档案');
      line('展柜里的三件器物是从声音、载体到数字存档的体素示意。');
      for (const [name, description] of [
        ['便携电台', '转动调谐旋钮，沿刻度寻找广播信号。'],
        ['双轮磁带', '两卷带轮之间的窄带承载录音，重听时按顺序走带。'],
        ['档案电路板', '数字文件保存后，可以用目录按发布者、日期和载体重新定位。'],
      ]) {
        const entry = document.createElement('article');
        const heading = document.createElement('h3');
        heading.textContent = name;
        const text = document.createElement('p');
        text.textContent = description;
        entry.append(heading, text);
        content.append(entry);
      }
      line('到一楼月展还能打开这些公开档案的出处。', 'museum-note');
      const actions = document.createElement('div');
      actions.className = 'museum-options';
      content.append(actions);
      button('打开一月档案', () => monthCard(1), actions);
      button('打开二月档案', () => monthCard(2), actions);
      button('打开七月档案', () => monthCard(7), actions);
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
    { ...museumIndexStop, y: .28, range: 1.55, label: '查看年度展陈索引', run: exhibitIndex },
    ...monthStops.map(({ month, x, z }) => ({ x, z, y: .28, range: 2.05, label: `查看${monthNames[month - 1]}月展`, run: () => monthCard(month, true) })),
    ...networkStops.map(({ id, x, z, label }) => ({ x, z, y: 5.65, range: 2.35, label, run: () => network(id) })),
    { ...terraceStop, y: 5.65, range: 2.8, label: '使用露台观景台', run: terrace },
  ];
  return { dialog, openMap(position: MuseumPosition) {
    frame('馆内地图', '2026 纪念馆');
    museumMap(content, position, progress.months);
  }, near(x: number, y: number, z: number) {
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
