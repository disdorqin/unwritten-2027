import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import type { createTerrainGrid } from './terrain';
import type { TownActivity, TownActivityContext } from './town-activity';

const stations = [
  { id: 'plaza', label: '钟楼广场迎宾灯', stand: [223, 180], fixture: [221.05, 181.05] },
  { id: 'forest', label: '西北木屋路灯', stand: [103, 255], fixture: [101.02, 254.72] },
  { id: 'workshop', label: '西南灯坊街灯', stand: [108, 114], fixture: [106.7, 112.25] },
  { id: 'bridge', label: '中央木桥桥灯', stand: [291, 192], fixture: [291, 194.65] },
  { id: 'memorial', label: '纪念馆前街灯', stand: [350, 249], fixture: [352.05, 248.55] },
  { id: 'lighthouse', label: '湖岸灯塔引路灯', stand: [411, 87.7], fixture: [412.7, 88.4] },
  { id: 'station', label: '火车站迎宾灯', stand: [526, 305], fixture: [524, 304.5] },
] as const;

export const trailLampColdRadius = 5;
export type TownLightId = (typeof stations)[number]['id'];
type Progress = { lit: number; total: number };
type Ground = Pick<ReturnType<typeof createTerrainGrid>, 'heightAt'>;

const storageKey = 'unwritten:town-lights:v1';
const colors = {
  stone: new Color('#647586'), snow: new Color('#b8cbdd'), clean: new Color('#35434f'),
  copper: new Color('#986442'), glass: new Color('#554738'), lamp: new Color('#ffbb66'),
  shade: new Color('#987251'), filament: new Color('#fff1c0'),
};

function savedLights() {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(stored)) return stations.filter(station => stored.includes(station.id)).map(station => station.id);
  } catch { /* Play remains available for browsers with storage disabled. */ }
  return [];
}

