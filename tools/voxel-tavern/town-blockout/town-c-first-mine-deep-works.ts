import {BoxGeometry,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,SRGBColorSpace} from 'three';
import {firstMineDeepWorks} from '../../../src/shared/town-c-first-mine-deep-works.js';
type K='rock'|'basalt'|'wood'|'iron'|'rust'|'cloth'|'dust'|'frost';
const colors:Record<K,number>={rock:0x6d6257,basalt:0x333b48,wood:0x745237,iron:0x78828b,rust:0x896044,cloth:0x747b6b,dust:0x9a9183,frost:0x93acbf};
type Part={k:K;x:number;y:number;z:number;w:number;h:number;d:number};
export function mountFirstMineDeepWorks(parent:Group,enabled:boolean){
 const group=new Group();group.name='town-c-first-mine-deep-works';const parts:Part[]=[];
 const add=(k:K,x:number,y:number,z:number,w:number,h:number,d:number)=>parts.push({k,x,y,z,w,h,d});
 if(enabled){
 const f=-91;
 // Contoured rubble mass; shared solid envelope leaves x=-40 approach clear.
 for(let i=0;i<7;i++)for(let j=0;j<16;j++){
   const x=-46.9+i*.57,z=126.2+j*.61;
   const h=.45+((i*11+j*7)%13)*.19+(6-i)*.085;
   for(let k=0;k<Math.ceil(h/.28);k++){
     const y=f+.14+k*.28;
     add((i+j+k)%5?'rock':'basalt',x+.02*Math.sin(j+k),y,z,.55,.265,.59);
     if((i*17+j*5+k)%19===0)add('dust',x+.27,y,z,.02,.12,.19);
   }
 }
 // Broken timber frame with iron plates, restrained inside collision box.
 for(let i=0;i<7;i++){
   const x=-36+i*.66;
   for(let k=0;k<11;k++)add(k%4?'wood':'rust',x,f+.15+k*.28,126.1,.29,.27,.32);
   for(const z of [125.64,126.96])add('iron',x,f+.13,z,.48,.26,.25);
   add('wood',x,f+3.12,126.1,.65,.28,.36);
   for(let j=0;j<5;j++)add('iron',x+.13,f+.40+j*.51,125.92,.09,.09,.065);
 }
 // Two complete rows of bunks, mattresses, abandoned blankets.
 for(const s of [-1,1]){
   const z=s===-1?126.35:135.65;
   for(let i=0;i<5;i++){
     const x=31.2+i*2.35;
     for(const dx of [-.94,.94])for(const dz of [-.76,.76])add('wood',x+dx,f+1.12,z+dz,.16,2.24,.16);
     for(const y of [.38,1.55]){
       for(let j=0;j<10;j++)add('wood',x-.91+j*.20,f+y,z,.19,.13,1.54);
       for(const dz of [-.73,.73])add('iron',x,f+y,z+dz,1.96,.19,.13);
       for(const dx of [-.91,.91])add('wood',x+dx,f+y+.12,z,.13,.24,1.52);
       add('dust',x,f+y+.17,z,1.74,.19,1.36);
       for(let a=0;a<8;a++)for(let b=0;b<5;b++){
         if(a>=6&&b>=3)continue;
         add((a+b)%8?'cloth':'dust',x-.76+a*.19,f+y+.29+(a%3)*.01,z-.56+b*.24,.19,.06,.23);
       }
       add('cloth',x-.62,f+y+.34,z+.49,.46,.14,.32);
     }
     for(const dz of [-.73,.73])for(let j=0;j<8;j++)
       add('rust',x+.93,f+.26+j*.25,z+dz,.05,.10,.07);
   }
 }
 // Narrow lockers, hinges and chipped handles.
 for(let i=0;i<4;i++){
   const z=129.25+i*1.10;
   add('basalt',46.5,f+1.18,z,1.6,2.36,1.03);
   for(let row=0;row<9;row++)for(let col=0;col<5;col++)
      add((row+col)%4?'iron':'rust',45.68,f+.14+row*.255,z-.41+col*.20,.11,.244,.192);
   add('rust',45.66,f+1.27,z+.22,.12,.22,.09);
 }
 // Bank-side damp scree and frost traces: flush nonmineable inlay.
 // No extra water or phase source.
 for(const s of firstMineDeepWorks.snakes)for(let i=-6;i<=6;i++)for(let j=-5;j<=5;j++){
   if(Math.hypot(i,j)>5.6+Math.sin(i*4+j*3)*.7)continue;
   const x=s.east+i*.13,z=s.north+j*.11;
   if(z>=136.94||x<-47.9||x>47.9||x>-4.28&&x<7.48)continue;
   add((i*i+j*j)%4?'dust':'frost',x,f+.009,z,.125,.018,.103);
 }
 }
 const geo=new BoxGeometry(),mats:MeshLambertMaterial[]=[],maps:DataTexture[]=[],meshes:InstancedMesh[]=[];
 for(const k of Object.keys(colors) as K[]){
  const list=parts.filter(p=>p.k===k);if(!list.length)continue;
  const data=new Uint8Array(1024);for(let j=0;j<256;j++){const d=((j*17+Math.floor(j/16)*11)%23)-11;for(let c=0;c<3;c++)data[j*4+c]=Math.max(0,Math.min(255,((colors[k]>>(16-c*8))&255)+d));data[j*4+3]=255}
  const map=new DataTexture(data,16,16);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.needsUpdate=true;
  const mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,list.length),matrix=new Matrix4();
  list.forEach((p,i)=>mesh.setMatrixAt(i,matrix.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z)));
  mesh.computeBoundingSphere();group.add(mesh);maps.push(map);mats.push(mat);meshes.push(mesh);
 }
 parent.add(group);return {group,pieces:parts.length,parts,dispose(){group.removeFromParent();meshes.forEach(m=>m.dispose());mats.forEach(m=>m.dispose());maps.forEach(t=>t.dispose());geo.dispose();}};
}
