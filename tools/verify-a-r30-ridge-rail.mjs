// Exact source, same-instance D field and A real rail survey.
// A-owned protected ownership proposal, never a live terrain replacement.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync,writeFileSync,readFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Raycaster,Vector3} from 'three';
const root=fileURLToPath(new URL('../',import.meta.url)),prefix='tools/voxel-tavern/town-blockout/';
const git=(...a)=>execFileSync('git',a,{cwd:root,windowsHide:true,maxBuffer:32*1024*1024});
const sha=r=>git('rev-parse',r).toString().trim(),a=sha('HEAD'),d=sha('1e6281b7');
const files=['town-d-r30-front-ridge.ts','town-d-r30-forest.ts'];
const blob=(r,p)=>sha(r+':'+prefix+p);
for(const p of ['north-ridge-350-terrain.ts','town-front-ridge-surface.ts'])assert.equal(blob(a,p),blob(d,p),'Shared D dependency mismatch');
assert.equal(git('status','--porcelain','--','tools/voxel-tavern/town-blockout','src').toString().trim(),'','dirty A production source');
const tmp=mkdtempSync(join(root,'.a-r30-ridge-proof-'));
const report={a,d,scope:'joint candidate only; no live ridge replacement or rail service',files:[],success:false};
try{
 cpSync(join(root,prefix),join(tmp,prefix),{recursive:true});
 cpSync(join(root,'src'),join(tmp,'src'),{recursive:true});
 mkdirSync(join(tmp,'docs'),{recursive:true});cpSync(join(root,'docs','p0-layout-draft.json'),join(tmp,'docs','p0-layout-draft.json'));
 for(const p of files){
  writeFileSync(join(tmp,prefix,p),git('show',d+':'+prefix+p));report.files.push({path:prefix+p,blob:blob(d,p)});
 }
 const load=n=>import(pathToFileURL(join(tmp,prefix,n+'.ts')).href);
 const {createTerrainGrid,worldBounds}=await load('terrain');
 const {mountWestCraterRoad}=await load('town-za22-crater-road');
 const {createTownRailway}=await load('town-railway');
 const {buildCraterRailExtension}=await load('town-crater-rail-extension');
 const {createAR30RidgeOwnership}=await load('town-a-r30-ridge-ownership');
 const {buildFrontRidgeR30Field,mountFrontRidgeR30}=await load('town-d-r30-front-ridge');
 const {planRidgeForest,ridgeForestRouteClearance}=await load('town-d-r30-forest');
 const {planAR30RailJunction}=await load('town-a-r30-rail-junction-plan');
 const {surveyAR30WestJunction}=await load('town-a-r30-rail-west-junction');
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),originalRailway=createTownRailway(grid,()=>0),loop=originalRailway.route;
 const rail=buildCraterRailExtension(grid,road,loop.points);
 const ownership=createAR30RidgeOwnership({loop:loop.points,branch:rail.samples});
 const naked=buildFrontRidgeR30Field(grid.groundHeightAt,()=>1),field=buildFrontRidgeR30Field(grid.groundHeightAt,ownership.weight);
 const combined=(e,n)=>field.heightAt(e,n)??grid.groundHeightAt(e,n);
 let edgeProbes=0,edgeMax=0,normalGap=0;
 for(const side of ['south','north','east','west'])for(const p of field.edge(side)){
  edgeProbes++;edgeMax=Math.max(edgeMax,Math.abs(p.height-grid.groundHeightAt(p.east,p.north)));
 }
 assert.equal(edgeMax,0);
 let frozenProbes=0,frozenMax=0,unmaskedMax=0;
 for(const p of [...loop.points.map(p=>({east:p.x,north:-p.z})),...rail.samples]){
  for(const [de,dn] of [[0,0],[1.4,0],[-1.4,0],[0,1.4],[0,-1.4]]){
   const e=p.east+de,n=p.north+dn,h=field.heightAt(e,n);if(h===undefined)continue;
   frozenProbes++;const original=grid.groundHeightAt(e,n);
   frozenMax=Math.max(frozenMax,Math.abs(h-original));unmaskedMax=Math.max(unmaskedMax,Math.abs(naked.heightAt(e,n)-original));
  }
 }
 assert.ok(frozenMax<1e-5);
 // Verify the actual D fine mesh, not a mathematical second surface.
 const mounted=mountFrontRidgeR30(field);mounted.group.updateMatrixWorld(true);
 let triangles=0,meshProbe=0,meshError=0;
 const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
 for(const m of mounted.group.children){
  triangles+=m.geometry.index.count/3;
  const p=m.geometry.attributes.position;
  const e=(p.getX(0)+p.getX(p.count-1))/2+.37,n=(-p.getZ(0)-p.getZ(p.count-1))/2+.19;
  ray.ray.origin.set(e,500,-n);const hit=ray.intersectObject(m,false)[0];
  assert.ok(hit);meshProbe++;meshError=Math.max(meshError,Math.abs(hit.point.y-field.heightAt(e,n)));
 }
 assert.ok(meshError<.0001);
 let midPadProbes=0,midPadMax=0;
 for(let e=425;e<=455;e++)for(let n=508;n<=532;n++){midPadProbes++;midPadMax=Math.max(midPadMax,Math.abs(field.heightAt(e,n)-140));}
 assert.equal(midPadMax,0);
 const slots=[[320,650],[440,520],[526,329],[336,640],[296,502],[296,520]].map(([east,north])=>({east,north,old:grid.groundHeightAt(east,north),unprotected:naked.heightAt(east,north),protected:field.heightAt(east,north),ownership:ownership.weight(east,north)}));
 const placements=planRidgeForest(field,ridgeForestRouteClearance([loop.points.map(p=>({east:p.x,north:-p.z})),rail.samples]));
 assert.ok(placements.every(p=>Math.abs(p.height-field.heightAt(p.east,p.north))<1e-6));
 let maskSlope=0,unmaskedSlope=0;let affected=0;
 for(let e=1;e<640;e+=2)for(let n=271;n<800;n+=2){
  const w=ownership.weight(e,n);
  if(w>0&&w<1){affected++;maskSlope=Math.max(maskSlope,Math.abs(field.heightAt(e+1,n)-field.heightAt(e,n)),Math.abs(field.heightAt(e,n+1)-field.heightAt(e,n)));unmaskedSlope=Math.max(unmaskedSlope,Math.abs(naked.heightAt(e+1,n)-naked.heightAt(e,n)),Math.abs(naked.heightAt(e,n+1)-naked.heightAt(e,n)));}
 }
 const corrected=buildCraterRailExtension({...grid,groundHeightAt:combined,heightAt:(e,n)=>{const h=grid.heightAt(e,n),g=grid.groundHeightAt(e,n);return h===g?combined(e,n):h}},road,loop.points);
 const plan=planAR30RailJunction(corrected.samples,loop.points,combined);
 const oldOnly=planAR30RailJunction(rail.samples,loop.points,grid.groundHeightAt);
 const west=surveyAR30WestJunction(rail.samples,loop.points,[...originalRailway.group.userData.colliders,...originalRailway.group.userData.floors],grid.groundHeightAt);
 report.westPlan={attempts:west.attempts,geometries:west.geometries,rejects:west.rejects,best:west.best,accepted:!!west.plan};
 report.field={midPadProbes,midPadMax,edgeProbes,edgeMax,frozenProbes,frozenMax,unmaskedMax,meshProbe,meshError,triangles,slots,placements:placements.length,feather:ownership.feather,affected,maskSlope,unmaskedSlope};
 report.rail={before:rail.verticalSurvey.violations.length,after:corrected.verticalSurvey.violations.length,junction:corrected.junctionAudit,closedHead:corrected.closedHead,eastValley:{spans:rail.eastValleyBridgeSpans.length,bearings:rail.eastValleyBridgeSpans.reduce((s,p)=>s+p.bearings,0),maxFill:rail.eastValleyRepair.maxFill},oldPlan:{attempts:oldOnly.attempts,best:oldOnly.best,accepted:!!oldOnly.plan},protectedPlan:{attempts:plan.attempts,best:plan.best,accepted:!!plan.plan}};
 assert.equal(corrected.verticalSurvey.violations.length,rail.verticalSurvey.violations.length);
 assert.equal(corrected.serviceGeometryReady,false);
 report.success=true;mounted.dispose();
}catch(e){report.failure=String(e?.stack??e);process.exitCode=1;}
finally{
 const out=process.argv[2]&&resolve(process.argv[2]);if(out){mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2)+'\n');}
 console.log(JSON.stringify(report));rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
