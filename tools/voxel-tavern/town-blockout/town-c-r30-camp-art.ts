import {BoxGeometry,BufferAttribute,BufferGeometry,Color,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,MeshBasicMaterial,Mesh,MeshStandardMaterial,PlaneGeometry,NearestFilter,Quaternion,RepeatWrapping,SRGBColorSpace,Vector3} from 'three';
/** R30 underground sample. Monochrome maps retain existing authored tints;
 * only the small camp uses this art until the paired visual review passes. */
export function makeCampGrain(family:'wood'|'rock'|'iron'|'cloth'|'neutral'){
 const size=32,data=new Uint8Array(size*size*4);
 for(let z=0;z<size;z++)for(let x=0;x<size;x++){
  const h=(x*17+z*29+(x*z)*7)%19;
  let v=220+h;
  if(family==='wood')v=205+Math.floor((Math.sin((x+Math.sin(z*.25)*.9)*1.4)+1)*14)+h+(z%13===0?-12:0);
  if(family==='rock')v=208+((Math.floor(x/5)*11+Math.floor(z/3)*7)%23)+h-(z%11===0?17:0);
  if(family==='iron')v=217+h-((x%9===0||h<3)?20:0);
  if(family==='cloth')v=218+h-((x+z)%2===0?12:0);
  const i=(z*size+x)*4;data.set([v,v,v,255],i);
 }
 const map=new DataTexture(data,size,size);map.colorSpace=SRGBColorSpace;map.magFilter=map.minFilter=NearestFilter;map.generateMipmaps=false;map.needsUpdate=true;
 return map;
}
/** Use the real rock triangles, not a decorative second collision shell.
 * Camp-only material groups preserve the exact original triangle buffer. */
export function applyR30CampRock(geometry:BufferGeometry,base:MeshStandardMaterial,start:number,end:number,fullMine=false){
 const size=64,data=new Uint8Array(size*size*4);
 for(let v=0;v<size;v++)for(let u=0;u<size;u++){
  const row=Math.floor((v+((Math.floor(u/9)*7)%5)-2)/8);
  const shift=(row%2+2)%2*7;
  const x=(u+shift+size)%size;
  const col=Math.floor(x/16),r=(v+((Math.floor(u/9)*7)%5)-2+size*8)%8;
  const seam=r===0||x%16===0&&r<7;
  const tone=seam?39:62+((row*17+col*11+128)%19)+((u*7+v*11)%9);
  const bevel=!seam&&(r===1||x%16===1)?8:0;
  data.set([tone+bevel,tone+2+bevel,tone+6+bevel,255],(v*size+u)*4);
 }
 const map=new DataTexture(data,size,size);map.colorSpace=SRGBColorSpace;map.wrapS=map.wrapT=RepeatWrapping;map.minFilter=map.magFilter=NearestFilter;map.generateMipmaps=false;map.needsUpdate=true;
 const stone=new MeshStandardMaterial({map,roughness:1,side:base.side,flatShading:true});
 // Coarse and fine bands follow the actual face projection. Keep the
 // original geometry, and use non-periodic-looking pixel strata instead
 // of painted mortar grids over the entire deep natural rock shell.
 const naturalMaps:DataTexture[]=[],naturalMats:MeshStandardMaterial[]=[];
 if(fullMine)for(const deep of [false,true]){
  const n=64,pixels=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   const tier=Math.floor((y+Math.floor(x/9)%3+Math.floor(x/17)*2)/8);
   const grit=((x*17+y*31+x*y*3)%23)/22;
   const ridge=(y+Math.floor(x/8)%4+Math.floor(x/13)*2)%13;
   const stripe=(Math.floor(x/9)*11+tier*7+71)%17;
   const v=(deep?57:70)+stripe+Math.floor(9*grit)+(ridge===0?-15:ridge===1?9:0);
   const i=(y*n+x)*4;
   pixels.set([v+(deep?0:7),v+(deep?3:1),v+(deep?8:-3),255],i);
  }
  const t=new DataTexture(pixels,n,n);t.colorSpace=SRGBColorSpace;
  t.wrapS=t.wrapT=RepeatWrapping;t.magFilter=t.minFilter=NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;
  naturalMaps.push(t);naturalMats.push(new MeshStandardMaterial({map:t,roughness:deep?.91:1,side:base.side,flatShading:true}));
 }
 const a=geometry.getAttribute('position'),norm=geometry.getAttribute('normal'),uv=new Float32Array(a.count*2);
 let previous=-1,runStart=0,campTriangles=0;
 geometry.clearGroups();
 for(let i=0;i<a.count;i+=3){
  const isCamp=[i,i+1,i+2].every(k=>a.getZ(k)>=start-1e-4&&a.getZ(k)<=end+1e-4);
  const meanZ=(a.getZ(i)+a.getZ(i+1)+a.getZ(i+2))/3;
  const index=isCamp?1:fullMine?(meanZ<95?2:3):0;if(isCamp)campTriangles++;
  if(index!==previous){if(previous>=0)geometry.addGroup(runStart,i-runStart,previous);runStart=i;previous=index;}
  const nx=Math.abs(norm.getX(i)),ny=Math.abs(norm.getY(i)),nz=Math.abs(norm.getZ(i));
  for(let k=i;k<i+3;k++){
   const x=a.getX(k),y=a.getY(k),z=a.getZ(k);
   const [u,v]=ny>=nx&&ny>=nz?[x,z]:nx>=nz?[z,y]:[x,y];
   uv[k*2]=u/2.4;uv[k*2+1]=v/2.4;
  }
 }
 if(previous>=0)geometry.addGroup(runStart,a.count-runStart,previous);
 geometry.setAttribute('uv',new BufferAttribute(uv,2));
 return {materials:[base,stone,...naturalMats],campTriangles,dispose(){stone.dispose();map.dispose();naturalMats.forEach(m=>m.dispose());naturalMaps.forEach(t=>t.dispose());}};
}
type Family='rock'|'wood'|'iron';
type Part={family:Family;centre:readonly [number,number,number];size:readonly [number,number,number];angle:number;shade:number};
/** Fixed emissive presentation, not another light/healing authority.
 * Warm pool uses a low-cost baked floor decal; zero PointLight budget. */
