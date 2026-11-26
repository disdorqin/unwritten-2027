export type Friend3DecorKind = 'lantern' | 'postcard';
export type Friend3DecorVariant = 0 | 1 | 2;

export type Friend3DecorAnchor = {
  readonly id: string;
  readonly kind: Friend3DecorKind;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotationY: number;
};

export const FRIEND3_DECOR_ANCHORS = [
  { id: 'lantern-1', kind: 'lantern', label: '横梁挂点 1', x: -2.0, y: 2.42, z: 0.42, rotationY: 0 },
  { id: 'lantern-2', kind: 'lantern', label: '横梁挂点 2', x: -1.0, y: 2.42, z: 0.42, rotationY: 0 },
  { id: 'lantern-3', kind: 'lantern', label: '横梁挂点 3', x: 0.0, y: 2.42, z: 0.42, rotationY: 0 },
  { id: 'lantern-4', kind: 'lantern', label: '横梁挂点 4', x: 1.0, y: 2.42, z: 0.42, rotationY: 0 },
  { id: 'lantern-5', kind: 'lantern', label: '横梁挂点 5', x: 2.0, y: 2.42, z: 0.42, rotationY: 0 },
  { id: 'postcard-1', kind: 'postcard', label: '墙面贴点 1', x: -1.6, y: 1.55, z: 0.13, rotationY: 0 },
  { id: 'postcard-2', kind: 'postcard', label: '墙面贴点 2', x: -0.8, y: 1.55, z: 0.13, rotationY: 0 },
  { id: 'postcard-3', kind: 'postcard', label: '墙面贴点 3', x: 0.0, y: 1.55, z: 0.13, rotationY: 0 },
  { id: 'postcard-4', kind: 'postcard', label: '墙面贴点 4', x: 0.8, y: 1.55, z: 0.13, rotationY: 0 },
  { id: 'postcard-5', kind: 'postcard', label: '墙面贴点 5', x: 1.6, y: 1.55, z: 0.13, rotationY: 0 },
] as const satisfies readonly Friend3DecorAnchor[];

export const FRIEND3_DECOR_VARIANT_LABELS = {
  lantern: ['朱红', '暖橙', '晶青'],
  postcard: ['雪夜', '灯火', '星尘'],
} as const;

export const FRIEND3_DECOR_VARIANT_COLORS = {
  lantern: ['#c05b4d', '#e9a35a', '#7fd4c8'],
  postcard: ['#4f7f9b', '#d9b36a', '#7fd4c8'],
} as const;

export type Friend3DecorPlacement = {
  anchorId: string;
  kind: Friend3DecorKind;
  variant: Friend3DecorVariant;
  order: number;
};

export type Friend3DecorPlaceResult =
  | { kind: 'placed'; placement: Friend3DecorPlacement }
  | { kind: 'rejected'; reason: 'unknown-anchor' | 'kind-mismatch' | 'invalid-variant' | 'occupied' };

export type Friend3DecorSnapshot = {
  placements: Friend3DecorPlacement[];
  counts: Record<Friend3DecorKind, number>;
  occupied: string[];
};

function rejected(reason: Extract<Friend3DecorPlaceResult, { kind: 'rejected' }>['reason']): Friend3DecorPlaceResult {
  return { kind: 'rejected', reason };
}

export function createFriend3DecorBoard() {
  const placements = new Map<string, Friend3DecorPlacement>();
  let nextOrder = 1;

  function place(anchorId: string, kind: Friend3DecorKind, variant: Friend3DecorVariant): Friend3DecorPlaceResult {
    const anchor = FRIEND3_DECOR_ANCHORS.find(item => item.id === anchorId);
    if (!anchor) return rejected('unknown-anchor');
    if (anchor.kind !== kind) return rejected('kind-mismatch');
    if (variant !== 0 && variant !== 1 && variant !== 2) return rejected('invalid-variant');
    if (placements.has(anchorId)) return rejected('occupied');
    const placement: Friend3DecorPlacement = { anchorId, kind, variant, order: nextOrder };
    nextOrder += 1;
    placements.set(anchorId, placement);
    return { kind: 'placed', placement: { ...placement } };
  }

  function remove(anchorId: string): Friend3DecorPlacement | undefined {
    const placement = placements.get(anchorId);
    if (!placement) return undefined;
    placements.delete(anchorId);
    return { ...placement };
  }

  function undo(): Friend3DecorPlacement | undefined {
    let latest: Friend3DecorPlacement | undefined;
    for (const placement of placements.values()) {
      if (!latest || placement.order > latest.order) latest = placement;
    }
    if (!latest) return undefined;
    placements.delete(latest.anchorId);
    return { ...latest };
  }

  function clear(): number {
    const count = placements.size;
    placements.clear();
    return count;
  }

  function isOccupied(anchorId: string): boolean {
    return placements.has(anchorId);
  }

  function snapshot(): Friend3DecorSnapshot {
    const list = [...placements.values()]
      .sort((left, right) => left.order - right.order)
      .map(placement => ({ ...placement }));
    return {
      placements: list,
      counts: {
        lantern: list.filter(placement => placement.kind === 'lantern').length,
        postcard: list.filter(placement => placement.kind === 'postcard').length,
      },
      occupied: list.map(placement => placement.anchorId),
    };
  }

  return { place, remove, undo, clear, isOccupied, snapshot };
}

export type Friend3DecorBoard = ReturnType<typeof createFriend3DecorBoard>;