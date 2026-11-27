import {Box3,BoxGeometry,Color,Group,InstancedMesh,Matrix4,MeshLambertMaterial,Quaternion,Vector3} from 'three';
import {createUndergroundMineCartModel} from './underground-mine-cart-model.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
import type {createUndergroundMineLayout} from './underground-mine-layout.js';
type Mine=ReturnType<typeof createUndergroundMineLayout>;
type Part={family:'wood'|'iron'|'rock'|'cloth';at:readonly [number,number,number];size:readonly [number,number,number];color:number;angle:number};
const floor=-91;
export function mountR30Workbay(parent:Group,mine:Mine){
 const root=new Group();root.name='r30-abandoned-west-haulage-bay';
 const parts:Part[]=[],boxes:Box3[]=[],carts:ReturnType<typeof createUndergroundMineCartModel>[]=[];
 const put=(family:Part['family'],x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0)=>parts.push({family,at:[x,y,z],size:[w,h,d],color,angle});
 const enabled=mine.expansion?.deepWorks===true;
 function cart(x:number,z:number,tip:number){
  const car=createUndergroundMineCartModel();const pose=new Group();
  pose.rotation.y=Math.PI/2;car.group.rotation.z=tip;car.group.scale.setScalar(tip?1.35:1);pose.add(car.group);
  pose.updateMatrixWorld(true);const b=new Box3().setFromObject(pose);
  pose.position.set(x,floor+.02-b.min.y,z);pose.updateMatrixWorld(true);
  const actual=new Box3().setFromObject(pose);
  // Reject a cart that overlaps the registered original mine obstructions.
  const min=actual.min,max=actual.max;
  for(let e=min.x;e<=max.x+.001;e+=Math.max(.05,(max.x-min.x)/4))for(let n=min.z;n<=max.z+.001;n+=Math.max(.05,(max.z-min.z)/4))
   if(!mine.queryPassage(e,n,.04,1.8,'open')){car.dispose();return}
  pose.name=tip?'r30-tipped-retired-cart':'r30-retired-iron-cart';root.add(pose);boxes.push(actual);carts.push(car);
 }
 if(enabled){
  // Disconnected, visibly broken side siding. No passenger or cargo state
  // on the retired carts: the original U19 transport remains distinct.
  for(let x=-18.8;x<=-6.2;x+=.36){
   put('wood',x,floor-.005,73.45,.18,.026,1.65,0x594536);
   for(const z of [72.95,73.95]){
    put('iron',x,floor+.009,z,.355,.022,.075,0x80563d);
    put('iron',x,floor+.016,z,.085,.018,.13,0x6c665d);
   }
  }
  for(let i=0;i<8;i++)put('iron',-5.9+i*.24,floor+.008,73.45+i*.13,.24,.022,.09,0x80563d,.48);
  for(const x of [-18.95,-6.05]){
   for(const z of [72.95,73.95]){
    put('rock',x,floor+.14,z,.39,.28,.42,0x505258);
    put('iron',x,floor+.29,z,.15,.18,.15,0x80563d);
   }
   put('wood',x,floor+.34,73.45,.23,.25,1.43,0x70543e);
  }
  cart(-10.1,73.45,0);cart(-16.1,73.45,1.12);
  // Recessed sorting and repair desk, iron ties, hanging tools, empty oil
  // tins, cargo stamps and discarded gloves. All are inert physical props.
  for(let i=0;i<16;i++)put('wood',-18.1+i*.25,floor+.83,79.95,.243,.14,.86,0x70543e);
  for(const x of [-18,-16.25,-14.5]){
   for(const z of [79.62,80.24])put('wood',x,floor+.39,z,.18,.78,.18,0x604735);
   put('iron',x,floor+.28,79.95,.11,.09,.79,0x80563d);
  }
  for(let i=0;i<7;i++){
   const x=-17.98+i*.53;
   put('iron',x,floor+1.03,80.04,.31,.23,.32,0x505258);
   for(let k=0;k<4;k++)put('iron',x-.105+k*.07,floor+1.16,80.04,.055,.045,.35,0x947346);
   put('wood',x,floor+.93,79.64,.08,.06,.31,0x70543e);
  }
  for(let j=0;j<15;j++){
   const x=-18.1+j*.27;
   put('wood',x,floor+1.65,80.63,.259,1.05,.10,0x604735);
   if(j%3===0){
    const tool=j/3;
    put(tool===3?'iron':'wood',x,floor+1.60,80.51,.074,.56,.073,tool===3?0x80563d:0x70543e);
    if(tool===0){ // pointed pick
     put('iron',x,floor+1.91,80.55,.46,.095,.08,0x80563d);
     for(const side of [-1,1])put('iron',x+side*.23,floor+1.86,80.55,.065,.10,.08,0x947346);
    }else if(tool===1){ // heavy hammer
     put('iron',x,floor+1.91,80.55,.31,.18,.14,0x505258);
     for(const side of [-1,1])put('iron',x+side*.16,floor+1.91,80.55,.04,.19,.15,0x947346);
    }else if(tool===2){ // shovel
     put('iron',x,floor+1.91,80.53,.26,.26,.08,0x80563d);
     put('iron',x,floor+2.07,80.53,.16,.07,.075,0x947346);
    }else if(tool===3){ // fork-ended pry bar
     put('iron',x,floor+1.94,80.51,.10,.22,.075,0x505258);
     put('iron',x+.06,floor+2.04,80.49,.14,.06,.075,0x80563d);
    }else{ // open-ended spanner
     put('iron',x,floor+1.91,80.53,.19,.13,.09,0x80563d);
     for(const side of [-1,1])put('iron',x+side*.085,floor+2.02,80.53,.055,.13,.085,0x947346);
    }
   }
  }
  for(const x of [-18.25,-14.05])for(let i=0;i<6;i++){
   put('iron',x,floor+.22+i*.31,80.55,.08,.09,.14,0x80563d);
  }
  // Spare wheel stands against the rear wall inside the desk footprint.
  for(let k=0;k<16;k++){
   const a=k*Math.PI/8;
   put('iron',-14.8+.31*Math.cos(a),floor+1.46+.31*Math.sin(a),80.45,.125,.125,.09,0x505258);
  }
  put('iron',-14.8,floor+1.46,80.45,.15,.15,.12,0x80563d);
  for(const d of [-1,1]){
   put('iron',-14.8+d*.16,floor+1.46,80.45,.32,.065,.065,0x80563d);
   put('iron',-14.8,floor+1.46+d*.16,80.45,.065,.32,.065,0x80563d);
  }
  // Close the inaccessible low strip behind the desk with its real
  // braced timber backing. Crouching cannot reach through the tabletop.
  for(let i=0;i<16;i++){
   const x=-18.10+i*.25;
   put('wood',x,floor+.50,80.66,.245,1.0,.14,0x604735);
   if(i%4===0)for(const y of [.18,.78])put('iron',x,floor+y,80.57,.08,.09,.065,0x80563d);
  }
  // Six closed scrap boxes, no collectible or mineral socket implied.
  for(let j=0;j<6;j++){
   const x=-12.8+j*.52;
   put('wood',x,floor+.30,79.87,.49,.60,.74,0x70543e);
   for(const z of [79.53,80.21])for(let k=0;k<4;k++)put('wood',x,floor+.08+k*.14,z,.49,.135,.06,0x604735);
   for(const dx of [-.18,.18])put('iron',x+dx,floor+.31,79.87,.055,.62,.76,0x80563d);
   put('iron',x,floor+.41,79.48,.16,.09,.055,0x947346);
  }
 }
 const geo=new BoxGeometry(),resources:{mesh:InstancedMesh;mat:MeshLambertMaterial;map:ReturnType<typeof makeCampGrain>}[]=[];
 const m=new Matrix4(),q=new Quaternion(),axis=new Vector3(0,1,0),color=new Color();
 for(const family of ['wood','iron','rock','cloth'] as const){
  const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
  const map=makeCampGrain(family),mat=new MeshLambertMaterial({map}),mesh=new InstancedMesh(geo,mat,rows.length);
  rows.forEach((p,i)=>{
   m.compose(new Vector3(...p.at),q.setFromAxisAngle(axis,p.angle),new Vector3(...p.size));mesh.setMatrixAt(i,m);mesh.setColorAt(i,color.setHex(p.color));
   if(p.size[1]>.055)boxes.push(new Box3(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5)).applyMatrix4(m));
  });
  mesh.computeBoundingSphere();root.add(mesh);resources.push({mesh,mat,map});
 }
 function blocks(x:number,z:number,y:number,radius:number,height:number){
  return boxes.some(b=>b.max.y>y+.025&&b.min.y<y+height&&
   Math.hypot(Math.max(0,b.min.x-x,x-b.max.x),Math.max(0,b.min.z-z,z-b.max.z))<radius);
 }
 parent.add(root);
 return {group:root,parts:parts.length,cartCount:carts.length,boxes,blocks,
  dispose(){root.removeFromParent();carts.forEach(c=>c.dispose());resources.forEach(r=>{r.mesh.dispose();r.mat.dispose();r.map.dispose()});geo.dispose()}};
}
