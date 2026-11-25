import {BoxGeometry, Color, CylinderGeometry, Group, InstancedMesh, MeshLambertMaterial, MeshStandardMaterial, Object3D, PointLight, SphereGeometry, Mesh, Vector3, Quaternion, TorusGeometry, type BufferGeometry} from 'three';
import {createSkyCitySurfaceGrain} from './sky-city-surface-grain';
import {skyCityInscribedPlate} from './sky-city-inscribed-plate';
export const skyObservatoryHall={x:16,z:-6,w:10,d:8} as const;
export function insideSkyObservatoryHall(x:number,z:number,margin=0){const p=skyObservatoryHall;return Math.abs(x-p.x)<=p.w/2+margin&&Math.abs(z-p.z)<=p.d/2+margin;}
export function buildSkyObservatoryHall(){
 const group=new Group();group.name='sky-city-observatory-main-hall';
 const {x,z,w,d}=skyObservatoryHall;
 const box=new BoxGeometry(),cylinder=new CylinderGeometry(.5,.5,1,12),tmp=new Object3D();
 const palette={stone:'#c3b89d',ivory:'#e6deca',shadow:'#827c70',oak:'#775c43',bronze:'#a28c64',iron:'#51645f',glass:'#9abdb5',paper:'#e7d7ad',ink:'#6e796b',teal:'#698f8d',gold:'#c1a06d'} as const;
 type Finish=keyof typeof palette;
 const batch=new Map<BufferGeometry,{matrices:typeof tmp.matrix[],colors:Color[]}>();
 const solids:{x:number;z:number;y:number;w:number;h:number;d:number}[]=[];
 function add(f:Finish,px:number,py:number,pz:number,sx:number,sy:number,sz:number,solid=false,geo:BufferGeometry=box,yaw=0,roll=0){
  let b=batch.get(geo);if(!b)batch.set(geo,b={matrices:[],colors:[]});
  tmp.position.set(px,py,pz);tmp.scale.set(sx,sy,sz);tmp.rotation.set(0,yaw,roll);tmp.updateMatrix();b.matrices.push(tmp.matrix.clone());b.colors.push(new Color(palette[f]));
  if(solid)solids.push({x:px,y:py,z:pz,w:sx,h:sy,d:sz});
 }
 // One accessible working hall. The upper observation drum is structural
 // scenery, not a fake walkable second or third floor.
 add('stone',x,-.10,z,w+.5,.2,d+.5);
 for(let ix=0;ix<13;ix++)for(let iz=0;iz<10;iz++)add((ix+iz)%6?'ivory':'stone',x-4.6+ix*.76,.04,z-3.42+iz*.76,.73,.08,.73);
 for(const s of [-1,1]){
  const ex=x+s*w/2;
  add('stone',ex,.39,z,.5,.78,d,true);
  add('ivory',ex,3.22,z,.45,1.18,d,true);
  for(const nz of [z-3.2,z,z+3.2])add('ivory',ex,1.89,nz,.45,2.3,1.35,true);
  for(const nz of [z-1.65,z+1.65]){
   add('glass',ex,1.89,nz,.12,1.95,1.65,true);
   add('bronze',ex,1.89,nz,.26,.055,1.74);
   add('bronze',ex,1.89,nz,.26,2.05,.065);
   for(const yy of [.88,2.89])add('bronze',ex,yy,nz,.31,.10,1.76);
  }
 }
 // Rear observation window: an inset, arched stone surround frames the
 // cloud horizon. Continuous thin glazing retains the original rear collision.
 const back=z-d/2;
 add('stone',x,.51,back,w,1.02,.48,true);
 add('stone',x,3.53,back,w,.66,.48,true);
 for(const s of [-1,1])add('ivory',x+s*3.65,2.12,back,2.70,2.20,.48,true);
 const window=new Mesh(new BoxGeometry(4.60,2.18,.06),new MeshStandardMaterial({color:'#b7dad3',transparent:true,opacity:.18,depthWrite:false,roughness:.32}));window.position.set(x,2.12,back);group.add(window);
 solids.push({x,z:back,y:2.12,w:4.60,h:2.18,d:.06});
 for(const side of [-1,1]){
  add('shadow',x+side*2.29,1.80,back+.18,.29,1.57,.34);
  for(let k=0;k<4;k++)add(k%2?'ivory':'stone',x+side*2.30,1.13+k*.38,back+.33,.42,.34,.18);
 }
 for(let j=0;j<13;j++){const a=Math.PI*j/12;add(j%3?'stone':'ivory',x+2.15*Math.cos(a),2.04+1.12*Math.sin(a),back+.30,.42,.34,.27,false,box,0,a-Math.PI/2)}
 add('oak',x,1.02,back+.31,4.95,.16,.66);
 for(const s of [-1,1]){
  for(let i=0;i<4;i++)for(let j=0;j<3;j++)add((i+j)%4?'stone':'shadow',x+s*(3.01+i*.51),1.35+j*.55,back+.27,.48,.50,.07);
  // Decorative wood panelling and staggered masonry, no intrusion into aisle.
  for(let j=0;j<6;j++)add(j%3?'oak':'shadow',x+s*4.73,.58,z-3.1+j*1.04,.06,.81,.99);
 }

 for(const s of [-1,1]){
  const cx=x+s*3.25;
  add('ivory',cx,1.93,z+d/2,3.5,3.86,.48,true);
  add('bronze',x+s*1.50,1.42,z+d/2,.17,2.85,.64);
  add('stone',x+s*1.5,.16,z+d/2,.45,.32,.66,true);
  // External oxidized ship plates and rivets.
  for(let j=0;j<4;j++)for(let k=0;k<3;k++)add('bronze',cx-1.13+j*.74,.63+k*.88,z+d/2+.25,.095,.095,.065);
 }
 add('ivory',x,3.36,z+d/2,3,1,.5,true);
 add('bronze',x,2.96,z+d/2+.26,3.1,.16,.24);
 add('oak',x,3.72,z,w-.24,.17,d-.24);
 for(let i=0;i<7;i++){
  const ex=x-4.2+i*1.4;add('oak',ex,3.57,z,.19,.30,7.65);
  for(const side of [-1,1]){add('shadow',ex,3.38,z+side*3.60,.24,.39,.26);add('bronze',ex,3.36,z+side*3.48,.105,.12,.11)}
 }
 for(let i=0;i<8;i++)add(i%3?'oak':'shadow',x,3.61,z-3.55+i*.99,9.65,.10,.94);
 // Stepped upper masonry bands, ribbed observation drum and glazed dome.
 add('stone',x,3.92,z,w+.55,.27,d+.5);
 add('ivory',x,4.92,z,7.3,1.74,6.3);
 add('bronze',x,5.84,z,7.55,.19,6.53);
 for(let i=0;i<12;i++){
   const a=i*Math.PI/6;
   add('shadow',x+3.42*Math.sin(a),4.96,z+2.97*Math.cos(a),.41,1.08,.16,false,box,a);
 }
 add('ivory',x,6.45,z,6.05,1.06,6.05,false,cylinder);
 add('bronze',x,7.02,z,6.28,.19,6.28,false,cylinder);
 const dome=new Mesh(new SphereGeometry(3.01,28,14,0,Math.PI*2,0,Math.PI/2),new MeshStandardMaterial({color:'#a8c2bb',roughness:.55,metalness:.24}));
 dome.position.set(x,7.11,z);dome.scale.y=.66;group.add(dome);
 for(let i=0;i<12;i++){const a=i*Math.PI/6;for(let j=0;j<6;j++){const t=j*Math.PI/12;add('bronze',x+Math.cos(a)*3.02*Math.cos(t),7.1+1.99*Math.sin(t),z+Math.sin(a)*3.02*Math.cos(t),.10,.22,.15,false,box,-a)}}
 // Star chart, drafting tools, shelves and seats. Keep central door aisle.
 add('oak',x-2.9,.54,z-1.1,2.25,1.08,1.55,true);
 add('paper',x-2.9,1.10,z-1.1,1.7,.045,1.08);
 // Carved apron, table legs, scrolls, drafting compass and specimen tray.
 for(const a of [-1,1])for(const b of [-1,1]){
  add('shadow',x-2.9+a*.91,.38,z-1.1+b*.58,.17,.69,.17);
  add('bronze',x-2.9+a*.97,.97,z-1.1+b*.64,.10,.09,.10);
 }
 add('shadow',x-2.9,.96,z-1.1,2.18,.15,1.49);
 for(let j=0;j<3;j++)add('paper',x-3.56+j*.15,1.19,z-1.68,.13,.13,.48);
 add('teal',x-2.19,1.15,z-.69,.26,.08,.22);
 add('gold',x-2.19,1.22,z-.69,.12,.10,.12,false,cylinder);
 const dial=new Mesh(new TorusGeometry(.22,.022,5,16),new MeshLambertMaterial({color:palette.gold}));dial.rotation.x=Math.PI/2;dial.position.set(x-3.46,1.16,z-.67);group.add(dial);
 add('gold',x-3.46,1.16,z-.67,.035,.025,.41,false,box,.45);
 add('gold',x-3.46,1.16,z-.67,.035,.025,.41,false,box,1.9);
 for(let i=0;i<17;i++){const a=i*2.399963,r=.13+(i%6)*.105;add('ink',x-2.9+Math.cos(a)*r,1.128,z-1.1+Math.sin(a)*r,.035,.015,.035)}
 for(let i=0;i<4;i++)add('gold',x-2.9,1.13,z-1.1+(i-1.5)*.19,1.22,.012,.015,false,box,i*.43);
 add('oak',x-2.9,.28,z+.19,.65,.56,.65,true);
 add('oak',x-2.9,.91,z+.50,.62,.73,.13,true);
 add('oak',x+3.75,1.30,z-2.95,1.30,2.60,.85,true);
 for(const side of [-1,1])add('bronze',x+3.75+side*.58,1.30,z-2.46,.08,2.54,.10);
 add('shadow',x+3.75,2.65,z-2.95,1.50,.13,.98);
 // A wall-mounted instrument rack avoids adding floor obstacles.
 for(let j=0;j<4;j++){
  const pz=z+1.2+j*.48;add('oak',x+4.72,1.81,pz,.12,.54,.35);
  add('gold',x+4.62,1.81,pz,.07,.32,.05);add('gold',x+4.56,1.94,pz,.08,.055,.26);
 }
 add('teal',x+4.69,1.04,z+2.0,.14,.12,1.84);
 for(let r=0;r<4;r++){add('bronze',x+3.75,.38+r*.58,z-2.48,1.21,.055,.085);for(let c=0;c<5;c++)add(c%2?'paper':'teal',x+3.27+c*.23,.61+r*.58,z-2.52,.18,.34,.18)}
 // Static telescope on a real tripod with bronze tube, objective and focus knob.
 const tx=x+2.55,tz=z-.5;
 add('stone',tx,.16,tz,1.52,.32,1.52,true,cylinder);
 for(let i=0;i<3;i++){
  const a=i*Math.PI*2/3;const start=new Vector3(tx+Math.cos(a)*.68,.18,tz+Math.sin(a)*.68),end=new Vector3(tx+Math.cos(a)*.15,1.22,tz+Math.sin(a)*.15);
  const leg=new Mesh(new BoxGeometry(.10,start.distanceTo(end),.10),new MeshLambertMaterial({color:palette.iron}));
  leg.position.copy(start.clone().lerp(end,.5));leg.quaternion.setFromUnitVectors(new Vector3(0,1,0),end.sub(start).normalize());group.add(leg);
  add('gold',tx+Math.cos(a)*.68,.19,tz+Math.sin(a)*.68,.22,.09,.22);
 }
 add('bronze',tx,1.19,tz,.39,.33,.39,false,cylinder);
 const tube=new Group();tube.name='sky-observatory-telescope-axis';tube.position.set(tx,1.50,tz);tube.rotation.x=.62;
 const tm=new MeshLambertMaterial({color:palette.bronze});
 const lens=new MeshLambertMaterial({color:palette.glass});
 for(const [len,rad,yy,mat]of [[1.36,.24,0,tm],[.27,.31,.72,tm],[.07,.27,.89,lens],[.24,.13,-.77,tm]] as const){
  const m=new Mesh(new CylinderGeometry(rad,rad,len,12),mat);m.position.y=yy;tube.add(m);
 }
 for(const yy of [-.58,.25,.55]){const rim=new Mesh(new TorusGeometry(.248,.025,5,16),new MeshLambertMaterial({color:palette.gold}));rim.rotation.x=Math.PI/2;rim.position.y=yy;tube.add(rim)}
 group.add(tube);solids.push({x:tx,z:tz,y:.84,w:1.50,h:1.68,d:1.50});
 const opaque=new MeshLambertMaterial({color:'#ffffff',map:createSkyCitySurfaceGrain()});
 for(const [geo,b]of batch){const m=new InstancedMesh(geo,opaque,b.matrices.length);m.name='sky-observatory-'+geo.type;b.matrices.forEach((mx,i)=>{m.setMatrixAt(i,mx);m.setColorAt(i,b.colors[i]!)});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();group.add(m)}
 const plaque=skyCityInscribedPlate('T-01',1.58,.56);plaque.position.set(x,3.4,z+d/2+.30);group.add(plaque);
 const warm=new PointLight('#f5b879',12,11,2);warm.position.set(x,3.1,z);warm.visible=false;group.add(warm);
 return {group,setDreamLighting(active:boolean){warm.visible=active},blocked(px:number,pz:number,feet:number,radius:number){return solids.some(s=>feet<s.y+s.h/2&&feet+1.8>s.y-s.h/2&&Math.hypot(Math.max(0,Math.abs(px-s.x)-s.w/2),Math.max(0,Math.abs(pz-s.z)-s.d/2))<radius)}};
}
