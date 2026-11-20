// D1 团队雪仗（占点 + 雪墙堡垒）共享逻辑：服务端权威状态机与雪墙场，客户端同源镜像。
// 数值口径见《未写镇3.0总任务书-2026-11-19》§1 D1；此处只实现规则，不含传输与渲染。

import { sledMaximumSpeed } from '../shared/sled-speed.js';
import { TOWN_BOUNDS } from './protocol.js';
import { cabinWallHousing, extensionWallHousing, oldTownWallHousing } from './snowfight-housing-sites.js';

export const SNOWFIGHT_TEAM_NAMES = ['红围巾队', '金铃队'] as const;
export type SnowfightTeam = 0 | 1;
export const freeWallTeam = 2;
export type SnowWallTeam = SnowfightTeam | typeof freeWallTeam;

export type SnowfightPoint = { id: string; label: string; east: number; north: number };
export const SNOWFIGHT_POINTS: readonly SnowfightPoint[] = [
  { id: 'plaza', label: '广场徽记', east: 224, north: 188 },
  { id: 'castle', label: '城堡前庭', east: 484, north: 46 },
  { id: 'spring', label: '温泉汤口', east: 551, north: 167 },
];
export const POINT_RADIUS = 5;
export const BUILD_MS = 180_000;
export const BATTLE_MS = 300_000;
export const CAPTURE_MS = 5_000;
export const ROTATE_DELAY_MS = 10_000;
export const SCORE_MS_PER_POINT = 1_000;
export const HALF_EAST = 320;

export const WALL_CELL = .5;
export const WALL_MAX_LAYERS = 4;
export const WALL_TOWN_CAP = 400;
export const WALL_BLOCK_HP = 3;
export const WALL_DECAY_MS = 600_000;
export const WALL_TOUCH_RADIUS = 4;
export const WALL_CLEARANCE = 1;

export function wallCellOf(metres: number): number {
  return Math.floor(metres / WALL_CELL);
}
export function wallCellCentre(cell: number): number {
  return (cell + .5) * WALL_CELL;
}

/** The report byte is integral; keep its band identical to the measured speed. */
export function sledWallReportSpeed(speed: number): number {
  return speed > 22 ? Math.ceil(speed) : Math.floor(speed);
}

// Muse 32eb675 §5. Main-window ride tuning also uses this approved cap.
export const sledWallMaximumReportSpeed = sledWallReportSpeed(sledMaximumSpeed);

export function sledWallImpact(speed: number): { layers: number; multiplier: number } {
  const layers = speed > 22 ? WALL_MAX_LAYERS : speed >= 15 ? 2 : speed >= 8 ? 1 : 0;
  return { layers, multiplier: speed > 22 ? .7 : .5 };
}

