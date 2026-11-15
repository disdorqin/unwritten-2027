// Individual unit blocks, stairs, slabs and 1/16 m furniture components.
import {writeFileSync,readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
const template=JSON.parse(readFileSync(new URL('./block-template.json',import.meta.url)));
const palette={snow:'#dde5e8',stone:'#697478',cobble:'#525e62',brick:'#89928c',wood:'#60432e',plank:'#a47949',dark:'#392e28',plaster:'#c8b88e',roof:'#3b5558',red:'#8e3e32',gold:'#c99b4e',glow:'#ffc676',green:'#435a3a',bottle:'#334e39',cream:'#e8d7aa',iron:'#414749',book:'#663b33',cloth:'#80342e',pot:'#925f42'};
const boxes=[];
const box=(m,x,y,z,w=1,h=1,d=1)=>{const b=[x,y,z,x+w,y+h,z+d].map(v=>Math.round(v*16)/16);if(b[3]>b[0]&&b[4]>b[1]&&b[5]>b[2])boxes.push({m,b});};
const cube=(m,x,y,z)=>box(m,x,y,z);
const beam=(m,x,y,z,w,h,d)=>{for(let a=0;a<w;a++)for(let b=0;b<h;b++)for(let c=0;c<d;c++)box(m,x+a,y+b,z+c,Math.min(1,w-a),Math.min(1,h-b),Math.min(1,d-c));};
for(let x=-7;x<7;x++)for(let z=-6;z<6;z++){
 cube((x+z)%4?'brick':'cobble',x,1,z);cube('plank',x,2,z);
 if(!(x>=4&&z>=-3&&z<5))cube('plank',x,7,z);
}
function windowFront(x,y,z){
 for(const xx of [x+.0625,x+.875])box('dark',xx,y,z+.625,.0625,1,.125);
 for(const yy of [y+.0625,y+.46875,y+.875])box('wood',x+.0625,yy,z+.625,.875,.0625,.125);
 box('wood',x+.46875,y+.0625,z+.625,.0625,.875,.125);
}
for(const base of [3,8]){
 for(let y=base;y<base+4;y++)for(let x=-7;x<7;x++)for(const z of [-6,5]){
  if(z===5&&x>=-1&&x<1&&y<base+3)continue;
  if([-5,-4,3,4].includes(x)&&(y===base+1||y===base+2)){windowFront(x,y,z);continue;}
  cube(y===base+3||[-7,-3,2,6].includes(x)?'wood':'plaster',x,y,z);
 }
 for(let y=base;y<base+4;y++)for(let z=-5;z<5;z++)for(const x of [-7,6]){
  if([-3,-2,1,2].includes(z)&&(y===base+1||y===base+2)){
   for(const zz of [z+.0625,z+.875])box('wood',x+.5,y,zz,.125,1,.0625);
   for(const yy of [y+.0625,y+.46875,y+.875])box('wood',x+.5,yy,z+.0625,.125,.0625,.875);
  }else cube(y===base+3||z===-1?'wood':'plaster',x,y,z);
 }
 for(let x=-7;x<7;x++){box('dark',x,base+3.5,5.9375,1,.25,.25);box('wood',x,base+3.125,6,.25,.375,.5);}
}
for(let x=-7;x<7;x++)for(let z=6;z<8;z++){box('plank',x,2.75,z,1,.25,1);box('plank',x,7.75,z,1,.25,1);}
for(let i=0;i<4;i++)for(let x=-2;x<2;x++)box('stone',x,2.5-i*.25,8+i*.5,1,.25,.5);
for(let x=-3;x<3;x++)for(let z=10;z<17;z++)box((x+z)%3?'stone':'cobble',x,1.9375,z,1,.0625,1);
function fenceX(x,y,z){box('wood',x+.4375,y,z,.125,1.125,.125);for(const yy of [y+.375,y+.875])box('dark',x,yy,z+.03125,1,.125,.0625);}
for(let x=-7;x<7;x++){fenceX(x,8,7.875);if((x+7)%3===0)box('snow',x+.375,9.125,7.8125,.25,.0625,.25);}
for(const x of [-7,6.875])for(let z=6;z<8;z++){box('wood',x,8,z+.4375,.125,1.125,.125);for(const y of [8.375,8.875])box('dark',x,y,z,.125,.125,1);}
// Gable ends close every space beneath the stepped roof.
for(let x=-7;x<7;x++){const top=12+Math.min(x+8,7-x)*.5;for(let y=12;y<top;y++)for(const z of [-6,5])box(x===-1||x===0?'wood':'plaster',x,y,z,1,Math.min(1,top-y),1);}
for(let x=-8;x<8;x++)for(let z=-7;z<9;z++){
 const y=12+Math.min(x+8,7-x)*.5;
 box('roof',x,y,z,1,.5,1);box('roof',x+(x<0?.5:0),y+.5,z,.5,.25,1);
 if((x*7+z*3+101)%5!==0)box('snow',x,y+.75,z,1,.0625,1);
 if(z===-7||z===8)box('dark',x,y-.1875,z,1,.1875,1);
}
for(let z=-7;z<9;z++){box('dark',-.5,16,z,1,.25,1);box('snow',-.5,16.25,z,1,.125,1);}
for(const y of [6.75,11.75])for(const z of [-5,-1,3])beam('wood',-6,y,z,y===6.75&&z>-4?10:12,.25,.375);
for(let x=-5;x<3;x++){
 cube('plank',x,3,-3);box('dark',x,4,-3.0625,1,.125,1.125);
 box('wood',x+.0625,3.125,-1.9375,.875,.75,.0625);box('plank',x+.1875,3.25,-1.875,.625,.5,.0625);box('iron',x+.375,3.625,-1.8125,.25,.0625,.0625);
}
for(let z=-5;z<-2;z++){cube('plank',2,3,z);box('dark',2,4,z,1,.125,1);}
function bottle(x,y,z,m='bottle',tall=false){
 const h=tall?.375:.25;box(m,x,y,z,.1875,h,.1875);box(m,x+.03125,y+h,z+.03125,.125,.0625,.125);box(m,x+.0625,y+h+.0625,z+.0625,.0625,.1875,.0625);box('gold',x+.0625,y+h+.1875,z+.0625,.0625,.0625,.0625);box('cream',x+.03125,y+.0625,z+.1875,.125,.125,.0625);
}
for(const y of [3.375,4.375,5.375]){beam('dark',-5.75,y,-5.625,8,.125,.5);for(let x=-5.625;x<2;x+=.375)bottle(x,y+.125,-5.5,Math.round(x*8)%3?'bottle':'red',Math.round(x*8)%2===0);}
for(const x of [-5.875,-3.375,-.875,2.125])box('wood',x,3,-5.75,.125,3,.625);
function mug(x,y,z){box('cream',x,y,z,.25,.0625,.25);for(const dx of [0,.1875])box('cream',x+dx,y+.0625,z,.0625,.25,.25);for(const dz of [0,.1875])box('cream',x+.0625,y+.0625,z+dz,.125,.25,.0625);box('gold',x+.0625,y+.1875,z+.0625,.125,.0625,.125);box('cream',x+.25,y+.0625,z+.0625,.125,.0625,.125);box('cream',x+.3125,y+.0625,z+.0625,.0625,.1875,.125);}
function chair(x,y,z,reverse=false){
 for(const dx of [0,.625])for(const dz of [0,.625])box('wood',x+dx,y,z+dz,.125,.5,.125);
 box('plank',x-.0625,y+.5,z-.0625,.875,.125,.875);
 const back=z+(reverse?.625:0);for(const dx of [0,.625])box('wood',x+dx,y+.625,back,.125,.75,.125);for(const yy of [.875,1.1875])box('plank',x,y+yy,back,.75,.125,.125);
}
function table(x,y,z){
 for(const dx of [0,1.5])for(const dz of [0,.875])box('wood',x+dx,y,z+dz,.125,.875,.125);
 for(let dx=0;dx<1.75;dx+=.25)box('plank',x+dx,y+.875,z,.25,.125,1.125);
 box('cloth',x+.5,y+1,z+.0625,.75,.0625,1);mug(x+.1875,y+1,z+.25);mug(x+1.25,y+1,z+.625);
 box('cream',x+.75,y+1.0625,z+.375,.375,.0625,.375);box('pot',x+.8125,y+1.125,z+.4375,.25,.125,.25);
 chair(x+.125,y,z-1);chair(x+.875,y,z+1.375,true);
}
for(const [x,z]of [[-4.75,-.25],[-.5,.5],[-4.25,3.5]])table(x,3,z);
for(const [x,z]of [[-4.75,-2.5],[-.25,1.5]])table(x,8,z);
for(let x=-4.75;x<2;x+=1.125){box('wood',x+.1875,3,-1,.125,.625,.125);box('iron',x,3,-1.1875,.5,.125,.5);box('plank',x-.0625,3.625,-1.25,.625,.125,.625);}
// Quarter-block staircase and continuous landing; reserve the upper floor opening.
for(let i=0;i<20;i++){const z=3.5-i*.375,y=3+i*.25;box('plank',4.25,y,z,1.5,.25,.375);box('dark',4.1875,y,z,.0625,.3125,.375);if(i<17){if(i%2===0)box('wood',4.0625,y+.25,z,.125,1,.125);box('wood',4.0625,y+1.125,z,.125,.125,.375);}}
for(let z=-2;z<5;z++){box('wood',3.875,8,z+.4375,.125,1.125,.125);for(const y of [8.375,8.875])box('dark',3.875,y,z,.125,.125,1);}
for(let y=3;y<17;y++)for(let x=3;x<5;x++)cube((x+y)%3?'brick':'cobble',x,y,-5);
box('dark',3,3,-3.9375,2,1.25,.125);box('glow',3.25,3.125,-3.75,1.5,.5,.125);
for(let x=3.25;x<4.75;x+=.375)box('wood',x,3.0625,-3.5625,.25,.1875,.375);beam('stone',2.75,4.25,-4.0625,2.5,.25,1.25);
beam('plank',-6,3,2.5,2.5,.25,2.5);box('dark',-5.75,3.25,3,1.75,1.5,.625);box('wood',-5.875,4.75,2.9375,2,.125,.75);
for(let i=0;i<18;i++){box('cream',-5.75+i*.09375,4,3.625,.0625,.0625,.3125);if(i%3!==2)box('dark',-5.71875+i*.09375,4.0625,3.625,.0625,.0625,.1875);}chair(-5.25,3.25,4.25,true);
for(const y of [8.125,8.875,9.625,10.375]){beam('wood',-5.875,y,-5.5,5,.125,.625);for(let i=0;i<27;i++)box(i%4?'book':'green',-5.75+i*.175,y+.125,-5.375,.125,.5-(i%3)*.0625,.375);}
for(const x of [-5.875,-.875])box('wood',x,8,-5.5,.125,2.875,.625);
beam('plank',-5.75,8,-.25,1,.5,2);beam('cloth',-5.625,8.5,-.125,.75,.25,1.75);box('wood',-5.875,8.5,-.25,.125,.875,2);
for(let x=-2.5;x<2;x+=.5)for(let z=-1;z<3;z+=.5)box((Math.round(x*2)+Math.round(z*2))%2?'cloth':'red',x,8,z,.5,.0625,.5);
function barrel(x,y,z){box('plank',x+.125,y,z+.125,.75,1,.75);box('plank',x,y+.125,z+.25,1,.75,.5);box('plank',x+.25,y+.125,z,.5,.75,1);for(const yy of [y+.1875,y+.75]){box('iron',x-.0625,yy,z+.1875,1.125,.125,.625);box('iron',x+.1875,yy,z-.0625,.625,.125,1.125);}box('dark',x+.4375,y+.375,z+1,.125,.125,.1875);}
for(const [x,y,z]of [[-6,3,-4.75],[-6,3,-3.5],[1,8,-5.5],[2,8,-5.5],[-6,2,7]])barrel(x,y,z);
function planter(x,y,z){box('pot',x+.0625,y,z+.0625,.625,.5,.625);box('pot',x,y+.5,z,.75,.125,.75);box('dark',x+.0625,y+.5,z+.0625,.625,.0625,.625);for(let i=0;i<7;i++)box('green',x+((i*7)%9)/16,y+.625+(i%3)*.1875,z+((i*5)%9)/16,.3125,.25,.3125);}
for(const [x,y,z]of [[-6.5,3,5.5],[5.5,3,6.5],[-6,8,6.75],[5,8,6.75],[-6,8,3.5],[1.5,3,-5]])planter(x,y,z);
for(const x of [-5,3])for(const y of [3.75,8.75]){box('wood',x,y,6.0625,2,.25,.5);for(let i=0;i<7;i++){box('green',x+i*.25,y+.25,6.125,.25,.25,.25);box(i%2?'red':'cream',x+i*.25+.0625,y+.5,6.1875,.125,.125,.125);}}
for(const side of [-6.75,6.5])for(let i=0;i<20;i++)box('green',side+(i%3)*.125,6.5+(i%6)*.375,6.0625+(i%2)*.125,.375,.375,.1875);
function lantern(x,y,z){box('iron',x+.25,y+.75,z+.25,.0625,.75,.0625);box('glow',x+.0625,y+.125,z+.0625,.4375,.5,.4375);for(const yy of [y,y+.625])box('dark',x,yy,z,.5625,.125,.5625);for(const dx of [0,.5])for(const dz of [0,.5])box('red',x+dx,y+.125,z+dz,.0625,.5,.0625);box('gold',x+.25,y-.25,z+.25,.0625,.25,.0625);}
for(const [x,y,z]of [[-2,5.5,6.5],[1.5,5.5,6.5],[-5.5,10.25,7],[4.5,10.25,7],[-2,5.5,.5],[1,5.5,.5],[-2,10.5,-1],[1,10.5,-1]])lantern(x,y,z);
for(let z=5.5;z<8;z+=.5)box('wood',6.75,6.25,z,.1875,.25,.5);
for(let i=0;i<3;i++)box('dark',6.6875,5.125+i*.25,7.625,.125,.25,1.25);
const cells=new Map();
for(const {m,b}of boxes)for(let x=Math.floor(b[0]);x<Math.ceil(b[3]);x++)for(let y=Math.floor(b[1]);y<Math.ceil(b[4]);y++)for(let z=Math.floor(b[2]);z<Math.ceil(b[5]);z++){
 const v=[Math.max(b[0]-x,0),Math.max(b[1]-y,0),Math.max(b[2]-z,0),Math.min(b[3]-x,1),Math.min(b[4]-y,1),Math.min(b[5]-z,1)];const k=[x,y,z].join(',');if(!cells.has(k))cells.set(k,[]);cells.get(k).push({m,b:v});
}
const catalogue=[],ids=new Map(),voxels=[];
for(const [k,parts]of cells){const key=JSON.stringify(parts);if(!ids.has(key)){ids.set(key,catalogue.length+2);catalogue.push(parts);}voxels.push([...k.split(',').map(Number),ids.get(key)]);}
const stats={pieces:boxes.length,cells:cells.size,types:catalogue.length,grid:1/16};
writeFileSync(new URL('./tavern.json',import.meta.url),JSON.stringify({palette,catalogue,voxels,stats}));
// Offline scene data; the actual Voxelize client creates its chunk meshes and collision.
const blocks={air:template.air,snow:structuredClone(template.cube)};
blocks.snow.faces.forEach(f=>{f.textureGroup='snow';});
for(let i=0;i<catalogue.length;i++){
 const ps=catalogue[i],full=ps.some(p=>p.b.every((v,j)=>v===[0,0,0,1,1,1][j]));
 const b={...structuredClone(template.partial),id:i+2,name:`Tavern ${i}`,faces:[],aabbs:[],isOpaque:full,isTransparent:Array(6).fill(!full),lightAttenuation:full?1:0,occludesFluid:full};
 for(let j=0;j<ps.length;j++){
  const p=ps[j],a=p.b;b.aabbs.push({minX:a[0],minY:a[1],minZ:a[2],maxX:a[3],maxY:a[4],maxZ:a[5]});
  for(const f of template.cube.faces){const face=structuredClone(f);face.name=`${p.m}${j}-${f.name}`;face.textureGroup=p.m;face.range={startU:0,endU:1,startV:0,endV:1};for(const c of face.corners){c.pos=c.pos.map((v,k)=>a[k]+v*(a[k+3]-a[k]));const ax=f.dir[0]?[2,1]:f.dir[1]?[0,2]:[0,1];c.uv=c.uv.map((v,k)=>v*(a[ax[k]+3]-a[ax[k]]));}b.faces.push(face);}
 }
 if(ps.some(p=>p.m==='glow'))Object.assign(b,{isLight:true,redLightLevel:15,greenLightLevel:11,blueLightLevel:6});blocks[b.name.toLowerCase()]=b;
}
// Allocate atlas UVs using Voxelize's quarter-cell margins. These are normally
// allocated by the Rust registry; the offline construction needs them too.
const slots=new Map();
for(const b of Object.values(blocks))for(const f of b.faces){const key=f.textureGroup?`g:${f.textureGroup}`:`f:${b.id}:${f.name}`;if(!slots.has(key))slots.set(key,slots.size);}
let side=1;while(side*side<slots.size)side*=2;
for(const b of Object.values(blocks))for(const f of b.faces){const key=f.textureGroup?`g:${f.textureGroup}`:`f:${b.id}:${f.name}`,n=slots.get(key),u=(n%side)/side+1/(side*4),v=Math.floor(n/side)/side+1/(side*4);f.range={startU:u,endU:u+1/(side*2),startV:1-v-1/(side*2),endV:1-v};}
const W=48,H=32,idx=(x,y,z)=>((x+16)*H+y)*W+z+16;
const grid=new Uint32Array(W*H*W),byId=new Map(Object.values(blocks).map(b=>[b.id,b]));
for(let x=-16;x<32;x++)for(let z=-16;z<32;z++)for(let y=0;y<2;y++)grid[idx(x,y,z)]=1;
for(const [x,y,z,id]of voxels)grid[idx(x,y,z)]=id;
const channels=Array.from({length:4},()=>new Uint8Array(grid.length));
const solid=Uint8Array.from(grid,id=>{const b=byId.get(id);return b?.isOpaque||b?.aabbs?.some(a=>a.minX===0&&a.maxX===1&&a.minZ===0&&a.maxZ===1)?1:0;});
for(let x=-16;x<32;x++)for(let z=-16;z<32;z++){let sun=15;for(let y=H-1;y>=0;y--){const n=idx(x,y,z);if(solid[n])sun=0;channels[0][n]=sun;}}
for(let i=0;i<grid.length;i++)if(byId.get(grid[i])?.isLight){channels[1][i]=15;channels[2][i]=11;channels[3][i]=6;}
for(const ch of channels){const q=[];for(let n=0;n<ch.length;n++)if(ch[n]>1)q.push(n);for(let a=0;a<q.length;a++){const n=q[a],v=ch[n]-1,z=n%W,y=Math.floor(n/W)%H,x=Math.floor(n/(W*H));for(const [k,ok]of [[n-1,z>0],[n+1,z<W-1],[n-W,y>0],[n+W,y<H-1],[n-W*H,x>0],[n+W*H,x<W-1]])if(ok&&!solid[k]&&ch[k]<v){ch[k]=v;if(v>1)q.push(k);}}}
const chunks=[];
for(let cx=-1;cx<=1;cx++)for(let cz=-1;cz<=1;cz++){
 const v=[],l=[];for(let x=0;x<16;x++)for(let y=0;y<H;y++)for(let z=0;z<16;z++){const n=idx(cx*16+x,y,cz*16+z);v.push(grid[n]);l.push((channels[0][n]<<12)|(channels[1][n]<<8)|(channels[2][n]<<4)|channels[3][n]);}chunks.push({id:`tavern-${cx}-${cz}`,x:cx,z:cz,voxels:v,lights:l,meshes:[]});
}
const world={provenance:'authored offline voxel construction',init:{type:'INIT',json:{id:'offline-tavern',options:{...template.options,minChunk:[-1,-1],maxChunk:[1,1],doesTickTime:false},stats:{...template.stats,time:6000},blocks}},load:{type:'LOAD',chunks}};
const compressed=gzipSync(JSON.stringify(world));
writeFileSync(new URL('./snapshot.ts',import.meta.url),'// Authored offline Voxelize construction, not a live multiplayer recording.\nexport default '+JSON.stringify(compressed.toString('base64'))+';\n');
console.log({...stats,snapshotBytes:compressed.length});
