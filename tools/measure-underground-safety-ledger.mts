/** Re-measure the current registered-layout first mine and -140 candidate.
 * Floor projection and safe masks are separate from actual capsule connectivity.
 * No density claim before the authority mineral and safety registries exist. */
import {createUndergroundMineLayout} from '../src/shared/underground-mine-layout.js';
import {undergroundMineSpec as spec} from './fixtures/underground-first-mine-survey-spec.js';
import {firstMineDeepWorks} from '../src/shared/town-c-first-mine-deep-works.js';
import {createUndergroundCampRemains} from './voxel-tavern/town-blockout/underground-camp-remains.js';
import {secondMineRooms,secondMineAnchors} from '../src/shared/underground-second-mine-layout.js';
import {createSecondMineScene} from './voxel-tavern/town-blockout/underground-second-mine.js';
type Rect={x0:number;x1:number;n0:number;n1:number};
type Circle={x:number;n:number;r:number};
const rect=(x0:number,x1:number,n0:number,n1:number):Rect=>({x0,x1,n0,n1});
const centred=(x:number,n:number,w:number,d:number)=>rect(x-w/2,x+w/2,n-d/2,n+d/2);
const area=(r:Rect)=>(r.x1-r.x0)*(r.n1-r.n0);
const inside=(r:Rect,x:number,n:number)=>r.x0<x&&x<r.x1&&r.n0<n&&n<r.n1;
const clip=(a:Rect,b:Rect)=>rect(Math.max(a.x0,b.x0),Math.min(a.x1,b.x1),Math.max(a.n0,b.n0),Math.min(a.n1,b.n1));
const overlap=(a:Rect,b:Rect)=>a.x0<b.x1&&b.x0<a.x1&&a.n0<b.n1&&b.n0<a.n1;
function decompose(floor:Rect[],masks:Rect[]){
 const x=[...new Set([...floor,...masks].flatMap(r=>[r.x0,r.x1]))].sort((a,b)=>a-b);
 const cells:Rect[]=[];let blocked=0;
 for(let i=1;i<x.length;i++){
  const mid=(x[i]+x[i-1])/2,active=floor.filter(r=>r.x0<mid&&mid<r.x1),solid=masks.filter(r=>r.x0<mid&&mid<r.x1);
  if(!active.length)continue;
  const ns=[...new Set([...active,...solid].flatMap(r=>[r.n0,r.n1]))].sort((a,b)=>a-b);
  for(let j=1;j<ns.length;j++){
   const n=(ns[j]+ns[j-1])/2;if(!active.some(r=>r.n0<n&&n<r.n1))continue;
   const cell=rect(x[i-1],x[i],ns[j-1],ns[j]);
   if(solid.some(r=>r.n0<n&&n<r.n1))blocked+=area(cell);else cells.push(cell);
  }
 }
 return {cells,blocked,net:cells.reduce((s,r)=>s+area(r),0)};
}
function simpson(f:(x:number)=>number,a:number,b:number,eps:number,depth=15){
 const whole=(a:number,b:number,fa:number,fm:number,fb:number)=>(b-a)*(fa+4*fm+fb)/6;
 const walk=(l:number,r:number,fl:number,fm:number,fr:number,s:number,t:number,d:number):number=>{
  const m=(l+r)/2,ql=f((l+m)/2),qr=f((m+r)/2),u=whole(l,m,fl,ql,fm),v=whole(m,r,fm,qr,fr);
  if(!d||Math.abs(u+v-s)<15*t)return u+v+(u+v-s)/15;
  return walk(l,m,fl,ql,fm,u,t/2,d-1)+walk(m,r,fm,qr,fr,v,t/2,d-1);
 };
 if(b<=a)return 0;const m=(a+b)/2,fa=f(a),fm=f(m),fb=f(b);
 return walk(a,b,fa,fm,fb,whole(a,b,fa,fm,fb),eps,depth);
}
function circleStrip(r:Rect,circles:Circle[],x:number){
 const intervals: number[][]=[];
 for(const c of circles){const dx=x-c.x;if(Math.abs(dx)>=c.r)continue;const dz=Math.sqrt(c.r*c.r-dx*dx);
  const a=Math.max(r.n0,c.n-dz),b=Math.min(r.n1,c.n+dz);if(b>a)intervals.push([a,b]);}
 intervals.sort((a,b)=>a[0]-b[0]);let end=-Infinity,len=0;
 for(const [a,b] of intervals){len+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b)}
 return len;
}
function safetyAnalytic(cells:Rect[],circles:Circle[]){
 let sum=0;
 for(const r of cells){
  const cuts=[r.x0,r.x1];
  for(const c of circles){
   cuts.push(c.x-c.r,c.x+c.r);
   for(const n of [r.n0,r.n1]){const dz=n-c.n;if(Math.abs(dz)<c.r){const dx=Math.sqrt(c.r*c.r-dz*dz);cuts.push(c.x-dx,c.x+dx)}}
  }
  const xs=[...new Set(cuts.filter(x=>x>=r.x0&&x<=r.x1))].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)sum+=simpson(x=>circleStrip(r,circles,x),xs[i-1],xs[i],1e-8);
 }
 return sum;
}
function distanceRange(r:Rect,c:Circle){
 return [Math.hypot(Math.max(0,r.x0-c.x,c.x-r.x1),Math.max(0,r.n0-c.n,c.n-r.n1)),
  Math.hypot(Math.max(Math.abs(r.x0-c.x),Math.abs(r.x1-c.x)),Math.max(Math.abs(r.n0-c.n),Math.abs(r.n1-c.n)))];
}
// Half-metre grid with exact rectangle clipping at room/obstacle edges;
// only circular boundary cells use 1cm recursive quadrature, retaining raw grid.
function safetyGrid(r:Rect,circles:Circle[],depth=6):number{
 const limits=circles.map(c=>({c,d:distanceRange(r,c)}));
 if(limits.some(q=>q.d[1]<=q.c.r))return area(r);
 if(limits.every(q=>q.d[0]>=q.c.r))return 0;
 const x=(r.x0+r.x1)/2,n=(r.n0+r.n1)/2;
 if(depth===0)return circles.some(c=>Math.hypot(x-c.x,n-c.n)<c.r)?area(r):0;
 return safetyGrid(rect(r.x0,x,r.n0,n),circles,depth-1)+safetyGrid(rect(x,r.x1,r.n0,n),circles,depth-1)+
  safetyGrid(rect(r.x0,x,n,r.n1),circles,depth-1)+safetyGrid(rect(x,r.x1,n,r.n1),circles,depth-1);
}
function raster(floor:Rect[],masks:Rect[],circles:Circle[],bounds:Rect){
 let net=0,safe=0,rawNet=0,rawSafe=0;
 for(let xi=Math.floor(bounds.x0*2);xi<Math.ceil(bounds.x1*2);xi++)
  for(let ni=Math.floor(bounds.n0*2);ni<Math.ceil(bounds.n1*2);ni++){
   const g=rect(xi/2,(xi+1)/2,ni/2,(ni+1)/2),x=(g.x0+g.x1)/2,n=(g.n0+g.n1)/2;
   const fs=floor.filter(r=>overlap(r,g));if(!fs.length)continue;
   const ms=masks.filter(r=>overlap(r,g));
   if(fs.some(r=>inside(r,x,n))&&!ms.some(r=>inside(r,x,n))){rawNet+=.25;if(circles.some(c=>Math.hypot(x-c.x,n-c.n)<c.r))rawSafe+=.25}
   const local=decompose(fs.map(r=>clip(r,g)),ms.map(r=>clip(r,g)));net+=local.net;
   for(const r of local.cells)safe+=safetyGrid(r,circles);
  }
 return {net,safe,rawNet,rawSafe};
}
function metric(floor:Rect[],masks:Rect[],circles:Circle[],bounds:Rect){
 const base=decompose(floor,[]).net,d=decompose(floor,masks),safety=safetyAnalytic(d.cells,circles),g=raster(floor,masks,circles,bounds);
 const pct=(a:number,b:number)=>Math.abs(a-b)/Math.max(1e-12,a)*100;
 return {dryGross:base,occupiedOrInaccessible:d.blocked,net:d.net,safeIntersection:safety,outsideSafe:d.net-safety,grid:g,
  netDifferencePct:pct(d.net,g.net),safeDifferencePct:pct(safety,g.safe),outsideSafeDifferencePct:pct(d.net-safety,g.net-g.safe)};
}
// Full capsule-connected raw grid. This is a conservative sampling, not exact
// area; do not confuse it with a geometric measure. Both sides of a narrow
// crossing are verified at the edge midpoint.
function reachableGrid(bounds:Rect,start:[number,number],query:(x:number,n:number)=>boolean,dry:(x:number,n:number)=>boolean){
 const ix0=Math.floor(bounds.x0*2),in0=Math.floor(bounds.n0*2),nx=Math.ceil(bounds.x1*2)-ix0,nn=Math.ceil(bounds.n1*2)-in0;
 const ok=new Uint8Array(nx*nn),visited=new Uint8Array(nx*nn);
 const point=(i:number):[number,number]=>[(ix0+i%nx+.5)/2,(in0+Math.floor(i/nx)+.5)/2];
 for(let i=0;i<ok.length;i++){const [x,n]=point(i);if(query(x,n))ok[i]=1}
 const seed=(Math.floor(start[1]*2)-in0)*nx+Math.floor(start[0]*2)-ix0;
 if(!ok[seed])throw Error('Unwalkable survey seed');
 const q=[seed];visited[seed]=1;let dryCount=0,wetCount=0;
 for(let h=0;h<q.length;h++){
  const i=q[h],[x,n]=point(i);if(dry(x,n))dryCount++;else wetCount++;
  for(const [dx,dn] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const cx=i%nx+dx,cz=Math.floor(i/nx)+dn;if(cx<0||cx>=nx||cz<0||cz>=nn)continue;
    const j=cz*nx+cx;if(!ok[j]||visited[j])continue;const [xx,zz]=point(j);
    if(!query((x+xx)/2,(n+zz)/2))continue;
    visited[j]=1;q.push(j);
  }
 }
 return {dryGrid:dryCount*.25,wetGrid:wetCount*.25,disconnectedGrid:(ok.reduce((s,x)=>s+x,0)-q.length)*.25};
}
function upward(mesh:Float32Array){let sum=0;for(let i=0;i<mesh.length;i+=9){
 const ny=(mesh[i+5]-mesh[i+2])*(mesh[i+6]-mesh[i])-(mesh[i+3]-mesh[i])*(mesh[i+8]-mesh[i+2]);if(ny>0)sum+=ny/2;
}return sum}
const mine=createUndergroundMineLayout(spec),camp=createUndergroundCampRemains({mine,camp:spec.camp,walker:spec.walker}),mine2=createSecondMineScene();
try{
 const dry90=[rect(-2,2,12,32),rect(-.6,.6,32,35),rect(-2,7,35,45),rect(-2,2,45,49),
  rect(-4.2,4.2,49,138.8),rect(-2,2,138.8,140),
  rect(-72,-4.2,71.6,81.1),rect(-100,-72,69.8,82.9),
  rect(4.2,72,88.7,99.15),rect(72,100,86.9,100.95),
  ...firstMineDeepWorks.rooms.map(r=>rect(r.minX,r.maxX,r.minZ,r.maxZ))];
 const wet90=[rect(-3,3,0,4),rect(-2,2,4,12),rect(4.2,7.4,113.4,137)];
 const fixtures90=[...mine.workfaces,...(mine.supportStation?[mine.supportStation]:[]),...mine.deepFixtures].map(s=>centred(s.x,s.z,s.width,s.depth));
 const campMasks=camp.colliders.filter(b=>b.max[1]>-91&&b.min[1]<-91+1.8).map(b=>rect(b.min[0],b.max[0],b.min[2],b.max[2]));
 // The crystal gate is closed in the present host. Exclude the whole volume
 // behind the blocking plane; this is not counted as furniture occupancy.
 const gate=rect(-2,2,138.8-.08,140),masks90=[...fixtures90,...campMasks,gate];
 const [cx,,cz]=mine.anchors.campRecovery.position,[sx,,sz]=mine.supportStation!.foot;
 const circles90=[{x:cx,n:cz,r:30},{x:sx,n:sz,r:30}];
 const m90=metric(dry90,masks90,circles90,rect(-100,100,0,140));
 const static90=decompose(dry90,[...fixtures90,...campMasks]);
 const mesh90=upward(mine.mesh.rock)+upward(mine.mesh.rail),water90=wet90.reduce((s,r)=>s+area(r),0);
 const query90=(x:number,n:number)=>{
  const p=mine.queryPassage(x,n,.27,1.1,'closed');return !!p&&(p.zone!=='camp'||!!camp.queryPassage(x,n,.27,1.1));
 };
 const reach90=reachableGrid(rect(-100,100,0,140),[.25,12.25],query90,(x,n)=>!(mine.queryPassage(x,n,.27,1.1,'closed')?.waterDepth));
 const dry140=secondMineRooms.filter(r=>!r.river).map(r=>rect(r.x0,r.x1,r.n0,r.n1));
 const mask140=mine2.solids.map(s=>centred(s.x,s.n,s.w,s.d));
 const circles140=[secondMineAnchors.supportCamp,secondMineAnchors.riverCamp].map(p=>({x:p.east,n:p.north,r:30}));
 const m140=metric(dry140,mask140,circles140,rect(-66,66,0,198));
 const reach140=reachableGrid(rect(-66,66,0,198),[.25,2.25],(x,n)=>mine2.canStand(x,n),()=>true);
 const result={scope:'geometry/known static collision/safe-circle candidates only. First mine host layout, second mine unregistered; 30m masks not server authority. No density until mineral and authority masks complete.',
  mine90:{...m90,water:water90,meshGross:mesh90,meshProjectionDifferencePct:Math.abs(mesh90-m90.dryGross-water90)/mesh90*100,staticOccupied:static90.blocked,closedGateExcluded:m90.occupiedOrInaccessible-static90.blocked,reach:reach90},
  mine140:{...m140,water:secondMineRooms.filter(r=>r.river).reduce((s,r)=>s+(r.x1-r.x0)*(r.n1-r.n0),0),reach:reach140,
    dryWings:secondMineRooms.filter(r=>['west-workface','east-workface','collapse-wing','barracks-wing'].includes(r.id)).map(r=>({id:r.id,area:(r.x1-r.x0)*(r.n1-r.n0)}))},
  pending:['registered ore masks all layers','first mine presence bounds vs actual yaw','140 world frame and pump annex registration','165 city safety pocket boundary','190 vault and core inaccessible geometry']};
 for(const m of [m90,m140])if(m.netDifferencePct>=.1||m.safeDifferencePct>=.1||m.outsideSafeDifferencePct>=.1)throw Error('Dual method variance exceeds gate '+JSON.stringify(m));
 console.log(JSON.stringify(result,null,2));
}finally{camp.dispose();mine2.dispose()}
