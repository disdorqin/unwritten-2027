import type { HouseDoorZone, TownHousePortal } from './town-house-portals';
import { browserTextStorage, readCollection, writeCollection } from './town-text-store';

export const houseDoorBookCopy = {
  title: '百门册 · 一屋通百门',
  introduction: '镇上的屋子都是通的。进一扇门，出百扇门。',
  blocked: '那扇门前正堵着，先回来了。',
  clerk: '这镇子的屋子阿，都是通的。从前门进，后门出，落脚在哪儿，你说了算——出门前在本册上挑好就行。',
  courier: '迷路了就随便推开一扇屋门，翻翻里面的百门册，想去哪条街，从那扇门出去就是啦。',
  chronicle: '未写镇屋舍相通，一室而百门。镇民串门不走街，走屋——推门进去，挑门出来，落脚已是另一条巷子。外乡人初至多不惯，住久了都说好。',
} as const;
export const houseDoorVisitKey = 'unwritten.houses.doors.v1';

export const houseDoorZones = [
  ['central', '中央'], ['market', '集市'], ['memorial', '纪念'], ['lakeside', '湖畔'], ['forest', '森林'],
] as const satisfies readonly (readonly [HouseDoorZone, string])[];

export type HouseDoorAnchor = { label: string; x: number; n: number };
type HouseDoorBookRow = { door: TownHousePortal; name: string; note: string };
type HouseDoorGround = (x: number, n: number) => number | undefined;

export function createHouseDoorBook(doors: readonly TownHousePortal[], anchors: readonly HouseDoorAnchor[]) {
  return houseDoorZones.map(([zone, label]) => ({
    zone, label,
    rows: doors.filter(door => door.zone === zone)
      .sort((a, b) => a.n - b.n || a.x - b.x || a.id.localeCompare(b.id))
      .map((door, i): HouseDoorBookRow => {
        let nearest: HouseDoorAnchor | undefined;
        let distance = Infinity;
        for (const anchor of anchors) {
          const measured = Math.hypot(door.x - anchor.x, door.n - anchor.n);
          if (measured >= distance) continue;
          nearest = anchor;
          distance = measured;
        }
        if (!nearest) return { door, name: `第 ${i + 1} 门`, note: `${label}区` };
        const east = door.x - nearest.x, north = door.n - nearest.n;
        const direction = Math.abs(east) > Math.abs(north) ? east > 0 ? '东' : '西' : north > 0 ? '北' : '南';
        return {
          door, name: `${nearest.label}附近 · ${i + 1} 号门`,
          note: `${nearest.label}${direction}侧 · 约 ${Math.round(distance)} 米`,
        };
      }),
  }));
}

export function recordHouseDoorVisit(id: string, storage = browserTextStorage()) {
  const ids = readCollection(storage, houseDoorVisitKey, (value): value is string =>
    typeof value === 'string' && value.length > 0 && value.length < 64);
  if (!ids.includes(id)) writeCollection(storage, houseDoorVisitKey, [...ids, id]);
}

export function findHouseDoorLanding(door: TownHousePortal, groundAt: HouseDoorGround) {
  // Existing interaction/return stands are 1.42 m out from the decorative facade.
  const forwardX = Math.sin(door.exitYaw), forwardN = Math.cos(door.exitYaw);
  const x = door.x - (1.42 - .9) * forwardX;
  const n = door.n - (1.42 - .9) * forwardN;
  for (const side of [0, -.6, .6]) {
    const east = x + side * forwardN;
    const north = n - side * forwardX;
    const ground = groundAt(east, north);
    if (ground !== undefined && Number.isFinite(ground)) return { x: east, n: north, ground };
  }
}

export function renderHouseDoorBook(
  panel: HTMLElement,
  groups: ReturnType<typeof createHouseDoorBook>,
  entry: TownHousePortal,
  blocked: ReadonlySet<string>,
  choose: (door: TownHousePortal) => void,
) {
  const view = document.createElement('div');
  view.className = 'house-door-book';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '搜门名或附近地标';
  search.setAttribute('aria-label', '搜门名或附近地标');
  const tabs = document.createElement('div');
  tabs.className = 'house-door-book-zones';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', '屋门分区');
  const list = document.createElement('ul');
  list.className = 'house-door-book-list';
  list.setAttribute('aria-label', '屋门清单');
  let zone = entry.zone;
  for (const group of groups) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.textContent = `${group.label} ${group.rows.length}`;
    tab.dataset.houseDoorZone = group.zone;
    tab.onclick = () => {
      zone = group.zone;
      search.value = '';
      render();
    };
    tabs.append(tab);
  }

  function render() {
    const query = search.value.normalize('NFKC').trim().toLowerCase();
    for (const tab of tabs.querySelectorAll('button')) {
      tab.setAttribute('aria-pressed', String(!query && tab.dataset.houseDoorZone === zone));
    }
    const rows = groups.filter(group => query || group.zone === zone)
      .flatMap(group => group.rows.filter(row =>
        !query || `${group.label} ${row.name} ${row.note}`.normalize('NFKC').toLowerCase().includes(query)));
    rows.sort((a, b) => Number(b.door.id === entry.id) - Number(a.door.id === entry.id));
    list.replaceChildren();
    if (!rows.length) {
      const message = document.createElement('li');
      message.textContent = '没有找到这扇门。';
      list.append(message);
    }
    for (const { door, name, note } of rows) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.houseDoor = door.id;
      button.onclick = () => choose(door);
      const title = document.createElement('strong');
      title.textContent = door.id === entry.id ? name + ' · 刚从这儿进' : name;
      const detail = document.createElement('small');
      detail.textContent = blocked.has(door.id) ? note + ' · 暂不可达' : note;
      button.append(title, detail);
      item.append(button);
      list.append(item);
    }
  }
  search.addEventListener('input', render);
  view.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    panel.closest('dialog')?.close();
  });
  view.append(search, tabs, list);
  panel.replaceChildren(view);
  render();
}