// Zone geometry extracted 2026-11-19 from layout.json, town-extension.ts (extensionRoads/districtStreets/districtParcels),
// docs/p0-layout-draft.json (rail guide, with town-railway.ts guideReplacements applied) and town-rail-stops.ts.
// Segments are [ax, an, bx, bn, halfWidth]; rects are [centreEast, centreNorth, width, depth]; doors are [east, north];
// platforms are [east, north, halfLength, axis].
const ROAD_SEGMENTS: readonly (readonly number[])[] = [[191,202,176,205,3.5],[176,205,151,215,3.5],[151,215,131,235,3.5],[131,235,103,255,3.5],[251,192,278,192,3.5],[278,192,304,192,3.5],[304,192,315,199,3.5],[315,199,319,230,3.5],[319,230,332,245,3.5],[332,245,350,249,3.5],[191,181,172,175,3.5],[172,175,151,156,3.5],[151,156,127,140,3.5],[127,140,108,114,3.5],[245,169,260,155,3.5],[260,155,276,149,3.5],[276,149,302,149,3.5],[302,149,319,137,3.5],[319,137,324,103,3.5],[324,103,350,100,3.5],[103,255,121,286,3],[121,286,163,308,3],[163,308,209,300,3],[209,300,253,298,3],[253,298,279,298,3],[279,298,316,304,3],[316,304,348,308,3],[348,308,373,296,3],[373,296,371,266,3],[371,266,350,249,3],[103,255,88,215,3],[88,215,77,164,3],[77,164,85,131,3],[85,131,108,114,3],[108,114,129,86,3],[129,86,176,74,3],[176,74,218,85,3],[218,85,269,100,3],[269,100,295,100,3],[295,100,350,100,3],[350,249,382,220,3],[382,220,396,189,3],[396,189,391,157,3],[391,157,374,129,3],[374,129,350,100,3],[350,249,371,266,3],[371,266,385,280,3],[385,280,378,301,3],[382,220,398,207,3],[398,207,410,207,3],[410,207,427,214,3],[427,214,445,221,3],[445,221,456,222,3],[456,222,464,224,3],[456,222,453,254,3.5],[453,254,473,276,3.5],[473,276,506,286,3.5],[506,286,526,312,3.5],[374,129,402,132,3],[402,132,445,136,3],[445,136,479,139,3],[479,139,504,150,3],[504,150,524,158,3],[445,136,446,107,3],[446,107,447,80,3],[447,80,460,72,3],[121,286,106,313,3],[106,313,92,345,3],[92,345,93,384,3],[93,384,104,415,3],[104,415,111,433,3],[111,433,134,449,3],[134,449,165,453,3],[165,453,182,467,3],[182,467,202,486,3],[111,433,98,442,3],[98,442,91,457,3],[91,457,110,480,3],[110,480,128,485,3],[128,485,153,481,3],[153,481,173,475,3],[173,475,182,467,3],[373,296,393,309,3],[393,309,410,323,3],[410,323,427,344,3],[427,344,446,357,3],[446,357,461,368,3],[461,368,493,383,3],[493,383,523,400,3],[523,400,546,427,3],[461,368,467,392,3],[467,392,485,417,3],[485,417,507,427,3],[507,427,546,427,3],[506,286,534,282,3],[534,282,562,292,3],[562,292,581,311,3],[581,311,588,337,3],[588,337,573,359,3],[573,359,551,365,3],[551,365,532,373,3],[532,373,506,378,3],[506,378,493,383,3],[555,304,562,310,3],[562,310,581,311,3],[446,99,472,97,3],[472,97,496,97,3],[496,97,521,97,3],[521,97,535,104,3],[535,104,553,128,3],[553,128,550,138,3],[521,156,507,174,3],[507,174,526,191,3],[526,191,549,202,3],[549,202,579,190,3],[579,190,601,176,3],[601,176,604,155,3],[574,165,587,158,3],[587,158,604,155,3],[604,155,609,136,3],[609,136,598,123,3],[598,123,574,118,3],[574,118,553,128,3]];
const RAIL_SEGMENTS: readonly (readonly number[])[] = [[478,224,478,255,1.7],[478,255,477,308,1.7],[477,308,477,320,1.7],[477,320,477,332,1.7],[477,332,478.5,343,1.7],[478.5,343,467,366,1.7],[467,366,431,410,1.7],[431,410,365,435,1.7],[365,435,300,449,1.7],[300,449,242,448,1.7],[242,448,175,442,1.7],[175,442,124,420,1.7],[124,420,112,420,1.7],[112,420,101,420,1.7],[101,420,62,377,1.7],[62,377,44,318,1.7],[44,318,20,250,1.7],[20,250,18,185,1.7],[18,185,24,125,1.7],[24,125,40,75,1.7],[40,75,120,40,1.7],[120,40,181,30,1.7],[181,30,239,25,1.7],[239,25,298,26,1.7],[298,26,338,27,1.7],[338,27,350,27,1.7],[350,27,363,27,1.7],[363,27,430,25,1.7],[430,25,482,20,1.7],[482,20,496,20,1.7],[496,20,511,20,1.7],[511,20,545,28,1.7],[545,28,573,49,1.7],[573,49,587,74,1.7],[587,74,581,108,1.7],[581,108,552,110,1.7],[552,110,502,131,1.7],[502,131,502,144,1.7],[502,144,502,157,1.7],[502,157,490,164,1.7],[490,164,478,190,1.7],[478,190,478,202,1.7],[478,202,478,224,1.7]];
const RAIL_PLATFORMS: readonly (readonly unknown[])[] = [[473.5,224,24,"north"],[480.5,320,10,"north"],[112,416.5,10,"east"],[350,30.5,10,"east"],[496,23.5,10,"east"],[505.5,144,10,"north"],[300,445.5,10,"east"],[21.5,185,10,"north"]];
const DOOR_POINTS: readonly (readonly number[])[] = [[226,216],[159,221],[264,202],[337,262.375],[378,306],[101,261],[117.5,115],[154,95],[365.76,96],[408,84],[238,164]];
const INTERIOR_RECTS: readonly (readonly number[])[] = [[226,223,34,14],[159,230,22,18],[264,210,16,16],[337,277,63,42.75],[378,316,34,20],[91,271,30,20],[126,115,17,24],[154,105,36,20],[372,96,13,20],[408,78,12,12],[80,416,9,9],[94,431,10,9],[76,449,11,10],[104,458,10,10],[92,477,12,10],[125,470,13,11],[134,436,10,9],[145,467,10,9],[151,493,11,10],[163,441,13,10],[168,489,10,9],[187,485,10,9],[194,453,12,11],[211,491,11,9],[410,343,11,10],[421,363,15,11],[441,381,14,12],[462,420,13,10],[479,398,16,12],[489,438,11,10],[502,401,11,10],[520,417,14,12],[550,412,13,11],[555,438,13,11],[503,451,13,10],[532,448,13,11],[516,273,11,10],[535,267,12,10],[554,272,13,11],[572,280,13,10],[589,295,13,11],[566,322,11,12],[603,314,15,12],[603,338,12,10],[590,362,13,12],[571,376,11,10],[548,352,11,8],[551,385,12,11],[526,358,13,10],[513,366,10,9],[428,94,11,9],[431,115,12,10],[521,82,12,10],[539,85,13,11],[551,65,10,9],[560,85,13,10],[570,133,13,11],[586,136,11,10],[607,117,12,10],[619,146,12,11],[601,163,10,9],[620,175,12,10],[596,192,12,10],[576,207,11,10],[552,216,13,10],[528,207,12,11],[519,178,10,9],[510,103,11,9],[502,401,11,10],[520,417,14,12],[550,412,13,11]];
const STAGE_RECT: readonly number[] = [238,157,18,14];
const PLAZA_STAGE_RECT = [238, 140, 18, 14] as const;
const PLAZA_WEST_ROADS = [[161, 202, 151, 215, 3.5], [161, 181, 151, 156, 3.5],
  [245, 152, 260, 155, 3.5]] as const;
