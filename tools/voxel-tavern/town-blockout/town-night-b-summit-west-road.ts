import {BufferGeometry,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import {mainSummitTrailSpec,type MainSummitTrailPoint as Point} from './main-summit-trail';
import {nightBWestBounds as bounds,inNightBWest} from './town-night-b-summit-west-relief';
type Height=(e:number,n:number)=>number|undefined;
type Tri=readonly [Point,Point,Point];
const half=mainSummitTrailSpec.width/2,lift=.07,cell=32;
const mix=(a:Point,b:Point,t:number):Point=>({east:a.east+(b.east-a.east)*t,north:a.north+(b.north-a.north)*t,height:a.height+(b.height-a.height)*t});
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
function clip(poly:readonly Point[],distance:(p:Point)=>number){
 const out:Point[]=[];for(let i=0;i<poly.length;i++){const a=poly[(i+poly.length-1)%poly.length]!,b=poly[i]!,da=distance(a),db=distance(b);if((da>=0)!==(db>=0))out.push(mix(a,b,da/(da-db)));if(db>=0)out.push(b)}return out;
}
function sector(poly:readonly Point[]){
 for(const d of [(p:Point)=>p.east-bounds.west,(p:Point)=>bounds.east-p.east,(p:Point)=>p.north-bounds.south,(p:Point)=>bounds.north-p.north])poly=clip(poly,d);
 return poly;
}
const area=(a:Point,b:Point,c:Point)=>(b.east-a.east)*(c.north-a.north)-(b.north-a.north)*(c.east-a.east);
function projectedDistance(a:Point,b:Point,e:number,n:number){
 const dx=b.east-a.east,dn=b.north-a.north,d=dx*dx+dn*dn;
 const t=d>0?Math.max(0,Math.min(1,((e-a.east)*dx+(n-a.north)*dn)/d)):0;
 return Math.hypot(e-a.east-t*dx,n-a.north-t*dn);
}
function gridKeys(w:number,e:number,s:number,n:number){
 const result:string[]=[];for(let x=Math.floor(w/cell);x<=Math.floor(e/cell);x++)for(let z=Math.floor(s/cell);z<=Math.floor(n/cell);z++)result.push(x+','+z);return result;
}
type Segment={a:Point;b:Point};
type Batch={tread:number[];stone:number[];rail:number[]};
/** The one P-3/C2-supplied centreline is immutable. This package REPLACES the
 * western part of the global tread/support mesh, not a second route. The host
 * must cut the canonical terrain against the tread geometry and retain the
 * same neighbour seam before admitting public walking. */
export function createNightBWestRoad(points:readonly Point[],groundAt:Height){
 if(points.length<3||points.some(p=>![p.east,p.north,p.height].every(Number.isFinite)))throw new RangeError('west road requires surveyed finite centreline');
 const group=new Group();group.name='night-b-west-road-replacement';
 const roadMaterial=new MeshLambertMaterial({color:'#b4b9b8',side:DoubleSide}),stoneMaterial=new MeshLambertMaterial({color:'#747d82',side:DoubleSide}),railMaterial=new MeshLambertMaterial({color:'#73523c',side:DoubleSide});
 const triCells=new Map<string,Tri[]>(),routeCells=new Map<string,Segment[]>(),railCells=new Map<string,Segment[]>();
 const batches=new Map<string,Batch>(),geos:BufferGeometry[]=[];
 const batch=(p:Point)=>{const key=Math.floor(p.east/96)+','+Math.floor(p.north/96);let b=batches.get(key);if(!b){b={tread:[],stone:[],rail:[]};batches.set(key,b)}return b};
 const boundsOf=(t:readonly Point[])=>({w:Math.min(...t.map(p=>p.east)),e:Math.max(...t.map(p=>p.east)),s:Math.min(...t.map(p=>p.north)),n:Math.max(...t.map(p=>p.north))});
 const insert=<T>(map:Map<string,T[]>,o:T,pts:readonly Point[],pad=0)=>{const b=boundsOf(pts);for(const key of gridKeys(b.w-pad,b.e+pad,b.s-pad,b.n+pad)){const list=map.get(key)??[];list.push(o);map.set(key,list)}};
 let length=0,maxGrade=0,maxCut=0,maxFill=0,railMetres=0,sections=0,treadTris=0,stoneTris=0,railTris=0;
 function emit(a:Point,b:Point,c:Point,family:keyof Batch){
  const poly=sector([a,b,c]);if(poly.length<3)return;
  for(let i=1;i<poly.length-1;i++){
   const t=[poly[0]!,poly[i]!,poly[i+1]!] as const;
   const ax=t[1].east-t[0].east,ay=t[1].height-t[0].height,az=t[1].north-t[0].north,bx=t[2].east-t[0].east,by=t[2].height-t[0].height,bz=t[2].north-t[0].north;
   if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)<1e-8)continue;
   if(family==='tread'){treadTris++;insert(triCells,t,t);}else if(family==='stone')stoneTris++;else railTris++;
   batch(t[0])[family].push(...t.flatMap(p=>[p.east,p.height,-p.north]));
  }
 }
 const quad=(a:Point,b:Point,c:Point,d:Point,f:keyof Batch)=>{emit(a,b,c,f);emit(c,b,d,f)};
 const sectionsAt=points.map((p,i)=>{
  const a=points[Math.max(0,i-1)]!,b=points[Math.min(points.length-1,i+1)]!,dx=b.east-a.east,dn=b.north-a.north,l=Math.hypot(dx,dn);
  if(l<1e-6)throw new RangeError('degenerate west road tangent');
  const edge=(side:number,r=half):Point=>({east:p.east-side*dn/l*r,north:p.north+side*dx/l*r,height:p.height+lift});
  return {p,edge};
 });
 function atGround(p:Point){const h=groundAt(p.east,p.north);if(h===undefined||!Number.isFinite(h))throw new RangeError('missing west road terrain');maxCut=Math.max(maxCut,h-p.height);maxFill=Math.max(maxFill,p.height-h);return h;}
 function clippedLength(a:Point,b:Point){
  let lo=0,hi=1;for(const d of [(p:Point)=>p.east-bounds.west,(p:Point)=>bounds.east-p.east,(p:Point)=>p.north-bounds.south,(p:Point)=>bounds.north-p.north]){
   const x=d(a),y=d(b);if(x<0&&y<0)return 0;if(x<0)lo=Math.max(lo,x/(x-y));else if(y<0)hi=Math.min(hi,x/(x-y));
  }return Math.max(0,hi-lo)*Math.hypot(b.east-a.east,b.north-a.north);
 }
 for(let i=1;i<sectionsAt.length;i++){
  const a=sectionsAt[i-1]!,b=sectionsAt[i]!,span=Math.hypot(b.p.east-a.p.east,b.p.north-a.p.north);
  if(span<1e-6)continue;
  const grade=Math.abs(b.p.height-a.p.height)/span;if(grade>mainSummitTrailSpec.maximumGrade+1e-6)throw new RangeError('road exceeds canonical grade');
  const segment={a:a.p,b:b.p};insert(routeCells,segment,[a.p,b.p],half);
  const edgeA=[a.edge(-1),a.edge(1)],edgeB=[b.edge(-1),b.edge(1)];
  const ext=boundsOf([...edgeA,...edgeB]);if(ext.e<bounds.west||ext.w>bounds.east||ext.n<bounds.south||ext.s>bounds.north)continue;
  const metres=clippedLength(a.p,b.p);length+=metres;maxGrade=Math.max(maxGrade,grade);sections++;
  quad(edgeA[0]!,edgeA[1]!,edgeB[0]!,edgeB[1]!,'tread');
  for(const side of [-1,1]){
   const l=a.edge(side),r=b.edge(side),g0=atGround(l),g1=atGround(r);
   // Continuous masonry web follows the actual grade and embeds into terrain.
   const base0={...l,height:Math.min(g0-.2,l.height-.24)},base1={...r,height:Math.min(g1-.2,r.height-.24)};
   quad(l,base0,r,base1,'stone');
   // Add the outward stone plinth, with its bottom following real ground.
   const o0=a.edge(side,half+.30),o1=b.edge(side,half+.30);
   const y0=atGround(o0),y1=atGround(o1);
   const cap0={...o0,height:l.height-.14},cap1={...o1,height:r.height-.14};
   quad(l,cap0,r,cap1,'stone');quad(cap0,{...o0,height:Math.min(y0-.2,cap0.height-.18)},cap1,{...o1,height:Math.min(y1-.2,cap1.height-.18)},'stone');
   // Guard only real exposed drop, outside the 32 m coordination band.
   const interior=(p:Point)=>p.east>bounds.west+32&&p.east<bounds.east-32&&p.north>bounds.south+32&&p.north<bounds.north-32;
   if(Math.min(l.height-g0,r.height-g1)>.9&&interior(o0)&&interior(o1)){
    const up=(p:Point,h:number)=>({...p,height:p.height+h});
    const ia=a.edge(side,half+.24),ib=b.edge(side,half+.24),oa=a.edge(side,half+.38),ob=b.edge(side,half+.38);
    for(const h of [.48,.98]){
     const aa=up(ia,h),bb=up(ib,h),cc=up(oa,h),dd=up(ob,h);
     quad(aa,cc,bb,dd,'rail');quad(aa,up(aa,-.13),bb,up(bb,-.13),'rail');quad(cc,up(cc,-.13),dd,up(dd,-.13),'rail');
    }
    if(i%4===0){const t=.08/span,c=mix(ia,ib,Math.min(.4,t)),d=mix(oa,ob,Math.min(.4,t));quad(ia,up(ia,1.03),c,up(c,1.03),'rail');quad(oa,up(oa,1.03),d,up(d,1.03),'rail');quad(ia,oa,up(ia,1.03),up(oa,1.03),'rail');}
    insert(railCells,{a:ia,b:ib},[ia,ib],.2);railMetres+=span;
   }
  }
 }
 for(const [key,b] of batches)for(const family of ['tread','stone','rail'] as const){
  if(!b[family].length)continue;const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(b[family],3));g.computeVertexNormals();g.computeBoundingSphere();geos.push(g);
  const m=new Mesh(g,family==='tread'?roadMaterial:family==='stone'?stoneMaterial:railMaterial);m.name='west-road-'+key+'-'+family;group.add(m);
 }
 function surfaceAt(e:number,n:number){
  if(!inNightBWest(e,n)&&!(e===bounds.east&&n>=bounds.south&&n<=bounds.north))return;
  let h:number|undefined;const p={east:e,north:n,height:0};
  for(const t of triCells.get(Math.floor(e/cell)+','+Math.floor(n/cell))??[]){
   const [a,b,c]=t,d=area(a,b,c);if(Math.abs(d)<1e-10)continue;
   const u=area(a,p,c)/d,v=area(a,b,p)/d;if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8){const y=a.height+u*(b.height-a.height)+v*(c.height-a.height);h=h===undefined?y:Math.max(h,y)}
  }return h;
 }
 function reserved(e:number,n:number,r:number){if(![e,n,r].every(Number.isFinite)||r<0)return false;return gridKeys(e-r,e+r,n-r,n+r).some(key=>(routeCells.get(key)??[]).some(s=>projectedDistance(s.a,s.b,e,n)<=half+r));}
 function blocked(e:number,n:number,h:number,r=.27,body=1.8){
  return gridKeys(e-r,e+r,n-r,n+r).some(key=>(railCells.get(key)??[]).some(s=>{if(projectedDistance(s.a,s.b,e,n)>r+.15)return false;const de=s.b.east-s.a.east,dn=s.b.north-s.a.north,t=Math.max(0,Math.min(1,((e-s.a.east)*de+(n-s.a.north)*dn)/(de*de+dn*dn)));const y=lerp(s.a.height,s.b.height,t);return h+body>y&&h<y+1.03}));
 }
 let disposed=false;
 return {group,surfaceAt,reserved,blocked,stats:Object.freeze({length,maxGrade,maxCut,maxFill,railMetres,sections,treadTris,stoneTris,railTris,draws:group.children.length,triangles:treadTris+stoneTris+railTris}),dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();geos.forEach(g=>g.dispose());roadMaterial.dispose();stoneMaterial.dispose();railMaterial.dispose();triCells.clear();routeCells.clear();railCells.clear();}};
}
