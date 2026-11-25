import { BufferGeometry, Float32BufferAttribute, Vector3, type Mesh } from 'three';

/** A-R01 / I1. All coordinates are world metres, north = -Three.z.
 * B owns the inner edge; A owns the outside rectangle. Both edges use the
 * actual Float32 geometry vertices. No overlapping ground, skirt or fake plane.
 */
export type SurfaceVertex = Readonly<{east:number;north:number;height:number}>;
export type CraterCollarBounds = Readonly<{west:number;east:number;south:number;north:number}>;
type PolarVertex = SurfaceVertex & {angle:number};
type Triangle = readonly [number,number,number];
const tau=2*Math.PI;
const f=Math.fround;
const angleOf=(e:number,n:number)=>((Math.atan2(e,n)%tau)+tau)%tau;

export function buildCraterSeamCollar(bowl:Mesh,anchor:{east:number;north:number;rimHeight:number},
  apronRadius:number,groundAt:(east:number,north:number)=>number) {
  if(!Number.isFinite(apronRadius)||apronRadius<=0)throw new RangeError('Invalid shared apron radius');
  const half=Math.ceil(apronRadius+5);
  const bounds:CraterCollarBounds={west:anchor.east-half,east:anchor.east+half,
    south:anchor.north-half,north:anchor.north+half};
  bowl.updateWorldMatrix(true,false);
  const positions=bowl.geometry.getAttribute('position');
  const unique=new Map<string,PolarVertex>();
  const v=new Vector3();
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i);
    // The B legacy fixture exposes the final apron at exactly 59m.
    // A deliberately fails closed if B changes this contract; no guess.
    if(Math.abs(Math.hypot(x,z)-apronRadius)>.0002)continue;
    v.set(x,positions.getY(i),z).applyMatrix4(bowl.matrixWorld);
    const p={east:f(v.x),north:f(-v.z),height:f(v.y)};
    const key=p.east+','+p.north;
    unique.set(key,{...p,angle:angleOf(p.east-anchor.east,p.north-anchor.north)});
  }
  const inner=[...unique.values()].sort((a,b)=>a.angle-b.angle);
  if(inner.length<64)throw new Error('B apron boundary changed: agree actual boundary samples before A mount');
  if(inner.some(p=>Math.abs(p.height-anchor.rimHeight)>.001))
    throw new Error('B apron datum changed: agree new boundary before mounting');
  const outer:PolarVertex[]=[];
  const add=(east:number,north:number)=>{
    outer.push({east,north,height:f(groundAt(east,north)),angle:angleOf(east-anchor.east,north-anchor.north)});
  };
  for(let e=bounds.west;e<bounds.east;e++)add(e,bounds.south);
  for(let n=bounds.south;n<bounds.north;n++)add(bounds.east,n);
  for(let e=bounds.east;e>bounds.west;e--)add(e,bounds.north);
  for(let n=bounds.north;n>bounds.south;n--)add(bounds.west,n);
  outer.sort((a,b)=>a.angle-b.angle);
  const points=[...inner,...outer];
  const triangles:Triangle[]=[];
  function face(a:number,b:number,c:number){
    const p=points[a]!,q=points[b]!,r=points[c]!;
    const signed=(q.east-p.east)*(r.north-p.north)-(q.north-p.north)*(r.east-p.east);
    if(Math.abs(signed)<1e-9)return;
    // East/north CCW is +Y when north is represented as -Z.
    triangles.push(signed>0?[a,b,c]:[a,c,b]);
  }
  // Zipper two star-shaped polygon rings, joining original vertices only.
  // Every boundary segment is represented exactly once. At equal bearings,
  // either diagonal is valid; process the inner event first.
  let i=inner.length-1,j=outer.length-1;
  for(let consumedI=0,consumedJ=0;consumedI<inner.length||consumedJ<outer.length;){
    const ni=(i+1)%inner.length,nj=(j+1)%outer.length;
    if(consumedJ===outer.length||
      (consumedI<inner.length&&inner[ni]!.angle<=outer[nj]!.angle)){
      face(i,ni,inner.length+j);i=ni;consumedI++;
    }else{
      face(i,inner.length+nj,inner.length+j);j=nj;consumedJ++;
    }
  }
  const geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(points.flatMap(p=>[p.east,p.height,-p.north]),3));
  geometry.setIndex(triangles.flatMap(t=>[...t]));
  geometry.computeVertexNormals();
  const cells=new Map<string,Triangle[]>();
  for(const t of triangles){
    const ps=t.map(k=>points[k]!);
    const loE=Math.floor(Math.min(...ps.map(p=>p.east))),hiE=Math.floor(Math.max(...ps.map(p=>p.east)));
    const loN=Math.floor(Math.min(...ps.map(p=>p.north))),hiN=Math.floor(Math.max(...ps.map(p=>p.north)));
    for(let n=loN;n<=hiN;n++)for(let e=loE;e<=hiE;e++){
      const key=e+','+n;const list=cells.get(key)??[];list.push(t);cells.set(key,list);
    }
  }
  function heightAt(east:number,north:number):number|undefined{
    if(!Number.isFinite(east)||!Number.isFinite(north))return;
    for(const t of cells.get(Math.floor(east)+','+Math.floor(north))??[]){
      const a=points[t[0]]!,b=points[t[1]]!,c=points[t[2]]!;
      const den=(b.north-c.north)*(a.east-c.east)+(c.east-b.east)*(a.north-c.north);
      const u=((b.north-c.north)*(east-c.east)+(c.east-b.east)*(north-c.north))/den;
      const v=((c.north-a.north)*(east-c.east)+(a.east-c.east)*(north-c.north))/den;
      const w=1-u-v;
      if(Math.min(u,v,w)>=-1e-7)return u*a.height+v*b.height+w*c.height;
    }
  }
  return {geometry,bounds,inner:inner.map(({angle,...p})=>p),outer:outer.map(({angle,...p})=>p),
    heightAt,triangleCount:triangles.length};
}