const RIVER_POINTS: readonly (readonly number[])[] = [[231,TOWN_BOUNDS.depth],[231,512],[239,470],[225,429],[231,384],[232,342],[266,298],[290,263],[302,230],[291,192],[289,149],[282,100],[287,76],[274,38],[263,0]];

export type WallSiteRejection = 'bounds' | 'secret' | 'stage' | 'platform' | 'rail' | 'road' | 'river' | 'door' | 'interior';

const PALACE_SECRET_RECT = [484, 72, 48, 38] as const; // 冰晶宫殿主体与密室带（前庭 n<53 不在此内）
const SHARED_HOME_RECT = [626, 498, 14, 12] as const;
// Preserve the landmark envelopes used by the current placement model. The cabins
// have individual building envelopes. The market stalls are open-air.
const [clocktower, tavern, postOffice, memorial, longHall, , lanternWorkshop, , glasshouse, lighthouse] = INTERIOR_RECTS;
const FREE_INTERIOR_RECTS = [
  clocktower, tavern, postOffice, memorial, longHall, lanternWorkshop, glasshouse, lighthouse,
  ...oldTownWallHousing,
  ...extensionWallHousing,
  ...cabinWallHousing,
];

function segmentDistance(east: number, north: number, seg: readonly number[]): number {
  const [ax, an, bx, bn] = seg;
  const dx = bx - ax;
  const dn = bn - an;
  const lengthSquared = dx * dx + dn * dn;
  const t = lengthSquared > 0 ? Math.min(1, Math.max(0, ((east - ax) * dx + (north - an) * dn) / lengthSquared)) : 0;
  return Math.hypot(east - ax - dx * t, north - an - dn * t);
}

function inRect(east: number, north: number, rect: readonly number[], grow = 0): boolean {
  return Math.abs(east - rect[0]) <= rect[2] / 2 + grow && Math.abs(north - rect[1]) <= rect[3] / 2 + grow;
}

function rectEdgeDistance(east: number, north: number, rect: readonly number[]): number {
  const dx = Math.max(Math.abs(east - rect[0]) - rect[2] / 2, 0);
  const dn = Math.max(Math.abs(north - rect[1]) - rect[3] / 2, 0);
  return Math.hypot(dx, dn);
}

