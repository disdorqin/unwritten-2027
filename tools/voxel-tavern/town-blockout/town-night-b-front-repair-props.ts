import {BoxGeometry,Color,Group,InstancedMesh,MeshLambertMaterial,Object3D} from 'three';
import type {RepairAnchors} from './town-cable-repair-host';
import type {Za36CableRepairState} from './town-za36-cable-repair';
type SiteKey=keyof RepairAnchors;
type Foot=Readonly<{east:number;north:number;height:number}>;
type Site=Foot&{key:SiteKey;halfWidth:number;halfDepth:number;top:number;foundationDepth:number};
type Input={owner:Group;cablePath:readonly Foot[];anchors:RepairAnchors;supportAt:(e:number,n:number)=>number|undefined;blocked:(e:number,n:number,h:number,r:number,b:number)=>boolean};
type Part={x:number;y:number;z:number;w:number;h:number;d:number;color:string;yaw?:number;pitch?:number};
const shape={brake:{w:.84,d:.72,h:1.65},cableWheel:{w:1.02,d:.84,h:1.6},weightTower:{w:1.04,d:.86,h:.72},weightFrame:{w:.88,d:.73,h:1.05}} as const;
const keys=['brake','cableWheel','weightTower','weightFrame'] as const;
/** Select a real supported fixture footprint near the authored repair area.
 * Return its actual interaction anchor; the host must consume this position
 * rather than retaining an obsolete action coordinate. Never guess elevation. */
