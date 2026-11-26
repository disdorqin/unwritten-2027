// Same-instance A/B candidate proof. No branch merge, B worktree edits,
 // production entry change or gameplay authorization. The only copied B
 // files are the exact source blobs listed by B's 2026-11-26 S0-S5 card.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
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
 const {surveyAR30InscriptionAccess,ar30HostTracks,ar30HostRoutes}=await load('town-a-r30-unified-surface-host');
 const {surveyBR30WorkshopApproaches}=await load('town-b-r30-workshop-approaches');
 const {createAR30RimAccessSurvey}=await load('town-a-r30-rim-access');
 const {rimPublicAccessFootway}=await load('town-a-r30-west-landscape');
 const grid=createTerrainGrid();
 report.stage='surface';
 const road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n),{unifiedStory:{retire:retireBR30LegacyTerracePlates,refit:refitBR30LegacyStory}});
 const ground=road.group.getObjectByName('meteor-crater-walk-mesh');
 assert.equal(ground.userData.bR30UnifiedRelief,true);
 assert.ok(!road.group.getObjectByName('za36-dressing-terrace:plate'));
 report.surface={retired:road.group.userData.aR30RetiredTerraces,settled:road.group.userData.aR30SettledSupports.length,apron:road.terrainBoundary.apronRadius,vertices:ground.geometry.attributes.position.count,triangles:ground.geometry.index.count/3,initialColliders:road.group.userData.colliders.length};
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
 // Geometry-only review assembly, on the *actual* A three-track host.
 // Independently certify all six approaches with actual support. This is
 // not acceptance of B host-candidate mode or the gameplay authority.
 const completion=attachBR30CraterCompletion(road,rail,tracks,'review');
 const solids=[...road.group.userData.colliders,...rail.group.userData.colliders];
 const approaches=surveyBR30WorkshopApproaches(road,completion.kit.machines.sites,routes,tracks,solids);
 const inscription=surveyAR30InscriptionAccess(road,rail);
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
  // Temporary proof-only replacement of A's dormant port; B's exact
  // source files remain untouched. No independent fixture pose/state.
  const port="import {retireBR30LegacyTerracePlates} from './town-b-r30-retire-legacy-terraces';\n"+
   "import {refitBR30LegacyStory} from './town-b-r30-settle-story-supports';\n"+
   "import {attachBR30CraterCompletion} from './town-b-r30-crater-completion';\n"+
   "import {surveyBR30WorkshopApproaches} from './town-b-r30-workshop-approaches';\n"+
   "import {ar30HostRoutes,ar30HostTracks,surveyAR30InscriptionAccess,type AR30SurfacePort} from './town-a-r30-unified-surface-host';\n"+
   "export function ar30SurfacePort():AR30SurfacePort{return {story:{retire:retireBR30LegacyTerracePlates,refit:refitBR30LegacyStory},attach(road,rail){const tracks=ar30HostTracks(rail),routes=ar30HostRoutes(road,rail);const c=attachBR30CraterCompletion(road,rail,tracks,'review');try{surveyBR30WorkshopApproaches(road,c.kit.machines.sites,routes,tracks,[...road.group.userData.colliders,...rail.group.userData.colliders]);surveyAR30InscriptionAccess(road,rail);return c;}catch(e){c.dispose();throw e;}}};}\n";
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
  report.browserRoute={points,approach:rimAccess.points,trailKnots:selected.length,historic:completion.historic.route,mode:'exact B review geometry + A actual host support audits'};
  const dir=join(dirname(out),'原生联合栈道');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'joint-route.json'),JSON.stringify(report.browserRoute,null,2));
  writeFileSync(join(dir,'joint-source.json'),JSON.stringify({a,b:bSha,files:report.files,portSHA256:report.portSHA256,exactHost:report.exactHost},null,2));
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
