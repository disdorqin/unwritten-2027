import {
  FRIEND2_GUIDE_CATEGORIES,
  FRIEND2_GUIDE_ENTRIES,
  filterFriend2Guide,
  friend2GuideCategoryLabel,
  friend2GuideCounts,
  type Friend2GuideCategoryId,
  type Friend2GuideEntry,
} from './town-blockout/town-friend2-guide';

function node<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

const searchInput = node<HTMLInputElement>('#guide-search');
const categoryList = node<HTMLElement>('#guide-categories');
const list = node<HTMLElement>('#guide-list');
const detail = node<HTMLElement>('#guide-detail');
const countStatus = node<HTMLElement>('#guide-count');
const status = node<HTMLElement>('#guide-status');

let query = '';
let category: Friend2GuideCategoryId = 'all';
let selectedId: string | undefined;

function categoryOf(entry: Friend2GuideEntry): string {
  return friend2GuideCategoryLabel(entry.category);
}

function renderCategories() {
  for (const item of FRIEND2_GUIDE_CATEGORIES) {
    let button = categoryList.querySelector<HTMLButtonElement>(`[data-category="${item.id}"]`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'f2-guide-category';
      button.dataset.category = item.id;
      button.textContent = item.label;
      button.addEventListener('click', () => {
        category = item.id;
        renderCategories();
        renderList();
      });
      categoryList.append(button);
    }
    button.setAttribute('aria-pressed', String(item.id === category));
  }
}

function renderList() {
  const visible = filterFriend2Guide(FRIEND2_GUIDE_ENTRIES, query, category);
  const counts = friend2GuideCounts(FRIEND2_GUIDE_ENTRIES);
  countStatus.textContent = `全册 ${counts.total} 条 · 当前 ${counts.current} · 规划 ${counts.planned} · 当前筛选 ${visible.length}`;
  if (!visible.length) {
    list.replaceChildren();
    const empty = document.createElement('p');
    empty.className = 'f2-guide-empty';
    empty.textContent = '没有匹配的地点和操作说明，换个关键词或分类试试。';
    list.append(empty);
    renderDetail();
    return;
  }
  list.replaceChildren(
    ...visible.map(entry => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'f2-guide-card';
      button.dataset.guideId = entry.id;
      button.setAttribute('aria-pressed', String(entry.id === selectedId));
      const main = document.createElement('span');
      main.className = 'f2-guide-card-copy';
      const title = document.createElement('strong');
      title.textContent = entry.name;
      const meta = document.createElement('small');
      meta.textContent = `${categoryOf(entry)} · ${entry.area}`;
      const summary = document.createElement('span');
      summary.className = 'f2-guide-card-summary';
      summary.textContent = entry.summary;
      main.append(title, meta, summary);
      const badge = document.createElement('span');
      badge.className = 'f2-guide-badge';
      badge.dataset.status = entry.status;
      badge.textContent = entry.status === 'planned' ? '规划' : '当前';
      button.append(main, badge);
      button.addEventListener('click', () => {
        selectedId = entry.id;
        renderList();
        status.textContent = `已打开 ${entry.name}。`;
      });
      return button;
    }),
  );
  if (selectedId && !visible.some(entry => entry.id === selectedId)) selectedId = undefined;
  renderDetail();
}

function renderDetail() {
  const entry = selectedId
    ? FRIEND2_GUIDE_ENTRIES.find(item => item.id === selectedId)
    : undefined;
  if (!entry) {
    detail.replaceChildren();
    detail.dataset.empty = 'true';
    const placeholder = document.createElement('p');
    placeholder.className = 'f2-guide-empty';
    placeholder.textContent = '选择左侧地点或操作条目，查看简介与到达方式。';
    detail.append(placeholder);
    return;
  }
  detail.dataset.empty = 'false';
  const header = document.createElement('header');
  header.className = 'f2-guide-detail-head';
  const heading = document.createElement('div');
  const kicker = document.createElement('p');
  kicker.className = 'f2-note';
  kicker.textContent = `${categoryOf(entry)} · ${entry.area}`;
  const title = document.createElement('h2');
  title.textContent = entry.name;
  heading.append(kicker, title);
  const back = document.createElement('button');
  back.type = 'button';
  back.textContent = '返回列表';
  back.addEventListener('click', () => {
    selectedId = undefined;
    renderList();
    status.textContent = '已返回导览列表。';
  });
  header.append(heading, back);
  const badge = document.createElement('span');
  badge.className = 'f2-guide-badge';
  badge.dataset.status = entry.status;
  badge.textContent = entry.status === 'planned' ? '规划中 · 未开放' : '当前可达';
  const summary = document.createElement('p');
  summary.textContent = entry.summary;
  const howToTitle = document.createElement('h3');
  howToTitle.textContent = '怎么看 / 怎么去';
  const howTo = document.createElement('p');
  howTo.textContent = entry.howTo;
  const tags = document.createElement('p');
  tags.className = 'f2-guide-tags';
  tags.textContent = entry.tags.map(tag => `#${tag}`).join('  ');
  detail.replaceChildren(header, badge, summary, howToTitle, howTo, tags);
}

searchInput.addEventListener('input', () => {
  query = searchInput.value;
  renderList();
});

renderCategories();
renderList();
status.textContent = '导览为静态手册，不改变导航、剧情或游戏世界。';