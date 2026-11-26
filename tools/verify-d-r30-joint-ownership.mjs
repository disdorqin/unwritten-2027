// Exact A snapshot, D working-tree candidates. Does not modify A's branch.
import {execFileSync} from 'node:child_process';
import {cpSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Group} from 'three';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='tools/voxel-tavern/town-blockout/';
const git=(...a)=>execFileSync('git',a,{cwd:root,windowsHide:true,maxBuffer:96*1024*1024});
const a=git('rev-parse',process.argv[2]??'335c77a2').toString().trim();
const tmp=mkdtempSync(join(root,'.d-r30-joint-proof-'));
try{
 const tar=git('archive','--format=tar',a,prefix,'src','tools/fixtures','docs/p0-layout-draft.json');
 execFileSync('tar',['-xf','-','-C',tmp],{input:tar,windowsHide:true,maxBuffer:96*1024*1024});
 for(const name of ['front-ridge','forest','road-survey','roadbed','cable-facilities','cloud-terrace','protected-approach'])cpSync(join(root,prefix,'town-d-r30-'+name+'.ts'),join(tmp,prefix,'town-d-r30-'+name+'.ts'));
 const load=n=>import(pathToFileURL(join(tmp,prefix,n+'.ts')).href);
 const {createTerrainGrid,worldBounds}=await load('terrain');
 const {mountWestCraterRoad}=await load('town-za22-crater-road');
 const {createTownRailway}=await load('town-railway');
 const {buildCraterRailExtension}=await load('town-crater-rail-extension');
 const {createAR30RidgeOwnership}=await load('town-a-r30-ridge-ownership');
 const {buildFrontRidgeR30Field,proposeRidgeCloudApronOwnership}=await load('town-d-r30-front-ridge');
 const {mountRidgeCableFacilities,auditRidgeCableSweep,surveyRidgeCableSpans}=await load('town-d-r30-cable-facilities');
 const {mountRidgeCloudTerrace,ridgeCloudHandoff,ridgeCloudFootAt}=await load('town-d-r30-cloud-terrace');
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),railway=createTownRailway(grid,()=>0),loop=railway.route;
 const rail=buildCraterRailExtension(grid,road,loop.points),ownership=createAR30RidgeOwnership({loop:loop.points,branch:rail.samples});
 const proposed=process.argv.includes('--proposed-apron');
 const proposal=proposeRidgeCloudApronOwnership(ownership.weight,ownership.distance);
 const aMask=process.argv.includes('--a-approved-apron')?createAR30RidgeOwnership({loop:loop.points,branch:rail.samples,cloudApron:true}):undefined;
 const weight=aMask?aMask.weight:proposed?proposal:ownership.weight;
 const field=buildFrontRidgeR30Field(grid.groundHeightAt,weight);
 let changed=0,frozenError=0,proposalDifference=0;
 for(let n=270;n<=800;n++)for(let e=0;e<=640;e++){
  if(ownership.weight(e,n)===0)frozenError=Math.max(frozenError,Math.abs(field.vertexAt(e,n)-Math.fround(grid.groundHeightAt(e,n))));
  if(Math.abs(weight(e,n)-ownership.weight(e,n))>1e-8)changed++;
  if(aMask)proposalDifference=Math.max(proposalDifference,Math.abs(weight(e,n)-proposal(e,n)));
 }
 const owner=new Group(),cable=mountRidgeCableFacilities(owner,field),terrace=mountRidgeCloudTerrace(owner,field,cable.blocked);
 const h=ridgeCloudHandoff,targets=[h.terminal,...h.lookouts,h.assemblyVisitor,h.runway.start,h.runway.end,{...h.gate,north:h.gate.north-1}];
 const routes=targets.map(p=>{const path=terrace.survey(h.terminal,p,1.2);return {east:p.east,north:p.north,height:ridgeCloudFootAt(field,p.east,p.north),ground:field.heightAt(p.east,p.north),originalWeight:ownership.weight(p.east,p.north),weight:weight(p.east,p.north),distance:ownership.distance(p.east,p.north),points:path.length,range:path.length?[Math.min(...path.map(q=>q.height)),Math.max(...path.map(q=>q.height))]:[],allSupported:path.length>0&&path.every(q=>Math.abs(q.height-347)<.00001&&!terrace.blocked(q.east,q.north,q.height,.27))}});
 const gridProbes=[];for(let n=630;n<=666;n+=2)for(let e=286;e<=352;e+=2){if(field.heightAt(e,n)<346.999&&ownership.weight(e,n)>0)gridProbes.push({e,n,h:field.heightAt(e,n),d:ownership.distance(e,n)})}
 const roadProbes=[];for(let n=290;n<=400;n+=10)for(let e=290;e<=560;e+=10){const d=ownership.distance(e,n);if(d>8)roadProbes.push([e,n,Math.round(field.heightAt(e,n)*10)/10,Math.round(d)])}
 let approach,sweep=auditRidgeCableSweep(field,cable.survey),externalSweep,fullSweep; const external=surveyRidgeCableSpans(field,true);
 if(process.argv.includes('--approach')||process.argv.includes('--full-sweep')){
  const {surveyProtectedFootApproach}=await load('town-d-r30-protected-approach');
  const {layout,canEnter}=await load('terrain'),{extensionPlots}=await load('town-extension');
  const {buildRailwayStation}=await load('landmark-station');
  const {za22StationApproach}=await load('town-za22-cloud-route');
  const station=buildRailwayStation();
  const boxes=(station.userData.colliders??[]).map(b=>({min:[b.min[0]+526,b.min[1]+26,b.min[2]-329],max:[b.max[0]+526,b.max[1]+26,b.max[2]-329]}));
  const floors=(station.userData.floors??[]).map(b=>({min:[b.min[0]+526,b.min[1]+26,b.min[2]-329],max:[b.max[0]+526,b.max[1]+26,b.max[2]-329]}));
  const stationObstacle=(p,w,d,top)=>boxes.some(b=>p.east+w>b.min[0]&&p.east-w<b.max[0]&&-p.north+d>b.min[2]&&-p.north-d<b.max[2]&&p.height+top>b.min[1]&&p.height<b.max[1]);
  sweep=auditRidgeCableSweep(field,cable.survey,stationObstacle);
  externalSweep={...auditRidgeCableSweep(field,external,stationObstacle),length:external.length,maxTower:external.maxTower};
  const all=[...boxes,...floors,...railway.group.userData.colliders,...railway.group.userData.floors,...rail.group.userData.colliders,...rail.group.userData.floors],solidBins=new Map();
  for(const b of all)for(let e=Math.floor((b.min[0]-2)/8);e<=Math.floor((b.max[0]+2)/8);e++)for(let n=Math.floor((-b.max[2]-2)/8);n<=Math.floor((-b.min[2]+2)/8);n++){const k=e+','+n,v=solidBins.get(k)??[];v.push(b);solidBins.set(k,v)}
  const fullObstacle=(p,w,d,top)=>(solidBins.get(Math.floor(p.east/8)+','+Math.floor(p.north/8))??[]).some(b=>p.east+w>b.min[0]&&p.east-w<b.max[0]&&-p.north+d>b.min[2]&&-p.north-d<b.max[2]&&p.height+top>b.min[1]&&p.height<b.max[1]);
  fullSweep={scope:'A station + ring + branch AABBs only',indexedBoxes:all.length,original:auditRidgeCableSweep(field,cable.survey,fullObstacle),external:auditRidgeCableSweep(field,external,fullObstacle)};
  if(process.argv.includes('--approach')){
  const plots=[...layout.plots,...extensionPlots].filter(p=>p.id!=='railway-station');
  const rails=[...loop.points.map(p=>({east:p.x,north:-p.z,y:p.y})),...rail.samples,...rail.narrowSamples,...rail.sidingSamples],bins=new Map();
  for(const p of rails){const k=Math.floor(p.east/8)+','+Math.floor(p.north/8),b=bins.get(k)??[];b.push(p);bins.set(k,b)}
  const support=(e,n)=>{
   if(!canEnter(e,n))return;
   let y=field.heightAt(e,n)??grid.groundHeightAt(e,n);
   if(!Number.isFinite(y))return;
   for(const p of plots)if(Math.abs(e-p.origin[0])<=p.footprint[0]/2+.27&&Math.abs(n-p.origin[1])<=p.footprint[1]/2+.27)return;
   for(const b of floors)if(e>=b.min[0]&&e<=b.max[0]&&-n>=b.min[2]&&-n<=b.max[2]&&b.max[1]>=y&&b.max[1]<=y+.43)y=b.max[1];
   for(const b of boxes)if(e>=b.min[0]-.27&&e<=b.max[0]+.27&&-n>=b.min[2]-.27&&-n<=b.max[2]+.27&&y+.025<b.max[1]&&y+1.775>b.min[1])return;
   const cx=Math.floor(e/8),cz=Math.floor(n/8);
   for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const p of bins.get((cx+dx)+','+(cz+dz))??[]){
    if(Math.hypot(e-p.east,n-p.north)<2.1&&Math.abs(y-p.y)<3.1)return;
   }
   return y;
  };
  const from={east:290,north:300},to=za22StationApproach;
  const result=surveyProtectedFootApproach(support,from,to,{west:255,east:575,south:255,north:475});
  approach={scope:'conservative read-only geometry; no crossing grant, no production collision certification',from:{...from,height:support(from.east,from.north)},to:{...to,actualSupport:support(to.east,to.north)},...result};
  }
 }
 const stationSamples=[];for(let n=344;n<=376;n+=2)for(let e=514;e<=550;e+=4)stationSamples.push([e,n,Math.round(field.heightAt(e,n)*100)/100,Math.round(ownership.distance(e,n)*10)/10]);
 const report={a,proposed,aApprovedApron:!!aMask,proposalDifference,changed,frozenError,routes,approach,sweep,externalSweep,fullSweep,stationSamples,gateSupported:ridgeCloudFootAt(field,h.gate.east,h.gate.north)!==undefined,cable:{length:cable.survey.length,towers:cable.survey.towers,maxTower:cable.survey.maxTower},gridProbes,roadProbes};
 if(process.argv[3]){const out=resolve(process.argv[3]);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2))}
 console.log(JSON.stringify({a,proposed,aApprovedApron:!!aMask,proposalDifference,changed,frozenError,routes,gateSupported:report.gateSupported,cable:report.cable,sweep,externalSweep,fullSweep,approach:approach&&{...approach,route:approach.route.length,length:approach.route.at(-1)?.cum},stationSamples:stationSamples.filter(p=>p[0]===526||p[0]===538),gridProbes:gridProbes.slice(0,12),roadProbes:roadProbes.slice(0,30)}));
 terrace.dispose();cable.dispose();
 if(aMask)assert.ok(proposalDifference<1e-12);
 if(proposed||aMask){assert.equal(frozenError,0);assert.ok(routes.every(r=>r.height===347&&r.allSupported));assert.equal(report.gateSupported,false)}
}finally{rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