export function mountR30CampHearthGlow(parent:Group,at:readonly [number,number,number]){
 const group=new Group();group.name='r30-camp-hearth-glow';group.position.fromArray(at);
 const size=64,data=new Uint8Array(size*size*4);
 for(let j=0;j<size;j++)for(let i=0;i<size;i++){
  const r=Math.hypot((i+.5-size/2)/(size/2),(j+.5-size/2)/(size/2));
  const a=Math.round(75*Math.max(0,1-r)**1.5);
  data.set([229,164,93,a],(j*size+i)*4);
 }
 const map=new DataTexture(data,size,size);map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
 const plane=new PlaneGeometry(4.6,4.6),poolMat=new MeshBasicMaterial({map,transparent:true,depthWrite:false});
 const pool=new Mesh(plane,poolMat);pool.rotation.x=-Math.PI/2;pool.position.y=.014;group.add(pool);
 const geo=new BoxGeometry(),flameMat=new MeshBasicMaterial();
 const flame=new InstancedMesh(geo,flameMat,15),matrix=new Matrix4(),color=new Color();
 for(let i=0;i<15;i++){
  const x=((i*7)%5-2)*.075,z=((i*3)%4-1.5)*.082,h=.10+((i*13)%7)*.025;
  matrix.makeScale(.065,h,.065).setPosition(x,.24+h/2+(i%3)*.025,z);
  flame.setMatrixAt(i,matrix);flame.setColorAt(i,color.setHex(i%3===0?0xf9d58a:i%3===1?0xe5a45d:0xb95d31));
 }
 flame.computeBoundingSphere();group.add(flame);parent.add(group);
 return {group,at,dispose(){group.removeFromParent();flame.dispose();geo.dispose();flameMat.dispose();plane.dispose();poolMat.dispose();map.dispose();}};
}
export function mountR30CampRoof(parent:Group,options:{floor:number;start:number;length:number;extension:number;side:'left'|'right'}){
 const {floor,start,length,extension,side}=options,sign=side==='right'?1:-1;
 const group=new Group();group.name='town-c-r30-camp-rock-and-timber';
 const parts:Part[]=[];
 const put=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,shade:number,angle=0)=>{
  // Every added visible block is above standing capsule clearance.
  // All structural trim stays inside the original camp ceiling envelope.
  parts.push({family,centre:[sign*x,floor+y,start+z],size:[w,h,d],angle:sign*angle,shade});
 };
 const left=-2,right=2+extension,width=right-left;
 for(const [i,z] of [.48,length*.43,length-.65].entries()){
  // Weight-bearing arch shoulders rise out of the existing stone walls.
  for(const [edge,direction] of [[left,1],[right,-1]]){
   for(let k=0;k<4;k++){
    const w=.29+k*.13,x=edge+direction*(w/2+.015);
    put('rock',x,2.33+k*.218,z,w,.202,.63,k%2?0x505258:0x41464b);
    put('rock',x,2.33+k*.218,z+.36,w*.86,.19,.073,0x62605a);
   }
   put('wood',edge+direction*.52,2.69,z,.22,1.15,.29,0x70543e,-direction*.68);
   put('iron',edge+direction*.82,3.08,z,.22,.25,.43,0x80563d);
  }
  const centre=(left+right)/2;
  put('wood',centre,3.23,z,width-.22,.39,.37,i===1?0x70543e:0x604735);
  for(const x of [left+.75,centre,right-.75]){
   put('iron',x,3.23,z,.115,.42,.41,0x80563d);
   for(const dz of [-.213,.213])put('iron',x,3.20,z+dz,.047,.051,.035,0xa08866);
  }
 }
 // Uneven dark-rock lip along the lateral walls. These are above head height
 // and flush with the hall, not false walkable platforms or new mining sites.
 for(const [edge,direction] of [[left,1],[right,-1]])for(let j=0;j<Math.floor(length/.7);j++){
  const z=.35+j*.7,thickness=.10+(j%4)*.028;
  put('rock',edge+direction*(thickness/2+.005),3.31-(j%3)*.04,z,thickness,.30,.65,j%3?0x343940:0x505258);
 }
 const geo=new BoxGeometry(),mats:MeshLambertMaterial[]=[],maps:DataTexture[]=[],meshes:InstancedMesh[]=[];
 for(const family of ['rock','wood','iron'] as const){
  const list=parts.filter(p=>p.family===family);if(!list.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,list.length);
  mesh.name='camp-r30-'+family;
  const matrix=new Matrix4(),q=new Quaternion(),axis=new Vector3(0,0,1),colour=new Color();
  list.forEach((p,i)=>{matrix.compose(new Vector3(...p.centre),q.setFromAxisAngle(axis,p.angle),new Vector3(...p.size));mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,colour.setHex(p.shade))});
  mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);meshes.push(mesh);maps.push(map);mats.push(mat);
 }
 parent.add(group);return {group,parts,dispose(){group.removeFromParent();meshes.forEach(m=>m.dispose());geo.dispose();mats.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());}};
}
