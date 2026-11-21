/**
 * Compatibility export for voxel review modules. The canonical cable repair
 * reducer is src/shared/za36-cable-repair.ts, compiled under NodeNext rootDir.
 * Both scene and server now consume the same logic instead of duplicating it.
 */
export {
  createZa36CableRepair,
  type Za36CableRepairLine,
  type Za36CableRepairStage,
  type Za36CableRepairState,
  type Za36CableRepairEvent,
} from '../../../src/shared/za36-cable-repair';
