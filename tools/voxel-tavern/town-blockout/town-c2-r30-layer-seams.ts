/**
 * C2-R04 deep-layer seam and C-window wiring contract.
 *
 * This is a DATA-ONLY port description, not a renderer and not a world
 * transform. C owns the underground domain authority, layer boundaries, entry/
 * return points and the single presence protocol. Per the interface freeze I2,
 * C2 only CONSUMES C-published anchors; until then every deep layer is a
 * clearly marked local fixture. Nothing here invents a world coordinate, opens
 * a gate, grants interaction, or claims a registered domain.
 *
 * The host resolves each local frame into the world only after C certifies a
 * `LayerFrame`. `resolveSeam` therefore fails closed when no certified frame is
 * supplied, and never guesses a depth or offset.
 */

export type C2DeepLayer = 'minus140' | 'minus165' | 'minus190';
export type C2SeamStatus = 'local-fixture' | 'c-certified';

export type C2LocalFrame = Readonly<{
  id: string;
  layer: C2DeepLayer;
  depthMetres: -140 | -165 | -190;
  axisMapping: 'x=east,y=height,z=-north';
  floorDatum: number;
  /** Local ENY exit/entry points, consumed by C, not world positions. */
  localEntry: Readonly<{ east: number; north: number }>;
  localExit: Readonly<{ east: number; north: number }>;
  status: C2SeamStatus;
}>;

/** A C-published world transform. C2 never writes one; the host supplies it. */
export type C2CertifiedLayerFrame = Readonly<{
  layer: C2DeepLayer;
  status: 'c-certified';
  worldOffset: Readonly<{ east: number; height: number; north: number }>;
  yaw: number;
  certifiedBy: string;
}>;

export type C2SeamLink = Readonly<{
  id: string;
  from: C2DeepLayer;
  to: C2DeepLayer | 'surface-return';
  kind: 'walk' | 'ferry' | 'lift-return';
  /** Human-readable route rule; no authority mutation. */
  rule: string;
  requiresCertifiedFrames: boolean;
}>;

/** The three authored local frames. All are fixtures until C publishes frames. */
export const c2R30LayerFrames: Readonly<Record<C2DeepLayer, C2LocalFrame>> = Object.freeze({
  minus140: Object.freeze({
    id: 'second-mine-local-east-up-north',
    layer: 'minus140',
    depthMetres: -140,
    axisMapping: 'x=east,y=height,z=-north',
    floorDatum: 0,
    localEntry: Object.freeze({ east: 0, north: 2 }),
    localExit: Object.freeze({ east: 0, north: 196 }),
    status: 'local-fixture',
  }),
  minus165: Object.freeze({
    id: 'warrior-city-local-east-height-north',
    layer: 'minus165',
    depthMetres: -165,
    axisMapping: 'x=east,y=height,z=-north',
    floorDatum: 0,
    localEntry: Object.freeze({ east: 1, north: 0 }),
    localExit: Object.freeze({ east: 179, north: 0 }),
    status: 'local-fixture',
  }),
  minus190: Object.freeze({
    id: 'palace-shell-local-east-height-north',
    layer: 'minus190',
    depthMetres: -190,
    axisMapping: 'x=east,y=height,z=-north',
    floorDatum: -2.4,
    localEntry: Object.freeze({ east: 0, north: 105.7 }),
    localExit: Object.freeze({ east: 0, north: 125.8 }),
    status: 'local-fixture',
  }),
});

/** Descending links and the three canon return routes; all need C frames. */
export const c2R30SeamLinks: readonly C2SeamLink[] = Object.freeze([
  Object.freeze({
    id: 'minus140-to-minus165', from: 'minus140', to: 'minus165', kind: 'walk',
    rule: '二矿出口厅（local n≈196）接勇士城城门（local e≈1）；两侧均为局部坐标，须 C 认证层界后接线',
    requiresCertifiedFrames: true,
  }),
  Object.freeze({
    id: 'minus165-to-minus190', from: 'minus165', to: 'minus190', kind: 'walk',
    rule: '勇士城冷焰过渡口（local e≈179）接地宫前庭（local n≈105.7）；不得提前开宝库门',
    requiresCertifiedFrames: true,
  }),
  Object.freeze({
    id: 'minus140-ferry', from: 'minus140', to: 'minus140', kind: 'ferry',
    rule: '暗河仅在 middle 水位可摆渡；high/low 走全程干绕道，河面不是步行支撑',
    requiresCertifiedFrames: false,
  }),
  Object.freeze({
    id: 'deep-lift-return', from: 'minus190', to: 'surface-return', kind: 'lift-return',
    rule: '深层返程仅用 C 权威空笼召唤/死亡回床；C2 只保留局部返程脚点，不自建传送',
    requiresCertifiedFrames: true,
  }),
]);