export function mountNightBFrontRepairProps(input:Input){
 const sites:Site[]=[];
 if(input.cablePath.length<2||input.cablePath.some(p=>![p.east,p.north,p.height].every(Number.isFinite)))return {ready:false as const,reason:'repair-fixture-missing-cable-survey'};
 for(const key of keys){
  const a=input.anchors[key],s=shape[key];let found:Site|undefined;
  for(const distance of key==='weightFrame'?[1.05,1.3,1.5,1.75,2,2.5,3,3.5,4]:[1.05,1.3,1.5,1.75,2]){
   if(found)break;
   for(const [dx,dn] of [[1,0],[-1,0],[0,1],[0,-1],[.707,.707],[-.707,.707],[.707,-.707],[-.707,-.707]]){
    const east=a.east+distance*dx!,north=a.north+distance*dn!;
    if(sites.some(p=>Math.abs(p.east-east)<p.halfWidth+s.w/2+.35&&Math.abs(p.north-north)<p.halfDepth+s.d/2+.35))continue;
    const points=[[-s.w/2,-s.d/2],[-s.w/2,s.d/2],[s.w/2,-s.d/2],[s.w/2,s.d/2],[0,0]];
    const hs=points.map(([x,z])=>input.supportAt(east+x!,north+z!));
    if(hs.some(h=>h===undefined||!Number.isFinite(h)))continue;
    const low=Math.min(...hs as number[]),height=Math.max(...hs as number[]),foundationDepth=height-low;
    if(foundationDepth>(key==='cableWheel'?.6:.18))continue;
    if(points.some(([x,z],i)=>input.blocked(east+x!,north+z!,hs[i]!, .055,s.h+height-hs[i]!)))continue;
    // Include both actual cabin lanes, the 2.78m upper body and a .10m buffer.
    if(input.cablePath.some(p=>[-1.55,1.55].some(dx=>Math.abs(p.east+dx-east)<1.22+s.w/2&&Math.abs(p.north-north)<1.575+s.d/2&&p.height+2.88>low&&p.height-.10<height+s.h)))continue;
    found={key,east,north,height,halfWidth:s.w/2,halfDepth:s.d/2,top:s.h,foundationDepth};break;
   }
  }
  if(!found)return {ready:false as const,reason:'repair-fixture-site:'+key};
  sites.push(found);
 }
 const group=new Group();group.name='night-b-front-repair-fixtures';
 const cube=new BoxGeometry(),material=new MeshLambertMaterial({color:'#ffffff'}),obj=new Object3D(),tint=new Color();
 const stone='#737c82',iron='#394d58',brass='#bda16e',rust='#9b4a2c',wood='#76573c',steel='#a8b8bd',dark='#4e5d66';
 const part=(x:number,y:number,z:number,w:number,h:number,d:number,color:string,pitch=0):Part=>({x,y,z,w,h,d,color,pitch});
 function staticParts(key:SiteKey):Part[]{
  const p=[part(0,.06,0,shape[key].w,.12,shape[key].d,stone)];
  if(key==='brake')p.push(part(0,.65,0,.36,1.18,.42,iron),part(0,1.18,0,.66,.34,.32,dark),part(-.24,.28,.25,.22,.28,.12,wood),part(-.24,.52,.25,.055,.44,.055,steel,-.3),part(-.24,.7,.25,.24,.09,.12,dark),part(.30,.22,-.24,.16,.24,.18,wood));
  if(key==='cableWheel')p.push(part(0,.46,0,.82,.72,.56,iron),part(-.38,1.05,0,.12,1.1,.46,iron),part(.38,1.05,0,.12,1.1,.46,iron),part(0,1.48,0,.88,.14,.42,brass),part(-.38,.32,-.33,.08,.55,.08,steel,.35));
  if(key==='weightTower')p.push(part(0,.14,0,.94,.08,.76,wood),part(-.46,.35,-.34,.08,.54,.09,iron),part(.46,.35,-.34,.08,.54,.09,iron),part(0,.65,-.34,.96,.12,.10,iron));
  if(key==='weightFrame')p.push(part(-.36,.55,0,.12,.86,.36,iron),part(.36,.55,0,.12,.86,.36,iron),part(0,.99,0,.84,.12,.36,iron),part(0,.22,-.20,.52,.18,.18,wood),...Array.from({length:4},(_,i)=>part((i%2?1:-1)*.19,.45+Math.floor(i/2)*.31,-.19,.30,.055,.17,brass)));
  return p;
 }
 function dynamicParts(key:SiteKey,state:Za36CableRepairState|undefined):Part[]{
  const s=state?.line===1?state:undefined;
  if(key==='brake'){
   const impacts=s?.impacts??0,out=[part(0,1.18,.17,.53,.31,.055,impacts===9?steel:rust)];
   for(let i=0;i<9;i++)out.push(part(-.20+(i%3)*.16,1.07+Math.floor(i/3)*.105,.205,.115, .07,.025,i<impacts?steel:i%2?rust:'#71351e'));
   out.push(part(.05,s?.brakePulled ? .91 : 1.35,.24,.085,.48,.08,iron,s?.brakePulled?-1.03:.22),part(.05,s?.brakePulled ? .73 : 1.55,.24,.24,.10,.12,brass),part(-.25,1.18,.21,.09,.09,.04,s?.brakePulled?steel:rust));return out;
  }
  if(key==='cableWheel'){
   const height=s?.cableHeight??0,turns=s?.cableTurns??0,out:Part[]=[];
   for(let i=0;i<12;i++){const theta=i*Math.PI/6+turns*Math.PI*2/3;out.push(part(Math.cos(theta)*.27,1.1+Math.sin(theta)*.27,0,.13,.105,.20,brass));}
   // The accessible slack section rises into the actual guide slot.
   // No duplicate timebase: cable height is the acknowledged server value.
   for(let i=0;i<7;i++){const x=-.42+i*.14,y=1.38-(1-height)*.59*(1-(x/.49)**2);out.push(part(x,y,.23,.15,.065,.085,s?.cableAligned?steel:dark));}
   out.push(part(.37,1.08,.29,.075,.27,.08,brass,turns*Math.PI*2/3),part(0,1.38,.28,.14,.09,.11,s?.cableAligned?'#dfc58d':rust));return out;
  }
  return Array.from({length:4},(_,i)=>{
   const mounted=s?.weightMounted[i]??false,carried=s?.carriedWeight===i,show=key==='weightFrame'?mounted:!mounted&&!carried;
   return key==='weightFrame'?part((i%2?1:-1)*.19,.34+Math.floor(i/2)*.31,.04,show ? .32 : 0,show ? .21 : 0,show ? .32 : 0,dark):
     part((i%2?1:-1)*.24,.29,(i<2?1:-1)*.19,show ? .34 : 0,show ? .25 : 0,show ? .29 : 0,iron);
  }).concat(key==='weightFrame'?[part(.34,.62,.19,.065,.27,.035,s?.weightMounted.every(Boolean)?steel:iron)]:[]);
 }
 const entries=sites.map(site=>{
  const root=new Group();root.name='night-b-front-fault-'+site.key;root.position.set(site.east,site.height,-site.north);group.add(root);
  const staticList=staticParts(site.key),dynamicList=dynamicParts(site.key,undefined);
  if(site.foundationDepth>.01)staticList.push(part(0,-site.foundationDepth/2,0,site.halfWidth*2,site.foundationDepth+.04,site.halfDepth*2,stone));
  const fixed=new InstancedMesh(cube,material,staticList.length),moving=new InstancedMesh(cube,material,dynamicList.length);
  fixed.name='repair-body-and-tools';moving.name='repair-authoritative-parts';root.add(fixed,moving);
  function draw(mesh:InstancedMesh,parts:Part[]){
   parts.forEach((p,i)=>{obj.position.set(p.x,p.y,p.z);obj.rotation.set(p.pitch??0,p.yaw??0,0);obj.scale.set(p.w,p.h,p.d);obj.updateMatrix();mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,tint.set(p.color));});
   mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();
  }
  draw(fixed,staticList);draw(moving,dynamicList);
  return {site,fixed,moving,draw};
 });
 input.owner.add(group);let disposed=false,version=-1,interrupted=false;
 function sync(s:Za36CableRepairState|undefined){
  if(disposed)return;
  if(!s){interrupted=true;return;} // keep last confirmed appearance during a transport gap
  if(s.line!==1||(!interrupted&&s.version<=version))return;
  interrupted=false;version=s.version;
  for(const e of entries)e.draw(e.moving,dynamicParts(e.site.key,s));
  group.userData.repairVersion=version;
 }
 function blocked(e:number,n:number,h:number,r=.27,b=1.8){
  return !disposed&&sites.some(s=>h+b>s.height-s.foundationDepth&&h<s.height+s.top&&Math.hypot(Math.max(0,Math.abs(e-s.east)-s.halfWidth),Math.max(0,Math.abs(n-s.north)-s.halfDepth))<r);
 }
 const anchors=Object.freeze(Object.fromEntries(sites.map(s=>[s.key,Object.freeze({east:s.east,north:s.north})]))) as RepairAnchors;
 return {ready:true as const,group,sites,anchors,sync,blocked,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const e of entries){e.fixed.dispose();e.moving.dispose();}cube.dispose();material.dispose();group.clear();}};
}
