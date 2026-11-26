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
 for(const name of ['front-ridge','forest','road-survey','roadbed','cable-facilities','cloud-terrace'])cpSync(join(root,prefix,'town-d-r30-'+name+'.ts'),join(tmp,prefix,'town-d-r30-'+name+'.ts'));
 const load=n=>import(pathToFileURL(join(tmp,prefix,n+'.ts')).href);
 const {createTerrainGrid,worldBounds}=await load('terrain');
 const {mountWestCraterRoad}=await load('town-za22-crater-road');
 const {createTownRailway}=await load('town-railway');
 const {buildCraterRailExtension}=await load('town-crater-rail-extension');
 const {createAR30RidgeOwnership}=await load('town-a-r30-ridge-ownership');
 const {buildFrontRidgeR30Field,proposeRidgeCloudApronOwnership}=await load('town-d-r30-front-ridge');
 const {mountRidgeCableFacilities}=await load('town-d-r30-cable-facilities');
 const {mountRidgeCloudTerrace,ridgeCloudHandoff,ridgeCloudFootAt}=await load('town-d-r30-cloud-terrace');
 const grid=createTerrainGrid(),road=mountWestCraterRoad(worldBounds.depth,n=>grid.groundHeightAt(0,n)),railway=createTownRailway(grid,()=>0),loop=railway.route;
 const rail=buildCraterRailExtension(grid,road,loop.points),ownership=createAR30RidgeOwnership({loop:loop.points,branch:rail.samples});
 const proposed=process.argv.includes('--proposed-apron');
 const weight=proposed?proposeRidgeCloudApronOwnership(ownership.weight,ownership.distance):ownership.weight;
 const field=buildFrontRidgeR30Field(grid.groundHeightAt,weight);
 let changed=0,frozenError=0;
 for(let n=270;n<=800;n++)for(let e=0;e<=640;e++){
  if(ownership.weight(e,n)===0)frozenError=Math.max(frozenError,Math.abs(field.vertexAt(e,n)-Math.fround(grid.groundHeightAt(e,n))));
  if(Math.abs(weight(e,n)-ownership.weight(e,n))>1e-8)changed++;
 }
 const owner=new Group(),cable=mountRidgeCableFacilities(owner,field),terrace=mountRidgeCloudTerrace(owner,field,cable.blocked);
 const h=ridgeCloudHandoff,targets=[h.terminal,...h.lookouts,h.assemblyVisitor,h.runway.start,h.runway.end,{...h.gate,north:h.gate.north-1}];
 const routes=targets.map(p=>{const path=terrace.survey(h.terminal,p,1.2);return {east:p.east,north:p.north,height:ridgeCloudFootAt(field,p.east,p.north),ground:field.heightAt(p.east,p.north),originalWeight:ownership.weight(p.east,p.north),weight:weight(p.east,p.north),distance:ownership.distance(p.east,p.north),points:path.length,range:path.length?[Math.min(...path.map(q=>q.height)),Math.max(...path.map(q=>q.height))]:[],allSupported:path.length>0&&path.every(q=>Math.abs(q.height-347)<.00001&&!terrace.blocked(q.east,q.north,q.height,.27))}});
 const gridProbes=[];for(let n=630;n<=666;n+=2)for(let e=286;e<=352;e+=2){if(field.heightAt(e,n)<346.999&&ownership.weight(e,n)>0)gridProbes.push({e,n,h:field.heightAt(e,n),d:ownership.distance(e,n)})}
 const roadProbes=[];for(let n=290;n<=400;n+=10)for(let e=290;e<=560;e+=10){const d=ownership.distance(e,n);if(d>8)roadProbes.push([e,n,Math.round(field.heightAt(e,n)*10)/10,Math.round(d)])}
 const report={a,proposed,changed,frozenError,routes,gateSupported:ridgeCloudFootAt(field,h.gate.east,h.gate.north)!==undefined,cable:{length:cable.survey.length,towers:cable.survey.towers,maxTower:cable.survey.maxTower},gridProbes,roadProbes};
 if(process.argv[3]){const out=resolve(process.argv[3]);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(report,null,2))}
 console.log(JSON.stringify({a,proposed,changed,frozenError,routes,gateSupported:report.gateSupported,cable:report.cable,gridProbes:gridProbes.slice(0,12),roadProbes:roadProbes.slice(0,30)}));
 terrace.dispose();cable.dispose();
 if(proposed){assert.equal(frozenError,0);assert.ok(routes.every(r=>r.height===347&&r.allSupported));assert.equal(report.gateSupported,false)}
}finally{rmSync(tmp,{recursive:true,force:true,maxRetries:3,retryDelay:100})}
