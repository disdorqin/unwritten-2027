import {BoxGeometry,BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial,Material} from 'three';
import {mountAR30StaticBatches} from './town-a-r30-static-batches';
import type {MainSummitTrailPoint as P} from './main-summit-trail';
import type {SouthGround} from './town-night-a-summit-landform';
type Section={index:number;p:P;ex:number;nn:number;left:number;right:number;min:number;max:number;valid:boolean};
const half=1.5;
/** Actual south-sector road construction on the shared surveyed centreline.
 * Only build intervals with real support and no buried tread. D2 must
 * replace corresponding legacy road visuals, not draw both. Unbuilt
 * intervals are explicit, never bridged by a fabricated path. */
export function mountSouthTrailWorks(points:readonly P[],groundAt:SouthGround){
 const root=new Group();root.name='night-a-south-trail-works';
 const roadMat=new MeshLambertMaterial({vertexColors:true}),wallMat=new MeshLambertMaterial({color:'#7b807b'}),wood=new MeshLambertMaterial({color:'#655441'}),snow=new MeshLambertMaterial({color:'#cfdae0'});
 const batches=new Map<Material,BufferGeometry[]>(),sections:Section[]=[];
 const add=(m:Material,g:BufferGeometry)=>{const a=batches.get(m)??[];a.push(g);batches.set(m,a);};
 let total=0,minGap=Infinity,maxGap=-Infinity;
 for(let i=1;i<points.length-1;i++){
  const p=points[i]!,a=points[i-1]!,b=points[i+1]!;
  if(p.north<40||p.north>=448||Math.abs(p.east)>=1068)continue;
  const dx=b.east-a.east,dn=b.north-a.north,l=Math.hypot(dx,dn);if(l<1e-6)continue;
  const ex=-dn/l,nn=dx/l;
  const h=[-2.4,-half,-.75,0,.75,half,2.4].map(t=>groundAt(p.east+ex*t,p.north+nn*t));
  if(h.some(v=>v===undefined||!Number.isFinite(v)))continue;
  const gaps=h.slice(1,-1).map(y=>p.height-y!),min=Math.min(...gaps),max=Math.max(...gaps);
  minGap=Math.min(minGap,min);maxGap=Math.max(maxGap,max);
  // Only modest fill with no cut through original terrain. For deeper
  // structures the final C2/D2 engineering route must be re-certified.
  sections.push({index:i,p,ex,nn,left:h[0]!,right:h.at(-1)!,min,max,valid:min>=-.035&&max<=3.0});
 }
 const chunks=new Map<string,{p:number[];c:number[]}>();
 const gravel=new Color('#a49b89'),packed=new Color('#c3bbb0'),edge=new Color('#889191');
 const links:{from:number;to:number;metres:number}[]=[];let length=0,posts=0,bridged=0;
 const markers:{east:number;north:number;height:number}[]=[];
 const tri=(bin:{p:number[];c:number[]},verts:number[][],colors:Color[])=>{for(let i=0;i<3;i++){bin.p.push(...verts[i]!);const c=colors[i]!;bin.c.push(c.r,c.g,c.b);}};
 const vertex=(s:Section,t:number,y:number)=>[s.p.east+s.ex*t,y,-s.p.north-s.nn*t];
 const box=(m:Material,e:number,n:number,y:number,w:number,h:number,d:number,yaw=0)=>add(m,new BoxGeometry(w,h,d).rotateY(yaw).translate(e,y,-n));
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1]!,b=sections[i]!,span=Math.hypot(b.p.east-a.p.east,b.p.north-a.p.north);
  if(b.index!==a.index+1)continue;
  total+=span;if(!a.valid||!b.valid||span<=0||Math.abs(b.p.height-a.p.height)/span>.12+1e-7)continue;
  const k=Math.floor(a.p.east/96)+','+Math.floor(a.p.north/96),bin=chunks.get(k)??{p:[],c:[]};chunks.set(k,bin);
  // Four strips: packed centre, two fine edge bands. Same height as the
  // existing route plus a 0.055m wearing course; no second route.
  for(const [t0,t1,c] of [[-half,-1.16,edge],[-1.16,0,gravel],[0,1.16,packed],[1.16,half,edge]] as const){
   const v=[vertex(a,t0,a.p.height+.055),vertex(a,t1,a.p.height+.055),vertex(b,t0,b.p.height+.055),vertex(b,t1,b.p.height+.055)];
   // ex is left of direction in EN; world north is -Z, upward winding.
   tri(bin,[v[1]!,v[0]!,v[2]!],[c,c,c]);tri(bin,[v[1]!,v[2]!,v[3]!],[c,c,c]);
  }
  // Grounded fill sides follow the exact terrain at both shoulder edges.
  for(const side of [-1,1]){
   const u=side*half,t=side*2.4,ya=side<0?a.left:a.right,yb=side<0?b.left:b.right;
   const v=[vertex(a,u,a.p.height+.035),vertex(a,t,ya),vertex(b,u,b.p.height+.035),vertex(b,t,yb)];
   const c=side<0?gravel:edge;
   if(side<0){tri(bin,[v[0]!,v[1]!,v[2]!],[c,c,c]);tri(bin,[v[1]!,v[3]!,v[2]!],[c,c,c]);}
   else{tri(bin,[v[1]!,v[0]!,v[2]!],[c,c,c]);tri(bin,[v[1]!,v[2]!,v[3]!],[c,c,c]);}
  }
  if(a.max>.65||b.max>.65)bridged+=span;
  if(a.index%8===0&&a.p.north>55){
   // Small grounded stone marker off the clear 3m tread. No barrier in
   // centreline; choose only an actual ground shoulder below the tread.
   const side=1,t=2.4,e=a.p.east+a.ex*t,n=a.p.north+a.nn*t,h=a.right;
   if(Math.abs(a.p.height-h)<1.4){
    box(wallMat,e,n,h+.35,.40,.9,.40);box(wood,e,n,h+.98,.14,.48,.14);box(snow,e,n,h+1.23,.24,.09,.24);markers.push({east:e,north:n,height:h});posts++;
   }
  }
  length+=span;links.push({from:a.index,to:b.index,metres:span});
 }
 for(const [k,{p,c}] of chunks){
  const geo=new BufferGeometry();geo.setAttribute('position',new Float32BufferAttribute(p,3));geo.setAttribute('color',new Float32BufferAttribute(c,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const m=new Mesh(geo,roadMat);m.name='south-trail:'+k;root.add(m);
 }
 mountAR30StaticBatches(root,batches,'south-trail-marker');
 const runs:{first:number;last:number;metres:number}[]=[];
 for(const l of links){const tail=runs.at(-1);if(tail&&tail.last===l.from){tail.last=l.to;tail.metres+=l.metres;}else runs.push({first:l.from,last:l.to,metres:l.metres});}
 return {group:root,runs,sections,markers,blocked(e:number,n:number,h:number,r=.27,body=1.8){return markers.some(m=>h+body-.025>m.height-.1&&h+.025<m.height+1.28&&Math.hypot(Math.max(0,Math.abs(m.east-e)-.2),Math.max(0,Math.abs(m.north-n)-.2))<r);},stats:{total,length,unbuilt:total-length,minGap,maxGap,posts,bridged,runs:runs.length},
 dispose(){root.removeFromParent();root.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});for(const m of [roadMat,wallMat,wood,snow])m.dispose();root.clear();}};
}