function wallBlocksRoad(east: number, north: number) {
  const near = (seg: readonly number[]) => segmentDistance(east, north, seg) < seg[4] + WALL_CLEARANCE;
  return PLAZA_WEST_ROADS.some(near) || ROAD_SEGMENTS.some(near);
}

function wallBlocksDoor(east: number, north: number) {
  return DOOR_POINTS.some(([x, n]) => Math.hypot(east - x, north - n) < 1.6);
}

/** 墙基座中心点分类：返回拒放类别，undefined 表示可堆。净空口径：禁堆区外扩 WALL_CLEARANCE。 */
export function classifyWallSite(east: number, north: number): WallSiteRejection | undefined {
  if (!Number.isFinite(east) || !Number.isFinite(north) || east < 0 || north < 0 || east > TOWN_BOUNDS.width || north > TOWN_BOUNDS.depth) return 'bounds';
  if (inRect(east, north, PALACE_SECRET_RECT, WALL_CLEARANCE)) return 'secret';
  if (inRect(east, north, STAGE_RECT, WALL_CLEARANCE) || inRect(east, north, PLAZA_STAGE_RECT, WALL_CLEARANCE)) return 'stage';
  for (const platform of RAIL_PLATFORMS) {
    const [px, pn, halfLength, axis] = platform as [number, number, number, string];
    const along = axis === 'north' ? Math.abs(north - pn) : Math.abs(east - px);
    const lateral = axis === 'north' ? Math.abs(east - px) : Math.abs(north - pn);
    if (along <= halfLength + WALL_CLEARANCE && lateral <= 2.5 + WALL_CLEARANCE) return 'platform';
  }
  for (const seg of RAIL_SEGMENTS) if (segmentDistance(east, north, seg) < seg[4] + WALL_CLEARANCE) return 'rail';
  if (wallBlocksRoad(east, north)) return 'road';
  for (let i = 1; i < RIVER_POINTS.length; i++) {
    const seg = [RIVER_POINTS[i - 1][0], RIVER_POINTS[i - 1][1], RIVER_POINTS[i][0], RIVER_POINTS[i][1]];
    if (segmentDistance(east, north, seg) < 2 + WALL_CLEARANCE) return 'river';
  }
  if (wallBlocksDoor(east, north)) return 'door';
  if (inRect(east, north, SHARED_HOME_RECT)) return 'interior';
  for (const rect of INTERIOR_RECTS) if (inRect(east, north, rect)) return 'interior';
  for (const rect of INTERIOR_RECTS) if (rectEdgeDistance(east, north, rect) < WALL_CLEARANCE + .2) return 'door';
  return undefined;
}

/** 自由堆砌给门口、道路和桥面让路，比赛另有场地限制。 */
export function classifyFreeWallSite(east: number, north: number): WallSiteRejection | undefined {
  if (!Number.isFinite(east) || !Number.isFinite(north) || east < 0 || north < 0 ||
      east > TOWN_BOUNDS.width || north > TOWN_BOUNDS.depth) return 'bounds';
  if (inRect(east, north, PALACE_SECRET_RECT)) return 'secret';
  if (inRect(east, north, SHARED_HOME_RECT) || FREE_INTERIOR_RECTS.some(rect => inRect(east, north, rect))) return 'interior';
  if (RAIL_SEGMENTS.some(seg => segmentDistance(east, north, seg) < seg[4] + WALL_CLEARANCE)) return 'rail';
  if (wallBlocksRoad(east, north)) return 'road';
  if (wallBlocksDoor(east, north) ||
    FREE_INTERIOR_RECTS.some(rect => rectEdgeDistance(east, north, rect) < WALL_CLEARANCE + .2)) return 'door';
  // Match terrain.ts riverX/isWater and the dry bridge decks in layout.json.
  const bridges = [[298, 253, 279], [192, 278, 304], [149, 276, 302], [100, 269, 295]];
  const bridge = bridges.some(([row, west, right]) => Math.abs(north - row) <= 4 && east >= west && east <= right);
  if (bridge) return 'road';
  const inlet = east >= 287 && east <= 305 && Math.abs(north - (76 - (east - 287) / 2)) < 4;
  if (inlet) return 'river';
  for (let i = 1; i < RIVER_POINTS.length; i++) {
    const [x0, n0] = RIVER_POINTS[i - 1], [x1, n1] = RIVER_POINTS[i];
    if (north >= n1) {
      const river = x1 + (x0 - x1) * Math.min(1, (north - n1) / (n0 - n1));
      return Math.abs(east - river) < 8 ? 'river' : undefined;
    }
  }
  return undefined;
}

