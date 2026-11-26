// Exact D source and A candidate mask, no production mount or cross-domain grant.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Group} from 'three';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='tools/voxel-tavern/town-blockout/';
const git=(...a)=>execFileSync('git',a,{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
const sha=r=>git('rev-parse',r).toString().trim(),a=sha('HEAD'),externalDock=process.argv.includes('--external-dock'),d=sha(externalDock?'a8c9f8a4':'cb9502d0');
const files=['front-ridge','forest','road-survey','roadbed','cable-facilities','cloud-terrace','protected-approach'].map(n=>'town-d-r30-'+n+'.ts');
const report={a,d,scope:'exact-source candidate only',files:[],success:false};
const tmp=mkdtempSync(join(root,'.a-r30-apron-proof-'));
try{
 assert.equal(git('status','--porcelain','--',prefix,'src').toString().trim(),'');
 for(const p of ['north-ridge-350-terrain.ts','town-front-ridge-surface.ts'])assert.equal(sha(a+':'+prefix+p),sha(d+':'+prefix+p));
 cpSync(join(root,prefix),join(tmp,prefix),{recursive:true});
 cpSync(join(root,'src'),join(tmp,'src'),{recursive:true});
 cpSync(join(root,'tools','fixtures'),join(tmp,'tools','fixtures'),{recursive:true});
 mkdirSync(join(tmp,'docs'),{recursive:true});cpSync(join(root,'docs','p0-layout-draft.json'),join(tmp,'docs','p0-layout-draft.json'));
 for(const p of files){writeFileSync(join(tmp,prefix,p),git('show',d+':'+prefix+p));report.files.push({path:p,blob:sha(d+':'+prefix+p)});}
 const load=n=>import(pathToFileURL(join(tmp,prefix,n+'.ts')).href);
 const {createTerrainGrid,worldBounds}=await load('terrain');
 const {mountWestCraterRoad}=await load('town-za22-crater-road');
 const {createTownRailway}=await load('town-railway');
 const {buildCraterRailExtension}=await load('town-crater-rail-extension');
 const {createAR30RidgeOwnership}=await load('town-a-r30-ridge-ownership');
 const {buildFrontRidgeR30Field,proposeRidgeCloudApronOwnership}=await load('town-d-r30-front-ridge');
 const {mountRidgeCableFacilities,auditRidgeCableSweep,externalCableDockSupport}=await load('town-d-r30-cable-facilities');
 const {supportFootprintOverlaps}=await load('town-a-r30-oriented-support');
 const {mountRidgeCloudTerrace,ridgeCloudHandoff,ridgeCloudFootAt}=await load('town-d-r30-cloud-terrace');
 const {buildRailwayStation}=await load('landmark-station');
 const g=createTerrainGrid(),r=mountWestCraterRoad(worldBounds.depth,n=>g.groundHeightAt(0,n)),ring=createTownRailway(g,()=>0),rail=buildCraterRailExtension(g,r,ring.route.points);
 const args={loop:ring.route.points,branch:rail.samples},old=createAR30RidgeOwnership(args),mask=createAR30RidgeOwnership({...args,cloudApron:true});
 const proposal=proposeRidgeCloudApronOwnership(old.weight,old.distance),field=buildFrontRidgeR30Field(g.groundHeightAt,mask.weight);
 let changed=0,zero=0,maxFrozen=0,maxProposal=0,outside=0,mid=0;
 for(let n=270;n<=800;n++)for(let e=0;e<=640;e++){
  const w=old.weight(e,n),v=mask.weight(e,n);maxProposal=Math.max(maxProposal,Math.abs(v-proposal(e,n)));
  if(w===0){zero++;maxFrozen=Math.max(maxFrozen,Math.abs(field.vertexAt(e,n)-Math.fround(g.groundHeightAt(e,n))));}
  if(Math.abs(w-v)>1e-8){changed++;if(e<270.5||e>368.5||n<637||n>683)outside++;}
  if(e>=425&&e<=455&&n>=508&&n<=532)mid=Math.max(mid,Math.abs(field.vertexAt(e,n)-140));
 }
 report.mask={changed,zero,maxFrozen,maxProposal,outside,mid};
 assert.equal(maxFrozen,0);assert.equal(outside,0);assert.ok(maxProposal<1e-12);assert.equal(mid,0);
 const owner=new Group(),cable=mountRidgeCableFacilities(owner,field,externalDock),terrace=mountRidgeCloudTerrace(owner,field,cable.blocked);
 try{
  const h=ridgeCloudHandoff,targets=[h.terminal,...h.lookouts,h.assemblyVisitor,h.runway.start,h.runway.end,{...h.gate,north:h.gate.north-1}];
  report.routes=targets.map(p=>{const path=terrace.survey(h.terminal,p,1.2);return {east:p.east,north:p.north,height:ridgeCloudFootAt(field,p.east,p.north),points:path.length,supported:path.length>0&&path.every(q=>Math.abs(q.height-347)<1e-5&&!terrace.blocked(q.east,q.north,q.height,.27))};});
  report.gateSupported=ridgeCloudFootAt(field,h.gate.east,h.gate.north)!==undefined;
  const station=buildRailwayStation(),boxes=[...station.userData.colliders,...station.userData.floors].map(b=>({min:[b.min[0]+526,b.min[1]+26,b.min[2]-329],max:[b.max[0]+526,b.max[1]+26,b.max[2]-329]}));
  // Binned exact A station and ring/branch solids for efficient envelope survey.
  const all=[...boxes,...ring.group.userData.colliders,...ring.group.userData.floors,...rail.group.userData.colliders,...rail.group.userData.floors],bins=new Map();
  for(const b of all)for(let e=Math.floor((b.min[0]-2)/8);e<=Math.floor((b.max[0]+2)/8);e++)for(let n=Math.floor((-b.max[2]-2)/8);n<=Math.floor((-b.min[2]+2)/8);n++){const k=e+','+n,v=bins.get(k)??[];v.push(b);bins.set(k,v);}
  const sweep=auditRidgeCableSweep(field,cable.survey,(p,w,d,top)=>(bins.get(Math.floor(p.east/8)+','+Math.floor(p.north/8))??[]).some(b=>p.east+w>b.min[0]&&p.east-w<b.max[0]&&-p.north+d>b.min[2]&&-p.north-d<b.max[2]&&p.height+top>b.min[1]&&p.height<b.max[1]));
  report.sweep={...sweep,scope:'conservative actual station+ring+branch AABB',indexedBoxes:all.length,maxTower:cable.survey.maxTower};
  if(externalDock){
   // Same actual old station assembly, protected H0 and opt-in D deck.
   const sf=station.userData.floors.map(b=>({min:[b.min[0]+526,b.min[1]+26,b.min[2]-329],max:[b.max[0]+526,b.max[1]+26,b.max[2]-329]}));
   const sc=station.userData.colliders.map(b=>({min:[b.min[0]+526,b.min[1]+26,b.min[2]-329],max:[b.max[0]+526,b.max[1]+26,b.max[2]-329]}));
   const footRadius=.27,body=1.8;
   let prev=g.heightAt(526,305),maxStep=0,minGround=Infinity,steps=0,blocked;
   const path=[];
   for(let i=0;i<=Math.ceil((354-305)/.08);i++){
    const n=Math.min(354,305+i*.08),e=526,h0=field.heightAt(e,n)??g.groundHeightAt(e,n);
    const support=externalCableDockSupport(e,n,footRadius),f=[h0,...(support===undefined?[]:[support])];
    for(const b of sf)if(supportFootprintOverlaps(e,n,b,footRadius)&&b.max[1]<=prev+.43)f.push(b.max[1]);
    const height=Math.max(...f.filter(h=>h<=prev+.43));
    const delta=Math.abs(height-prev);maxStep=Math.max(maxStep,delta);
    const obstruction=[...sc,...ring.group.userData.colliders,...rail.group.userData.colliders].some(b=>supportFootprintOverlaps(e,n,b,footRadius)&&b.max[1]>height+.025&&b.min[1]<height+body-.025)||cable.blocked(e,n,height,footRadius);
    if(!Number.isFinite(height)||delta>.43||obstruction){blocked={east:e,north:n,height,previous:prev,h0,support,obstruction};break;}
    if(support!==undefined)minGround=Math.min(minGround,h0);steps++;prev=height;
    if(i%25===0||n===354)path.push({east:e,north:n,height,h0,support});
   }
   report.dockWalk={steps,maxStep,minGround,end:prev,blocked,path,passed:!blocked&&Math.abs(prev-26)<.025,scope:'exact physical station floor/collision plus D deck; not native player or boarding permission'};
  }
  assert.ok(report.routes.every(x=>x.height===347&&x.supported));assert.equal(report.gateSupported,false);
  report.success=true;
 }finally{terrace.dispose();cable.dispose();}
}catch(e){report.failure=String(e?.stack??e);process.exitCode=1}
finally{if(process.argv[2]){const out=resolve(process.argv[2]);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');}console.log(JSON.stringify(report));rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:200});}
