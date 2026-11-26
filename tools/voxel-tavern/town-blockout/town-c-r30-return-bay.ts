import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Vector3,Quaternion} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {r30ReturnBay as site,r30ReturnBayFixtures,r30ReturnBayFloor} from '../../../src/shared/town-c-r30-return-bay.js';
type Part={family:'rock'|'wood'|'iron';at:readonly [number,number,number];size:readonly [number,number,number];color:number;fixture?:number};
type Point=Readonly<{east:number;north:number;height:number}>;
type Local=readonly [number,number,number];
/** A physically separate, roof-sealed return station. The top exit has
 * not been surveyed: a station model cannot authorize a new shaft trip. */
export function mountR30ReturnBay(parent:Group,enabled:boolean,toWorld:(p:Local)=>Point){
 const group=new Group();group.name='r30-independent-return-station';
 const parts:Part[]=[];
 const add=(family:Part['family'],x:number,y:number,z:number,w:number,h:number,d:number,color:number,fixture?:number)=>
  parts.push({family,at:[x,r30ReturnBayFloor(z)+y,z],size:[w,h,d],color,fixture});
 if(enabled){
  for(const [index,z] of [[1,14.48],[2,17.10]] as const){
   for(const x of [-5.75,-3.65]){
    add('rock',x,.14,z,.28,.28,.30,0x53504b,index);
    add('wood',x,1.28,z,.21,2.54,.25,0x70543e,index);
    for(const h of [.35,1.2,2.4]){
     add('iron',x,h,z,.26,.10,.30,0x80563d,index);
     add('iron',x,h,z+.16,.056,.052,.021,0x947346,index);
    }
   }
   add('wood',-4.7,2.55,z,2.4,.25,.29,0x604735,index);
   for(const x of [-5.7,-4.7,-3.7])add('iron',x,2.55,z,.13,.29,.32,0x80563d,index);
  }
  const rear=3;
  for(const z of [14.72,15.8,16.88]){
   add('rock',-6.02,.12,z,.32,.24,.28,0x505258,rear);
   add('iron',-6.02,.65,z,.13,1.28,.14,0x80563d,rear);
  }
  add('wood',-6.02,1.15,15.8,.18,.16,2.36,0x70543e,rear);
  for(let i=0;i<10;i++)add('iron',-6.02,.63,14.74+i*.235,.065,.99,.055,0x505258,rear);
  // A distinct hand-operated bell on its own plinth outside future aperture.
  const x=site.lever.x,z=site.lever.z;
  add('rock',x,.12,z,.59,.24,.65,0x53504b,0);
  add('wood',x,.72,z,.42,1.20,.34,0x70543e,0);
  add('iron',x,1.34,z,.59,.13,.46,0x80563d,0);
  add('iron',x,1.44,z-.09,.18,.17,.18,0x947346,0);
  add('iron',x,1.22,z-.19,.075,.38,.075,0x505258,0);
  for(let i=0;i<5;i++)add('iron',x,1.09-i*.115,z-.28,.065,.07,.06,0x947346,0);
  add('wood',x,.55,z-.28,.17,.14,.13,0x604735,0);
  // The remaining overhead arch is not a false hole in the rock.
  for(const xx of [-5.8,-3.6]){
   add('wood',xx,3.28,15.8,.20,.28,2.18,0x604735);
   for(let i=0;i<5;i++)add('iron',xx,3.28,14.88+i*.46,.25,.31,.11,0x80563d);
  }
  for(const n of [14.75,16.85]){
   add('wood',-4.7,3.29,n,2.25,.27,.24,0x70543e);
   for(const xx of [-5.61,-4.7,-3.79])add('iron',xx,3.29,n,.14,.30,.29,0x80563d);
  }
  // Flush rim inlays indicate the reserved footprint; the actual sloped
  // rock floor is still the only support, with no fake standing platform.
  for(let i=0;i<10;i++)for(const xx of [-5.76,-3.64])
   add('iron',xx,.006,14.78+i*.226,.07,.012,.22,0x80563d);
  for(let i=0;i<10;i++)for(const n of [14.75,16.85])
   add('iron',-5.73+i*.23,.006,n,.22,.012,.07,0x80563d);
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron'] as const){
  const list=parts.filter(p=>p.family===family);if(!list.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,list.length);
  const m=new Matrix4(),c=new Color();
  list.forEach((p,i)=>{m.makeScale(...p.size).setPosition(...p.at);mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
  mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
 }
 parent.add(group);
 const point=(p:{x:number;z:number})=>toWorld([p.x,r30ReturnBayFloor(p.z),p.z]);
 const dock=enabled?point(site.dock):undefined,call=enabled?point(site.call):undefined;
 const contract=dock&&call?{domainId:'underground/mine',dock,call,
  futureAperture:site.futureAperture,
  roofCorners:[site.futureAperture.minX,site.futureAperture.maxX].flatMap(x=>
   [site.futureAperture.minZ,site.futureAperture.maxZ].map(z=>toWorld([x,r30ReturnBayFloor(z)+3.5,z]))),
  returnSurface:undefined,productionReady:false as const}:undefined;
 return {group,parts,fixtures:enabled?r30ReturnBayFixtures:[],contract,
  dispose(){group.removeFromParent();resources.forEach(r=>{r.mesh.dispose();r.mat.dispose();r.map.dispose()});geo.dispose()}};
}
