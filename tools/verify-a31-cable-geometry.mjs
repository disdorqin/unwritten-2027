// A31 actual host geometry review. Does not grant transport permission.
import {Group} from 'three';
import {createTownD2R30ProductionHost} from './voxel-tavern/town-blockout/town-d2-r30-production-host.ts';
import {createSouthSectorInstaller,createWestSectorInstaller,createEastSectorInstaller} from './voxel-tavern/town-blockout/town-d2-r30-sector-installers.ts';
import {createTownD2R30Ropeway} from './voxel-tavern/town-blockout/town-d2-r30-ropeway.ts';
import {createTownD2R30CableTowers} from './voxel-tavern/town-blockout/town-d2-r30-cable-towers.ts';
import {mountMainSummitCableWorkshop,mainSummitR30CableWorkshopAnchor} from './voxel-tavern/town-blockout/main-summit-cable-workshop.ts';
import {auditNightBSummitCable} from './voxel-tavern/town-blockout/town-night-b-summit-line2-service.ts';
import {execFileSync} from 'node:child_process';
const host=createTownD2R30ProductionHost();
const stage=new Group();
let r,t,w,clock;
try{
 host.install('A',createSouthSectorInstaller());host.install('B',createWestSectorInstaller());host.install('C2',createEastSectorInstaller());
 r=createTownD2R30Ropeway({heightAt:host.surfaceAt,arrivalHeight:347,epochMs:0,controlPointSupports:false});
 t=createTownD2R30CableTowers({heightAt:host.surfaceAt,cable:r.cable,arrivalHeight:347});
 stage.add(r.group,t.group);
 w=mountMainSummitCableWorkshop(stage,host.surfaceAt,mainSummitR30CableWorkshopAnchor);
 clock=r.claimOperationalClock();
 const full=process.env.A31_FULL_SWEEP==='1';
 let hostHits=0,ownHits=0,probes=0,skipped=0,firstHost,firstOwn;
 const audit=auditNightBSummitCable(r,host.surfaceAt,p=>{
  // The default diagnostic keeps the complete ground sweep but stops
  // repeating the expensive external search after its first confirmed hit.
  // It can NEVER certify an envelope. Set A31_FULL_SWEEP=1 for full scan.
  if(!full&&(firstHost||firstOwn)){skipped++;return true;}
  let actual=false,own=false;
  for(let i=0;i<=6;i++)for(let j=0;j<=8;j++){
   const x=(i/3-1)*p.halfWidth,z=(j/4-1)*p.halfLength,e=p.feet.east+x*Math.cos(p.heading)+z*Math.sin(p.heading),n=p.feet.north-x*Math.sin(p.heading)+z*Math.cos(p.heading),h=p.feet.height;
   if(host.blocked(e,n,h,.025,p.bodyTop)||host.assembly.northWall?.blocked(e,n,h,.025,p.bodyTop))actual=true;
   if(r.blocked(e,n,h,.025,p.bodyTop)||t.blocked(e,n,h,.025,p.bodyTop)||w.blocked(e,n,h,.025,p.bodyTop))own=true;
   probes++;
  }
  if(actual){hostHits++;firstHost??=p;}if(own){ownHits++;firstOwn??=p;}return actual||own;
 });
 const docks=['cloud-deck','summit'].flatMap(station=>r.cable.ropes.flatMap((rope,cabin)=>Object.entries(rope.dock(station)).filter(([k])=>k==='board'||k==='approach').map(([role,foot])=>{
  const h=host.supportAt(foot.east,foot.north),deck=r.supportAt(foot.east,foot.north,.27);
  return {station,cabin,role,foot,ground:host.surfaceAt(foot.east,foot.north),support:h,ropewayDeck:deck,
   blocked:host.blocked(foot.east,foot.north,foot.height,.27,1.8)||!!host.assembly.northWall?.blocked(foot.east,foot.north,foot.height,.27,1.8),
   ownBlocked:r.blocked(foot.east,foot.north,foot.height,.27,1.8)||t.blocked(foot.east,foot.north,foot.height,.27,1.8)||w.blocked(foot.east,foot.north,foot.height,.27,1.8)};
 })));
 console.log(JSON.stringify({source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),scope:'actual D2 four-sector terrain plus B staged ropeway/towers/workshop; central visual-only facilities lack complete collision contract; NOT a certified public route',audit:{...audit,candidateEnvelopeClear:false,externalSurveyComplete:skipped===0,obstacleHits:skipped?null:audit.obstacleHits},hostHits,ownHits,probes,skipped,firstHost,firstOwn,docks,towers:t.stats(),gateDuplicates:{A:!!host.group.getObjectByName('night-a-south-entry'),B:!!r.stations},boardable:host.cableState().boardable},null,2));
}finally{clock?.release();w?.dispose();t?.dispose();r?.dispose();host.dispose();}
