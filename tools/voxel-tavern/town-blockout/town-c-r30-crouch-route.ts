import {BoxGeometry,CanvasTexture,Color,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,MeshLambertMaterial,NearestFilter,PlaneGeometry,Quaternion,Raycaster,SRGBColorSpace,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Passage=Readonly<{floor:number;clearance:number;requiresCrouch:boolean}>;
type Query=(x:number,z:number,posture:'standing'|'crouching')=>Passage|undefined;
/** Readability of the original collapsed gallery, not new player controls.
 * Derive the two stand-up zones and floor profile from the actual host. */
export function mountR30CrouchRoute(parent:Group,interval:readonly[number,number],query:Query,enabled:boolean){
 const root=new Group();root.name='r30-collapse-retreat-guidance';parent.add(root);
 const signs:Mesh[]=[],maps:CanvasTexture[]=[],signMats:MeshBasicMaterial[]=[];
 const geo=new BoxGeometry(),woodMap=makeCampGrain('wood'),wood=new MeshLambertMaterial({map:woodMap}),ironMap=makeCampGrain('iron'),iron=new MeshLambertMaterial({map:ironMap}),paint=new MeshLambertMaterial();
 const boardGeo=new PlaneGeometry(1.42,.37),resources:InstancedMesh[]=[];
 type Part={x:number;y:number;z:number;w:number;h:number;d:number;angle:number;color:number};
 const rows:Record<'wood'|'iron'|'paint',Part[]>={wood:[],iron:[],paint:[]};
 const add=(family:keyof typeof rows,x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0)=>rows[family].push({x,y,z,w,h,d,color,angle});
 const entries:{side:'shore'|'camp';z:number;floor:number}[]=[];
 const [lo,hi]=interval;
 if(enabled){
  for(const [side,edge,dir] of [['shore',lo,-1],['camp',hi,1]] as const){
   let approach:Passage|undefined,z=0;
   for(const d of [.55,.75,.95,1.15]){
    const candidate=edge+dir*d,p=query(0,candidate,'standing');
    if(p&&p.clearance>=2.95){approach=p;z=candidate;break}
   }
   if(!approach)continue;
   entries.push({side,z,floor:approach.floor});
   const y=approach.floor+2.21;
   add('wood',0,y,z,1.52,.43,.10,0x594735);
   for(const x of [-.64,.64]){
    add('iron',x,y,z,.075,.48,.13,0x80563d);
    add('iron',x,y+.39,z,.045,.34,.05,0x505258);
   }
   add('wood',0,y+.57,z,1.73,.16,.22,0x70543e);
   const rock=parent.getObjectByName('underground-mine-rock');
   if(rock)for(const x of [-.72,.72]){
    parent.updateWorldMatrix(true,true);
    const origin=parent.localToWorld(new Vector3(x,y+.65,z)),up=new Vector3(0,1,0);
    const hit=new Raycaster(origin,up,0,2).intersectObject(rock)[0];
    if(hit&&hit.distance>.025){
     add('iron',x,y+.65+hit.distance/2,z,.045,hit.distance,.045,0x505258);
     add('iron',x,y+.63+hit.distance,z,.16,.04,.16,0x80563d);
    }
   }
   // Double-sided readability, one side warns before entering, the
   // other says stand up only once actual headroom permits.
   if(typeof document!=='undefined')for(const face of [-1,1]){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;const c=canvas.getContext('2d');if(!c)continue;
    const front=face===dir,words=front?'塌方低口 · 蹲行':'已出低口 · 可起身';
    c.fillStyle='#43372d';c.fillRect(0,0,512,160);c.strokeStyle='#b49b66';c.lineWidth=7;c.strokeRect(8,8,496,144);
    c.textAlign='center';c.textBaseline='middle';c.fillStyle='#e1cda3';c.font='bold 45px Microsoft YaHei,sans-serif';c.fillText(words,256,80,470);
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;maps.push(map);
    const mat=new MeshBasicMaterial({map});signMats.push(mat);
    const sign=new Mesh(boardGeo,mat);sign.position.set(0,y,z+face*.052);if(face<0)sign.rotation.y=Math.PI;root.add(sign);signs.push(sign);
   }
   // Yellow-black scuff bars lie on the measured sloping floor,
   // not a flat plank that creates a small false step.
   for(let k=0;k<5;k++){
    const zz=z+dir*(k-2)*.15,q=query(0,zz,'crouching'),a=query(0,zz-.04,'crouching'),b=query(0,zz+.04,'crouching');
    if(!q||!a||!b)continue;
    const grade=(b.floor-a.floor)/.08;
    for(const x of [-.38,.38])add('paint',x,q.floor+.008,zz,.22,.016,.11,k%2?0x4d4840:0xb29b61,Math.atan(-grade));
   }
  }
  // Narrow opening edge markings remain flush with original floor and
  // do not add a crossbar or shrink the 1.2m passage.
  for(let z=lo+.3;z<=hi-.3;z+=.26){
   const q=query(0,z,'crouching');if(!q)continue;
   for(const x of [-.46,.46])add('paint',x,q.floor+.006,z,.09,.012,.18,0x776a51);
  }
 }
 const m=new Matrix4(),q=new Quaternion(),c=new Color(),axis=new Vector3(1,0,0);
 for(const [key,mat] of [['wood',wood],['iron',iron],['paint',paint]] as const){
  const list=rows[key];if(!list.length)continue;
  const mesh=new InstancedMesh(geo,mat,list.length);
  list.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),q.setFromAxisAngle(axis,p.angle),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
  mesh.computeBoundingSphere();root.add(mesh);resources.push(mesh);
 }
 function guidance(x:number,z:number){
  if(!enabled||Math.abs(x)>.8||z<lo-2||z>hi+2)return;
  const crouched=query(x,z,'crouching'),standing=query(x,z,'standing');
  if(!crouched)return;
  if(!standing)return {mode:'keep-crouched' as const,label:'低顶 · 保持蹲行'};
  const toward=z<(lo+hi)/2?1:-1;
  const next=query(x,z+toward*.45,'standing');
  if(!next)return {mode:'crouch-ahead' as const,label:'前方低顶 · 先蹲下'};
  return {mode:'standing-clear' as const,label:'此处可以起身'};
 }
 return {group:root,entries,parts:rows.wood.length+rows.iron.length+rows.paint.length,guidance,
 dispose(){root.removeFromParent();resources.forEach(r=>r.dispose());geo.dispose();wood.dispose();woodMap.dispose();iron.dispose();ironMap.dispose();paint.dispose();boardGeo.dispose();signMats.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());root.clear()}};
}
