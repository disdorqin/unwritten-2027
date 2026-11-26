import {BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import {firstMineShallowWorks as plan} from '../../../src/shared/town-c-first-mine-shallow-works.js';
type Family='rock'|'wood'|'iron'|'cloth'|'neutral';
type Part={family:Family;x:number;y:number;z:number;w:number;h:number;d:number;color:number};
type Footprint={x:number;z:number;w:number;d:number;h:number;id:string};
type Supports=(x:number,z:number,r:number,h:number)=>boolean;
const floor=-91;
const colors={wood:0x70543e,iron:0x80563d,rock:0x505258,dark:0x343940,cloth:0x77746b};
function distanceToPath(x:number,z:number){
 return Math.min(...plan.path.slice(1).map((b,i)=>{
  const a=plan.path[i],dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
  return Math.hypot(x-a[0]-dx*t,z-a[1]-dz*t);
 }));
}
/** Three traversable mining galleries, three styles of abandoned working
 * furniture. All new foot blockers come from the same visible solid boxes. */
export function mountR30ShallowGallery(parent:Group,supports:Supports,enabled:boolean){
 const group=new Group();group.name='r30-shallow-gallery';parent.add(group);
 const parts:Part[]=[],footprints:Footprint[]=[],frames:{x:number;z:number;id:string}[]=[],bays:{id:string;x:number;z:number;approach:[number,number]}[]=[];
 const add=(family:Family,x:number,y:number,z:number,w:number,h:number,d:number,color:number)=>parts.push({family,x,y:floor+y,z,w,h,d,color});
 const reserve=(f:Footprint)=>{
  const r=Math.hypot(f.w,f.d)/2;
  if(distanceToPath(f.x,f.z)<r+1.0||plan.nests.some(n=>Math.hypot(n.east-f.x,n.north-f.z)<r+2.0)||
    footprints.some(b=>Math.abs(f.x-b.x)<(f.w+b.w)/2+.16&&Math.abs(f.z-b.z)<(f.d+b.d)/2+.16))return false;
  for(const dx of [-f.w/2,0,f.w/2])for(const dz of [-f.d/2,0,f.d/2])if(!supports(f.x+dx,f.z+dz,.045,f.h))return false;
  footprints.push(f);return true;
 };
 if(enabled){
 for(const [lane,z,targets] of [[0,52,[-12,-21,-43,-54,-65,-75,-92]],[1,59.25,[-88,-78,-68,-48,-41]],[2,66,[-90,-80,-59,-49,-42]]] as const){
  for(const x of targets){
   const old=footprints.length,half=2.04,id='frame/'+lane+'/'+x;
   if(!reserve({id:id+'/a',x,z:z-half,w:.50,d:.50,h:4.25})||!reserve({id:id+'/b',x,z:z+half,w:.50,d:.50,h:4.25})){footprints.splice(old);continue}
   if(!Array.from({length:18},(_,i)=>supports(x,z-half+i*half*2/17,.12,4.35)).every(Boolean)){footprints.splice(old);continue}
   frames.push({x,z,id});
   for(const s of [-1,1]){
    const q=z+s*half;
    add('rock',x,.15,q,.49,.30,.48,colors.rock);
    add('wood',x,2.12,q,.29,3.70,.30,colors.wood);
    for(const y of [.40,1.85,3.64]){
     add('iron',x,y,q,.35,.13,.36,colors.iron);
     for(const dx of [-.18,.18])add('iron',x+dx,y,q,.055,.05,.08,0x9b8260);
    }
    for(let i=0;i<5;i++)add('wood',x,3.36+i*.135,q-s*(i+.5)*.16,.26,.20,.22,colors.wood);
   }
   add('wood',x,4.06,z,.38,.31,half*2+.28,0x604735);
   for(const q of [-half,0,half]){add('iron',x,4.06,z+q,.44,.35,.14,colors.iron);add('iron',x-.23,4.06,z+q,.042,.08,.075,0x9b8260)}
   // Unlit lantern hook and capped cable: no new dynamic light.
   add('iron',x,3.71,z+1.22,.12,.38,.11,colors.iron);
   add('iron',x,3.46,z+1.22,.26,.10,.25,colors.dark);
   add('neutral',x,3.27,z+1.22,.17,.27,.17,0x706347);
   for(const dx of [-.10,.10])for(const dz of [-.1,.1])add('iron',x+dx,3.27,z+1.22+dz,.045,.29,.04,colors.iron);
   add('iron',x,3.10,z+1.22,.24,.075,.24,colors.dark);
  }
 }
 // Asymmetric side-wall furniture. Candidates only within real existing
 // rooms; a minimum 2m clear corridor remains alongside every item.
 const candidates=[
  {id:'survey-desk',x:-16,z:54.12,w:1.65,d:.86,h:2.02},
  {id:'tool-rack',x:-27,z:49.90,w:1.85,d:1.0,h:2.1},
  {id:'timber-stack',x:-46,z:54.08,w:2.4,d:1.0,h:1.36},
  {id:'water-barrels',x:-60,z:54.05,w:2.0,d:1.02,h:1.26},
  {id:'supply-shelf',x:-78,z:49.95,w:2.25,d:.9,h:2.2},
  {id:'repair-bench',x:-82,z:61.15,w:2.1,d:.92,h:2.02},
  {id:'timber-stack-2',x:-46,z:57.28,w:2.4,d:1.0,h:1.4},
  {id:'water-barrels-2',x:-83,z:67.65,w:2.0,d:1.02,h:1.26},
  {id:'tool-rack-2',x:-53,z:67.6,w:1.85,d:1.0,h:2.1}
 ];
 for(const c of candidates){
  if(!reserve(c))continue;
  const {id,x,z,w,d}=c,mid=z<55?52:z<63?59.25:66,side=Math.sign(mid-z);
  const approach:[number,number]=[x,z+side*1.55];
  if(!supports(...approach,.27,1.8)){footprints.pop();continue}
  bays.push({id,x,z,approach});
  if(id.startsWith('timber')){
   for(let k=0;k<4;k++)for(let j=0;j<5-k;j++){
    add('wood',x,.18+k*.25,z+(j-(4-k)/2)*.17,w-.14,.22,.16, k%2?0x624936:0x76583b);
    for(const dx of [-w/2+.06,w/2-.06])add('wood',x+dx,.18+k*.25,z+(j-(4-k)/2)*.17,.10,.18,.13,0x9a7957);
   }
   for(const dx of [-.70,.70])add('iron',x+dx,.73,z,.07,.10,.87,colors.iron);
  }else if(id.startsWith('water')){
   for(const dx of [-.49,.49]){
    for(let k=0;k<12;k++){const a=k*Math.PI/6;add('wood',x+dx+.36*Math.cos(a),.58,z+.36*Math.sin(a),.18,1.03,.18,0x76583b)}
    for(const y of [.20,.90])for(let k=0;k<12;k++){const a=k*Math.PI/6;add('iron',x+dx+.40*Math.cos(a),y,z+.40*Math.sin(a),.15,.095,.15,colors.iron)}
    add('wood',x+dx,1.10,z,.66,.09,.66,0x5c4532);add('iron',x+dx+.1,1.16,z-.1,.13,.06,.13,colors.dark);
   }
  }else{
   for(const dx of [-w/2+.11,w/2-.11])for(const dz of [-d/2+.10,d/2-.10])add('wood',x+dx,.48,z+dz,.15,.96,.16,colors.wood);
   for(let i=0;i<Math.floor(w/.20);i++)add('wood',x-w/2+.12+i*.20,.92,z,.19,.13,d-.06,0x76583b);
   for(const dx of [-w/2+.10,w/2-.10])add('wood',x+dx,1.45,z-side*.32,.12,1.05,.14,colors.wood);
   add('wood',x,1.91,z-side*.32,w-.10,.13,.14,colors.wood);
   if(id.includes('rack')||id.includes('repair')){
    for(let j=0;j<5;j++){
     const xx=x-w*.35+j*w*.175;
     add('wood',xx,1.39,z-side*.26,.055,.74,.06,colors.wood);
     add('iron',xx,1.78,z-side*.24,.26,.075,.09,colors.iron);
    }
    add('iron',x+.46,1.03,z,.30,.13,.22,colors.dark);
    add('iron',x+.46,1.15,z,.12,.13,.14,colors.iron);
    if(id.includes('repair')){
     add('iron',x-.43,1.07,z+.07,.36,.10,.31,colors.dark);
     add('iron',x-.43,1.20,z+.07,.29,.17,.18,0x686761);
     for(const dx of [-.12,.12])add('iron',x-.43+dx,1.31,z+.07,.075,.12,.27,colors.iron);
     add('wood',x+.04,1.06,z-.15,.44,.065,.065,0x8b6a47);
     add('iron',x+.25,1.09,z-.15,.12,.13,.20,colors.iron);
    }
   }else{
    // A surveyor's board, with a broken schematic (no fictional labels).
    for(let j=0;j<7;j++)add('wood',x-w*.43+j*w*.143,1.46,z-side*.34,w*.14,.76,.06,0x4e3e31);
    for(let j=0;j<6;j++)add('neutral',x-w*.30+j*w*.12,1.47+(j%3)*.08,z-side*.295,.11,.024,.018,0xb4a78b);
    for(let j=0;j<3;j++)add('neutral',x-w*.30+j*w*.24,1.53,z-side*.295,.023,.14,.018,0xb4a78b);
    add('neutral',x-.39,1.002,z+.09,.45,.025,.33,0xb8ac95);
    add('neutral',x-.37,1.02,z+.08,.35,.012,.22,0xc6bc9f);
    for(let j=0;j<5;j++)add('rock',x-.50+j*.064,1.03,z+.08,.022,.009,.15,0x6c665c);
    // Measuring compass, squared ruler, cloth roll and stone weight.
    add('iron',x+.14,1.05,z+.06,.29,.09,.16,colors.dark);
    for(const dx of [-.08,.08])add('iron',x+.14+dx,1.10,z+.06,.042,.12,.042,colors.iron);
    add('wood',x+.37,1.02,z-.18,.39,.034,.09,0x9a7957);
    for(let j=0;j<5;j++)add('rock',x+.21+j*.067,1.044,z-.18,.013,.009,.07,colors.dark);
    add('cloth',x+.38,1.10,z+.16,.29,.19,.19,colors.cloth);
   }
  }
  // Floor-level worn boot tracks in front of furniture, safely flush.
  for(let i=0;i<16;i++){
   const xx=x+(i%8-3.5)*.17,zz=z+side*(.68+Math.floor(i/8)*.18);
   if(supports(xx,zz,.035,.03))add('rock',xx,.008,zz,.15,.016,.13,i%3?0x5e574b:0x77746b);
  }
 }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 for(const family of ['rock','wood','iron','cloth','neutral'] as const){
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map});
  for(let from=-104;from<0;from+=24){
   const rows=parts.filter(p=>p.family===family&&p.x>=from&&p.x<from+24);if(!rows.length)continue;
   const mesh=new InstancedMesh(geo,mat,rows.length),m=new Matrix4(),c=new Color(),q=new Quaternion();
   rows.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),q,new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
   mesh.computeBoundingSphere();group.add(mesh);resources.push({mesh,mat,map});
  }
  if(!resources.some(r=>r.mat===mat)){mat.dispose();map.dispose()}
 }
 function blocks(x:number,z:number,y:number,r:number,h:number){
  if(x>0||z<48||z>69.5)return false;
  return footprints.some(p=>floor+p.h>y+.025&&floor<y+h&&Math.hypot(Math.max(0,Math.abs(x-p.x)-p.w/2),Math.max(0,Math.abs(z-p.z)-p.d/2))<r);
 }
 return {group,parts,footprints,frames,bays,blocks,dispose(){group.removeFromParent();resources.forEach(r=>r.mesh.dispose());new Set(resources.map(r=>r.mat)).forEach(m=>m.dispose());new Set(resources.map(r=>r.map)).forEach(m=>m.dispose());geo.dispose();group.clear()}};
}
