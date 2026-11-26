import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial,Color,Vector3} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {Box} from './landmark-kit';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import {createMeteorCrater,meteorCraterFixturePlan} from './meteor-crater';
import {surveyBR30RelicView} from './town-b-r30-crater-relic-view';
type Road=ReturnType<typeof mountWestCraterRoad>;
const fixture=createMeteorCrater(meteorCraterFixturePlan);
const close=(a:number,b:number)=>Math.abs(a-b)<1e-6;
type V=readonly [number,number,number];
/** Replace the two old cone batches in their existing LOD host, keeping
 * 7+7 original sites, not doubling the narrative objects. Root rings
 * follow the measured final ground even on a cut slope. */
export function installBR30MeltColumns(road:Road){
 const host=road.midground.group,group=new Group();group.name='b-r30-melt-columns';
 if(host.getObjectByName(group.name))throw Error('Melt columns already replaced');
 const sites=road.midground.placements.filter(p=>p.kind==='lava-column');
 if(sites.length!==14||[1,2].some(i=>sites.filter(p=>p.cluster==='impact-melt-wall-'+i).length!==7))throw Error('Expected original 7+7 melt sites');
 const old=host.children.filter(o=>['za36-midground-basalt','za36-midground-cinder','za36-midground-cyan'].includes(o.name));
 if(old.length!==3)throw Error('Missing original melt batches');
 const channel=road.group.userData.colliders as Box[];
 if(!Array.isArray(channel))throw Error('Missing west collision channel');
 const originals:Box[]=[],boxes:Box[]=[],parts:[BufferGeometry[],BufferGeometry[],BufferGeometry[]]=[[],[],[]];
 const views:ReturnType<typeof surveyBR30RelicView>[]=[];
 const support=(e:number,n:number)=>{
  const h=road.heightAt(e,n);if(h===undefined||!Number.isFinite(h))throw Error('Missing melt support');return h;
 };
 const c=Math.cos(road.anchor.yaw),s=Math.sin(road.anchor.yaw);
 const trail=Array.from({length:1301},(_,i)=>{const q=fixture.mainTrailPoint(i/1300);return {east:road.anchor.east+q.east*c+q.north*s,north:road.anchor.north+q.north*c-q.east*s};});
 const audit:{east:number;north:number;height:number;rootSpan:number;minRootGap:number;maxRootGap:number;chipGap:number;cluster:string}[]=[];
 function form(rings:V[][],color:number,seed:number){
  const pos:number[]=[],rgb:number[]=[],tone=new Color();
  const triangle=(a:V,b:V,c:V,shade:number)=>{
   pos.push(...a,...b,...c);tone.setHex(color).multiplyScalar(shade);for(let j=0;j<3;j++)rgb.push(tone.r,tone.g,tone.b);
  };
  const n=rings[0].length;
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<n;i++){
   const j=(i+1)%n,a=rings[k][i],b=rings[k][j],c=rings[k+1][i],d=rings[k+1][j];
   const sh=.75+.20*((i*3+seed)%7)/6+.12*((k+seed)%3);
   triangle(a,c,b,sh);triangle(b,c,d,sh);
  }
  for(const [r,reverse] of [[rings[0],false],[rings.at(-1)!,true]] as const){
   const mid=r.reduce((v,p)=>[v[0]+p[0]/n,v[1]+p[1]/n,v[2]+p[2]/n],[0,0,0]) as [number,number,number];
   for(let i=0;i<n;i++)triangle(mid,r[reverse?(i+1)%n:i],r[reverse?i:(i+1)%n],reverse?1.07:.73);
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(pos,3));g.setAttribute('color',new Float32BufferAttribute(rgb,3));g.computeVertexNormals();return g;
 }
 try{
 for(const [i,p] of sites.entries()){
  const ground=support(p.east,p.north),top=ground+p.height*.975;
  const oldBox=channel.find(b=>close(b.min[0],p.east-.62)&&close(b.max[0],p.east+.62)&&close(b.min[2],-p.north-.62)&&close(b.max[2],-p.north+.62)&&close(b.min[1],p.ground)&&close(b.max[1],p.ground+p.height*.98));
  if(!oldBox||originals.includes(oldBox))throw Error('Original melt collider not uniquely identified');
  originals.push(oldBox);
  const angle=i*1.713,ring=(r:number,y:number,shift:number,root=false):V[]=>Array.from({length:7},(_,j)=>{
    const a=angle+j*2*Math.PI/7,rr=r*(.87+.13*Math.sin(j*2.7+i)),x=p.east+Math.cos(a)*rr+shift,z=-p.north+Math.sin(a)*rr;
    return [x,root?support(x,-z)-.12:y+(Math.sin(j*2.1+i)*.075),z];
  });
  const root=ring(.59,0,0,true),shoulderY=Math.max(ground+p.height*.18,...root.map(q=>q[1]+.19));
  if(shoulderY>top-.75)throw Error('Melt site too buried for canonical silhouette');
  const shoulder=Math.max(shoulderY,ground+p.height*.18),crown=top-.09;
  const rings=[root,ring(.51,shoulder,0),ring(.46,shoulder+(crown-shoulder)*.43,.03),ring(.36,shoulder+(crown-shoulder)*.78,.065),ring(.23,crown,.09)];
  const g=form(rings,p.cluster.endsWith('1')?0x514e49:0x655951,i);g.computeBoundingBox();
  const bound=g.boundingBox!;boxes.push({min:bound.min.toArray(),max:bound.max.toArray()});
  parts[p.cluster.endsWith('1')?0:1].push(g);
  const tip={east:p.east+.09,north:p.north,height:top-.07};
  views.push(surveyBR30RelicView(road.heightAt,trail,tip));
  // One restrained mineral at each original root; no independent light.
  const e=p.east+Math.cos(angle)*.72,n=p.north-Math.sin(angle)*.72,base=support(e,n);
  const cr=(r:number,y:number,embedded=false):V[]=>Array.from({length:6},(_,j)=>{
    const a=angle+j*Math.PI/3,x=e+r*Math.cos(a),z=-n+r*Math.sin(a);
    return [x,embedded?support(x,-z)-.035:y,z];
  });
  const chipRoot=cr(.095,0,true),chipTop=Math.max(base+.24,...chipRoot.map(q=>q[1]+.12));
  parts[2].push(form([chipRoot,cr(.085,chipTop-.08),cr(.024,chipTop)],0x75b7b1,i));
  const gaps=root.map(q=>q[1]-support(q[0],-q[2]));
  audit.push({east:p.east,north:p.north,height:p.height,cluster:p.cluster,rootSpan:Math.max(...root.map(q=>q[1]))-Math.min(...root.map(q=>q[1])),minRootGap:Math.min(...gaps),maxRootGap:Math.max(...gaps),chipGap:Math.max(...chipRoot.map(q=>q[1]-support(q[0],-q[2])))});
 }
 const mats=[new MeshStandardMaterial({vertexColors:true,roughness:.99,flatShading:true}),new MeshStandardMaterial({vertexColors:true,roughness:.98,flatShading:true}),new MeshStandardMaterial({vertexColors:true,roughness:.58,emissive:0x4f8985,emissiveIntensity:.12,flatShading:true})];
 for(let i=0;i<3;i++){
  const g=mergeGeometries(parts[i]);if(!g)throw Error('Cannot batch melt forms');
  const mesh=new Mesh(g,mats[i]);mesh.name='b-r30-melt-'+i;group.add(mesh);parts[i].forEach(x=>x.dispose());parts[i]=[];
 }
 const states=old.map(o=>o.visible);old.forEach(o=>o.visible=false);host.add(group);
 road.group.userData.colliders=[...channel.filter(b=>!originals.includes(b)),...boxes];
 let disposed=false;
 return {group,sites,audit,views:views.filter(v=>v!==undefined),boxes,dispose(){
  if(disposed)return;disposed=true;group.removeFromParent();old.forEach((o,i)=>o.visible=states[i]);
  road.group.userData.colliders=[...(road.group.userData.colliders as Box[]).filter(b=>!boxes.includes(b)),...originals];
  group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});mats.forEach(m=>m.dispose());
 }};
 }catch(error){parts.flat().forEach(g=>g.dispose());throw error;}
}
