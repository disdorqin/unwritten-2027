import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,InstancedMesh,Mesh,MeshStandardMaterial,Matrix4,Quaternion,Vector3,PointLight,DataTexture,RGBAFormat,NearestFilter} from 'three';
import {secondMineRooms,secondMineRoomAt,secondMineBed,secondMineAnchors,canStandSecondMine,secondMineFloor,type MineRiverState} from '../../../src/shared/underground-second-mine-layout.js';
import {dressSecondMineDryWings} from './underground-second-mine-dry-dressing.js';
type Part={x:number;n:number;y:number;w:number;d:number;h:number;rz:number};
type Solid=Readonly<{x:number;n:number;w:number;d:number}>;
const colors={rock:0x555b62,basalt:0x353b44,iron:0x777b82,rust:0x815b44,wood:0x71553c,crystal:0x82c5d6,ember:0xe5a05a,gravel:0x66645d} as const;
type Kind=keyof typeof colors;
/** Physical local scene; the existing underground host must approve its placement and water state. */
export function createSecondMineScene(){
  const group=new Group();group.name='second-mine-local-candidate';
  const parts=new Map<Kind,Part[]>(),solids:Solid[]=[];
  const meshGeometry=new BoxGeometry();
  const material=new Map<Kind,MeshStandardMaterial>();
  const textures:DataTexture[]=[];
  for(const [k,color] of Object.entries(colors) as [Kind,number][]){
    const bytes=new Uint8Array(16*16*4);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const i=(y*16+x)*4, shade=((x*19+y*31+(x*y)%17)%19-9)*1.5;
      for(let c=0;c<3;c++)bytes[i+c]=Math.max(0,Math.min(255,((color>>(16-c*8))&255)+shade));
      bytes[i+3]=255;
    }
    const t=new DataTexture(bytes,16,16,RGBAFormat);t.magFilter=NearestFilter;t.minFilter=NearestFilter;t.needsUpdate=true;textures.push(t);
    material.set(k,new MeshStandardMaterial({map:t,roughness:k==='iron'?.65:.94,metalness:k==='iron'?.45:0,...(k==='crystal'?{emissive:0x216070,emissiveIntensity:.8}:k==='ember'?{emissive:0xc57837,emissiveIntensity:1.4}:{})}));
  }
  function box(k:Kind,x:number,n:number,y:number,w:number,d:number,h:number,rz=0,solid=false){
    const b={x,n,y,w,d,h,rz};const list=parts.get(k)??[];list.push(b);parts.set(k,list);
    if(solid)solids.push({x,n,w,d});
  }
  const riverGeometries:BufferGeometry[]=[];
  // Rock chambers share exact floor and wall footprints with the passage query.
  for(const r of secondMineRooms){
    const w=r.x1-r.x0,d=r.n1-r.n0;
    if(!r.river)box('rock',(r.x0+r.x1)/2,(r.n0+r.n1)/2,-.4,w,d,.8);
    box('basalt',(r.x0+r.x1)/2,(r.n0+r.n1)/2,r.ceiling+.5,w,d,1);
    for(const side of [-1,1]){
      const x=side===-1?r.x0:r.x1,n=side===-1?r.n0:r.n1;
      for(let p=r.n0;p<r.n1;p+=2){
        const len=Math.min(2,r.n1-p),mid=p+len/2;
        if(secondMineRoomAt(x+side*.05,mid))continue;
        for(let y=0;y<r.ceiling;y+=1.4)box((Math.round(p+y)%3===0?'rock':'basalt'),x+side*.34,mid,y+.7,.68,len,1.4);
      }
      for(let p=r.x0;p<r.x1;p+=2){
        const len=Math.min(2,r.x1-p),mid=p+len/2;
        if(secondMineRoomAt(mid,n+side*.05))continue;
        for(let y=0;y<r.ceiling;y+=1.4)box((Math.round(p+y)%3===0?'rock':'basalt'),mid,n+side*.34,y+.7,len,.68,1.4);
      }
    }
  }
  // Actual sloped exposed riverbed at low water, not a separate floating floor.
  for(const [a,b] of [[128,132],[132,142],[142,146]]){
    const g=new BufferGeometry(),y1=secondMineBed(a),y2=secondMineBed(b);
    g.setAttribute('position',new Float32BufferAttribute([-48,y1,-a,48,y1,-a,48,y2,-b,-48,y1,-a,48,y2,-b,-48,y2,-b],3));g.computeVertexNormals();
    group.add(new Mesh(g,material.get('gravel')));riverGeometries.push(g);
  }
  // Iron galleries: old mine rail stops at the entry; no track through the river.
  for(let n=4;n<24;n+=1.2){box('wood',0,n,.06,3.4,.28,.12);for(const x of [-1.15,1.15])box('iron',x,n,.15,.14,1.2,.12);}
  for(let n=6;n<=92;n+=6){
    const x=n<24?5.45:3.45, h=n<24?4.6:4.1;
    for(const s of [-1,1]){
      box('iron',s*x,n,h/2,.27,.34,h,0,true);
      box('rust',s*x,n,.2,.68,.75,.4);
      box('rust',s*x,n,h-.3,.42,.48,.42);
      for(let y=.55;y<h-.35;y+=.64)box('iron',s*(x-.16),n-.19,y,.09,.07,.1);
    }
    box('iron',0,n,h,2*x+.5,.38,.34);
    for(const s of [-1,1])box('iron',s*(x-.35),n,h-.35,.18,.25,1, s*.65);
  }
  // Shore masonry, aged bollards, timber quays and a single pole ferry.
  for(const [n,sgn] of [[126,1],[148,-1]]){
    for(let x=-4.5;x<4.6;x+=.48)box('wood',x,n,.1,.44,3.6,.20);
    for(const x of [-4.2,4.2]){
      for(const dn of [-1.35,1.35])box('wood',x,n+dn,.65,.28,.28,1.3,0,true);
      box('wood',x,n,1.12,.18,3.2,.16);
      box('iron',x,n+sgn*1.35,1.34,.32,.32,.16);
    }
    for(let x=-44;x<=44;x+=2)if(Math.abs(x)>5)box('basalt',x,n+sgn*1.5,.14,1.7,.55,.28);
  }
  const boat=new Group();boat.name='single-pole-ferry';
  function boatPart(k:Kind,x:number,n:number,y:number,w:number,d:number,h:number,angle=0){
    const m=new Mesh(meshGeometry,material.get(k));m.position.set(x,y,-n);m.scale.set(w,h,d);m.rotation.z=angle;boat.add(m);
  }
  for(let n=-2.3;n<=2.3;n+=.34)boatPart('wood',0,n,0,2.1,.32,.18);
  for(const x of [-1.05,1.05])for(let n=-2.25;n<=2.3;n+=.5)boatPart('wood',x,n,.38,.17,.49,.58);
  for(const n of [-2.55,2.55])boatPart('wood',0,n,.36,2.1,.18,.58);
  for(const n of [-1.4,0,1.4])boatPart('wood',0,n,.58,1.96,.3,.14);
  boatPart('wood',.82,0,1.75,.07,.07,3,.2);
  boat.position.set(0,-.18,-137);group.add(boat);
  // Dry east bypass, above the bed in every water phase; railings do not cross the route.
  for(let n=113;n<164;n+=1.5){
    for(const x of [48.38,54.62]){
      if(x<50&&(n<129||n>145))continue;
      box('iron',x,n,.65,.18,.18,1.3,0,true);
      box('iron',x,n,1.15,.15,1.55,.15);
    }
    box('gravel',51.5,n,.022,5.8,1.45,.044);
  }
  // Sparse near-bank rubble, then distinct larger crystal clusters after crossing.
  for(const side of [-1,1])for(let i=0;i<15;i++){
    const x=side*(11+(i%5)*7.4),n=99+Math.floor(i/5)*9.2;
    for(let j=0;j<9;j++)box(j%3===0?'gravel':'rock',x+(j%3-1)*.55,n+Math.floor(j/3)*.48,.35+(j%4)*.16,.62,.58,.7+(j%4)*.32,0,true);
  }
  for(const s of [-1,1])for(let i=0;i<14;i++){
    const x=s*(11+(i%5)*7.3),n=151+Math.floor(i/5)*11.6;
    for(let j=0;j<7;j++){
      const px=x+(j%3-1)*.64,pn=n+Math.floor(j/3)*.62,h=1.1+((i*7+j*3)%12)*.24;
      box('basalt',px,pn,.3,.9,.86,.6,0,true);
      box('crystal',px,pn,.6+h/2,.39,.45,h,(j%3-1)*.18);
      box('crystal',px,pn,.6+h,.28,.29,.24);
    }
  }
  // Functional silhouettes at two fire anchors; no invented ore or rewards.
  for(const camp of [secondMineAnchors.supportCamp,secondMineAnchors.riverCamp]){
    for(let i=0;i<12;i++){const a=i*Math.PI/6;box('rock',camp.east+Math.cos(a)*.8,camp.north+Math.sin(a)*.8,.18,.38,.35,.36);}
    for(let i=0;i<5;i++){box('wood',camp.east+(i-2)*.19,camp.north,.18,.17,.78,.22);box('ember',camp.east+(i-2)*.15,camp.north,.52,.13,.18,.7);}
    const light=new PointLight(0xffb277,24,16,2);light.position.set(camp.east,1.4,-camp.north);group.add(light);
  }
  dressSecondMineDryWings(box);
  const dummy=new Matrix4(),q=new Quaternion(),v=new Vector3(),scale=new Vector3(),axis=new Vector3(0,0,1);
  for(const [kind,items] of parts){
    const m=new InstancedMesh(meshGeometry,material.get(kind),items.length);
    items.forEach((p,i)=>{dummy.compose(v.set(p.x,p.y,-p.n),q.setFromAxisAngle(axis,p.rz),scale.set(p.w,p.h,p.d));m.setMatrixAt(i,dummy);});
    m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();group.add(m);
  }
  const waterGeo=new BoxGeometry(96,.035,18),waterMat=new MeshStandardMaterial({color:0x142d3d,metalness:.38,roughness:.23,transparent:true,opacity:.86});
  const water=new Mesh(waterGeo,waterMat);water.position.set(0,-.24,-137);group.add(water);
  let state:MineRiverState='middle';
  function setRiverState(next:MineRiverState){
    state=next;water.visible=next!=='low';water.position.y=next==='high'?-.025:-.24;
    boat.visible=next==='middle';
  }
  function canStand(e:number,n:number,r=.27){
    if(!canStandSecondMine(e,n,state,r))return false;
    return !solids.some(s=>Math.hypot(Math.max(0,Math.abs(e-s.x)-s.w/2),Math.max(0,Math.abs(n-s.n)-s.d/2))<r);
  }
  setRiverState('middle');
  return {group,boat,water,solids,anchors:secondMineAnchors,setRiverState,canStand,floor:(e:number,n:number)=>secondMineFloor(e,n,state),
    get riverState(){return state;},pieces:[...parts.values()].reduce((a,b)=>a+b.length,0)+boat.children.length+3,
    dispose(){group.removeFromParent();meshGeometry.dispose();waterGeo.dispose();waterMat.dispose();riverGeometries.forEach(g=>g.dispose());material.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}};
}