/** 建造段半场：红队（0）西半（east<320），金队（1）东半。 */
export function buildHalfAllows(team: SnowfightTeam, east: number): boolean {
  return team === 0 ? east < HALF_EAST : east >= HALF_EAST;
}

export type WallBlock = {
  gx: number; gy: number; layer: number;
  ownerId: number; team: SnowWallTeam; hp: number;
  placedAt: number; touchedAt: number;
};

export class SnowWallField {
  private columns = new Map<string, WallBlock[]>();
  private total = 0;

  constructor(private readonly maxLayers = WALL_MAX_LAYERS) {}

  private key(gx: number, gy: number) { return `${gx},${gy}`; }

  get size() { return this.total; }

  height(gx: number, gy: number): number {
    return this.columns.get(this.key(gx, gy))?.length ?? 0;
  }

  blockAt(gx: number, gy: number, layer: number): WallBlock | undefined {
    return this.columns.get(this.key(gx, gy))?.[layer];
  }

  place(gx: number, gy: number, ownerId: number, team: SnowWallTeam, now: number):
    { block: WallBlock; cleared: WallBlock[] } | { reason: 'stack' | 'cap' } {
    const key = this.key(gx, gy);
    if (this.height(gx, gy) >= this.maxLayers) return { reason: 'stack' };
    const cleared = this.total >= WALL_TOWN_CAP ? this.evictOldestFree() : [];
    if (this.total >= WALL_TOWN_CAP) return { reason: 'cap' };
    const column = this.columns.get(key) ?? [];
    const block: WallBlock = {
      gx, gy, layer: column.length, ownerId, team, hp: WALL_BLOCK_HP, placedAt: now, touchedAt: now,
    };
    column.push(block);
    this.columns.set(key, column);
    this.total++;
    return { block, cleared };
  }

  private collapse(key: string, column: WallBlock[], layer: number): WallBlock[] {
    const removed = column.splice(layer);
    this.total -= removed.length;
    if (!column.length) this.columns.delete(key);
    return removed;
  }

  private evictOldestFree(): WallBlock[] {
    let oldest: WallBlock[] | undefined;
    for (const column of this.columns.values()) {
      // During team play, preserve team walls resting on a free base.
      if (column.at(-1)?.team !== freeWallTeam) continue;
      if (!oldest || column[0].placedAt < oldest[0].placedAt) oldest = column;
    }
    return oldest ? this.collapse(this.key(oldest[0].gx, oldest[0].gy), oldest, 0) : [];
  }

  clearWhere(matches: (block: WallBlock) => boolean): WallBlock[] {
    const removed: WallBlock[] = [];
    for (const [key, column] of this.columns) {
      const layer = column.findIndex(matches);
      if (layer !== -1) removed.push(...this.collapse(key, column, layer));
    }
    return removed;
  }

  /** 雪橇从上往下削层，保留下面各块的原有 HP 和归属。 */
  breakTop(gx: number, gy: number, layers: number): WallBlock[] {
    const key = this.key(gx, gy);
    const column = this.columns.get(key);
    return column && layers > 0 ? this.collapse(key, column, Math.max(0, column.length - layers)) : [];
  }

  /** 命中一块：hp-1；击毁则其上整段塌落。返回受损块或塌落块列表。 */
  damage(gx: number, gy: number, layer: number, now: number):
    { damaged: WallBlock } | { destroyed: WallBlock[] } | undefined {
    const key = this.key(gx, gy);
    const column = this.columns.get(key);
    const block = column?.[layer];
    if (!column || !block) return undefined;
    block.hp--;
    if (block.hp > 0) return { damaged: block };
    void now;
    return { destroyed: this.collapse(key, column, layer) };
  }

  /** 无人维护自塌：自 touchedAt 超过 WALL_DECAY_MS 的最低块起，上方整段塌落。 */
  decay(now: number): WallBlock[] {
    const removed: WallBlock[] = [];
    for (const [key, column] of this.columns) {
      const stale = column.findIndex(block => now - block.touchedAt > WALL_DECAY_MS);
      if (stale === -1) continue;
      removed.push(...this.collapse(key, column, stale));
    }
    return removed;
  }

