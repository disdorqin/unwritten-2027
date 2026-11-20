import type {
  UndergroundMiningCore, UndergroundMiningPoint, UndergroundMiningReceipt, UndergroundMiningTargetView,
} from '../../../src/shared/underground-mining';

type Intent = Readonly<{ action: 'strike' | 'pickup'; targetId: string }>;
type LayerSnapshot = Readonly<{
  targets: readonly UndergroundMiningTargetView[];
  cores: readonly UndergroundMiningCore[];
}>;
type StrikeReceipt = Extract<UndergroundMiningReceipt, { action: 'strike' }>;
type Options = Readonly<{
  aimedTarget(): string | undefined;
  heldPickaxe(): boolean;
  request(intent: Intent): void;
  showTarget(target: UndergroundMiningTargetView): void;
  hideTarget(targetId: string): void;
  showCore(core: UndergroundMiningCore): void;
  hideCore(coreId: string): void;
  onStrike?(receipt: StrikeReceipt): void;
}>;

function samePoint(a: UndergroundMiningPoint, b: UndergroundMiningPoint) {
  return a.layer === b.layer && a.east === b.east && a.north === b.north && a.height === b.height;
}

function sameTarget(a: UndergroundMiningTargetView, b: UndergroundMiningTargetView) {
  return a.kind === b.kind && a.surface === b.surface && a.mineral === b.mineral &&
    a.strikes === b.strikes && a.hits === b.hits &&
    a.open === b.open && a.regrowAt === b.regrowAt && samePoint(a.at, b.at);
}

function sameCore(a: UndergroundMiningCore, b: UndergroundMiningCore) {
  return a.mineral === b.mineral && a.amount === b.amount && samePoint(a.at, b.at);
}

/** Wire into the host's aim and E action resolver, and apply mining frames in transport order. */
export function mountUndergroundMiningActivity(options: Options) {
  let layer: string | undefined;
  let disposed = false;
  const targets = new Map<string, UndergroundMiningTargetView>();
  const cores = new Map<string, UndergroundMiningCore>();

  function updateTarget(target: UndergroundMiningTargetView) {
    const last = targets.get(target.id);
    if (last && sameTarget(last, target)) return false;
    targets.set(target.id, target);
    options.showTarget(target);
    return true;
  }

  function updateCore(core: UndergroundMiningCore) {
    const last = cores.get(core.id);
    if (last && sameCore(last, core)) return false;
    cores.set(core.id, core);
    options.showCore(core);
    return true;
  }

  function removeTarget(id: string) {
    if (targets.delete(id)) options.hideTarget(id);
  }

  function removeCore(id: string) {
    if (cores.delete(id)) options.hideCore(id);
  }

  function clearLayer() {
    for (const id of targets.keys()) removeTarget(id);
    for (const id of cores.keys()) removeCore(id);
  }

  return {
    /** Call when the authoritative active layer changes. */
    setLayer(activeLayer?: string) {
      if (disposed || layer === activeLayer) return;
      clearLayer();
      layer = activeLayer;
    },
    /** Reconnect and regrowth snapshots project the current state without replaying strikes. */
    sync(snapshot: LayerSnapshot, snapshotLayer = layer) {
      if (disposed || layer === undefined || snapshotLayer !== layer) return;
      const nextTargets = new Set<string>();
      for (const target of snapshot.targets) {
        if (target.at.layer !== layer) continue;
        nextTargets.add(target.id);
        updateTarget(target);
      }
      for (const id of targets.keys()) if (!nextTargets.has(id)) removeTarget(id);

      const nextCores = new Set<string>();
      for (const core of snapshot.cores) {
        if (core.at.layer !== layer) continue;
        nextCores.add(core.id);
        updateCore(core);
      }
      for (const id of cores.keys()) if (!nextCores.has(id)) removeCore(id);
    },
    /** Feed ordered live receipts from the host's accepted mining event channel. */
    receive(receipt: UndergroundMiningReceipt): boolean {
      if (disposed || layer === undefined) return false;
      if (receipt.action === 'pickup') {
        if (receipt.core.at.layer !== layer || !cores.has(receipt.core.id)) return false;
        removeCore(receipt.core.id);
        return true;
      }
      if (receipt.target.at.layer !== layer || receipt.sound.at.layer !== layer) return false;
      if (!updateTarget(receipt.target)) return false;
      if (receipt.core?.at.layer === layer) updateCore(receipt.core);
      options.onStrike?.(receipt);
      return true;
    },
    primaryInput(): boolean {
      if (disposed || layer === undefined || !options.heldPickaxe()) return false;
      const targetId = options.aimedTarget();
      if (!targetId) return false;
      const target = targets.get(targetId);
      if (!target || target.open) return false;
      options.request({ action: 'strike', targetId });
      return true;
    },
    pickup(coreId: string): boolean {
      if (disposed || layer === undefined || !cores.has(coreId)) return false;
      options.request({ action: 'pickup', targetId: coreId });
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearLayer();
    },
  };
}