/** Per-layer lighting budget: bounded warm pools, no dynamic flood lights. */
export const c2R30LightingBudget: Readonly<Record<C2DeepLayer, Readonly<{
  warmPools: number;
  selfLitOnly: boolean;
  note: string;
}>>> = Object.freeze({
  minus140: Object.freeze({ warmPools: 1, selfLitOnly: false,
    note: '青蓝水 + 少量火；泵房暖池由 U-17 宿主预算供给' }),
  minus165: Object.freeze({ warmPools: 2, selfLitOnly: false,
    note: '酒馆壁炉+吧台两处暖池，月光石/冷焰自发光，不铺满小灯' }),
  minus190: Object.freeze({ warmPools: 0, selfLitOnly: true,
    note: '火盆已冷；暗金/石青/门前晶辉仅自发光色块' }),
});

export type C2SeamResolution = Readonly<{
  layer: C2DeepLayer;
  resolved: false;
  reason: 'no-certified-frame';
  local: C2LocalFrame;
}> | Readonly<{
  layer: C2DeepLayer;
  resolved: true;
  worldEntry: Readonly<{ east: number; height: number; north: number }>;
  worldExit: Readonly<{ east: number; height: number; north: number }>;
  frame: C2CertifiedLayerFrame;
}>;

/**
 * Resolve a layer's local entry/exit into the world ONLY with a C-certified
 * frame. Fails closed otherwise — never extrapolates depth from the layer id.
 */
export function resolveSeam(
  layer: C2DeepLayer,
  certified?: C2CertifiedLayerFrame,
): C2SeamResolution {
  const local = c2R30LayerFrames[layer];
  if (!certified || certified.layer !== layer || certified.status !== 'c-certified' ||
    !certified.certifiedBy.trim() ||
    ![certified.worldOffset.east, certified.worldOffset.height, certified.worldOffset.north, certified.yaw]
      .every(Number.isFinite)) {
    return Object.freeze({ layer, resolved: false as const, reason: 'no-certified-frame', local });
  }
  const transform = (point: Readonly<{ east: number; north: number }>) => {
    const x = point.east, z = -point.north;
    const cos = Math.cos(certified.yaw), sin = Math.sin(certified.yaw);
    return Object.freeze({
      east: certified.worldOffset.east + x * cos + z * sin,
      height: certified.worldOffset.height + local.floorDatum,
      north: certified.worldOffset.north - (x * sin - z * cos),
    });
  };
  return Object.freeze({
    layer,
    resolved: true as const,
    worldEntry: transform(local.localEntry),
    worldExit: transform(local.localExit),
    frame: certified,
  });
}

/** True when a seam link may be wired in production: both ends certified. */
export function canWireSeam(
  link: C2SeamLink,
  frames: Readonly<Partial<Record<C2DeepLayer, C2CertifiedLayerFrame>>>,
): boolean {
  if (!link.requiresCertifiedFrames) return true;
  if (frames[link.from]?.status !== 'c-certified') return false;
  if (link.to === 'surface-return') return true;
  return frames[link.to]?.status === 'c-certified';
}

/** Audit summary for the handoff; no rendering, no mutation. */
export function c2R30SeamAudit(frames: Readonly<Partial<Record<C2DeepLayer, C2CertifiedLayerFrame>>> = {}) {
  const layers = (Object.keys(c2R30LayerFrames) as C2DeepLayer[]).map(layer => ({
    layer,
    depth: c2R30LayerFrames[layer].depthMetres,
    frameStatus: frames[layer]?.status ?? 'local-fixture',
    resolution: resolveSeam(layer, frames[layer]),
  }));
  const links = c2R30SeamLinks.map(link => ({
    id: link.id, from: link.from, to: link.to, kind: link.kind,
    wireable: canWireSeam(link, frames),
  }));
  return Object.freeze({
    layers: Object.freeze(layers),
    links: Object.freeze(links),
    allLocalFixtures: layers.every(item => item.frameStatus === 'local-fixture'),
    productionReady: links.every(item => item.wireable),
    claim: 'C2 deep layers are local fixtures; production wiring requires C-certified frames.',
  });
}
