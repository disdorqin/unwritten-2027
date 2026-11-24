import {
  BoxGeometry, DataTexture, Group, InstancedMesh, MeshStandardMaterial,
  NearestFilter, Object3D, RGBAFormat, SRGBColorSpace,
} from 'three';

/** Batch 91 / C: physical forge interior, local east/north relative to the
 * existing U-10 forge hall. Nothing in this dressing grants inventory, changes
 * the F-2 forge phase, or claims an installed original-stone core. */
type Family='stone'|'brick'|'wood'|'iron'|'copper'|'water'|'soot';
type Part=Readonly<{id:string;family:Family;e:number;n:number;y:number;w:number;d:number;h:number}>;
type Solid=Readonly<{e:number;n:number;y:number;width:number;depth:number;height:number}>;
const palette:Record<Family,readonly[number,number,number]>={
  stone:[0x62676d,0x777b7b,0x414952], brick:[0x76554a,0x927060,0x4e3936],
  wood:[0x5b4334,0x81604a,0x3c3029], iron:[0x454b50,0x777c7e,0x2d3439],
  copper:[0x996545,0xbb8c59,0x704433],water:[0x36575b,0x5b8b8b,0x283f44],
  soot:[0x30363a,0x44464a,0x22282d],
};
const parts:Part[]=[];
const solids:Solid[]=[];
function p(id:string,family:Family,e:number,n:number,y:number,w:number,d:number,h:number){
  parts.push(Object.freeze({id,family,e,n,y,w,d,h}));
}
function solid(e:number,n:number,y:number,width:number,depth:number,height:number){
  solids.push(Object.freeze({e,n,y,width,depth,height}));
}
// Stone courses and deeper mortar, not a monolithic undecorated box.
// Existing hall wall colliders are the only authority for these trim courses.
for(const side of [-1,1])for(let course=0;course<8;course++){
  for(let j=0;j<17;j++){
    const n=.55+j*.53+(course%2)*.09;
    if(n>9.4)continue;
    p('wall/'+side+'/'+course+'/'+j,(course+j)%6?'stone':'soot',
      side*4.71,n,.12+course*.397,.055,.44,.32);
  }
}
for(let row=0;row<8;row++)for(let col=0;col<18;col++){
  p('rear/'+row+'/'+col,(row+col)%7?'stone':'soot',-4.5+col*.52+(row%2)*.07,
    9.34,.1+row*.396,.45,.065,.33);
}
// Visible timber roof ribs and iron shoes; maintain overhead clearance.
for(let i=0;i<7;i++){
  const n=.65+i*1.36;
  p('ceiling/rib/'+i,'wood',0,n,2.99,9.72,.18,.26);
  for(const side of [-1,1])p('ceiling/shoe/'+side+'/'+i,'iron',side*4.56,n,2.79,.31,.31,.20);
}
// A solid low stone quench trough, with an actual water plane and segmented
// rim. Kept behind the work table on the west side, outside all three feet.
const qe=-3.55,qn=7.63;
p('quench/base','stone',qe,qn,0,1.82,1.45,.22);
for(let i=0;i<7;i++)for(const side of [-1,1])
  p('quench/rim-long/'+side+'/'+i,i%3?'stone':'brick',
    qe-.76+i*.255,qn+side*.59,.22,.25,.25,.67);
for(let i=0;i<4;i++)for(const side of [-1,1])
  p('quench/rim-short/'+side+'/'+i,'stone',
    qe+side*.8,qn-.43+i*.285,.22,.23,.28,.67);
p('quench/water','water',qe,qn,.72,1.36,.95,.025);
for(let i=0;i<8;i++)p('quench/water-line/'+i,'water',qe-.54+(i%4)*.35,
  qn-.24+Math.floor(i/4)*.45,.75,.22,.027,.012);
