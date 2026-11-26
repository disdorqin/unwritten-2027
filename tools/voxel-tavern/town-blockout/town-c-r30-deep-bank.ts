import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Raycaster,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {firstMineDeepWorks as plan} from '../../../src/shared/town-c-first-mine-deep-works.js';
type Family='rock'|'wood'|'iron'|'neutral';
type Part={family:Family;x:number;y:number;z:number;w:number;h:number;d:number;color:number;angle:number};
type Support=(x:number,z:number,r:number,h:number)=>boolean;
type Foot={x:number;z:number;w:number;d:number;h:number;id:string};
const floor=-91;
const palette=[0x394149,0x424a50,0x505258,0x4d514f,0x62625b];
const dist=(x:number,z:number,a:readonly[number,number],b:readonly[number,number])=>{
 const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
 return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
};
/** Uses only existing actual rock faces and dry supports. No water phase,
 * light, mineral, recovery, combat or interaction authority is introduced. */
export function mountR30DeepBank(parent:Group,supports:Support,enabled:boolean){
 const group=new Group();group.name='r30-deep-bank-strata-and-engineering';parent.add(group);
 const parts:Part[]=[],feet:Foot[]=[],faces:{x:number;z:number;nx:number;nz:number}[]=[],piers:{x:number;z:number}[]=[];
 const add=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0)=>parts.push({family,x,y:floor+y,z,w,h,d,color,angle});
 const paths=[plan.westPath,plan.eastDryPath];
 const excluded=[...plan.zombies,...plan.snakes,{east:10,north:126.1},{east:9.5,north:135.9}];
 const reserve=(f:Foot)=>{
  const radius=Math.hypot(f.w,f.d)/2;
  if(excluded.some(p=>Math.hypot(p.east-f.x,p.north-f.z)<radius+2.2)||
   paths.some(path=>path.slice(1).some((b,i)=>dist(f.x,f.z,path[i],b)<radius+1.0))||
   feet.some(b=>Math.abs(b.x-f.x)<(b.w+f.w)/2+.15&&Math.abs(b.z-f.z)<(b.d+f.d)/2+.15))return false;
  for(const x of [-f.w/2,0,f.w/2])for(const z of [-f.d/2,0,f.d/2])if(!supports(f.x+x,f.z+z,.04,f.h))return false;
  feet.push(f);return true;
 };
 if(enabled){
  const rock=parent.getObjectByName('underground-mine-rock');
  parent.updateWorldMatrix(true,true);
  const localToWorld=(x:number,y:number,z:number)=>parent.localToWorld(new Vector3(x,y,z));
  // A wet, stratified wall on the *actual* exposed side of the channel
  // and both dry side caverns. Probe horizontal rock rays; no guessed
  // surface where two chambers are open to one another.
  const probes:{x:number;z:number;dx:number;dz:number;span:number}[]=[];
  for(let z=114.5;z<=124;z+=1.25)probes.push({x:5.8,z,dx:1,dz:0,span:1.12});
  for(let x=-42;x<=-8;x+=2.2){probes.push({x,z:135.9,dx:0,dz:1,span:1.94});if(x<-12)probes.push({x,z:127,dx:0,dz:-1,span:1.94})}
  for(let x=13;x<=28;x+=1.9){probes.push({x,z:135.85,dx:0,dz:1,span:1.62});probes.push({x,z:126.1,dx:0,dz:-1,span:1.62})}
  for(let z=115;z<124;z+=2.1)probes.push({x:46.8,z,dx:1,dz:0,span:1.65});
  if(rock)for(const [i,p] of probes.entries()){
   const origin=localToWorld(p.x,floor+1.0,p.z),next=localToWorld(p.x+p.dx,floor+1.0,p.z+p.dz),dir=next.sub(origin).normalize();
   const hit=new Raycaster(origin,dir,0,2.3).intersectObject(rock)[0];
   if(!hit||hit.distance<.7)continue;
   const face=parent.worldToLocal(hit.point.clone()),nx=-p.dx,nz=-p.dz,angle=Math.atan2(nx,nz);
   faces.push({x:face.x,z:face.z,nx,nz});
   // Irregular sediment seams rather than a tiled checkerboard.
   for(let k=0;k<6;k++){
    const yy=.18+k*.37+.09*Math.sin(i*.71+k*.6);
    for(let j=0;j<4;j++){
     if((i*7+j*3+k*5)%11<3)continue;
     const side=(j-1.5)*p.span/4,offset=.007+(k+j)%3*.006;
     const w=p.span/4*(.90+(i+j+k)%3*.045),h=.035+((i+j*3+k*2)%5)*.021;
     add('rock',face.x+nz*side+nx*offset,yy+Math.sin(j*1.8+i)*.028,face.z-nx*side+nz*offset,w,h,.019,[0x484d50,0x505457,0x555952][(i+k)%3],angle);
    }
    // Short, overlapping mineral-free chips follow each seam.
    for(let j=0;j<3;j++){
     const side=(j-1)*p.span/3+.03*Math.sin(i+j+k);
     if((i+j*5+k*3)%7<2)continue;
     add('rock',face.x+nz*side+nx*.015,yy+.065,face.z-nx*side+nz*.015,p.span*.09,.065,.018,0x5d605b,angle);
    }
   }
   for(let j=0;j<8;j++){
    const side=(j-3.5)*p.span/8,offset=.025;
    add('rock',face.x+nz*side+nx*offset,.085+(i+j)%3*.036,face.z-nx*side+nz*offset,p.span/8*.94,.045,.020,0x526263,angle);
   }
  }
  // Flat damp stones/old drainage marks along the original channel.
  // The thin paint-like geometry cannot change water support or grade.
  for(let z=114;z<136.9;z+=.38){
   for(const x of [3.88,3.57,7.73,8.05]){
    if(!supports(x,z,.095,.05))continue;
    const k=Math.round(z*100+x*10);
    add('rock',x,.009,z,.17,.018,.24+(k%3)*.03,k%4?0x465355:0x63706b);
   }
  }
  // Historical drainage measuring posts and small stone/wood ledges:
  // individually admitted to the collision layout only if supported.
  for(const [i,x,z] of [[0,-17,126.2],[1,-24,135.75],[2,-11,135.75],[3,23,126.2],[4,26,135.7],[5,47,117.3],[6,47,121.5]] as const){
   const f={id:'bank-pier/'+i,x,z,w:.64,d:.66,h:2.25};
   if(!reserve(f))continue;
   piers.push({x,z});
   for(let k=0;k<5;k++){
    add('rock',x,.17+k*.12,z,.60-k*.04,.16,.62-k*.035,palette[(k+i)%palette.length]);
   }
   add('wood',x,1.38,z,.23,1.55,.25,0x70543e);
   for(const h of [.76,1.34,2.04]){
    add('iron',x,h,z,.29,.12,.31,0x80563d);
    for(const dx of [-.16,.16])add('iron',x+dx,h,z,.045,.06,.075,0x968163);
   }
   for(let k=0;k<7;k++)add('neutral',x+.13,1.01+k*.13,z+.03,.025,.025,.13,k%2?0xb5a789:0x716956);
   add('iron',x,2.18,z,.32,.12,.34,0x505258);
  }
  // West flood-abandoned workbench and east drainage stockpiles.
  for(const c of [{id:'drainage-bench',x:-21,z:126.7,w:2.2,d:1.08,h:1.91},{id:'hose-crate',x:-12,z:126.5,w:1.5,d:1.18,h:1.18},
    {id:'plank-pile',x:25,z:127.1,w:2.65,d:1.0,h:1.12},{id:'tool-chest',x:22,z:135.55,w:1.55,d:1.1,h:1.18}]){
   if(!reserve(c))continue;
   const {id,x,z,w,d}=c;
   if(id==='drainage-bench'){
    for(const dx of [-w/2+.14,w/2-.14])for(const dz of [-d/2+.12,d/2-.12])add('wood',x+dx,.45,z+dz,.17,.9,.16,0x604735);
    for(let j=0;j<10;j++)add('wood',x-w/2+.11+j*.22,.9,z,.21,.13,d-.06,0x70543e);
    for(const dx of [-.73,.73]){add('iron',x+dx,.24,z,.12,.12,d-.1,0x80563d);add('wood',x+dx,1.42,z-.38,.12,.89,.14,0x604735)}
    add('wood',x,1.85,z-.38,1.64,.12,.14,0x70543e);
    for(let j=0;j<5;j++){const xx=x-.64+j*.31;add('wood',xx,1.36,z-.29,.055,.67,.06,0x70543e);add('iron',xx,1.66,z-.29,.22,.10,.09,0x80563d)}
    add('iron',x-.55,1.04,z+.20,.42,.16,.27,0x505258);add('iron',x-.55,1.16,z+.20,.18,.12,.21,0x80563d);
    for(let j=0;j<6;j++)add('iron',x+.18+j*.10,1.00,z+.20,.08,.05,.19,0x80563d);
   }else if(id==='plank-pile'){
    for(let k=0;k<4;k++)for(let j=0;j<4-k/2;j++){const zz=z+(j-1.5)*.19;add('wood',x,.14+k*.22,zz,w-.16,.20,.18,0x70543e);add('wood',x-w/2+.09,.14+k*.22,zz,.07,.16,.13,0xa07c56)}
    for(const dx of [-.82,.82])add('iron',x+dx,.89,z,.085,.10,.76,0x80563d);
   }else{
    add('wood',x,.42,z,w-.07,.84,d-.06,0x604735);
    for(let j=0;j<Math.floor(w/.17);j++)add('wood',x-w/2+.09+j*.17,.89,z,.165,.15,d,0x70543e);
    for(const dx of [-w*.31,w*.31]){add('iron',x+dx,.9,z,.07,.17,d,0x80563d);add('iron',x+dx,.44,z+d/2-.018,.07,.85,.045,0x80563d)}
    add('iron',x,.73,z+d/2-.012,.16,.15,.04,0x968163);
    if(id==='hose-crate')for(let j=0;j<12;j++){const a=j*Math.PI/6;add('iron',x+.27*Math.cos(a),1.07,z+.27*Math.sin(a),.12,.10,.12,0x484849)}
   }
  }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron','neutral'] as const){
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map});
  for(const range of [[-50,-25],[-25,0],[0,12],[12,32],[32,50]]){
   const rows=parts.filter(p=>p.family===family&&p.x>=range[0]&&p.x<range[1]);if(!rows.length)continue;
   const mesh=new InstancedMesh(geo,mat,rows.length),m=new Matrix4(),q=new Quaternion(),c=new Color();
   rows.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),q.setFromAxisAngle(new Vector3(0,1,0),p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
   mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
  }
  if(!resources.some(r=>r.mat===mat)){mat.dispose();map.dispose()}
 }
 return {group,parts,faces,feet,piers,
 blocks(x:number,z:number,y:number,r:number,h:number){return z>=113&&feet.some(f=>floor+f.h>y+.025&&floor<y+h&&Math.hypot(Math.max(0,Math.abs(x-f.x)-f.w/2),Math.max(0,Math.abs(z-f.z)-f.d/2))<r)},
 dispose(){group.removeFromParent();resources.forEach(r=>r.mesh.dispose());new Set(resources.map(r=>r.mat)).forEach(m=>m.dispose());new Set(resources.map(r=>r.map)).forEach(m=>m.dispose());geo.dispose();group.clear()}};
}
