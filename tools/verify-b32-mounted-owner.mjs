import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {Box3,Group,Vector3} from 'three';
import {mountNightBPublicRearCable} from './voxel-tavern/town-blockout/town-night-b-public-rear-cable.ts';
import {mountNorthRidgeMiddleStation} from './voxel-tavern/town-blockout/north-ridge-middle-station.ts';
import {createNightBMountedClearance} from './voxel-tavern/town-blockout/town-night-b-mounted-clearance.ts';
import {createTownD2R30Ropeway} from './voxel-tavern/town-blockout/town-d2-r30-ropeway.ts';
import {auditNightBSummitCable} from './voxel-tavern/town-blockout/town-night-b-summit-line2-service.ts';
import {auditNightBFrontOpenFacilities} from './voxel-tavern/town-blockout/town-night-b-summit-front-sweep.ts';
import {mountRidgeCableFacilities} from './voxel-tavern/town-blockout/town-d-r30-cable-facilities.ts';
const here=fileURLToPath(new URL('../',import.meta.url));
const paired=path.resolve(here,'../window-a-a0-a6'),expected=process.argv[3];
const git=(...args)=>execFileSync('git',['-C',paired,...args],{encoding:'utf8'}).trim();
assert.ok(expected&&git('rev-parse','HEAD')===expected&&git('status','--porcelain','--untracked-files=no')==='','Paired A owner must be exact tracked-clean SHA');
const load=name=>import(pathToFileURL(path.join(paired,'tools','voxel-tavern','town-blockout',name+'.ts')).href);
const scope=process.argv[2];
if(scope==='rear'||scope==='rear-mount'){
 const [{createTownD2R30ProductionHost},{createSouthSectorInstaller,createWestSectorInstaller,createEastSectorInstaller},{retireA31LegacySectorOverlays}]=await Promise.all([load('town-d2-r30-production-host'),load('town-d2-r30-sector-installers'),load('town-a31-summit-visual-ownership')]);
 const host=createTownD2R30ProductionHost({includeRopeway:false});
 try{
  host.install('A',createSouthSectorInstaller());host.install('B',createWestSectorInstaller());host.install('C2',createEastSectorInstaller());
  const visual=retireA31LegacySectorOverlays(host.group);
  if(scope==='rear-mount'){
   const old=host.group.getObjectByName('main-summit-machine-room');assert.ok(old);const oldParent=old.parent;old.removeFromParent();
   const originalPaint=host.group.getObjectByName('main-summit-paint')?.geometry;
   const result=mountNightBPublicRearCable({owner:host.group,groundAt:host.surfaceAt,supportAt:host.supportAt,
    blocked:(e,n,h,r,b)=>host.blocked(e,n,h,r,b)||!!host.assembly.northWall?.blocked(e,n,h,r,b),
    groundMeshes:host.tiles,authorized:true,authority:{state:()=>undefined,now:()=>undefined,daylight:()=>undefined,firstRun:{wokeAt:()=>undefined,openedAt:()=>undefined,dawnEpoch:()=>undefined}},
    certifyRoutes:()=>false});
   console.log(JSON.stringify({scope:'actual four-sector host, legacy room physically detached in paired ephemeral object, B real mount, route gate deliberately refused',paired:expected,result:result.ready?{ready:true}:result,paintRestored:host.group.getObjectByName('main-summit-paint')?.geometry===originalPaint,remainingCable:!!host.group.getObjectByName('night-b-public-rear-cable')}));
   if(result.ready)result.dispose();oldParent.add(old);
  }else{
  const ropeway=createTownD2R30Ropeway({heightAt:host.surfaceAt,controlPointSupports:false});
  const corridor=ropeway.cable.ropes.flatMap(r=>r.points.slice(1).map((p,i)=>{const a=r.points[i];return new Box3().setFromPoints([new Vector3(a.east,a.height,-a.north),new Vector3(p.east,p.height,-p.north)]).expandByScalar(5)}));
  const scan=createNightBMountedClearance(host.group,host.tiles,corridor);
  try{
   const first={};const audit=auditNightBSummitCable(ropeway,host.surfaceAt,p=>{const name=scan.firstHit(p);if(name){first[name]??=p;return true;}return false;});
   console.log(JSON.stringify({scope:'actual A four-sector production owner, final rendered triangle sweep; legacy machine room retained; no service certification or walking claim',paired:expected,live:host.sectorLiveCheck(),visual:{removedTrailTriangles:visual.removedTrailTriangles,removedForestInstances:visual.removedForestInstances},audit,meshAudit:scan.stats(),first}));
  }finally{ropeway.dispose();}
  }
 }finally{host.dispose();}
}else if(scope==='front'){
 const [{createTerrainGrid,worldBounds},{mountWestCraterRoad},{createTownRailway},{buildCraterRailExtension},{mountProductionRidge},{buildRailwayStation}]=await Promise.all([load('terrain'),load('town-za22-crater-road'),load('town-railway'),load('town-crater-rail-extension'),load('town-d-r30-production-ridge'),load('landmark-station')]);
 const grid=createTerrainGrid(),root=new Group(),west=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),rail=createTownRailway(grid,()=>0),branch=buildCraterRailExtension(grid,west,rail.route.points),hall=buildRailwayStation();
 hall.position.set(526,26,-329);root.add(rail.group,branch.group,hall);
 const ridge=mountProductionRidge(root,grid,{loop:rail.route.points,branch:branch.samples});
 assert.ok(ridge.facilities&&ridge.serviceExit);
 // Replace only the old station's rendered body in this ephemeral paired owner.
 const old=root.getObjectByName('north-ridge-middle-station');assert.ok(old);old.removeFromParent();const revised=mountNorthRidgeMiddleStation(root);
 const scan=createNightBMountedClearance(root,[ridge.model.group,ridge.facilities.group]),stage=new Group(),op=mountRidgeCableFacilities(stage,ridge.field,true,false,true);
 try{
  const first={};const audit=auditNightBFrontOpenFacilities(ridge.field,op,(feet,w,d,top)=>{const name=scan.firstHit({feet,heading:0,halfWidth:w,halfLength:d,bodyTop:top});if(name){first[name]??=feet;return true;}return false;});
  console.log(JSON.stringify({scope:'actual A front production owner including railway, with exact B replacement middle station body; actual mounted triangle scan, not route certification or ordinary entry',paired:expected,audit,meshAudit:scan.stats(),first,roads:ridge.roads.map(r=>r.route.at(-1)?.cum)}));
 }finally{op.dispose();revised.dispose();}
}else throw Error('Choose front or rear');
assert.equal(git('rev-parse','HEAD'),expected);assert.equal(git('status','--porcelain','--untracked-files=no'),'');