export function createTownLights(
  context: TownActivityContext,
  grid: Ground,
  onProgress?: (progress: Progress) => void,
): TownActivity & {
  getProgress(): Progress;
  litIds(): TownLightId[];
  litAt(east: number, north: number, feet: number): boolean;
  activate(id: TownLightId): boolean;
  openBook(): void;
  setCeremonyBand(band: number): void;
  setCeremonyDim(level: number): void;
} {
  const lit = new Set<TownLightId>(savedLights());
  let ceremonyBand = -1;
  let ceremonyDim = 1;
  const dimmedColor = new Color();
  const partsPerLight = 15;
  const fixtures = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), stations.length * partsPerLight);
  fixtures.name = 'Town light trail';
  fixtures.matrixAutoUpdate = false;
  const shape = new Object3D();
  const pieces = stations.map(({ id, fixture: [x, n] }, index) => {
    const ground = grid.heightAt(x, n);
    let slot = index * partsPerLight;
    function cube(dx: number, y: number, dz: number, w: number, h: number, d: number, color: Color) {
      shape.position.set(x + dx, ground + y, -n + dz);
      shape.scale.set(w, h, d);
      shape.updateMatrix();
      fixtures.setMatrixAt(slot, shape.matrix);
      fixtures.setColorAt(slot, color);
      return slot++;
    }
    cube(0, .075, 0, .63, .3, .63, colors.stone);
    cube(0, .237, 0, .62, .045, .62, colors.snow);
    cube(0, .87, 0, .15, 1.28, .15, colors.clean);
    cube(0, 1.18, 0, .178, .12, .178, colors.copper);
    cube(0, 1.515, 0, .43, .13, .43, colors.copper);
    const pane = cube(0, 1.81, 0, .346, .46, .346, colors.glass);
    const wick = cube(0, 1.805, 0, .08, .29, .35, colors.shade);
    const cross = cube(0, 1.805, 0, .35, .29, .08, colors.shade);
    for (const dx of [-.172, .172]) for (const dz of [-.172, .172]) {
      cube(dx, 1.8, dz, .047, .5, .047, colors.clean);
    }
    cube(0, 2.074, 0, .49, .104, .49, colors.clean);
    cube(0, 2.14, 0, .392, .048, .392, colors.snow);
    cube(0, 2.23, 0, .091, .147, .091, colors.copper);
    const distance = Math.hypot(x - 223, n - 188);
    const band = distance < 36 ? 0 : distance < 110 ? 1 : distance < 200 ? 2 : 3;
    return { id, x, n, ground, pane, wick, cross, band };
  });
  fixtures.computeBoundingSphere();
  fixtures.instanceColor!.setUsage(DynamicDrawUsage);
  context.scene.add(fixtures);

  function paint({ id, pane, wick, cross, band }: typeof pieces[number]) {
    const glowing = lit.has(id) || band <= ceremonyBand;
    fixtures.setColorAt(pane, dimmedColor.copy(glowing ? colors.lamp : colors.glass).multiplyScalar(ceremonyDim));
    dimmedColor.copy(glowing ? colors.filament : colors.shade).multiplyScalar(ceremonyDim);
    fixtures.setColorAt(wick, dimmedColor);
    fixtures.setColorAt(cross, dimmedColor);
    fixtures.instanceColor!.needsUpdate = true;
  }
  pieces.forEach(paint);

  function getProgress(): Progress {
    return { lit: lit.size, total: stations.length };
  }

  function litIds() { return stations.map(station => station.id).filter(id => lit.has(id)); }

  function syncSaved() {
    let changed = false;
    for (const id of savedLights()) {
      if (lit.has(id)) continue;
      lit.add(id);
      paint(pieces.find(piece => piece.id === id)!);
      changed = true;
    }
    if (changed) onProgress?.(getProgress());
  }

  function activate(id: TownLightId) {
    syncSaved();
    const station = stations.find(station => station.id === id);
    if (!station || lit.has(id)) return false;
    lit.add(id);
    paint(pieces.find(piece => piece.id === id)!);
    try { localStorage.setItem(storageKey, JSON.stringify(litIds())); } catch { /* Keep this session's progress. */ }
    const progress = getProgress();
    onProgress?.(progress);
    context.announce(progress.lit === progress.total
      ? `全镇灯火齐明 · ${progress.lit} / ${progress.total}`
      : `${station.label}已点亮 · ${progress.lit} / ${progress.total}`);
    return true;
  }

  function openBook() {
    syncSaved();
    const { lit: count, total } = getProgress();
    const panel = context.open('小镇灯火', count === total
      ? '全镇灯火齐明。你点亮的灯会在下次回镇时继续亮着。'
      : '走近路上的铜灯，使用「点亮」即可将它记入灯路。这些进度会保存在本机。');
    const summary = document.createElement('p');
    summary.textContent = `已点亮 ${count} / ${total} 盏`;
    const bar = document.createElement('progress');
    bar.max = total;
    bar.value = count;
    bar.setAttribute('aria-label', '小镇亮灯进度');
    const list = document.createElement('ul');
    for (const { id, label } of stations) {
      const line = document.createElement('li');
      line.textContent = `${label} · ${lit.has(id) ? '已点亮' : '待点亮'}`;
      list.append(line);
    }
    panel.append(summary, bar, list);
  }

  return {
    getProgress,
    litIds,
    litAt(east, north, feet) {
      return pieces.some(({ id, x, n, ground, band }) =>
        (lit.has(id) || band <= ceremonyBand) && Math.abs(ground - feet) <= 2.8 &&
        (x - east) ** 2 + (n - north) ** 2 <= trailLampColdRadius ** 2);
    },
    activate,
    openBook,
    setCeremonyBand(band) {
      if (!Number.isInteger(band) || band < -1 || band > 3 || ceremonyBand === band) return;
      ceremonyBand = band;
      pieces.forEach(paint);
    },
    setCeremonyDim(level) {
      if (!Number.isFinite(level)) return;
      const dim = Math.max(0, Math.min(1, level));
      if (dim === ceremonyDim) return;
      ceremonyDim = dim;
      pieces.forEach(paint);
    },
    blocked(x, n) {
      return stations.some(({ fixture: [east, north] }) => Math.hypot(x - east, n - north) < .55);
    },
    spots: stations.map(({ id, label, stand: [x, n], fixture: [east, north] }) => ({
      x, n, ground: grid.heightAt(x, n), range: 1.7, label: `点亮${label}`,
      available: () => !lit.has(id),
      run() {
        if (activate(id)) context.face(east, north, grid.heightAt(east, north) + 1.81);
      },
    })),
  };
}
