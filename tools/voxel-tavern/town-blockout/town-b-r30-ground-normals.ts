import {BufferAttribute,BufferGeometry} from 'three';

/** The B01 polar slicing deliberately duplicates boundary vertices so the
 * triangle-based support sampler can retain its original slice indices.
 * Share area-weighted normals at coincident positions without welding or
 * modifying a single height, triangle, UV or support index. */
export function smoothBR30GroundNormals(geometry:BufferGeometry){
  const p=geometry.getAttribute('position'),ix=geometry.getIndex();
  if(!ix){geometry.computeVertexNormals();return;}
  const groups=new Map<string,number>(),ids=new Uint32Array(p.count),sum:number[]=[];
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*10000)).join('/');
    let id=groups.get(key);
    if(id===undefined){id=groups.size;groups.set(key,id);sum.push(0,0,0);}
    ids[i]=id;
  }
  for(let i=0;i<ix.count;i+=3){
    const a=ix.getX(i),b=ix.getX(i+1),c=ix.getX(i+2);
    const ux=p.getX(b)-p.getX(a),uy=p.getY(b)-p.getY(a),uz=p.getZ(b)-p.getZ(a);
    const vx=p.getX(c)-p.getX(a),vy=p.getY(c)-p.getY(a),vz=p.getZ(c)-p.getZ(a);
    const x=uy*vz-uz*vy,y=uz*vx-ux*vz,z=ux*vy-uy*vx;
    for(const j of [a,b,c]){
      const k=ids[j]*3;sum[k]+=x;sum[k+1]+=y;sum[k+2]+=z;
    }
  }
  const normals=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const k=ids[i]*3,x=sum[k],y=sum[k+1],z=sum[k+2],l=Math.hypot(x,y,z);
    if(l>1e-12)normals.set([x/l,y/l,z/l],i*3);
    else normals.set([0,1,0],i*3);
  }
  geometry.setAttribute('normal',new BufferAttribute(normals,3));
}