  /** 主人在附近即维护：刷新其名下 WALL_TOUCH_RADIUS 内的块。 */
  refreshFor(ownerId: number, east: number, north: number, now: number): void {
    for (const column of this.columns.values()) {
      for (const block of column) {
        if (block.ownerId !== ownerId) continue;
        const dx = wallCellCentre(block.gx) - east;
        const dn = wallCellCentre(block.gy) - north;
        if (dx * dx + dn * dn <= WALL_TOUCH_RADIUS ** 2) block.touchedAt = now;
      }
    }
  }

  clear(): WallBlock[] {
    const all = this.snapshot();
    this.columns.clear();
    this.total = 0;
    return all;
  }

  snapshot(): WallBlock[] {
    return [...this.columns.values()].flat();
  }
}

export type SnowfightPhase = 'idle' | 'build' | 'battle' | 'done';
export type SnowfightEvent =
  | { type: 'phase'; phase: SnowfightPhase }
  | { type: 'point-active'; index: number }
  | { type: 'captured'; index: number; team: SnowfightTeam }
  | { type: 'capture-reset'; index: number }
  | { type: 'score'; team: SnowfightTeam }
  | { type: 'streak'; playerId: number; streak: number }
  | { type: 'finished'; winner: SnowfightTeam | 'draw'; scores: readonly [number, number] };

export type SnowfightDurations = { buildMs: number; battleMs: number; captureMs: number; rotateDelayMs: number };
const DEFAULT_DURATIONS: SnowfightDurations = {
  buildMs: BUILD_MS, battleMs: BATTLE_MS, captureMs: CAPTURE_MS, rotateDelayMs: ROTATE_DELAY_MS,
};

export class SnowfightMatch {
  phase: SnowfightPhase = 'idle';
  readonly teams = new Map<number, SnowfightTeam>();
  readonly scores: [number, number] = [0, 0];
  readonly owners: (SnowfightTeam | undefined)[] = SNOWFIGHT_POINTS.map(() => undefined);
  activePoint = -1;
  captureTeam: SnowfightTeam | undefined;
  captureMs = 0;
  private phaseEndsAt = 0;
  private activatesAt = 0;
  private rotation = 0;
  private scoreAcc: [number, number] = [0, 0];
  private streaks = new Map<number, number>();
  private lastTick = 0;
  private readonly durations: SnowfightDurations;

  constructor(durations: Partial<SnowfightDurations> = {}) {
    this.durations = { ...DEFAULT_DURATIONS, ...durations };
  }

  get endsAt() { return this.phaseEndsAt; }

  teamOf(id: number): SnowfightTeam | undefined {
    return this.teams.get(id);
  }

  start(playerIds: readonly number[], now: number): void {
    this.teams.clear();
    [...playerIds].sort((a, b) => a - b).forEach((id, i) => this.teams.set(id, (i % 2) as SnowfightTeam));
    this.scores[0] = 0;
    this.scores[1] = 0;
    this.scoreAcc = [0, 0];
    this.owners.fill(undefined);
    this.activePoint = -1;
    this.captureTeam = undefined;
    this.captureMs = 0;
    this.rotation = 0;
    this.streaks.clear();
    this.phase = 'build';
    this.phaseEndsAt = now + this.durations.buildMs;
    this.lastTick = now;
  }

  addPlayer(id: number): SnowfightTeam {
    const existing = this.teams.get(id);
    if (existing !== undefined) return existing;
    let count0 = 0;
    for (const team of this.teams.values()) if (team === 0) count0++;
    const team = (count0 * 2 <= this.teams.size ? 0 : 1) as SnowfightTeam;
    this.teams.set(id, team);
    return team;
  }

  removePlayer(id: number): void {
    this.teams.delete(id);
    this.streaks.delete(id);
  }

  streakOf(id: number): number {
    return this.streaks.get(id) ?? 0;
  }

