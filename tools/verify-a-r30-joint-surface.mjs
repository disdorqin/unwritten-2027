// Same-instance A/B candidate proof. No branch merge, B worktree edits,
 // production entry change or gameplay authorization. The only copied B
 // files are the exact source blobs listed by B's 2026-11-26 S0-S5 card.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {Raycaster,Vector3} from 'three';
const root=fileURLToPath(new URL('../',import.meta.url));
const prefix='tools/voxel-tavern/town-blockout/';
const b='eac4b4e0', base='53372f1a';
const git=(...args)=>execFileSync('git',args,{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
const sha=(ref)=>git('rev-parse',ref).toString().trim();
const a=sha('HEAD'),bSha=sha(b);
assert.equal(git('status','--porcelain','--','tools/voxel-tavern/town-blockout','src').toString().trim(),'','dirty production source');
const groups=[
 ['town-b-r30-east-historic-walkway'],
 ['meteor-crater','meteor-crater-surface','meteor-crater-interior-dressing','meteor-crater-floor-worklight-chain','town-b-r30-crater-relief','town-b-r30-ground-normals','town-b-r30-crater-workface-layout','town-b-r30-mound-route','town-c2-crater-central-mound','town-c2-crater-broken-circle','town-crater-midground-s5','town-b-r30-crater-remnant-forms','town-b-r30-crater-relic-view','town-b-r30-broken-trestle','town-b-r30-retire-legacy-terraces','town-b-r30-settle-story-supports'],
 ['town-b-r30-crater-workface','town-b-r30-crater-workstations','town-b-r30-crater-workshop-controls','town-b-r30-physical-kit','town-b-r30-route-markers','town-b-r30-workshop-approaches','town-b-r30-inscription-approach'],
 ['town-b-r30-return-headframe'],
 ['town-c2-crater-inscription','town-c2-crater-molten-beads','town-b-r30-melt-columns','town-b-r30-mound-planting','town-b-r30-mound-work-flag','town-b-r30-historic-walkway-site','town-b-r30-inscription-rubbing'],
 ['town-b-r30-crater-completion']
];
const files=groups.flat().map(n=>prefix+n+'.ts');
const refBlob=(ref,p)=>{try{return git('rev-parse','--quiet','--verify',ref+':'+p).toString().trim()}catch{return undefined}};
for(const p of files)assert.equal(refBlob(a,p),refBlob(base,p),'A/B path ownership conflict: '+p);
const temporary=mkdtempSync(join(root,'.a-r30-joint-proof-'));
const report={a,b:bSha,base:sha(base),files:[],scope:'same-instance candidate, not mainline acceptance',stage:'copy',success:false};
const out=process.argv[2]&&resolve(process.argv[2]);
const browser=process.argv[3]==='--browser';
const lock=out&&out+'.lock';
if(lock){mkdirSync(dirname(lock),{recursive:true});try{mkdirSync(lock);}catch(e){rmSync(temporary,{recursive:true,force:true});throw e;}}
try{
 cpSync(join(root,prefix),join(temporary,prefix),{recursive:true});
 cpSync(join(root,'src'),join(temporary,'src'),{recursive:true});
 cpSync(join(root,'tools','fixtures'),join(temporary,'tools','fixtures'),{recursive:true});
 cpSync(join(root,'tools','voxel-tavern','public'),join(temporary,'tools','voxel-tavern','public'),{recursive:true});
 for(const p of ['town-blockout.html','vite.config.ts','package.json','tower-chime.ts','build-grand-clocktower.mjs'])
  cpSync(join(root,'tools','voxel-tavern',p),join(temporary,'tools','voxel-tavern',p));
 mkdirSync(join(temporary,'docs'),{recursive:true});
 cpSync(join(root,'docs','p0-layout-draft.json'),join(temporary,'docs','p0-layout-draft.json'));
 for(const p of files){
  const bytes=git('show',bSha+':'+p),id=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
  assert.equal(id,refBlob(bSha,p));
  writeFileSync(join(temporary,p),bytes);
  report.files.push({path:p,blob:id});
 }
 const load=async(name)=>import(pathToFileURL(join(temporary,prefix,name+'.ts')).href);
 const {createTerrainGrid,worldBounds}=await load('terrain');
 const {mountWestCraterRoad}=await load('town-za22-crater-road');
 const {buildCraterRailExtension}=await load('town-crater-rail-extension');
 const {buildTownRailRoute}=await load('town-railway');
 const {retireBR30LegacyTerracePlates}=await load('town-b-r30-retire-legacy-terraces');
 const {refitBR30LegacyStory}=await load('town-b-r30-settle-story-supports');
 const {attachBR30CraterCompletion}=await load('town-b-r30-crater-completion');
 const {surveyAR30InscriptionAccess,ar30HostTracks,ar30HostRoutes,assertAR30SurfaceLifecycle,assertAR30SurfaceAttachment}=await load('town-a-r30-unified-surface-host');
 const {surveyBR30WorkshopApproaches}=await load('town-b-r30-workshop-approaches');
 const {createAR30RimAccessSurvey}=await load('town-a-r30-rim-access');
 const {rimPublicAccessFootway}=await load('town-a-r30-west-landscape');
 const grid=createTerrainGrid();
 report.stage='surface';
 const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:{retire:retireBR30LegacyTerracePlates,refit:refitBR30LegacyStory}});
 const ground=road.group.getObjectByName('meteor-crater-walk-mesh');
 assertAR30SurfaceLifecycle(road,{story:{retire:retireBR30LegacyTerracePlates,refit:refitBR30LegacyStory},attach(){throw Error('not yet attached');}});
 assert.equal(ground.userData.bR30UnifiedRelief,true);
 assert.ok(!road.group.getObjectByName('za36-dressing-terrace:plate'));
 report.surface={retired:road.group.userData.aR30RetiredTerraces,settled:road.group.userData.aR30SettledSupports.length,apron:road.terrainBoundary.apronRadius,vertices:ground.geometry.attributes.position.count,triangles:ground.geometry.index.count/3,initialColliders:road.group.userData.colliders.length};
 // Actual triangles: seam ownership and walk height must agree on
 // the new B mesh, not just the previous legacy geometry.
 road.group.updateMatrixWorld(true);
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 const carriers=road.group.children.filter(o=>o.name==='meteor-crater-west-ground');
 let probes=0,maxError=0,overlaps=0;
 for(let a=1;a<360;a+=7)for(const radius of [20,38,53,58.8,59.1,59.7,60.3,61.5,63,64.5,70,80]){
  const t=a*Math.PI/180,e=road.anchor.east+radius*Math.sin(t),n=road.anchor.north+radius*Math.cos(t);
  ray.ray.origin.set(e,100,-n);
  const hits=ray.intersectObjects([...carriers,ground],false);
  assert.ok(hits.length,'Missing shared triangle '+e+'/'+n);
  if(hits.some(h=>h.object===ground)&&hits.some(h=>h.object!==ground))overlaps++;
  maxError=Math.max(maxError,Math.abs(hits[0].point.y-road.heightAt(e,n)));probes++;
 }
 report.seam={probes,maxError,overlaps,inner:road.terrainBoundary.inner.length,outer:road.terrainBoundary.outer.length};
 assert.equal(overlaps,0);
 assert.ok(maxError<.0005,'Unified rendered/support discrepancy '+maxError);
 report.stage='rail';
 const rail=buildCraterRailExtension(grid,road,buildTownRailRoute(grid).points);
 const tracks=ar30HostTracks(rail),routes=ar30HostRoutes(road,rail);
 const before=road.group.userData.colliders;
 report.rail={tracks:tracks.map(t=>t.length),routes:routes.map(r=>r.id),inscription:rail.stationWalkRoutes.find(r=>r.id==='inscription-access')?.points};
 report.stage='completion';
 // Prove exact B production-candidate gate rejects the stale ground-only
 // inscription route and rolls back. Do not change or conceal B's gate.
 try{
  const exact=attachBR30CraterCompletion(road,rail,tracks,'host-candidate',routes);
  exact.dispose();report.exactHost={accepted:true};
 }catch(e){
  report.exactHost={accepted:false,error:String(e)};
  if(!String(e).includes('Obstructed inscription approach'))throw e;
 }
 assert.equal(road.group.userData.colliders.length,before.length);
 assert.ok(before.every(box=>road.group.userData.colliders.includes(box)));
 // Reproduce the exact B rejection above, then try a narrowly proposed
 // cross-lane API extension on a DIFFERENT temp file. Do not modify
 // B's worktree, copied B blob, ref, or claim owner acceptance.
 const originalPath=join(temporary,prefix,'town-b-r30-crater-completion.ts');
 let proposal=readFileSync(originalPath,'utf8');
 const replace=(old,next)=>{
  assert.equal(proposal.split(old).length,2,'B proposal anchor changed');
  proposal=proposal.replace(old,next);
 };
 replace("const live=new WeakSet<object>();",
  "type HostInscriptionSurvey=(road:Road,rail:HostRail)=>Readonly<{points:HostRoute['points'];length:number;bodyGap:number;trackGap:number;maxStep:number;steps:number;routeId:string}>;\nconst live=new WeakSet<object>();");
 replace("mode:Mode,hostRoutes?:readonly HostRoute[])","mode:Mode,hostRoutes?:readonly HostRoute[],supportSurvey?:HostInscriptionSurvey)");
 replace("inscriptionApproach:ReturnType<typeof surveyBR30InscriptionApproach>|undefined;",
  "inscriptionApproach:ReturnType<typeof surveyBR30InscriptionApproach>|ReturnType<HostInscriptionSurvey>|undefined;");
 replace("inscriptionApproach=surveyBR30InscriptionApproach(road,road.inscription.layout.useFoot,dock,tracks,solids);",
  "if(supportSurvey){const a=supportSurvey(road,rail),actual=routes.find(r=>r.id==='inscription-access');if(!actual||a.routeId!==actual.id||a.points!==actual.points||![a.length,a.bodyGap,a.trackGap,a.maxStep,a.steps].every(Number.isFinite)||a.length<=0||a.bodyGap<.27||a.trackGap<1.30||a.maxStep>.43001||a.steps<1)throw Error('Invalid actual inscription support survey');inscriptionApproach=a;}else inscriptionApproach=surveyBR30InscriptionApproach(road,road.inscription.layout.useFoot,dock,tracks,solids);");
 writeFileSync(join(temporary,prefix,'town-b-r30-crater-completion-proposed.ts'),proposal);
 report.bProposal={status:'unaccepted owner-interface proposal',originalBlob:refBlob(bSha,prefix+'town-b-r30-crater-completion.ts'),proposedSHA256:createHash('sha256').update(proposal).digest('hex')};
 const {attachBR30CraterCompletion:attachProposed}=await load('town-b-r30-crater-completion-proposed');
 const completion=attachProposed(road,rail,tracks,'host-candidate',routes,surveyAR30InscriptionAccess);
 assertAR30SurfaceAttachment(road,rail);
 const approaches=completion.workshopApproaches;
 const inscription=completion.inscriptionApproach;
 assert.ok(approaches?.length===5&&inscription?.routeId==='inscription-access');
 const rimAccess=createAR30RimAccessSurvey(road,rail,.27).trace(rimPublicAccessFootway);
 createAR30RimAccessSurvey(road,rail,.40).trace(rimPublicAccessFootway);
 report.rimAccess=rimAccess;
 report.assembly={colliders:road.group.userData.colliders.length,historic:completion.historic.audit,approaches,inscription,productionReady:completion.productionReady,mode:completion.mode};
 assert.equal(completion.productionReady,false);
 const ids=new Set(road.group.userData.colliders);
 assert.equal(ids.size,road.group.userData.colliders.length,'duplicate box registration');
 const first=completion.historic.firstFoot;
 assert.ok(Math.abs(completion.historic.supportedHeight(first.east,first.north)-first.height)<.015);
 report.stage='rollback';
 completion.dispose();
 assert.equal(road.group.userData.colliders.length,before.length);
 assert.ok(before.every(box=>road.group.userData.colliders.includes(box)));
 report.success=true;report.stage='done';
 if(browser){
  assert.ok(out,'browser needs report destination');
  // Temporary proof-only replacement of A's dormant port, pointing
  // at the separately named B proposal. The exact B blobs stay intact.
  const port="import {retireBR30LegacyTerracePlates} from './town-b-r30-retire-legacy-terraces';\n"+
   "import {refitBR30LegacyStory} from './town-b-r30-settle-story-supports';\n"+
   "import {attachBR30CraterCompletion} from './town-b-r30-crater-completion-proposed';\n"+
   "import {ar30HostRoutes,ar30HostTracks,surveyAR30InscriptionAccess,type AR30SurfacePort} from './town-a-r30-unified-surface-host';\n"+
   "export function ar30SurfacePort():AR30SurfacePort{return {story:{retire:retireBR30LegacyTerracePlates,refit:refitBR30LegacyStory},attach(road,rail){const tracks=ar30HostTracks(rail),routes=ar30HostRoutes(road,rail);return attachBR30CraterCompletion(road,rail,tracks,'host-candidate',routes,surveyAR30InscriptionAccess);}};}\n";
  writeFileSync(join(temporary,prefix,'town-a-r30-surface-port.ts'),port);
  report.portSHA256=createHash('sha256').update(port).digest('hex');
  const {createMeteorCrater,meteorCraterFixturePlan}=await load('meteor-crater');
  const fixture=createMeteorCrater(meteorCraterFixturePlan),an=road.anchor,c=Math.cos(an.yaw),s=Math.sin(an.yaw);
  const point=t=>{const p=fixture.mainTrailPoint(t),east=an.east+p.east*c+p.north*s,north=an.north+p.north*c-p.east*s;return {east,north,height:road.heightAt(east,north),t};};
  const dense=Array.from({length:270},(_,i)=>point(i*.002)).concat(point(.538));
  const selected=[dense[0]];
  // Preserve the actual tight entry bend; simplify only where the
  // surveyed centerline is within .12 m of the chord and <= 6 m long.
  function gap(p,a,b){const de=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((p.east-a.east)*de+(p.north-a.north)*dn)/(de*de+dn*dn||1)));return Math.hypot(p.east-a.east-t*de,p.north-a.north-t*dn);}
  for(let i=0;i<dense.length-1;){
   let j=i+1;while(j+1<dense.length&&Math.hypot(dense[j+1].east-dense[i].east,dense[j+1].north-dense[i].north)<=6&&dense.slice(i+1,j+1).every(p=>gap(p,dense[i],dense[j+1])<=.12))j++;
   selected.push(dense[j]);i=j;
  }
  const points=[...selected,...completion.historic.route.slice(1)];
  report.browserRoute={points,approach:rimAccess.points,trailKnots:selected.length,historic:completion.historic.route,mode:'unaccepted B narrow host API proposal + actual A support audit'};
  const dir=join(dirname(out),'原生联合栈道');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'joint-route.json'),JSON.stringify(report.browserRoute,null,2));
  writeFileSync(join(dir,'joint-source.json'),JSON.stringify({a,b:bSha,files:report.files,portSHA256:report.portSHA256,exactHost:report.exactHost,bProposal:report.bProposal},null,2));
  report.stage='browser';report.success=false;
  const status=await new Promise((done,reject)=>{
   const child=spawn(process.execPath,[join(root,'tools','verify-a-r30-native-local.mjs'),'joint-historic',dir],{cwd:root,windowsHide:true,stdio:'inherit',env:{...process.env,ZA22_HARDWARE:'1',AR30_JOINT_ROOT:temporary,AR30_JOINT_ROUTE:join(dir,'joint-route.json')}});
   child.once('error',reject);child.once('exit',code=>done(code));
  });
  report.browserExit=status;
  assert.equal(status,0,'joint native browser did not complete');
  report.success=true;report.stage='done';
 }
}catch(error){report.failure=String(error?.stack??error);process.exitCode=1;}
finally{
 if(out){mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify({...report,files:report.files.length,assembly:report.assembly&&{...report.assembly,approaches:report.assembly.approaches?.map(x=>({id:x.id,bodyGap:x.bodyGap,trackGap:x.trackGap,samples:x.samples}))}}));
 rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:100});
 if(lock)rmSync(lock,{recursive:true,force:true});
}
