import { Group } from 'three';
import { createTownC2SecondMineUpperRelief } from './town-c2-second-mine-upper-relief.js';
import { buildTownC2SecondMineNearBankTeeth } from './town-c2-second-mine-near-bank-teeth.js';
import { build as buildFarBankCrystals } from './town-c2-second-mine-far-bank-crystals.js';
import { buildTownC2SecondMineBypassWall } from './town-c2-second-mine-bypass-wall.js';
import { buildTownC2SecondMineTimbering } from './town-c2-second-mine-timbering.js';
import { buildTownC2SecondMineHaulage } from './town-c2-second-mine-haulage.js';
import { buildC2SecondMineCampLife } from './town-c2-second-mine-camp-life.js';
import { buildC2SecondMineLightSources } from './town-c2-second-mine-light-sources.js';

export function buildTownC2SecondMinePrefab(owner?: Group) {
  const root = new Group();
  root.name = 'town-c2-second-mine-prefab';
  root.userData.visualOnly = true;
  root.userData.domainRegistered = false;
  root.userData.coordinateFrame = 'second-mine-local-east-up-north';

  const upperRelief = createTownC2SecondMineUpperRelief();
  const nearBankTeeth = buildTownC2SecondMineNearBankTeeth();
  const farBankCrystals = buildFarBankCrystals();
  const bypassWall = buildTownC2SecondMineBypassWall();
  const timbering = buildTownC2SecondMineTimbering();
  const haulage = buildTownC2SecondMineHaulage();
  const campLife = buildC2SecondMineCampLife();
  const lightSources = buildC2SecondMineLightSources();

  const modules = Object.freeze({
    upperRelief, nearBankTeeth, farBankCrystals, bypassWall,
    timbering, haulage, campLife, lightSources,
  });
  for (const module of Object.values(modules)) root.add(module.group);
  root.updateMatrixWorld(true);
  root.traverse(object => { object.matrixAutoUpdate = false; });

  function stats() {
    const moduleStats = Object.freeze({
      upperRelief: upperRelief.stats(),
      nearBankTeeth: nearBankTeeth.stats,
      farBankCrystals: farBankCrystals.stats(),
      bypassWall: bypassWall.stats(),
      timbering: timbering.stats,
      haulage: haulage.stats,
      campLife: campLife.stats(),
      lightSources: lightSources.stats(),
    });
    const pieceCount = upperRelief.stats().voxelCount + nearBankTeeth.stats.pieceCount +
      farBankCrystals.stats().pieceCount + bypassWall.stats().pieces +
      timbering.stats.pieceCount + haulage.stats.guardedEntityCount + haulage.stats.cartCount +
      campLife.stats().pieceCount + lightSources.stats().pieceCount;
    return Object.freeze({
      moduleCount: Object.keys(modules).length,
      pieceCount,
      realLightCount: lightSources.lights.length,
      visualOnly: true,
      domainRegistered: false,
      modules: moduleStats,
    });
  }

  root.userData.stats = stats();
  let night = false;
  let disposed = false;
  function setNight(value: boolean) {
    if (disposed) return;
    const nextNight = !!value;
    if (night === nextNight) return;
    night = nextNight;
    upperRelief.setNight(night);
    farBankCrystals.setNight(night);
    lightSources.setNight(night);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const module of Object.values(modules)) module.dispose();
    root.removeFromParent();
    root.clear();
  }
  owner?.add(root);
  return Object.freeze({ group: root, modules, stats, setNight, dispose });
}
