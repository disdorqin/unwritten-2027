import type { TownActivityContext } from './town-activity';
import { tavernRecipes } from './tavern-mix-book';

export type PassportStamp<Id extends string = string> = { id: Id; label: string; hint: string };

const storageKey = 'unwritten:2027-town-passport';

function renderSouvenir(stamps: readonly PassportStamp[], status: HTMLElement) {
  const canvas = document.createElement('canvas');
  const columns = stamps.length === 1 ? 1 : 2;
  const rows = Math.ceil(stamps.length / columns);
  canvas.width = 1200;
  canvas.height = 392 + 105 * rows;
  const ink = canvas.getContext('2d');
  if (!ink) { status.textContent = '无法生成纪念卡，请再试一次。'; return; }

  const gold = '#e8bf8a';
  const paper = '#f1e8d1';
  const text = (value: string, x: number, y: number, font: string, color: string, maxWidth: number) => {
    ink.font = font + ' "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
    ink.fillStyle = color;
    ink.fillText(value, x, y, maxWidth);
  };
  ink.fillStyle = '#182b40';
  ink.fillRect(0, 0, canvas.width, canvas.height);
  ink.strokeStyle = gold;
  ink.lineWidth = 2;
  ink.strokeRect(28, 28, canvas.width - 56, canvas.height - 56);
  ink.strokeStyle = '#8b755d';
  ink.strokeRect(39, 39, canvas.width - 78, canvas.height - 78);
  text('UNWRITTEN 2027', 75, 112, '600 25px', gold, 1050);
  text('雪镇集章纪念卡', 72, 197, 'bold 62px', paper, 1050);
  text('2026 → 2027', 76, 245, '500 23px', gold, 1050);
  ink.fillStyle = paper;
  ink.fillRect(75, 289, 1050, canvas.height - 366);

  const columnWidth = 1050 / columns;
  stamps.forEach(({ label }, index) => {
    const x = 100 + columnWidth * (index % columns);
    const y = 349 + Math.floor(index / columns) * 105;
    ink.lineWidth = 3;
    ink.strokeStyle = '#aa463f';
    ink.beginPath();
    ink.arc(x + 34, y - 10, 27, 0, Math.PI * 2);
    ink.stroke();
    ink.textAlign = 'center';
    text(String(index + 1).padStart(2, '0'), x + 34, y - 2, '700 22px', '#aa463f', 47);
    ink.textAlign = 'left';
    text(label, x + 83, y, '600 29px', '#293445', columnWidth - 113);
  });

  canvas.toBlob(blob => {
    if (!blob) { status.textContent = '无法生成纪念卡，请再试一次。'; return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'UNWRITTEN-2027-town-passport.png';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    status.textContent = '已导出跨年纪念卡。';
  }, 'image/png');
}

export function createTownPassport<Id extends string>(
  context: Pick<TownActivityContext, 'open' | 'announce'>,
  stamps: readonly PassportStamp<Id>[],
  drinkCollection?: () => readonly string[],
) {
  const byId = new Map(stamps.map(stamp => [stamp.id, stamp]));
  const collected = new Set<Id>();

  function restore() {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
      if (!Array.isArray(saved)) return;
      for (const id of saved) {
        if (typeof id === 'string' && byId.has(id as Id)) collected.add(id as Id);
      }
    } catch { /* Continue in memory when storage is unavailable. */ }
  }

  function getProgress() {
    const total = byId.size;
    return { collected: collected.size, total, complete: total > 0 && collected.size === total };
  }

  function collect(id: Id) {
    const stamp = byId.get(id);
    if (!stamp) return false;
    restore();
    if (collected.has(id)) return false;
    collected.add(id);
    try { localStorage.setItem(storageKey, JSON.stringify([...collected])); }
    catch { /* Keep stamps until the current page closes. */ }
    const progress = getProgress();
    context.announce(progress.complete
      ? '印章已集齐，打开戳册领取跨年纪念卡。'
      : `已盖章 · ${stamp.label}（${progress.collected}/${progress.total}）`);
    return true;
  }

  function open() {
    restore();
    const progress = getProgress();
    const panel = context.open('雪镇戳册', '在镇上收集纪念章。集齐后可下载跨年纪念卡。');
    const summary = document.createElement('p');
    summary.className = 'passport-progress';
    summary.textContent = `已集 ${progress.collected} / ${progress.total} 枚`;
    const meter = document.createElement('progress');
    meter.setAttribute('aria-label', '纪念章收集进度');
    meter.max = progress.total || 1;
    meter.value = progress.collected;
    meter.style.width = '100%';

    const list = document.createElement('ul');
    list.className = 'passport-stamps';
    list.style.cssText = 'display:grid;gap:7px;list-style:none;margin:0;padding:0';
    [...byId.values()].forEach(({ id, label, hint }, index) => {
      const row = document.createElement('li');
      const stamped = collected.has(id);
      row.className = 'passport-stamp';
      row.dataset.stampId = id;
      row.dataset.collected = String(stamped);
      row.style.cssText = 'display:flex;gap:11px;align-items:center;padding:8px 10px;border:1px solid #496280;border-radius:6px';

      const seal = document.createElement('span');
      seal.className = 'passport-seal';
      seal.style.cssText = `display:grid;place-items:center;flex:0 0 34px;height:34px;border:1px ${stamped ? 'solid #e2b783;color:#ffe6ad' : 'dashed #7186a0;color:#b2c3d8'};border-radius:50%;font-size:12px`;
      seal.setAttribute('aria-hidden', 'true');
      seal.textContent = String(index + 1).padStart(2, '0');

      const copy = document.createElement('div');
      copy.className = 'passport-stamp-copy';
      const name = document.createElement('strong');
      name.textContent = label;
      const detail = document.createElement('p');
      detail.textContent = stamped ? '已盖章' : hint;
      detail.style.fontSize = '12px';
      copy.append(name, detail);
      row.append(seal, copy);
      list.append(row);
    });
    panel.append(summary, meter, list);

    if (progress.complete) {
      const download = document.createElement('button');
      download.type = 'button';
      download.className = 'passport-reward';
      download.textContent = '下载跨年纪念卡 PNG';
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      download.onclick = () => renderSouvenir([...byId.values()], status);
      panel.append(download, status);
    }

    if (drinkCollection) {
      const drinks = new Set(drinkCollection());
      const count = tavernRecipes.filter(({ id }) => drinks.has(id)).length;
      const section = document.createElement('section');
      section.className = 'passport-drinks';
      const heading = document.createElement('h3');
      heading.textContent = `酒馆特调 ${count} / ${tavernRecipes.length}`;
      heading.style.margin = '0 0 4px';
      heading.style.fontSize = '1rem';
      const hint = document.createElement('p');
      hint.textContent = '到未写酒馆一楼吧台调制特调。';
      const recipes = document.createElement('ul');
      recipes.style.marginBlock = '6px 0';
      for (const { id, name } of tavernRecipes) {
        const row = document.createElement('li');
        const discovered = drinks.has(id);
        row.dataset.recipeId = id;
        row.dataset.collected = String(discovered);
        row.textContent = `${name} · ${discovered ? '已收集' : '待调制'}`;
        recipes.append(row);
      }
      section.append(heading, hint, recipes);
      panel.append(section);
    }
  }

  restore();
  return { collect, has: (id: Id) => collected.has(id), open, getProgress };
}
