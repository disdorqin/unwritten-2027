// Read-only acceptance of the exact D2/C2 production source. No patches,
 // preview substitutes or guessed route authority. Run with node --import tsx.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=process.cwd(),d=resolve(root,process.env.A31_D2_ROOT??'../window-d2'),c=resolve(root,process.env.A31_C2_ROOT??'../window-c2');
const from=(r,name)=>import(pathToFileURL(resolve(r,'tools/voxel-tavern/town-blockout',name+'.ts')).href);
const sha=r=>execFileSync('git',['-C',r,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const {createTownD2R30ProductionHost}=await from(d,'town-d2-r30-production-host');
const {createSouthSectorInstaller,createWestSectorInstaller}=await from(d,'town-d2-r30-sector-installers');
const {createC2EastProduction}=await from(c,'town-night-c2-summit-east-production');
const host=createTownD2R30ProductionHost();
const issues=[];
const report={A:sha(root),D2:sha(d),C2:sha(c)};
try{
 host.install('A',createSouthSectorInstaller());
 host.install('B',createWestSectorInstaller());
 if(!host.installed().includes('C2'))host.install('C2',port=>{
  const east=createC2EastProduction({heightAt:port.groundAt});
  east.install(port.owner);
  return {sector:'C2',group:east.group,supportAt:east.topAt,blocked:east.blocked,updateView:east.updateView,setNight:east.setNight,dispose:east.dispose};
 });
 report.live=host.sectorLiveCheck();
 if(!report.live.ready)issues.push('Four-sector live check failed');
 const south=host.package('A');
 let incorrect=0,max=0,worst;
 for(const p of host.trail.slice(2,834)){
  const cut=south.cutGroundAt?.(p.east,p.north)??south.groundAt?.(p.east,p.north);
  const deck=south.deckAt?.(p.east,p.north)??south.supportAt?.(p.east,p.north);
  const actual=host.supportAt(p.east,p.north);
  if(!Number.isFinite(deck)||!Number.isFinite(actual)){incorrect++;continue;}
  const error=Math.abs(actual-deck);
  if(error>.001){incorrect++;if(error>max){max=error;worst={p,cut,deck,actual};}}
 }
 report.southRoad={samples:832,incorrect,max,worst};
 if(incorrect)issues.push('Host support differs from actual southern road');
 // A rejected C2 install must not restore A/B cut buffers to pre-cut
 // geometry. Test only on the existing real host, not a fake terrain.
 host.uninstall('C2');
 const before=host.tiles.map(t=>t.geometry);
 try{host.install('C2',port=>{throw Error('intentional installer refusal');});issues.push('Rejected installer succeeded');}catch{}
 report.rollbackChangedTiles=host.tiles.filter((t,i)=>t.geometry!==before[i]).length;
 if(report.rollbackChangedTiles)issues.push('Failed installer altered prior sector cut tiles');
 report.stats=host.stats().sectors;
}finally{host.dispose();}
console.log(JSON.stringify({...report,issues},null,2));
if(issues.length)process.exitCode=1;
