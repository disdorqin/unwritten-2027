import {execFileSync} from 'node:child_process';
import {createUndergroundMineLayout,type UndergroundMineSpec} from '../src/shared/underground-mine-layout.js';
import {secondMineRooms} from '../src/shared/underground-second-mine-layout.js';
// Audit-only pinned source, not a second production configuration.
const revision='0108336d';
const host=execFileSync('git',['show',revision+':tools/voxel-tavern/town-blockout/underground-domain-host.ts'],{encoding:'utf8'});
const spec:UndergroundMineSpec={
  pool:{length:4,width:6,depth:1.2,shaftAperture:{width:2,length:2}},
  shoreLength:8,gallery:{length:20,drop:1,railGauge:1,railWidth:.08},
  collapse:{length:3,width:1.2,height:1.3},
  camp:{length:10,side:'right',extension:5,openBackForExpansion:true,crystalGate:true},
  walker:{radius:.27,standingHeight:1.8,crouchingHeight:1.1,maxGrade:.2},
};
const source=host.replace(/\s/g,'').replace(/\b0\./g,'.').replace(/["']/g,'').replace(/,}/g,'}');
for(const fragment of ['pool:{length:4,width:6,depth:1.2,shaftAperture:{width:2,length:2}}','shoreLength:8','gallery:{length:20,drop:1,railGauge:1,railWidth:.08}','collapse:{length:3,width:1.2,height:1.3}','camp:{length:10,side:right,extension:5,openBackForExpansion:true,crystalGate:true}','walker:{radius:.27,standingHeight:1.8,crouchingHeight:1.1,maxGrade:.2}']){
  if(!source.includes(fragment))throw Error('Pinned host spec differs: '+fragment);
}
for(const file of ['src/shared/underground-mine-layout.ts','src/shared/underground-mine-expansion-shell.ts']){
  if(execFileSync('git',['diff',revision,'--',file],{encoding:'utf8'}).trim())throw Error('Survey source differs from pinned integration: '+file);
}
const mine=createUndergroundMineLayout(spec);
function upward(a:Float32Array){let sum=0;for(let i=0;i<a.length;i+=9){
  const ny=(a[i+5]-a[i+2])*(a[i+6]-a[i])-(a[i+3]-a[i])*(a[i+8]-a[i+2]);
  if(ny>0)sum+=ny/2;
}return sum}
const floorMesh=upward(mine.mesh.rock)+upward(mine.mesh.rail),waterMesh=upward(mine.mesh.water);
let dry=0,wet=0,blocked=0;
for(let z=.25;z<140;z+=.5)for(let x=-99.75;x<100;x+=.5){
  const p=mine.queryPassage(x,z,0,spec.walker.crouchingHeight,'open');
  if(!p)blocked+=.25;else if(p.waterDepth>1e-6)wet+=.25;else dry+=.25;
}
// Retain the mandatory raw half-metre count above. For narrow non-grid-aligned
// edges subdivide only the crossed grid cells, and classify subcell centres with
// the actual passage query. This fixes raster boundary bias without changing geometry.
const xs=new Set<number>(),zs=new Set<number>();
for(let x=-100;x<=100;x+=.5)xs.add(x);
for(let z=0;z<=140;z+=.5)zs.add(z);
for(const mesh of [mine.mesh.rock,mine.mesh.rail,mine.mesh.water])for(let i=0;i<mesh.length;i+=3){
  xs.add(Math.round(mesh[i]*10000)/10000);zs.add(Math.round(mesh[i+2]*10000)/10000);
}
const xx=[...xs].sort((a,b)=>a-b),zz=[...zs].sort((a,b)=>a-b);
let weightedDry=0,weightedWet=0;
for(let j=1;j<zz.length;j++)for(let i=1;i<xx.length;i++){
  const x=(xx[i]+xx[i-1])/2,z=(zz[j]+zz[j-1])/2;
  const p=mine.queryPassage(x,z,0,spec.walker.crouchingHeight,'open');
  if(!p)continue;
  const a=(xx[i]-xx[i-1])*(zz[j]-zz[j-1]);if(p.waterDepth>1e-6)weightedWet+=a;else weightedDry+=a;
}
// Independent cross-section sum, using the pinned host spec and expansion constants.
const original=4*6+8*4+20*4+3*1.2+10*9;
const expansion=4*4+8.4*89.8+4*1.2+67.8*9.5+28*13.1+67.8*10.45+28*14.05+3.2*23.6;
const analyticFloor=original+expansion,analyticWater=4*6+8*4+3.2*23.6;
const area90={source:revision,scope:'geometry footprint, gate open for survey; does not deduct props/safety',floorMesh,waterMesh,gridDry:dry,gridWet:wet,gridOutside:blocked,gridDifferencePct:Math.abs(dry+wet-floorMesh)/floorMesh*100,
  weightedDry,weightedWet,analyticFloor,analyticWater,correctedGridDifferencePct:Math.abs(weightedDry+weightedWet-analyticFloor)/analyticFloor*100,meshDifferencePct:Math.abs(floorMesh-analyticFloor)/analyticFloor*100};
const area140=secondMineRooms.reduce((a,r)=>{a[r.river?'water':'dry']+=(r.x1-r.x0)*(r.n1-r.n0);return a},{dry:0,water:0});
console.log(JSON.stringify({area90,area140:{scope:'new local candidate geometry only, not integration official',...area140},pending:['90-crystal','165 safety and interior mask','190 forecourt and closed vault','all registered mineral, fire and encounter masks']},null,2));
