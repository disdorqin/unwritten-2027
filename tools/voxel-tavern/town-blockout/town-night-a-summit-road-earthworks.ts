import {BufferGeometry,Color,DoubleSide,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial} from 'three';
import type {MainSummitTrailPoint as Point} from './main-summit-trail';
import type {SouthGround} from './town-night-a-summit-landform';

type Tri=readonly [Point,Point,Point];
const cell=24,half=1.5,lift=.055;
const area=(a:Point,b:Point,c:Point)=>(b.east-a.east)*(c.north-a.north)-(b.north-a.north)*(c.east-a.east);
/** A bounded earthwork on C2's accepted centreline/profile. Supply the
 * identical canonical terrain to this builder and D2's terrain cutter.
 * The returned indexed cutTread describes the entire walking strip;
 * do not mount the old tread or admit walking before cut is installed.
 * This module deliberately does not replace a shared height authority. */
export function mountSouthEarthworks(points:readonly Point[],first:number,last:number,groundAt:SouthGround,cap=5){
 if(first<1||last>=points.length-1||first>=last||!Number.isFinite(cap)||cap<=0)throw Error('Invalid southern earthwork range');
 const group=new Group();group.name='night-a-south-road-earthworks';
 const treadMat=new MeshLambertMaterial({vertexColors:true}),stoneMat=new MeshLambertMaterial({vertexColors:true,side:DoubleSide});
 const chunks=new Map<string,{road:number[];roadColor:number[];walls:number[];wallColor:number[]}>();
 const triangleCells=new Map<string,Tri[]>(),verts:number[]=[],idx:number[]=[],lookup=new Map<string,number>();
 const railSegments:{a:Point;b:Point}[]=[];
 const roadColor=new Color('#aba496'),edgeColor=new Color('#8c948d'),wallColor=new Color('#747d7e'),fillColor=new Color('#8a8e85'),railColor=new Color('#6b5241');
 const get=(p:Point)=>{const key=Math.floor(p.east/96)+','+Math.floor(p.north/96);let c=chunks.get(key);if(!c){c={road:[],roadColor:[],walls:[],wallColor:[]};chunks.set(key,c);}return c;};
 const keys=(w:number,e:number,s:number,n:number)=>{const out:string[]=[];for(let i=Math.floor(w/cell);i<=Math.floor(e/cell);i++)for(let j=Math.floor(s/cell);j<=Math.floor(n/cell);j++)out.push(i+','+j);return out;};
 const put=(p:Point)=>{const xyz=[Math.fround(p.east),Math.fround(p.height),Math.fround(-p.north)],key=xyz.join(',');let i=lookup.get(key);if(i===undefined){i=verts.length/3;lookup.set(key,i);verts.push(...xyz);}return i;};
 const point=(e:number,n:number,h:number):Point=>({east:e,north:n,height:h});
 function emit(a:Point,b:Point,c:Point,road:boolean,color:Color){
  if(road&&area(a,b,c)<0)[b,c]=[c,b];
  if(road&&Math.abs(area(a,b,c))<1e-9)return;
  const bin=get(a),p=road?bin.road:bin.walls,colors=road?bin.roadColor:bin.wallColor;
  for(const q of [a,b,c]){p.push(q.east,q.height,-q.north);colors.push(color.r,color.g,color.b);}
  if(road){idx.push(put(a),put(b),put(c));const t=[a,b,c] as const;for(const k of keys(Math.min(a.east,b.east,c.east),Math.max(a.east,b.east,c.east),Math.min(a.north,b.north,c.north),Math.max(a.north,b.north,c.north))){const list=triangleCells.get(k)??[];list.push(t);triangleCells.set(k,list);}}
 }
 const quad=(a:Point,b:Point,c:Point,d:Point,road:boolean,color:Color)=>{emit(a,b,c,road,color);emit(c,b,d,road,color);};
 function ground(p:Point){const h=groundAt(p.east,p.north);if(h===undefined||!Number.isFinite(h))throw Error('Missing earthwork ground');return h;}
 const sections=points.slice(first,last+1).map((p,j)=>{
  const i=first+j,a=points[i-1]!,b=points[i+1]!,dx=b.east-a.east,dn=b.north-a.north,l=Math.hypot(dx,dn);
  if(![p.east,p.north,p.height,l].every(Number.isFinite)||l<1e-8||p.north<0||p.north>=448||Math.abs(p.east)>=1068)throw Error('Road outside south construction core');
  const at=(t:number,h=p.height+lift)=>point(p.east-dn/l*t,p.north+dx/l*t,h);
  return {p,at};
 });
 let length=0,maxGrade=0,maxCut=0,maxFill=0,railMetres=0;
 // Check every intermediate cross-section before creating a renderable object.
 // The route is finely sampled; midpoint probes catch changes between vertices.
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1]!,b=sections[i]!,span=Math.hypot(a.p.east-b.p.east,a.p.north-b.p.north),grade=Math.abs(a.p.height-b.p.height)/span;
  if(span<=0||span>1.25||grade>.120001)throw Error('Road profile spacing or grade invalid');
  maxGrade=Math.max(maxGrade,grade);length+=span;
  for(const t of [-half,-.75,0,.75,half])for(const f of [0,.25,.5,.75,1]){
   const u=a.at(t),v=b.at(t),p=point(u.east+(v.east-u.east)*f,u.north+(v.north-u.north)*f,u.height+(v.height-u.height)*f);
   const h=ground(p);maxCut=Math.max(maxCut,h-p.height);maxFill=Math.max(maxFill,p.height-h);
  }
 }
 if(Math.max(maxCut,maxFill)>cap+.1)throw Error('Earthwork exceeds certified envelope');
 for(let i=1;i<sections.length;i++){
  const a=sections[i-1]!,b=sections[i]!,span=Math.hypot(a.p.east-b.p.east,a.p.north-b.p.north);
  for(const [l,r,color] of [[-half,-1.15,edgeColor],[-1.15,1.15,roadColor],[1.15,half,edgeColor]] as const)quad(a.at(l),a.at(r),b.at(l),b.at(r),true,color);
  for(const sign of [-1,1]){
   const l=a.at(sign*half),r=b.at(sign*half),g0=ground(l),g1=ground(r);
   // Continuous stone bearing wall embeds 0.2m in real ground; the
   // shared cut removes only the ground covering the walking surface.
   const base=(p:Point,h:number)=>point(p.east,p.north,Math.min(h-.2,p.height-.18));
   quad(l,base(l,g0),r,base(r,g1),false,wallColor);
   const ol=a.at(sign*1.84,l.height-.13),orr=b.at(sign*1.84,r.height-.13),og0=ground(ol),og1=ground(orr);
   quad(l,ol,r,orr,false,fillColor);
   quad(ol,base(ol,og0),orr,base(orr,og1),false,wallColor);
   if(Math.min(l.height-g0,r.height-g1)>.9){
    const p=a.at(sign*1.72),q=b.at(sign*1.72);railSegments.push({a:p,b:q});railMetres+=span;
    for(const h of [.45,.94]){
     const u=a.at(sign*1.72,p.height+h),v=b.at(sign*1.72,q.height+h),w=a.at(sign*1.84,p.height+h),z=b.at(sign*1.84,q.height+h);
     quad(u,w,v,z,false,railColor);quad(u,point(u.east,u.north,u.height-.12),v,point(v.east,v.north,v.height-.12),false,railColor);
    }
    if(i%4===0){const u=a.at(sign*1.72),v=a.at(sign*1.84);quad(u,v,point(u.east,u.north,u.height+1),point(v.east,v.north,v.height+1),false,railColor);}
   }
  }
 }
 for(const [k,c] of chunks)for(const road of [true,false]){
  const p=road?c.road:c.walls,colors=road?c.roadColor:c.wallColor;if(!p.length)continue;
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(p,3));g.setAttribute('color',new Float32BufferAttribute(colors,3));g.computeVertexNormals();g.computeBoundingSphere();
  const m=new Mesh(g,road?treadMat:stoneMat);m.name='south-earthworks:'+k+(road?':tread':':walls');group.add(m);
 }
 const cutTread=new BufferGeometry();cutTread.setAttribute('position',new Float32BufferAttribute(verts,3));cutTread.setIndex(idx);cutTread.computeVertexNormals();
 function supportAt(e:number,n:number){
  const p=point(e,n,0);let y:number|undefined;
  for(const t of triangleCells.get(Math.floor(e/cell)+','+Math.floor(n/cell))??[]){
   const [a,b,c]=t,d=area(a,b,c);if(Math.abs(d)<1e-10)continue;
   const u=area(a,p,c)/d,v=area(a,b,p)/d;if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7){const h=a.height+u*(b.height-a.height)+v*(c.height-a.height);y=y===undefined?h:Math.max(y,h);}
  }return y;
 }
 // Rails are few and are spatially indexed once, not scanned each frame.
 const railCells=new Map<string,typeof railSegments>();
 for(const s of railSegments)for(const k of keys(Math.min(s.a.east,s.b.east)-1,Math.max(s.a.east,s.b.east)+1,Math.min(s.a.north,s.b.north)-1,Math.max(s.a.north,s.b.north)+1)){const list=railCells.get(k)??[];list.push(s);railCells.set(k,list);}
 function blocked(e:number,n:number,h:number,r=.27,body=1.8){
  return (railCells.get(Math.floor(e/cell)+','+Math.floor(n/cell))??[]).some(({a,b})=>{const dx=b.east-a.east,dn=b.north-a.north,t=Math.max(0,Math.min(1,((e-a.east)*dx+(n-a.north)*dn)/(dx*dx+dn*dn||1))),y=a.height+(b.height-a.height)*t;return h+body>y&&h<y+1.04&&Math.hypot(e-a.east-dx*t,n-a.north-dn*t)<r+.1;});
 }
 let disposed=false;
 return {group,cutTread,supportAt,blocked,stats:{length,maxGrade,maxCut,maxFill,railMetres,draws:group.children.length,treadTriangles:idx.length/3,triangles:group.children.reduce((s,m)=>s+(m as Mesh).geometry.getAttribute('position').count/3,0)},
 dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});group.clear();cutTread.dispose();treadMat.dispose();stoneMat.dispose();triangleCells.clear();railCells.clear();}};
}
