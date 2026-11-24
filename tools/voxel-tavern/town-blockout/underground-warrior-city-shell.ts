import {BoxGeometry,Color,DataTexture,Group,InstancedMesh,MeshLambertMaterial,NearestFilter,Object3D,PointLight,SRGBColorSpace} from 'three';
import {createStaticFootIndex} from './town-c-static-foot-index.js';
/** U10 city ENY local frame. Existing houses, statue, forge, arcade and wall remain separate reusable modules.
 * This shell supplies only missing street, gates, tavern, square paving and enclosing rock. No registration/loot/teleport. */
type Family='stone'|'shade'|'tan'|'wood'|'moss'|'rust'|'crystal'|'moon';
type Piece={id:string;family:Family;e:number;n:number;y:number;w:number;h:number;d:number;solid:boolean};
const colors:Record<Family,number>={stone:0x8a8378,shade:0x2c3648,tan:0xa98a56,wood:0x5d4630,moss:0x44503c,rust:0x8a4a34,crystal:0x7fd4c8,moon:0xe8ecf0};
const pieces:Piece[]=[];
function p(id:string,family:Family,e:number,n:number,y:number,w:number,h:number,d:number,solid=false){pieces.push({id,family,e,n,y,w,h,d,solid})}
export const warriorCityShellPlan={
  depth:-165,length:180,
  segments:[['gate',0,25],['homes',25,80],['square',80,120],['workshops',120,170],['cold-exit',170,180]] as const,
  floor:{minE:0,maxE:180,minN:-30,maxN:30},
  tavern:{east:125,north:20,entry:{east:125,north:14.35},counter:{east:125,north:22.15}},
  mainRoute:[{east:1,north:0},{east:24,north:0},{east:80,north:0},{east:120,north:0},{east:170,north:0},{east:179,north:0}],
  forgeApproach:[{east:142,north:0},{east:142,north:4.9}],
  coldFlame:{east:98.1,north:-9.65},
} as const;
// A full continuous cave bed. Pavers are flush, not independent raised blockers.
p('bed','shade',90,0,-.491,180,.98,60);
for(let e=0;e<180;e+=1.2)for(let n=-7.5;n<7.5;n+=1.25){
  const w=Math.min(1.2,180-e),d=Math.min(1.25,7.5-n);
  p('street/'+e+'/'+n,(Math.round(e*10+n*4)%11===0?'tan':'stone'),e+w/2,n+d/2,-.047,w-.025,.094,d-.025);
}
for(let e=80;e<120;e+=1.25)for(let n=-20;n<20;n+=1.25){
  if(Math.abs(n+.625)<7.5)continue;
  p('square/'+e+'/'+n,(Math.round(e+n)%9===0?'tan':'stone'),e+.625,n+.625,-.044,1.215,.088,1.215);
}
// Two enclosing cliff walls and overhead rock plates. The exterior is not a second world.
for(const side of [-1,1])for(let e=1;e<180;e+=2){
  for(let row=0;row<9;row++){
    const n=side*(30.9+(row%3)*.35+Math.sin(e*.17+row)*.28);
    p('cave-wall/'+side+'/'+e+'/'+row,(row+e)%5?'shade':'stone',e,n,1+row*2,2.03,2.06,2.4,true);
  }
  for(let r=0;r<5;r++)p('roof/'+side+'/'+e+'/'+r,'shade',e,side*(3+r*6),19+(r%3)*.55,2.04,2.2,6.2);
}
// Tall stone gateway, half-open leaf outside a protected 5.6 m central opening.
// The second gate is the end of this local level, not a fake teleport to the palace.
function gate(e:number,exit:boolean){
  const h=exit?8:10;
  for(const s of [-1,1]){
    p('gate/'+e+'/base/'+s,'shade',e,s*5.15,.40,4.1,.8,3.7,true);
    for(let row=0;row<Math.floor(h/.62);row++)for(let j=0;j<4;j++){
      const n=s*(3.8+j*.75+(row%2)*.065);
      p('gate/'+e+'/course/'+s+'/'+row+'/'+j,(row+j)%5?'stone':'tan',e,n,.82+(row+.5)*.62,2.7,.60,.73,true);
    }
    for(let row=0;row<10;row++){
      p('gate/'+e+'/pilaster/'+s+'/'+row,'tan',e-.98,s*3.43,.45+row*.78,.5,.73,.67);
      p('gate/'+e+'/pier-edge/'+s+'/'+row,'shade',e+.91,s*6.55,.45+row*.78,.52,.74,.67);
    }
    // Leaf, resting beside jamb; no blocker in the middle of the corridor.
    p('gate/'+e+'/half-leaf/'+s,'shade',e+.37,s*4.25,2.2,.68,4.4,1.45,true);
    for(let i=0;i<7;i++)p('gate/'+e+'/strap/'+s+'/'+i,'rust',e-.01,s*4.25,.3+i*.56,.11,.13,1.38);
  }
  for(let row=0;row<5;row++)for(let j=0;j<17;j++)
    p('gate/'+e+'/head/'+row+'/'+j,(row+j)%7?'stone':'shade',e,-6.4+j*.8,h-.7+row*.44,3.15+row*.43,.42,.78,true);
  for(let j=0;j<17;j++)p('gate/'+e+'/eave/'+j,'tan',e,-6.4+j*.8,h+1.44,4.95,.27,.79);
  // Unlettered beam, visible chisel marks only.
  for(let j=0;j<14;j++)p('gate/'+e+'/chisel/'+j,'shade',e-1.67,-2.7+j*.41,h-.65,.04,.08,.23);
}
gate(8,false);gate(175,true);
// Barbican stone cheeks, open alcoves, lamp recesses, ancient unlettered wear.
for(const s of [-1,1])for(let e=12;e<25;e+=1){
  for(let row=0;row<9;row++)
    p('barbican/'+s+'/'+e+'/'+row,row%3?'stone':'shade',e,s*7.6,.32+row*.62,.98,.60,1.26,true);
  if(e%3===0)for(let r=0;r<4;r++)p('barbican/recess/'+s+'/'+e+'/'+r,'shade',e,s*6.95,1.35+r*.18,.28,.16,.025);
}
// Stone posts at the edge of the square, keeping the street and existing statue free.
for(const e of [83,91,112,118])for(const n of [-17,17]){
  for(let row=0;row<10;row++)p('square/pier/'+e+'/'+n+'/'+row,row%4?'stone':'shade',e,n,.25+row*.48,.85,.46,.83,true);
  p('square/cap/'+e+'/'+n,'tan',e,n,4.95,1.3,.32,1.3);
}
// Tavern occupies the previously empty north-side workshop pocket, clear of the forge and wall staircase.
const te=125,tn=20;
p('tavern/foundation','stone',te,tn,-.10,11,.2,11.4);
for(let row=0;row<9;row++){
  for(let i=0;i<20;i++){
    const e=te-5.2+i*.55+(row%2)*.06;
    if(Math.abs(e-te)>1.45||row>=6)p('tavern/front/'+row+'/'+i,(row+i)%7?'stone':'tan',e,14.4,.24+row*.46,.53,.45,.56,true);
    p('tavern/rear/'+row+'/'+i,(row+i)%5?'stone':'shade',e,24.55,.24+row*.46,.53,.45,.56,true);
  }
  for(const s of [-1,1])for(let i=0;i<18;i++)p('tavern/side/'+s+'/'+row+'/'+i,row%4?'stone':'tan',te+s*5.45,14.8+i*.56,.24+row*.46,.55,.45,.55,true);
}
for(let e=te-5.5;e<te+5.5;e+=.55)for(let n=14.1;n<24.55;n+=1.15)
  p('tavern/roof/'+e+'/'+n,'shade',e+.27,n+.55,4.28,.56,.28,1.15);
