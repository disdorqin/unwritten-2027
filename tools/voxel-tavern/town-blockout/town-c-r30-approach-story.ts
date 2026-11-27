import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,Mesh,MeshLambertMaterial,PointLight,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Local=readonly[number,number,number];
type Point=Readonly<{east:number;north:number;height:number}>;
type Part={x:number;y:number;z:number;w:number;h:number;d:number;angle:number;family:'wood'|'iron'|'rock';color:number};
type Supports=(x:number,z:number,r:number,h:number)=>number|undefined;
type Foot=Readonly<Point&{domainId:string}>;
/** KD1/KD3: read the mine's path through actual rail-side fixtures,
 * not tutorial arrows or a newly invented survival/recovery authority.
 * C-owned art consumes an explicit residual budget from A. */
export function mountR30ApproachStory(parent:Group,options:Readonly<{
 enabled:boolean;frames:readonly number[];support:Supports;toWorld(p:Local):Point;
 readAcceptedFoot?:()=>Foot|undefined;readRemainingLightBudget?:()=>number;
}>){
 const root=new Group();root.name='r30-first-approach-miner-traces';parent.add(root);
 const parts:Part[]=[],lanterns:{local:Local;world:Point;light:PointLight;bulb:Mesh;mat:MeshLambertMaterial}[]=[];
 const geo=new BoxGeometry(),boxes:{x:number;z:number;minY:number;maxY:number;w:number;d:number}[]=[];
 const add=(family:Part['family'],x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0)=>{
  parts.push({family,x,y,z,w,h,d,color,angle});
 };
 if(options.enabled){
 for(const [index,z] of [13.2,22.4,30.4].entries()){
  if(!options.frames.includes(z))continue;
  const x=index%2?-1.02:1.02,floor=options.support(x,z,.16,1.8);
  if(floor===undefined)continue;
  // Hang from the existing 3.5m frame's beam, not in free air.
  const y=floor+2.65;
  add('iron',x,floor+3.01,z,.055,.32,.06,0x505258);
  add('iron',x,floor+2.86,z,.12,.045,.12,0x80563d);
  add('iron',x,y+.165,z,.28,.07,.28,0x53504b);
  add('iron',x,y-.17,z,.29,.08,.29,0x80563d);
  for(const dx of [-.105,.105])for(const dz of [-.105,.105])add('iron',x+dx,y,z+dz,.045,.31,.045,0x505258);
  for(const dy of [-.095,.095]){add('iron',x,y+dy,z-.12,.25,.027,.035,0x80563d);add('iron',x,y+dy,z+.12,.25,.027,.035,0x80563d)}
  add('iron',x,y+.215,z,.15,.04,.15,0x947346);
  const mat=new MeshLambertMaterial({color:0x77776c,emissive:0x9fbed1,emissiveIntensity:0});
  const bulb=new Mesh(geo,mat);bulb.position.set(x,y,z);bulb.scale.set(.17,.25,.17);root.add(bulb);
  const light=new PointLight(0xb9d8ea,5,4,2);light.position.set(x,y,z);light.visible=false;root.add(light);
  const local=[x,y,z] as const;lanterns.push({local,world:options.toWorld(local),light,bulb,mat});
 }
 // The original collapse has solid rubble on both sides. A torn cart
 // side and a flattened hat sit against the existing rock, no second
 // interactive cart. Admit the actual protruding fragments to collision
 // only at independently supported dry positions outside the 1.2m slot.
 for(const [x,z] of [[1.37,30.94],[-1.38,31.12]] as const){
  const floor=options.support(x,z,.24,.65);
  if(floor===undefined)continue;
  if(x>0){
   // Half-buried iron chassis fragment and broken wheel rim.
   add('iron',x,floor+.20,z,.25,.24,.60,0x555659,-.12);
   add('iron',x,floor+.35,z,.32,.08,.47,0x80563d,-.12);
   add('wood',x-.07,floor+.25,z+.18,.10,.10,.30,0x70543e,-.12);
   for(let i=0;i<9;i++){
    const a=Math.PI*i/8;
    add('iron',x-.12,floor+.08+.22*Math.sin(a),z+.22*Math.cos(a),.075,.09,.09,0x505258);
   }
   for(const zz of [-.23,.19])add('iron',x-.14,floor+.34,z+zz,.055,.055,.075,0x947346);
   boxes.push({x,z,minY:floor,maxY:floor+.45,w:.40,d:.67});
  }else{
   // Crushed broad brim and folded crown, no readable identity.
   add('iron',x,floor+.035,z,.46,.07,.36,0x685b45);
   add('iron',x-.08,floor+.105,z,.26,.14,.24,0x88704e);
   add('iron',x+.08,floor+.085,z-.035,.22,.10,.21,0x74634d);
   add('iron',x-.10,floor+.15,z-.11,.09,.035,.08,0x9c8868);
   for(let i=0;i<4;i++)add('rock',x+.14,floor+.025,z-.14+i*.08,.10,.05,.07,0x53504b);
   boxes.push({x,z,minY:floor,maxY:floor+.18,w:.46,d:.36});
  }
 }
 }
 const resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,rows.length),m=new Matrix4(),q=new Quaternion(),c=new Color(),axis=new Vector3(1,0,0);
  rows.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),q.setFromAxisAngle(axis,p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
  mesh.computeBoundingSphere();root.add(mesh);resources.push({mesh,mat,map});
 }
 function sync(){
  const foot=options.readAcceptedFoot?.(),budget=options.readRemainingLightBudget?.();
  const permitted=foot?.domainId==='underground/mine'&&[foot.east,foot.north,foot.height].every(Number.isFinite)&&Number.isFinite(budget)?Math.min(2,Math.max(0,Math.floor(budget!))):0;
  const nearest=permitted?lanterns.map(l=>({l,d:Math.hypot(l.world.east-foot!.east,l.world.north-foot!.north,l.world.height-foot!.height)})).filter(p=>p.d<=9).sort((a,b)=>a.d-b.d).slice(0,permitted).map(p=>p.l):[];
  for(const l of lanterns){const on=nearest.includes(l);l.light.visible=on;l.mat.emissiveIntensity=on?.55:0;l.mat.color.setHex(on?0xb6bdc1:0x77776c)}
 }
 // The host first syncs after its public player bindings are initialized.
 return {group:root,parts:parts.length+lanterns.length,lanterns,boxes,sync,
 blocks(x:number,z:number,y:number,r:number,h:number){return boxes.some(b=>b.maxY>y+.025&&b.minY<y+h&&Math.hypot(Math.max(0,Math.abs(x-b.x)-b.w/2),Math.max(0,Math.abs(z-b.z)-b.d/2))<r)},
 dispose(){root.removeFromParent();resources.forEach(r=>{r.mesh.dispose();r.mat.dispose();r.map.dispose()});lanterns.forEach(l=>l.mat.dispose());geo.dispose();root.clear()}};
}
