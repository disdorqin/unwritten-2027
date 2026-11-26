import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Vector3,Quaternion} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {r30SupportAnnexFixtures} from '../../../src/shared/town-c-r30-support-annex.js';
type Family='rock'|'wood'|'iron'|'cloth'|'neutral';
type Part=Readonly<{family:Family;x:number;y:number;z:number;w:number;h:number;d:number;color:number;fixture?:string}>;
const floor=-91;
/** Retired timber shelter, with a full old map and layered storage.
 * The only low fixtures use the shared static footprint. No light,
 * recovery, encounter, inventory or transport authority is added. */
export function mountR30SupportAnnex(parent:Group,enabled:boolean){
 const group=new Group();group.name='r30-old-support-annex';
 const parts:Part[]=[];
 const add=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,color:number,fixture?:string)=>parts.push({family,x,y:floor+y,z,w,h,d,color,fixture});
 if(enabled){
  const bed='annex-bunks';
  for(const z of [101.15,103.05]){
   for(const x of [-12.57,-10.88])for(const n of [z-.55,z+.55]){
    add('wood',x,1.12,n,.16,2.24,.16,0x70543e,bed);
    for(const h of [.41,1.57,2.17])add('iron',x,h,n,.19,.075,.19,0x80563d,bed);
   }
   for(const y of [.45,1.6]){
    for(let j=0;j<9;j++)add('wood',-12.53+j*.205,y,z,.20,.12,1.08,0x604735,bed);
    for(const n of [z-.53,z+.53])add('iron',-11.71,y,n,1.83,.13,.09,0x80563d,bed);
    add('cloth',-11.72,y+.14,z,1.60,.17,.94,0x9c8b71,bed);
    for(let i=0;i<7;i++)for(let j=0;j<4;j++)
     add('cloth',-12.48+i*.18,y+.25,z-.36+j*.24,.175,.06+(j%3)*.014,.235,(i+j)%4?0x66746b:0x53625b,bed);
    add('cloth',-10.98,y+.24,z,.34,.16,.71,0xb7a58a,bed);
   }
   for(const n of [z-.52,z+.52])add('wood',-10.83,1.95,n,.14,.22,.15,0x604735,bed);
  }
  const supply='annex-supplies';
  for(const x of [-12.55,-10.86])for(const z of [105.18,108.19]){
   add('wood',x,1.24,z,.18,2.48,.18,0x604735,supply);
   for(const y of [.22,.95,1.68,2.4])add('iron',x,y,z,.21,.085,.21,0x80563d,supply);
  }
  for(const y of [.23,.96,1.69,2.4])for(let j=0;j<12;j++)add('wood',-11.70,y,105.28+j*.258,1.85,.13,.25,0x70543e,supply);
  for(let i=0;i<7;i++){
   const z=105.40+i*.426,x=-11.91;
   add('wood',x,.50,z,1.24,.41,.40,0x604735,supply);
   for(const n of [z-.18,z+.18])add('iron',x,.50,n,1.28,.43,.04,0x80563d,supply);
   add('iron',-11.27,.59,z,.055,.12,.15,0x947346,supply);
  }
  for(let i=0;i<6;i++){
   const z=105.5+i*.48;
   add('cloth',-11.92,1.17,z,1.10,.27,.43,i%2?0xb5a78d:0x776d5a,supply);
   add('cloth',-11.44,1.30,z,.13,.10,.25,0xa49377,supply);
  }
  // Old iron oil bottles and rolled cloth, inert props only.
  for(let i=0;i<7;i++){
   const z=105.42+i*.42;
   add('iron',-11.91,1.98,z,.32,.42,.29,i%3?0x565e60:0x80563d,supply);
   add('iron',-11.91,2.22,z,.12,.075,.12,0x947346,supply);
   add('neutral',-11.70,1.97,z,.045,.16,.19,0xb39b70,supply);
  }
  const mapId='annex-map';
  for(const x of [-9.98,-7.02]){
   add('wood',x,1.30,99.40,.18,2.6,.20,0x604735,mapId);
   for(const y of [.22,2.34])add('iron',x,y,99.40,.23,.13,.24,0x80563d,mapId);
  }
  for(let i=0;i<14;i++)add('wood',-9.96+i*.224,1.65,99.45,.216,1.55,.12,0x70543e,mapId);
  add('neutral',-8.5,1.66,99.525,2.65,1.25,.028,0xb4a78a,mapId);
  // A mine-work record, with only the old main path and developed crosscuts.
  // Hidden shortcuts and new discoveries are deliberately absent.
  const px=(x:number)=>-8.5+x*.011,py=(z:number)=>1.13+(z-12)*.008;
  const strokes=[[0,12,0,138],[0,76,-72,76],[-72,76,-96,76],[0,94,72,94],[72,94,96,94]] as const;
  for(const [x,z,xx,zz] of strokes){
   const count=Math.ceil(Math.hypot(xx-x,zz-z)/2);
   for(let k=0;k<=count;k++)add('neutral',px(x+(xx-x)*k/count),py(z+(zz-z)*k/count),99.546,.036,.022,.011,0x594d3d,mapId);
  }
  for(const z of [38,104.5])for(let i=0;i<4;i++)add('neutral',px(0)+(i%2-.5)*.052,py(z)+(Math.floor(i/2)-.5)*.052,99.55,.047,.047,.012,0x855f38,mapId);
  for(let i=0;i<3;i++)add('neutral',-9.63,1.23+i*.076,99.55,.27-i*.035,.021,.012,0x6b5e4b,mapId);
  for(const x of [-9.78,-7.22])for(const y of [1.10,2.23])add('iron',x,y,99.56,.065,.065,.025,0x80563d,mapId);
  // A low writing shelf with sealed note and quill.
  add('wood',-8.5,.81,99.62,2.78,.15,.48,0x604735,mapId);
  add('neutral',-8.9,.9,99.66,.37,.045,.23,0xafa289,mapId);
  add('iron',-8.49,.91,99.70,.26,.035,.055,0x565e60,mapId);
  const bench='annex-rest-bench';
  for(let j=0;j<12;j++)add('wood',-10.04+j*.262,.47,109.53,.257,.13,.64,0x70543e,bench);
  for(const x of [-9.97,-8.5,-7.23]){
   for(const z of [109.34,109.71])add('wood',x,.22,z,.16,.44,.14,0x604735,bench);
   add('iron',x,.33,109.53,.19,.09,.65,0x80563d,bench);
  }
  for(let i=0;i<12;i++)add('wood',-10.04+i*.262,1.04,109.84,.257,.32,.14,0x604735,bench);
  // Full-height timber above the approved walking clearance; no columns
  // on either of the two passage centre-lines.
  for(const z of [101.1,104.5,107.9]){
   add('wood',-9.5,4.34,z,6.84,.38,.39,0x604735);
   for(const x of [-12.51,-9.5,-6.49]){
    add('iron',x,4.34,z,.13,.41,.43,0x80563d);
    add('iron',x,4.29,z+.23,.06,.055,.035,0x947346);
   }
   for(const x of [-12.75,-6.25])for(let k=0;k<4;k++)
    add('rock',x,3.38+k*.26,z,.42,.24,.58,k%2?0x41464b:0x505258);
  }
  for(const z of [101.1,107.9]){
   add('wood',-5.1,3.59,z,1.76,.29,.33,0x70543e);
   for(const x of [-5.77,-4.43])add('iron',x,3.59,z,.16,.32,.38,0x80563d);
  }
  // Unlit signal cages: visible historical equipment, no new light budget.
  for(const z of [101.1,107.9]){
   add('iron',-6.18,3.14,z,.14,.63,.15,0x80563d);
   add('neutral',-6.18,2.78,z,.18,.30,.18,0x483f35);
   for(const dx of [-.11,.11])for(const dz of [-.11,.11])add('iron',-6.18+dx,2.78,z+dz,.04,.36,.04,0x505258);
   for(const y of [2.56,2.99])add('iron',-6.18,y,z,.26,.11,.26,0x80563d);
  }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron','cloth','neutral'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,rows.length);
  const m=new Matrix4(),c=new Color();
  rows.forEach((p,i)=>{m.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z);mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
  mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
 }
 parent.add(group);
 return {group,parts,fixtures:enabled?r30SupportAnnexFixtures:[],dispose(){group.removeFromParent();resources.forEach(r=>{r.mesh.dispose();r.mat.dispose();r.map.dispose()});geo.dispose()}};
}