for(let n=15;n<24.55;n+=1.6){
  p('tavern/beam/'+n,'wood',te,n,3.89,10.5,.27,.32);
  for(const s of [-1,1])p('tavern/beam-post/'+n+'/'+s,'wood',te+s*5.02,n,1.88,.21,3.7,.23,true);
}
for(let i=0;i<15;i++)p('tavern/counter-top/'+i,'wood',te-3.65+i*.5,23.15,1.04,.49,.17,1.22,true);
for(let i=0;i<15;i++)p('tavern/counter-base/'+i,i%4?'stone':'shade',te-3.65+i*.5,23.15,.45,.49,.90,.94,true);
for(let i=0;i<9;i++){
 const e=te-3.4+i*.79;
 if(i!==4&&i!==5){p('tavern/stool/'+i,'wood',e,21.1,.35,.45,.7,.43,true);
 p('tavern/stool-seat/'+i,'tan',e,21.1,.73,.60,.12,.57,true);}
 p('tavern/cup-base/'+i,'tan',e,23.15,1.2,.19,.08,.18);
 for(const s of [-1,1])p('tavern/cup-rim/'+i+'/'+s,'stone',e+s*.075,23.15,1.28,.04,.12,.16);
}
for(const s of [-1,1])for(let j=0;j<2;j++){
 const e=te+s*3.1,n=17+j*2.4;
 p('tavern/table/'+s+'/'+j,'wood',e,n,.82,1.65,.19,1.24,true);
 for(const dx of [-.62,.62])for(const dn of [-.43,.43])p('tavern/table-leg/'+s+'/'+j+'/'+dx+'/'+dn,'wood',e+dx,n+dn,.4,.16,.8,.17,true);
 for(let i=0;i<5;i++)p('tavern/plate/'+s+'/'+j+'/'+i,'stone',e-.4+i*.20,n,.95,.15,.06,.22);
}
for(let i=0;i<4;i++){
 const e=te-3.9+i*2.55;
 p('tavern/dead-lamp-chain/'+i,'rust',e,19.2,3.48,.08,.72,.08);
 p('tavern/dead-lamp/'+i,'shade',e,19.2,3.03,.44,.25,.44);
}
// Unreadable open ledger. No invented names, dates or secret text.
for(const s of [-1,1]){
 p('tavern/ledger-page/'+s,'tan',te+s*.16,22.94,1.17,.31,.045,.43);
 for(let i=0;i<5;i++)p('tavern/ledger-faint/'+s+'/'+i,'shade',te+s*.16,22.8+i*.063,1.196,.21-i*.02,.004,.018);
}
for(let i=0;i<9;i++)p('tavern/rear-shelf/'+i,'wood',te-4+i,24.13,2.15,.99,.16,.65);
// Broken cold-transition wall edges leave the last approach open.
for(let e=168;e<180;e+=.8)for(const s of [-1,1])for(let j=0;j<5;j++)
 p('cold-transition/'+e+'/'+s+'/'+j,j%3?'shade':'stone',e,s*(7.8+j*.53),.26+j*.22,.76,.5+j*.24,.78,true);