for(const e of [-.63,.63])p('quench/foot/iron-'+e,'iron',qe+e,qn-.64,.06,.15,.13,.2);
solid(qe,qn,0,1.82,1.45,.89);
// Empty core receptacle built onto the original hearth crown. Its central
// recess is black; there is intentionally NO original stone or fake emissive
// installed core. The existing F-2 snapshot alone may ever install a core.
p('core-seat/base','brick',2,6.92,1.90,.82,.72,.12);
p('core-seat/empty-recess','soot',2,6.92,2.02,.38,.35,.025);
for(let i=0;i<8;i++){
  const a=Math.PI*i/4;
  p('core-seat/clamp/'+i,i%2?'iron':'copper',
    2+.30*Math.cos(a),6.92+.26*Math.sin(a),2.03,.15,.15,.16);
}
// A physically stocked display of unfinished housings, with exposed ribs,
// nozzle and mounting band. Decorative non-pickup objects ONLY.
const re=-4.28,rn=2.3;
for(const n of [rn-1.11,rn+1.11]){
  p('rack/post/'+n,'wood',re,n,0,.15,.17,2.33);
  p('rack/iron-shoe/'+n,'iron',re,n,.06,.21,.24,.21);
}
for(const y of [.28,1.17,2.15]){
  p('rack/shelf/'+y,'wood',re,rn,y,.92,2.46,.12);
  p('rack/lip/'+y,'iron',re+.43,rn,y+.1,.08,2.44,.09);
}
for(let i=0;i<3;i++){
  const n=rn-.8+i*.8,y=.41+(i%2)*.89;
  p('rack/housing/'+i,'iron',re,n,y,.54,.52,.5);
  for(let j=0;j<5;j++){
    p('rack/booster-rib/'+i+'/'+j,'copper',re+.28,n,y+.08+j*.083,.12,.53,.047);
  }
  p('rack/nozzle/'+i,'soot',re,n,y+.5,.32,.35,.17);
  p('rack/nozzle-lip/'+i,'iron',re,n,y+.66,.40,.43,.07);
  p('rack/unfinished-open-end/'+i,'soot',re+.28,n,y+.25,.045,.28,.23);
}
solid(re,rn,0,.98,2.46,2.33);
// Tool silhouettes on the west rear wall; table top details on existing
// smithing table stay below hand reach and don't add new interaction feet.
for(let i=0;i<7;i++){
  const n=4.0+i*.36;
  p('tool-rail/hook/'+i,'iron',-4.70,n,1.92,.17,.095,.095);
  p('tool-rail/handle/'+i,'wood',-4.56,n,1.35,.08,.08,.59);
  p('tool-rail/head/'+i,'iron',-4.53,n,1.28,.12,.22,.16);
}
p('tool-rail/beam','wood',-4.69,5.08,1.99,.12,2.8,.14);
p('table/anvil-foot','iron',-2.32,5.08,.79,.30,.34,.13);
p('table/anvil-body','iron',-2.32,5.08,.92,.47,.37,.25);
p('table/anvil-horn','iron',-2.00,5.08,1.08,.32,.17,.10);
p('table/hammer-head','iron',-1.74,4.9,.81,.19,.14,.10);
p('table/hammer-grip','wood',-1.74,5.11,.81,.07,.31,.06);
for(let j=0;j<6;j++)p('table/rivets/'+j,'copper',-1.73+(j%3)*.11,
  5.29+Math.floor(j/3)*.09,.80,.065,.065,.04);

export const warriorForgeDressing=Object.freeze({
  pieces:Object.freeze(parts),solids:Object.freeze(solids),
  quench:Object.freeze({east:qe,north:qn}),
  coreSeat:Object.freeze({east:2,north:6.92,installed:false}),
  boosterRack:Object.freeze({east:re,north:rn,housings:3,collectible:false}),
});
function texture(family:Family){
  const [base,mid,dark]=palette[family], pixels=new Uint8Array(16*16*4);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const stripe=family==='wood'?(x%5===0):(y%5===0);
    const c=x===0||y===0||x===15||y===15?dark:stripe?mid:base;
    pixels.set([c>>16,(c>>8)&255,c&255,255],(y*16+x)*4);
  }
  const map=new DataTexture(pixels,16,16,RGBAFormat);
  map.colorSpace=SRGBColorSpace;map.magFilter=map.minFilter=NearestFilter;
  map.generateMipmaps=false;map.needsUpdate=true;
  return map;
}
export function mountWarriorForgeDressing(parent:Group){
  const group=new Group();group.name='warrior-forge-batch91-physical-dressing';
  const geo=new BoxGeometry(1,1,1), pose=new Object3D();
  const resources:{mesh:InstancedMesh;material:MeshStandardMaterial;map:DataTexture}[]=[];
  for(const family of Object.keys(palette) as Family[]){
    const entries=parts.filter(p=>p.family===family);
    const map=texture(family);
    const material=new MeshStandardMaterial({map,roughness:family==='water'?.3:.95,
      metalness:family==='iron'||family==='copper'?.25:0});
    const mesh=new InstancedMesh(geo,material,entries.length);
    mesh.name='forge-dressing/'+family;
    for(const [i,item] of entries.entries()){
      pose.position.set(item.e,item.y+item.h/2,-item.n);
      pose.scale.set(item.w,item.h,item.d);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);
    }
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
    resources.push({mesh,material,map});
  }
  parent.add(group);
  return {group,geometry:warriorForgeDressing,dispose(){
    group.removeFromParent();
    for(const {mesh,material,map} of resources){mesh.dispose();material.dispose();map.dispose();}
    geo.dispose();group.clear();
  }};
}