  /** 雪球命中确认钩子：打断占点进度 + 连中计数。victimPos 为被击者坐标（缺省时只计连中）。 */
  onHit(victimId: number, throwerId: number, victimPos?: { east: number; north: number }): SnowfightEvent[] {
    const events: SnowfightEvent[] = [];
    if (throwerId !== victimId) {
      const streak = (this.streaks.get(throwerId) ?? 0) + 1;
      this.streaks.set(throwerId, streak);
      if (streak === 3) events.push({ type: 'streak', playerId: throwerId, streak });
    }
    this.streaks.set(victimId, 0);
    if (this.phase === 'battle' && this.activePoint >= 0 && this.captureMs > 0 &&
        this.captureTeam !== undefined && this.teams.get(victimId) === this.captureTeam && victimPos) {
      const point = SNOWFIGHT_POINTS[this.activePoint];
      if (Math.hypot(victimPos.east - point.east, victimPos.north - point.north) <= POINT_RADIUS) {
        this.captureMs = 0;
        this.captureTeam = undefined;
        events.push({ type: 'capture-reset', index: this.activePoint });
      }
    }
    return events;
  }

  tick(now: number, positions: ReadonlyMap<number, { east: number; north: number }>): SnowfightEvent[] {
    const events: SnowfightEvent[] = [];
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (this.phase === 'build' && now >= this.phaseEndsAt) {
      this.phase = 'battle';
      this.phaseEndsAt = now + this.durations.battleMs;
      this.activatesAt = now;
      events.push({ type: 'phase', phase: 'battle' });
    }
    if (this.phase !== 'battle') return events;
    if (now >= this.phaseEndsAt) {
      this.phase = 'done';
      const winner = this.scores[0] === this.scores[1] ? 'draw' : (this.scores[0] > this.scores[1] ? 0 : 1) as SnowfightTeam;
      events.push({ type: 'finished', winner, scores: [...this.scores] });
      return events;
    }
    let scored0 = false;
    let scored1 = false;
    for (let i = 0; i < SNOWFIGHT_POINTS.length; i++) {
      const owner = this.owners[i];
      if (owner === undefined) continue;
      this.scoreAcc[owner] += dt;
      while (this.scoreAcc[owner] >= SCORE_MS_PER_POINT) {
        this.scoreAcc[owner] -= SCORE_MS_PER_POINT;
        this.scores[owner]++;
        if (owner === 0) scored0 = true; else scored1 = true;
      }
    }
    if (scored0) events.push({ type: 'score', team: 0 });
    if (scored1) events.push({ type: 'score', team: 1 });

    if (this.activePoint < 0 && now >= this.activatesAt) {
      this.activePoint = this.rotation % SNOWFIGHT_POINTS.length;
      this.rotation++;
      this.captureTeam = undefined;
      this.captureMs = 0;
      events.push({ type: 'point-active', index: this.activePoint });
    }
    if (this.activePoint >= 0) {
      const point = SNOWFIGHT_POINTS[this.activePoint];
      const inside: [number, number] = [0, 0];
      for (const [id, team] of this.teams) {
        const pos = positions.get(id);
        if (pos && Math.hypot(pos.east - point.east, pos.north - point.north) <= POINT_RADIUS) inside[team]++;
      }
      const present = inside[0] > 0 && inside[1] > 0 ? undefined
        : inside[0] > 0 ? 0 as SnowfightTeam : inside[1] > 0 ? 1 as SnowfightTeam : undefined;
      if (present !== undefined) {
        if (this.captureTeam !== present) {
          this.captureTeam = present;
          this.captureMs = 0;
        }
        this.captureMs += dt;
        if (this.captureMs >= this.durations.captureMs) {
          const index = this.activePoint;
          this.owners[index] = present;
          this.activePoint = -1;
          this.activatesAt = now + this.durations.rotateDelayMs;
          this.captureTeam = undefined;
          this.captureMs = 0;
          events.push({ type: 'captured', index, team: present });
        }
      }
    }
    return events;
  }

  state(now: number) {
    return {
      phase: this.phase,
      endsInMs: this.phase === 'build' || this.phase === 'battle' ? Math.max(0, this.phaseEndsAt - now) : 0,
      scores: [...this.scores] as [number, number],
      teams: [...this.teams.entries()] as [number, SnowfightTeam][],
      owners: this.owners.map(owner => owner ?? -1),
      activePoint: this.activePoint,
      captureTeam: this.captureTeam ?? -1,
      captureProgress: Math.min(1, this.captureMs / this.durations.captureMs),
    };
  }
}