export const warriorCityShellPieces=Object.freeze(pieces);
function texture(f:Family){const bytes=new Uint8Array(1024),base=colors[f],accent=colors[f==='wood'?'tan':f==='shade'?'stone':'shade'];for(let y=0;y<16;y++)for(let x=0;x<16;x++){
 const c=(x===0||y===0||x===15||y===15||(x*13+y*7+x*y)%29<3)?accent:base;bytes.set([c>>16,(c>>8)&255,c&255,255],(y*16+x)*4)
}const t=new DataTexture(bytes,16,16);t.colorSpace=SRGBColorSpace;t.magFilter=t.minFilter=NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t}
export function createWarriorCityShell(){
 const group=new Group();group.name='u10-city-complete-street-shell';const geo=new BoxGeometry(),pose=new Object3D();
 const resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:DataTexture}[]=[];
 for(const f of Object.keys(colors) as Family[]){
   const rows=pieces.filter(p=>p.family===f);if(!rows.length)continue;const map=texture(f),mat=new MeshLambertMaterial({map});
   // Spatial chunks prevent the entire 180m street from rendering around every corner.
   for(let start=0;start<180;start+=30){
    const chunk=rows.filter(p=>Math.min(179.999,Math.max(0,p.e))>=start&&Math.min(179.999,Math.max(0,p.e))<start+30);if(!chunk.length)continue;
    const mesh=new InstancedMesh(geo,mat,chunk.length);chunk.forEach((p,i)=>{pose.position.set(p.e,p.y,-p.n);pose.scale.set(p.w,p.h,p.d);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix)});mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
   }
 }
 const solids=pieces.filter(p=>p.solid);
 const collisionIndex=createStaticFootIndex(solids.map(p=>({min:[p.e-p.w/2,p.y-p.h/2,-p.n-p.d/2],max:[p.e+p.w/2,p.y+p.h/2,-p.n+p.d/2]})));
 function canStand(e:number,n:number,y=0,r=.27){
   if(![e,n,y,r].every(Number.isFinite)||e-r<0||e+r>180||n-r< -30||n+r>30)return false;
   return !collisionIndex.blocks(e,n,y,r);
 }
 const lamp=new PointLight(new Color(colors.crystal),13,15,2);lamp.position.set(98.1,1.2,9.65);group.add(lamp);
 return {group,canStand,solids,plan:warriorCityShellPlan,count:pieces.length,dispose(){group.removeFromParent();for(const {mesh} of resources)mesh.dispose();for(const mat of new Set(resources.map(r=>r.mat)))mat.dispose();for(const map of new Set(resources.map(r=>r.map)))map.dispose();geo.dispose();}};
}
