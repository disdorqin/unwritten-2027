import {BoxGeometry,DataTexture,Group,InstancedMesh,Matrix4,MeshLambertMaterial,NearestFilter,SRGBColorSpace} from 'three';
import {firstMineMiddleSnowSites,type MineWorkface} from '../../../src/shared/town-c-first-mine-workfaces.js';
type K='stone'|'wood'|'iron'|'rust'|'dark'|'dust'|'snow';
const colors:Record<K,number>={stone:0x72685e,wood:0x76553a,iron:0x777e83,rust:0x956447,dark:0x30363b,dust:0x9d9385,snow:0xaabcca};
type Part={k:K;x:number;y:number;z:number;w:number;h:number;d:number};
export function mountFirstMineWorkfaces(parent:Group,sites:readonly MineWorkface[],station?:MineWorkface){
 const group=new Group();group.name='town-c-first-mine-five-workfaces';const parts:Part[]=[];
 const add=(k:K,x:number,y:number,z:number,w:number,h:number,d:number)=>parts.push({k,x,y,z,w,h,d});
 for(const s of sites){
  const {x,y,z}=s;
  // A complete old mineral cart, fixed on a short recessed end track.
  // All solid cart, lamp and tools fit within the shared static obstruction.
  for(let j=0;j<8;j++){
   add('wood',x-1.12+j*.32,y+.065,z,.30,.13,1.48);
   add('iron',x-1.15+j*.33,y+.19,z-.48,.33,.10,.11);
   add('iron',x-1.15+j*.33,y+.19,z+.48,.33,.10,.11);
  }
  for(const dx of [-.78,.78])for(const dz of [-.48,.48]){
    add('iron',x+dx,y+.29,z+dz,.34,.34,.17);
    for(let j=0;j<8;j++){const a=j*Math.PI/4;add('rust',x+dx+Math.cos(a)*.165,y+.29+Math.sin(a)*.165,z+dz,.11,.11,.19)}
  }
  add('dark',x,y+.50,z,2.03,.22,1.12);
  for(let j=0;j<9;j++){
    const xx=x-.91+j*.225;
    add('wood',xx,y+.65,z,.21,.09,1.08);
    for(const dz of [-.50,.50]){
      add(j%3?'wood':'rust',xx,y+.87,z+dz,.213,.45,.12);
      add('iron',xx,y+1.11,z+dz,.213,.085,.15);
    }
  }
  for(const dx of [-.98,.98])for(let j=0;j<5;j++)add('wood',x+dx,y+.86,z-.4+j*.20,.13,.46,.19);
  for(const dx of [-.72,0,.72])for(const dz of [-.57,.57])for(let j=0;j<4;j++){
    add('rust',x+dx,y+.70+j*.12,z+dz,.085,.08,.055);
  }
  // Old empty lamp on side of cart, no light emitted; pick head and tool rack.
  add('iron',x+1.15,y+.31,z-.58,.14,.55,.14);
  add('dark',x+1.15,y+.79,z-.58,.26,.42,.24);
  add('iron',x+1.15,y+1.02,z-.58,.31,.10,.28);
  for(const dx of [-.10,.10])for(const dz of [-.09,.09])add('rust',x+1.15+dx,y+.81,z-.58+dz,.055,.36,.055);
  add('wood',x-.82,y+.73,z+.05,.10,.10,.72);
  add('iron',x-.82,y+.76,z-.28,.40,.14,.12);
  for(let i=0;i<18;i++){
   const xx=x-.84+(i%6)*.29,zz=z-.33+Math.floor(i/6)*.31;
   add(i%4?'stone':'dust',xx,y+.76+(i%3)*.06,zz,.23,.18+(i%3)*.06,.22);
  }
 }
 if(station){
   const {x,y,z}=station;
   // Long recessed supply bench, storage bins, iron frame, old mine diagram
   // and extinguished lantern. All solid geometry remains inside the shared box.
   for(let i=0;i<12;i++)add('wood',x,y+.76,z-1.64+i*.285,1.45,.17,.275);
   for(const dz of [-1.42,0,1.42]){
     add('iron',x-.58,y+.36,z+dz,.18,.72,.18);
     add('iron',x+.58,y+.36,z+dz,.18,.72,.18);
     add('wood',x,y+.29,z+dz,1.30,.15,.55);
   }
   for(let i=0;i<7;i++){
     const n=z-1.48+i*.46;
     add('wood',x-.28,y+.48,n,.83,.28,.42);
     for(const k of [-1,1])add('iron',x-.28+k*.29,y+.48,n,.09,.29,.42);
     add('dark',x+.16,y+.51,n,.06,.10,.19);
   }
   for(const dz of [-1.63,1.63]){
     for(let j=0;j<10;j++)add(j%4?'iron':'rust',x-.67,y+.11+j*.21,z+dz,.15,.205,.19);
     add('iron',x,y+2.17,z+dz,1.52,.16,.19);
   }
   for(let i=0;i<11;i++)add('wood',x-.73,y+1.5,z-1.55+i*.28,.08,.91,.268);
   // Faint lines are diagram strokes, not invented map text.
   for(let i=0;i<7;i++)add('dust',x-.665,y+1.36+(i%3)*.20,z-.95+i*.22,.024,.044,.32);
   for(let i=0;i<8;i++)add(i%3?'iron':'rust',x-.15+(i%2)*.32,y+.92,z-.8+i*.16,.16,.09,.13);
   add('dark',x+.39,y+1.12,z+1.24,.25,.36,.24);
   for(const dx of [-.12,.12])for(const dz of [-.12,.12])add('iron',x+.39+dx,y+1.12,z+1.24+dz,.055,.37,.055);
   add('rust',x+.39,y+1.34,z+1.24,.30,.08,.30);
 }
 if(station&&sites.length===5){
   // Low floor inlays: remain below the .025 m walking-surface tolerance.
   // They are neither mineable crystals nor additional collision obstacles.
   for(const s of firstMineMiddleSnowSites)for(let row=-6;row<=6;row++)for(let col=-6;col<=6;col++){
     if(Math.hypot(row,col)>6.2+Math.sin(row*5+col*11)*.65)continue;
     add((row*row+col*col)%7===0?'dust':'snow',s.x+col*.24,s.y+.007,s.z+row*.24,.23,.014,.23);
   }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:DataTexture}[]=[];
 for(const k of Object.keys(colors) as K[]){
   const list=parts.filter(p=>p.k===k);if(!list.length)continue;
   const raw=new Uint8Array(1024);const color=colors[k];
   for(let j=0;j<256;j++){const d=((j*17+Math.floor(j/16)*11)%21)-10;for(let c=0;c<3;c++)raw[j*4+c]=Math.max(0,Math.min(255,((color>>(16-c*8))&255)+d));raw[j*4+3]=255}
   const map=new DataTexture(raw,16,16);map.colorSpace=SRGBColorSpace;map.minFilter=map.magFilter=NearestFilter;map.needsUpdate=true;
   const mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,list.length),pose=new Matrix4();
   list.forEach((p,i)=>mesh.setMatrixAt(i,pose.makeScale(p.w,p.h,p.d).setPosition(p.x,p.y,p.z)));
   mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
 }
 parent.add(group);return {group,pieces:parts.length,parts,dispose(){group.removeFromParent();resources.forEach(({mesh,mat,map})=>{mesh.dispose();mat.dispose();map.dispose()});geo.dispose();}};
}
