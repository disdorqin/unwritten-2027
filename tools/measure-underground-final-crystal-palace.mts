import {execFileSync} from 'node:child_process';
import {crystalCavernArchitecture} from './voxel-tavern/town-blockout/underground-crystal-cavern.js';
import {undergroundPalaceDressing} from './voxel-tavern/town-blockout/underground-palace-dressing.js';
import {createUndergroundPalaceShell,undergroundPalacePlan} from './fixtures/underground-palace-d-shell-snapshot.js';
type Rect={x0:number;x1:number;n0:number;n1:number};
type Surface=Rect&{kind:'floor'|'wet'|'solid';bottom:number;top:number};
const rect=(x0:number,x1:number,n0:number,n1:number):Rect=>({x0,x1,n0,n1});
const area=(r:Rect)=>(r.x1-r.x0)*(r.n1-r.n0);
const clip=(a:Rect,b:Rect)=>rect(Math.max(a.x0,b.x0),Math.min(a.x1,b.x1),Math.max(a.n0,b.n0),Math.min(a.n1,b.n1));
const overlap=(a:Rect,b:Rect)=>a.x0<b.x1&&b.x0<a.x1&&a.n0<b.n1&&b.n0<a.n1;
const cuts=(v:number[])=>[...new Set(v)].sort((a,b)=>a-b);
const inside=(r:Rect,x:number,n:number)=>r.x0<x&&x<r.x1&&r.n0<n&&n<r.n1;
function partition(rs:Surface[],fn:(a:number,s:Surface[])=>void){
 const xs=cuts(rs.flatMap(r=>[r.x0,r.x1]));
 for(let i=1;i<xs.length;i++){
  const x=(xs[i-1]+xs[i])/2,active=rs.filter(r=>x>r.x0&&x<r.x1);
  if(!active.some(r=>r.kind==='floor'))continue;
  const ns=cuts(active.flatMap(r=>[r.n0,r.n1]));
  for(let j=1;j<ns.length;j++){const n=(ns[j-1]+ns[j])/2;
   fn((xs[i]-xs[i-1])*(ns[j]-ns[j-1]),active.filter(r=>n>r.n0&&n<r.n1));}
 }
}
function classify(s:Surface[]){
 const floor=s.filter(r=>r.kind==='floor');if(!floor.length)return 'outside';
 if(s.some(r=>r.kind==='wet'))return 'water';
 const y=Math.max(...floor.map(r=>r.top));
 return s.some(r=>r.kind==='solid'&&r.top>y+.025&&r.bottom<y+1.8)?'occupied':'dry';
}
type Ledger={dry:number;water:number;occupied:number;outside:number};
const ledger=():Ledger=>({dry:0,water:0,occupied:0,outside:0});
function integrate(rs:Surface[]){const a=ledger();partition(rs,(size,s)=>a[classify(s)]+=size);return a}
const pieces=crystalCavernArchitecture.pieces;
const footprint=(p:{center:readonly number[];size:readonly number[]})=>rect(p.center[0]-p.size[0]/2,p.center[0]+p.size[0]/2,p.center[2]-p.size[2]/2,p.center[2]+p.size[2]/2);
const surface=(p:(typeof pieces)[number],kind:Surface['kind']):Surface=>({...footprint(p),kind,bottom:p.center[1]-p.size[1]/2,top:p.center[1]+p.size[1]/2});
const rs=[
 ...pieces.filter(p=>/^u3\/(floor\/rock-tile-|trail\/slab-|quay\/dry-masonry-)/.test(p.name)).map(p=>surface(p,'floor')),
 ...pieces.filter(p=>p.name.startsWith('u3/river/cell-')).map(p=>surface(p,'wet')),
 ...pieces.filter(p=>p.solid).map(p=>surface(p,'solid')),
];
const cells=new Map<string,Surface[]>();
for(const r of rs)for(let i=Math.floor(r.x0*2);i<Math.ceil(r.x1*2);i++)for(let j=Math.floor(r.n0*2);j<Math.ceil(r.n1*2);j++){
 const q=clip(r,rect(i/2,(i+1)/2,j/2,(j+1)/2));if(q.x1<=q.x0||q.n1<=q.n0)continue;
 const k=i+','+j,ls=cells.get(k)??[];ls.push({...r,...q});cells.set(k,ls);
}
const crystal=integrate(rs),grid=ledger(),raw=ledger();
for(const [k,ls] of cells){
 const a=integrate(ls);for(const key of ['dry','occupied','water'] as const)grid[key]+=a[key];
 const [i,j]=k.split(',').map(Number);raw[classify(ls.filter(r=>inside(r,(i+.5)/2,(j+.5)/2)))]+=.25;
}
const diff=(a:number,b:number)=>Math.abs(a-b)/Math.max(a,1e-9)*100;
for(const k of ['dry','water','occupied'] as const)if(diff(crystal[k],grid[k])>=.1)throw Error('Crystal variance '+k);
const palace=createUndergroundPalaceShell();
try{
 const source='9ab161e8691ea32662f389527ebb57f1d3fe0947';
 const actual=execFileSync('git',['rev-parse','origin/lane-d:tools/voxel-tavern/town-blockout/underground-palace-shell.ts'],{encoding:'utf8'}).trim();
 if(actual!==source)throw Error('D changed shell; resurvey before registering');
 const floorRects=[[-4,4,0,16],[-8,8,16,52],[3,14,48,52],[10,14,48,66],[0,14,62,68],[-15,15,66,96],[-4,4,96,108]].map(([x0,x1,n0,n1])=>rect(x0,x1,n0,n1));
 const {fireReserve:fire}=undergroundPalacePlan;
 // Filter vertical overlap by exact stair step/flat floor height; walls outside
 // this floor envelope contribute no occupied area.
 const masks:Rect[]=[];
 for(const [x,y,n,w,h,d] of palace.surveyBlockers){
   for(let step=0;step<=16;step++){
     const from=step,to=step===16?126:step+1,base=-step*.15;
     if(y>=base+1.8||y+h<=base)continue;
     const r=clip(rect(x-w/2,x+w/2,n-d/2,n+d/2),rect(-22,22,from,to));
     if(r.x1>r.x0&&r.n1>r.n0)masks.push(r);
   }
 }
 type Interval=[number,number];
 function unionLength(v:Interval[]){v.sort((a,b)=>a[0]-b[0]);let total=0,end=-Infinity;for(const [a,b] of v){total+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b)}return total}
 function at(x:number,lo=0,hi=126){
   const ranges:Interval[]=floorRects.filter(r=>x>r.x0&&x<r.x1).map(r=>[r.n0,r.n1]);
   if(Math.abs(x)<22)ranges.push([126-Math.sqrt(22**2-x*x),126]);
   const f=ranges.map(([a,b])=>[Math.max(a,lo),Math.min(b,hi)] as Interval).filter(([a,b])=>b>a);
   const m=masks.filter(r=>x>r.x0&&x<r.x1).map(r=>[r.n0,r.n1] as Interval);
   const blocked=f.flatMap(([a,b])=>m.map(([c,d])=>[Math.max(a,c),Math.min(b,d)] as Interval)).filter(([a,b])=>b>a);
   const fLen=unionLength(f),occ=unionLength(blocked);
   const h=Math.abs(x-fire.east)<30?Math.sqrt(900-(x-fire.east)**2):0;
   const safeLo=fire.north-h,safeHi=fire.north+h;
   const slice=(v:Interval[])=>v.map(([a,b])=>[Math.max(a,safeLo),Math.min(b,safeHi)] as Interval).filter(([a,b])=>b>a);
   return [fLen,occ,unionLength(slice(f))-unionLength(slice(blocked))];
 }
 // Composite midpoint strips at 1mm with exact breaks at all rectangular
 // footprint edges; independent half-metre raster uses exact edge cuts with
 // fine circular boundary sampling along the strip, never a nominal room area.
 const xEdges=cuts([-22,22,...floorRects.flatMap(r=>[r.x0,r.x1]),...masks.flatMap(r=>[r.x0,r.x1])]);
 function integrateStrips(step:number,edges:number[]){
   const out=[0,0,0];for(let i=1;i<edges.length;i++){
     const a=edges[i-1],b=edges[i],n=Math.ceil((b-a)/step),dx=(b-a)/n;
     for(let j=0;j<n;j++){const v=at(a+(j+.5)*dx);for(let k=0;k<3;k++)out[k]+=v[k]*dx}
   }return out;
 }
 const a=integrateStrips(.001,xEdges);
 let gridGross=0,gridOccupied=0,gridSafe=0,rawNet=0,rawSafe=0,capsuleNet=0;
 // Independent 0.5m raster, exact rectangular clipping + refined circular edges.
 for(let i=-44;i<44;i++){
   const l=i/2,r=(i+1)/2,edges=cuts([l,r,...xEdges.filter(x=>x>l&&x<r)]);
   for(let j=0;j<252;j++){
     const lo=j/2,hi=(j+1)/2,x=(l+r)/2,n=(lo+hi)/2;
     if(palace.canStand(x,n,0)){rawNet+=.25;if(Math.hypot(x-fire.east,n-fire.north)<=30)rawSafe+=.25}
     if(palace.canStand(x,n,.27))capsuleNet+=.25;
     if(!floorRects.some(p=>overlap(p,rect(l,r,lo,hi)))&&
       Math.hypot(Math.max(0,l,-r),126-hi)>22)continue;
     for(let k=1;k<edges.length;k++){
       const aa=edges[k-1],bb=edges[k],count=Math.ceil((bb-aa)/.01),dx=(bb-aa)/count;
       for(let u=0;u<count;u++){const [g,o,s]=at(aa+(u+.5)*dx,lo,hi);gridGross+=g*dx;gridOccupied+=o*dx;gridSafe+=s*dx}
     }
   }
 }
 const net=a[0]-a[1],gridNet=gridGross-gridOccupied;
 for(const [v,g] of [[a[0],gridGross],[net,gridNet],[a[2],gridSafe]])if(diff(v,g)>=.1)throw Error('Palace variance '+v+'/'+g);
 const vault=undergroundPalaceDressing.pieces.filter(p=>p.zone.startsWith('vault-')&&p.name.startsWith('u11/vault/floor-'));
 const sealed=integrate(vault.map(p=>({...footprint(p),kind:'floor',bottom:p.center[1]-p.size[1]/2,top:p.center[1]+p.size[1]/2}))).dry;
 console.log(JSON.stringify({
 scope:'geometry projection and exact collision masks only. Crystal floor highest tile at each point, any wet projection excluded; no certified terrain/capsule connectivity. Palace uses actual D shell blockers, sealed reserve separate, no core deck constructed.',
 crystal:{...crystal,grid,raw,diffPct:Object.fromEntries((['dry','water','occupied'] as const).map(k=>[k,diff(crystal[k],grid[k])])),knownSolidCount:pieces.filter(p=>p.solid).length,fireSafety:0},
 palace:{source,gross:a[0],occupied:a[1],net,candidateFireSafety:a[2],outsideFireSafety:net-a[2],gridGross,gridOccupied,gridNet,gridSafe,rawNet,rawSafe,capsuleNet,netDiffPct:diff(net,gridNet),safeDiffPct:diff(a[2],gridSafe),sealedVaultFloorTileProjection:sealed,sealedVaultFloorTiles:vault.length,core:'not built / not measured'},
 pending:'world registry, authoritative safety and mineral occupancy, live path; do not treat reserve as accessible'
 },null,2));
}finally{palace.dispose()}
