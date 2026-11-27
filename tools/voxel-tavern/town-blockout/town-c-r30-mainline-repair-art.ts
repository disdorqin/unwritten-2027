import {BoxGeometry,Group,Mesh,MeshLambertMaterial,Color,InstancedMesh,Matrix4,Vector3,Quaternion} from 'three';
import type {createUndergroundMainlineTrack,UndergroundMainlineFault} from '../../../src/shared/underground-mainline-track.js';
import type {U19MineCartSnapshot} from '../../../src/presence/underground-mainline-cart.js';
import {makeCampGrain} from './town-c-r30-camp-art.js';
type Route=ReturnType<typeof createUndergroundMainlineTrack>;
type Part={x:number;y:number;z:number;w:number;h:number;d:number;family:'wood'|'iron'|'rock';color:number;angle?:number};
export function r30RepairSleeperIndices(route:Route){
 return [0,1,2].map(i=>Math.round(route.faults.sleepers/.85)-1+i);
}
/** Three specific damaged sleepers replace the ordinary sleeper instances.
 * Gauge plates and rusty clamps change in order with the existing server's
 * repair receipt. Rail centreline never changes; a damaged line is locked
 * by U19, not by a second client-side vehicle authority. */
export function mountR30MainlineRepairArt(parent:Group,route:Route){
 const root=new Group();root.name='r30-repairable-track-parts';parent.add(root);
 const geom=new BoxGeometry(),maps=['wood','iron','rock'].map(f=>makeCampGrain(f as Part['family']));
 const mats=maps.map(map=>new MeshLambertMaterial({map}));
 const stages:{fault:UndergroundMainlineFault;index:number;damaged:Group;restored:Group}[]=[];
 let count=0;
 function batch(owner:Group,parts:Part[]){
  for(const [k,family] of ['wood','iron','rock'].entries()){
   const rows=parts.filter(p=>p.family===family);if(!rows.length)continue;
   const mesh=new InstancedMesh(geom,mats[k],rows.length),m=new Matrix4(),c=new Color();
   rows.forEach((p,i)=>{m.compose(new Vector3(p.x,p.y,p.z),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),p.angle??0),new Vector3(p.w,p.h,p.d));mesh.setMatrixAt(i,m);mesh.setColorAt(i,c.setHex(p.color))});
   mesh.computeBoundingSphere();owner.add(mesh);count+=rows.length;
  }
 }
 function site(fault:UndergroundMainlineFault,index:number,chainage:number,broken:Part[],fixed:Part[]){
  const p=route.sample(chainage),group=new Group();group.name='repair/'+fault+'/'+index;
  group.position.set(p.position.east,p.position.height,-p.position.north);group.rotation.y=p.heading;root.add(group);
  const damaged=new Group(),restored=new Group();damaged.name='damaged';restored.name='restored';
  group.add(damaged,restored);batch(damaged,broken);batch(restored,fixed);
  stages.push({fault,index,damaged,restored});
 }
 const block=(family:Part['family'],x:number,y:number,z:number,w:number,h:number,d:number,color:number,angle=0):Part=>({family,x,y,z,w,h,d,color,angle});
 for(const [i,k] of r30RepairSleeperIndices(route).entries()){
  const fixed=[block('wood',0,-.001,0,1.72,.03,.23,0x6a513b)];
  for(const x of [-.5,.5])fixed.push(block('iron',x,.015,0,.19,.012,.17,0x80563d));
  const broken=[block('wood',-.55,-.003,.025,.58,.022,.20,0x534131,.12),block('wood',.52,-.003,-.07,.66,.022,.21,0x554237,-.15)];
  for(let j=0;j<7;j++)broken.push(block('wood',-.29+j*.087,.004,(j%3-1)*.056,.08,.027,.07,j%2?0x554237:0x8b7150,.17*j));
  for(const x of [-.5,.5])broken.push(block('iron',x+(x<0?-.12:.11),.01,.08,.15,.016,.09,0x8a5639,.32));
  site('sleepers',i,k*.85,broken,fixed);
 }
 for(let i=0;i<3;i++){
  const chainage=route.faults.gauge+(i-1)*.75,side=i%2?-.5:.5;
  const broken=[block('iron',side+Math.sign(side)*.15,.023,.06,.26,.04,.24,0x8a5639,.32),
   block('iron',side+Math.sign(side)*.22,.026,-.11,.07,.05,.15,0x6b5140,.35)];
  for(let k=0;k<3;k++)broken.push(block('rock',side+Math.sign(side)*(.30+k*.10),.012,.08+k*.04,.085,.035,.10,0x514b44));
  const fixed=[block('iron',side,.020,.035,.26,.022,.24,0x737879),block('iron',side+.11,.031,.035,.045,.025,.055,0x8b806a),block('iron',side-.11,.031,.035,.045,.025,.055,0x8b806a)];
  site('gauge',i,chainage,broken,fixed);
 }
 for(let i=0;i<4;i++){
  const chainage=route.faults['turnout-rust']+(i-1.5)*.54,side=i%2?-.5:.5;
  const broken:Part[]=[],fixed:Part[]=[];
  for(let k=0;k<8;k++)broken.push(block('iron',side+(k%2-.5)*.07,.032+(k%3)*.008,-.20+Math.floor(k/2)*.12,.09,.024,.10,k%2?0x9b5b37:0x6b442f,.08*k));
  for(let k=0;k<3;k++)fixed.push(block('iron',side,.030,-.14+k*.14,.09,.009,.12,i===3?0x30383a:0x7b7e7a));
  site('turnout-rust',i,chainage,broken,fixed);
 }
 function sync(snapshot?:U19MineCartSnapshot){
  for(const stage of stages){
   const done=!!snapshot&&snapshot.faults[stage.fault]>stage.index;
   stage.damaged.visible=!done;stage.restored.visible=done;
  }
 }
 sync();
 return {group:root,stages,parts:count,sync,dispose(){root.removeFromParent();root.traverse(o=>{if(o instanceof InstancedMesh)o.dispose()});mats.forEach(m=>m.dispose());maps.forEach(m=>m.dispose());geom.dispose();root.clear()}};
}
