import {
  chronicleEntryDate, chronicleSourceLabels, chronicleVolumes, readTownChronicleViews, searchChronicle,
  type ChroniclePage, type ChronicleVolume,
} from './town-chronicle-views';
import type { TownActivityContext } from './town-activity';
import { townChronicleChanged } from './town-chronicle';
import './town-chronicle.css';

const numerals = ['一', '二', '三', '四', '五'];

function button(label: string, run: () => void) {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.onclick = run;
  return element;
}

export function openTownChronicleBook(
  open: TownActivityContext['open'],
  launch: { entry?: string; onPassport: () => void; playerName: string },
) {
  let data = readTownChronicleViews();
  const initial = data.entries.find(entry => entry.id === launch.entry);
  let volume: ChronicleVolume = initial?.vol ?? 1;
  let pageIndex = 0;
  let era = '';
  const root = document.createElement('section');
  root.className = 'town-chronicle-book';
  root.setAttribute('aria-label', '未写镇镇志书册');

  const nav = document.createElement('nav');
  nav.setAttribute('aria-label', '五卷目录');
  const reading = document.createElement('div');
  reading.className = 'town-chronicle-reading';
  const form = document.createElement('form');
  form.className = 'town-chronicle-search';
  form.onsubmit = event => event.preventDefault();
  const keyword = document.createElement('input');
  keyword.type = 'search';
  keyword.placeholder = '搜索题名或正文';
  keyword.setAttribute('aria-label', '搜索题名或正文');
  const date = document.createElement('input');
  date.type = 'date';
  date.setAttribute('aria-label', '按日期查编年');
  form.append(keyword, date, button('清空', () => {
    keyword.value = '';
    date.value = '';
    pageIndex = 0;
    render();
    keyword.focus();
  }));
  const index = document.createElement('div');
  index.className = 'town-chronicle-index';
  const article = document.createElement('article');
  article.setAttribute('aria-live', 'polite');
  const pagination = document.createElement('div');
  pagination.className = 'town-chronicle-pages';

  function pages() {
    if (keyword.value.trim() || date.value) return searchChronicle(data, keyword.value, date.value);
    return data.entries.filter(entry => entry.vol === volume && (!era || entry.era === era));
  }
  function navigate(next: ChronicleVolume, nextEra = '') {
    volume = next;
    era = nextEra;
    pageIndex = 0;
    keyword.value = '';
    date.value = '';
    render();
  }
  function setPage(next: number) {
    pageIndex = next;
    renderPage();
  }
  function entryText(entry: ChroniclePage) {
    const title = document.createElement('h3');
    title.textContent = entry.title;
    const meta = document.createElement('p');
    meta.className = 'town-chronicle-meta';
    meta.textContent = [chronicleEntryDate(entry), chronicleSourceLabels[entry.source], entry.reserved && '预置',
      (entry.local || entry.vol === 5) && data.localScope].filter(Boolean).join(' · ');
    const body = document.createElement('p');
    body.className = 'town-chronicle-copy';
    body.textContent = entry.body || '正文留白';
    article.dataset.entryId = entry.id;
    article.replaceChildren(title, meta, body);
    if (entry.vol === 5 && entry.actor === launch.playerName) {
      article.append(button('查看我的护照', launch.onPassport));
    }
  }
  function renderPage() {
    const current = pages();
    delete article.dataset.entryId;
    if (current.length) entryText(current[pageIndex]);
    else article.textContent = keyword.value.trim() || date.value
      ? '没有符合的条目。'
      : (volume === 5 ? data.localScope + ' · 暂无登记。' : '本卷待编纂。');
    [...index.querySelectorAll('button')].forEach((item, i) => item.setAttribute('aria-pressed', String(i === pageIndex)));
    const prev = button('上一页', () => setPage(pageIndex - 1));
    const next = button('下一页', () => setPage(pageIndex + 1));
    prev.disabled = pageIndex === 0;
    next.disabled = pageIndex >= current.length - 1;
    const count = document.createElement('span');
    count.textContent = (current.length ? pageIndex + 1 : 0) + ' / ' + current.length;
    pagination.replaceChildren(prev, count, next);
  }
  function render() {
    const searching = !!(keyword.value.trim() || date.value);
    nav.replaceChildren();
    chronicleVolumes.forEach((name, i) => {
      const navButton = button('卷' + numerals[i] + ' · ' + name, () => navigate((i + 1) as ChronicleVolume));
      navButton.setAttribute('aria-pressed', String(!searching && volume === i + 1 && !era));
      nav.append(navButton);
      if (!searching && volume === 2 && i === 1) {
        const eras = new Set(data.entries.filter(entry => entry.vol === 2).map(entry => entry.era));
        for (const cycle of eras) {
          const eraButton = button(cycle, () => navigate(2, cycle));
          eraButton.className = 'town-chronicle-era';
          eraButton.setAttribute('aria-pressed', String(era === cycle));
          nav.append(eraButton);
        }
      }
    });
    index.replaceChildren(...pages().map((entry, i) =>
      button(entry.title + (entry.reserved ? ' · 预置' : ''), () => setPage(i))));
    renderPage();
  }

  const filter = () => { pageIndex = 0; render(); };
  keyword.addEventListener('input', filter);
  date.addEventListener('input', filter);
  if (initial) pageIndex = pages().findIndex(entry => entry.id === initial.id);
  document.addEventListener(townChronicleChanged, () => {
    const openId = pages()[pageIndex]?.id;
    data = readTownChronicleViews();
    pageIndex = Math.max(0, pages().findIndex(entry => entry.id === openId));
    render();
  });
  reading.append(form, index, article, pagination);
  root.append(nav, reading);
  open('未写镇镇志', '').append(root);
  render();
}
