import {BoxGeometry,BufferGeometry,Color,Float32BufferAttribute,Group,Mesh,MeshLambertMaterial,MeshStandardMaterial,Material} from 'three';
import {mountAR30StaticBatches} from './town-a-r30-static-batches';
import type {Box} from './landmark-kit';
import type {SouthGround} from './town-night-a-summit-landform';
/** Adorn the existing gate/guardroom, never create another entrance or
 * alter the 4x5m opening or the original station and guardroom shells. */
export function mountSouthEntry(heightAt:SouthGround){
 const floor=heightAt(0,0);
 if(floor===undefined||!Number.isFinite(floor)||Math.abs(floor-347)>.05)throw Error('Uncertified arrival datum');
 const group=new Group();group.name='night-a-south-entry';
 const stone=new MeshLambertMaterial({color:'#707b7d'}),ash=new MeshLambertMaterial({color:'#505d63'}),wood=new MeshLambertMaterial({color:'#554334'}),warm=new MeshLambertMaterial({color:'#917250'}),snow=new MeshLambertMaterial({color:'#dce6eb'}),bronze=new MeshLambertMaterial({color:'#a48a58'});
 const lamp=new MeshStandardMaterial({color:'#f2ca88',emissive:'#ffad43',emissiveIntensity:.10});
 const batches=new Map<Material,BufferGeometry[]>(),solids:Box[]=[],floors:Box[]=[];
 const add=(m:Material,g:BufferGeometry)=>{const arr=batches.get(m)??[];arr.push(g);batches.set(m,arr);};
 const box=(m:Material,e:number,n:number,low:number,w:number,d:number,h:number,solid=false,walk=false)=>{
  add(m,new BoxGeometry(w,h,d).translate(e,floor+low+h/2,-n));
  if(solid||walk)(walk?floors:solids).push({min:[e-w/2,floor+low,-n-d/2],max:[e+w/2,floor+low+h,-n+d/2]});
 };
 // Original jambs extend from x ±2 to ±3.5, N -10..0. Clad the
 // outside faces only, with offset stone courses and timber cornice.
 for(const side of [-1,1]){
  box(ash,side*3.62,-5,0,.24,10.18,.52,true);
  for(let row=0;row<10;row++)for(let j=0;j<10;j++){
   const n=-9.55+j+.24*(row%2);
   box(row%3===0?ash:stone,side*3.53,n,.55+row*.42,.09,.94,.39);
  }
  // Front/rear masonry faces with staggered visible mortar. Stay entirely
  // outside the original ±2m aperture.
  for(const n of [-10.055,.055])for(let row=0;row<10;row++){
   for(let col=0;col<3;col++){
    const e=side*(2.26+col*.46+(row%2?.045:0));
    box(row%4===0?ash:stone,e,n,.47+row*.44,.435,.115,.405,true);
   }
  }
  for(const n of [-9.92,-.08]){
   box(wood,side*3.20,n,.5,.46,.22,4.5);
   box(bronze,side*3.20,n,2.0,.52,.28,.12);
   box(lamp,side*3.20,n,2.14,.35,.30,.48);
   box(wood,side*3.20,n,2.65,.52,.43,.13);
  }
 }
 // Snow covered pitched roof with proper sloped panels, not a solid
 // triangle obstructing the original passage. Overhang above lintel.
 const roofRun=4.45,rise=1.55,theta=Math.atan2(rise,roofRun);
 for(const side of [-1,1]){
  const run=Math.hypot(roofRun,rise);
  for(let j=0;j<23;j++){
   const n=-10.75+j*.49;
   add(wood,new BoxGeometry(run,.20,.485).rotateZ(-side*theta).translate(side*roofRun/2,floor+6.38+rise/2,-n));
   add(snow,new BoxGeometry(run,.10,.49).rotateZ(-side*theta).translate(side*roofRun/2,floor+6.53+rise/2,-n));
  }
  box(wood,side*4.43,-5,6.18,.18,11.65,.26);
 }
 box(wood,0,-5,7.91,.26,11.85,.24);box(snow,0,-5,8.13,.33,11.85,.10);
 for(const n of [-10.25,.25]){
  box(wood,0,n,5.52,4.65,.30,.58);
  box(bronze,0,n,5.65,2.3,.32,.27);
 }
 // Timber gable bracing and snow-shedding fascia on both ends of the
 // original stone tunnel. The diagonal members are above the lintel.
 for(const n of [-10.34,.34]){
  for(const s of [-1,1]){
   const len=Math.hypot(3.9,1.42);
   add(wood,new BoxGeometry(len,.19,.19).rotateZ(-s*Math.atan2(1.42,3.9)).translate(s*1.95,floor+7.03,-n));
   add(warm,new BoxGeometry(.20,1.15,.18).translate(s*1.2,floor+6.85,-n));
  }
  box(wood,0,n,6.36,8.1,.22,.20);
  box(warm,0,n,6.63,.23,.22,1.22);
 }
 // Preserve existing guardroom doorway at E4.5, N7 and station on west.
 // Exterior timber uprights and eave brackets only, no second shell.
 for(const n of [2.7,5.2,8.8,11.3]){
  box(wood,12.10,n,.06,.25,.25,2.55);
  box(warm,12.24,n,2.36,.52,.25,.20);
 }
 for(const n of [2.25,11.75])for(const e of [5.0,8.0,11.5]){
  box(wood,e,n,.1,.23,.16,2.50);
 }
 // Furniture on the guardroom's rear/east walls. Existing registration
 // desk and the E4.5/N7 entrance remain clear. All reachable solid parts
 // are added to the same host collider list.
 for(const n of [8.95,10.65])for(const e of [11.12,11.68])box(wood,e,n,.04,.13,.14,2.02,true);
 for(const y of [.18,.83,1.45])box(warm,11.4,9.8,y,.72,1.96,.13,true);
 for(let i=0;i<4;i++)box(i%2?ash:warm,11.42,9.06+i*.46,.98,.36,.35,.36,true);
 for(const e of [7.25,8.75])box(stone,e,10.68,0,.24,.45,.40,true);
 box(warm,8,10.68,.40,2.1,.56,.14,true);
 box(wood,8,10.93,.54,2.1,.12,.47,true);
 // 60x40 arrival plaza remains the true ground. Low stone strips and
 // benches sit outside the central trail/door/boarding reservations.
 for(const side of [-1,1]){
  for(let i=0;i<12;i++){
   const n=19.4+i*1.6,e=side*24;
   box(i%3===0?ash:stone,e,n,-.02,.48,1.54,.20,true);
   box(snow,e,n,.17,.50,1.55,.05);
  }
  for(const n of [23,33]){
   const e=side*17;
   box(stone,e-1,n,0,.35,.62,.42,true);box(stone,e+1,n,0,.35,.62,.42,true);
   box(warm,e,n,.42,2.6,.65,.12,true);
   box(wood,e,n+.29,.54,2.6,.13,.47,true);
  }
  for(const n of [18,35]){
   const e=side*6.5;
   box(stone,e,n,0,.70,.70,.33,true);box(wood,e,n,.33,.22,.22,2.25,true);
   box(lamp,e,n,2.58,.42,.42,.45);box(wood,e,n,3.03,.56,.56,.15);box(snow,e,n,3.18,.6,.6,.07);
  }
 }
 // Individual inset paving tiles follow the fixed plaza datum, with a
 // narrow real offset so no coplanar fighting or fake walking surface.
 for(let n=13;n<39;n+=1.6)for(let e=-5.6;e<5.7;e+=1.4)
  box((Math.round(n*10+e*10)%3===0)?ash:stone,e,n,-.025,1.36,1.56,.045);
 mountAR30StaticBatches(group,batches,'night-a-entry');
 group.userData.colliders=solids;group.userData.floors=floors;
 let disposed=false;
 return {group,colliders:solids,floors,blocked(e:number,n:number,h:number,r=.27,body=1.8){return solids.some(b=>h+body-.025>b.min[1]!&&h+.025<b.max[1]!&&Math.hypot(Math.max(b.min[0]!-e,e-b.max[0]!,0),Math.max(b.min[2]!+n,-n-b.max[2]!,0))<r);},setNight(night:boolean){lamp.emissiveIntensity=night?1.0:.10;},dispose(){
  if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
  for(const m of [stone,ash,wood,warm,snow,bronze,lamp])m.dispose();group.clear();
 }};
}
