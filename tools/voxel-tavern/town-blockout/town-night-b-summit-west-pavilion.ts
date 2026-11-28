import {BoxGeometry,Group,Mesh,MeshLambertMaterial,InstancedMesh,Vector3} from 'three';
import {createCloudPavilion,cloudPavilionDimensions} from './main-summit-pavilions';
import {inNightBWest,nightBWestBounds as b,westCableDistance,type WestReserve} from './town-night-b-summit-west-relief';
type Point={east:number,north:number,height:number};
type Height=(e:number,n:number)=>number|undefined;
type Box={min:number[],max:number[]};
const {width,depth}=cloudPavilionDimensions['upper-cloud'];
const span=6,offset=depth/2+span;
export type WestPavilionSite={east:number,north:number,height:number,viewEast:number,viewNorth:number,approach:Point,score:number};
/** Select a real point on C2's supplied trail, rather than introducing a
 * competing main route. This REPLACES upper-cloud, never adds a third pavilion. */
export function findNightBWestPavilionSite(points:readonly Point[],heightAt:Height,reserved:WestReserve=()=>false):WestPavilionSite|undefined{
 let best:WestPavilionSite|undefined;
 for(let i=1;i<points.length-1;i++){
  const p=points[i]!,before=points[i-1]!,after=points[i+1]!;
  if(!inNightBWest(p.east,p.north)||p.height<380||p.height>560)continue;
  let ve=-(after.north-before.north),vn=after.east-before.east;const len=Math.hypot(ve,vn);if(len<.01)continue;ve/=len;vn/=len;if(ve>0){ve=-ve;vn=-vn}
  const e=p.east+ve*offset,n=p.north+vn*offset;
  if(e<b.west+40||e>b.east-40||n<b.south+40||n>b.north-40||westCableDistance(e,n)<25||reserved(e,n,7))continue;
  const yaw=Math.atan2(ve,-vn);
  let low=Infinity,high=-Infinity,valid=true;
  for(let z=-depth/2-span;z<=depth/2+.01;z+=.5)for(let x= z< -depth/2?-1: -width/2;x<=(z< -depth/2?1:width/2)+.01;x+=.5){
   const E=e+x*Math.cos(yaw)+z*Math.sin(yaw),N=n+x*Math.sin(yaw)-z*Math.cos(yaw),h=heightAt(E,N);
   if(h===undefined||!Number.isFinite(h)){valid=false;continue}low=Math.min(low,h);high=Math.max(high,h);
  }
  if(!valid||high>p.height+.035||p.height-low>12)continue;
  const score=p.height-low+.4*Math.abs(p.height-550)+Math.max(0,high-low)*.3;
  if(!best||score<best.score)best={east:e,north:n,height:p.height,viewEast:ve,viewNorth:vn,approach:{...p},score};
 }
 return best;
}
export function createNightBWestPavilion(site:WestPavilionSite,heightAt:Height){
 const root=createCloudPavilion('upper-cloud');root.name='night-b-west-pavilion-replaces-upper-cloud';
 root.position.set(site.east,site.height,-site.north);root.rotation.y=Math.atan2(site.viewEast,-site.viewNorth);
 const yaw=root.rotation.y,world=(x:number,z:number)=>({e:site.east+x*Math.cos(yaw)+z*Math.sin(yaw),n:site.north+x*Math.sin(yaw)-z*Math.cos(yaw)});
 if(!inNightBWest(site.east,site.north)||Math.hypot(site.approach.east-world(0,-offset).e,site.approach.north-world(0,-offset).n)>.01||Math.abs(site.approach.height-site.height)>.01)throw new RangeError('invalid west pavilion approach');
 const stone=new MeshLambertMaterial({color:'#8a8378'}),wood=new MeshLambertMaterial({color:'#795344'}),trim=new MeshLambertMaterial({color:'#a47952'}),iron=new MeshLambertMaterial({color:'#45464b'});
 const colliders:Box[]=[...root.userData.colliders],floors:Box[]=[...root.userData.floors];
 function box(name:string,x:number,y:number,z:number,w:number,h:number,d:number,material:MeshLambertMaterial,solid=false){
  const m=new Mesh(new BoxGeometry(w,h,d),material);m.name=name;m.position.set(x,y,z);root.add(m);
  if(solid)colliders.push({min:[x-w/2,y-h/2,z-d/2],max:[x+w/2,y+h/2,z+d/2]});
 }
 for(let z=-offset;z<=depth/2+.01;z+=.5)for(let x=z< -depth/2?-1:-width/2;x<=(z< -depth/2?1:width/2)+.01;x+=.5){
  const p=world(x,z),h=heightAt(p.e,p.n);if(h===undefined||h>site.height+.035||site.height-h>12)throw new RangeError('pavilion surface interferes with canonical terrain');
 }
 function pier(x:number,z:number){
  const heights:number[]=[];for(const dx of [-.4,0,.4])for(const dz of [-.4,0,.4]){const p=world(x+dx,z+dz),h=heightAt(p.e,p.n);if(h===undefined||!Number.isFinite(h))throw new RangeError('missing footing');heights.push(h)}
  const bottom=Math.min(...heights)-site.height-.35;if(bottom>=-.18)return;
  box('west-pavilion-footing',x,(bottom-.18)/2,z,.8,-.18-bottom,.8,stone,true);
 }
 for(const x of [-3.5,3.5])for(const z of [-2.5,2.5])pier(x,z);
 const zmid=-depth/2-span/2;box('west-pavilion-walkway',0,-.12,zmid,2,.24,span,wood);
 floors.push({min:[-1,-.24,-offset],max:[1,0,-depth/2]});
 for(const z of [-offset+.8,zmid,-depth/2-.8]){for(const x of [-.67,.67])pier(x,z);}
 for(const x of [-.94,.94]){
  // Leave the original 3m road unobstructed where the bridge meets it.
  const railStart=-offset+1.85,railEnd=-depth/2-.10;
  box('walkway-rail',x,.95,(railStart+railEnd)/2,.10,.12,railEnd-railStart,wood,true);
  for(let i=0;i<4;i++)box('walkway-post',x,.48,railStart+(railEnd-railStart)*i/3,.13,.96,.13,wood,true);
 }
 // The view edge used to have no barrier; preserve the actual back
 // entrance and build a visible timber parapet above the exposed drop.
 const viewZ=depth/2-.23;
 for(const x of [-width/2+.25,0,width/2-.25]){
  box('b33-view-guard-post-base',x,.085,viewZ,.36,.17,.36,stone,true);
  box('b33-view-guard-post',x,.58,viewZ,.18,.99,.18,wood,true);
  box('b33-view-guard-cap',x,1.12,viewZ,.25,.11,.25,trim,true);
 }
 for(const x of [-width/4,width/4]){
  box('b33-view-guard-low',x,.28,viewZ,width/2-.16,.14,.13,wood,true);
  box('b33-view-guard-top',x,.98,viewZ,width/2-.16,.18,.17,wood,true);
  for(let i=0;i<7;i++)box('b33-view-guard-baluster',x+(i-3)*.60,.62,viewZ,.10,.63,.10,trim,true);
 }
 // Real deck edge beams above the already grounded piers. The central
 // 2m walkway stays open in both directions.
 for(const x of [-3.5,3.5]){
  box('b33-pier-longitudinal-beam',x,-.46,0,.36,.35,depth-.45,wood,true);
  for(const z of [-2.5,2.5])box('b33-pier-iron-seat',x,-.23,z,.56,.12,.56,iron,true);
 }
 for(const x of [-.67,.67])box('b33-walkway-long-beam',x,-.32,zmid,.22,.19,span-.25,wood,true);
 for(const z of [-offset+.8,zmid,-depth/2-.8])box('b33-walkway-crossbeam',0,-.33,z,1.8,.21,.28,wood,true);
 root.userData.colliders=colliders;root.userData.floors=floors;
 root.userData.owner='B';root.userData.revision='B33-2';root.userData.chunkId='rear/B/pavilion';root.userData.static=true;
 const local=(e:number,n:number,h:number)=>{const dx=e-site.east,dn=n-site.north;return new Vector3(dx*Math.cos(yaw)+dn*Math.sin(yaw),h-site.height,dx*Math.sin(yaw)-dn*Math.cos(yaw))};
 let disposed=false;
 return {group:root,site,replaces:'upper-cloud' as const,
  supportAt(e:number,n:number,r=.32){const p=local(e,n,site.height);return floors.some(f=>p.x>=f.min[0]!+r&&p.x<=f.max[0]!-r&&p.z>=f.min[2]!+r&&p.z<=f.max[2]!-r)||Math.abs(p.x)<=1-r&&p.z>=-offset&&p.z<=-depth/2+r?site.height:undefined},
  blocked(e:number,n:number,h:number,r=.32,body=1.8){const p=local(e,n,h);return colliders.some(c=>p.y+body>c.min[1]!&&p.y<c.max[1]!&&Math.hypot(Math.max(c.min[0]!-p.x,p.x-c.max[0]!,0),Math.max(c.min[2]!-p.z,p.z-c.max[2]!,0))<r)},
  dispose(){if(disposed)return;disposed=true;root.removeFromParent();const geos=new Set<any>(),mats=new Set<any>();root.traverse(o=>{if(o instanceof Mesh){geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);if(o instanceof InstancedMesh)o.dispose()}});for(const g of geos)g.dispose();for(const m of mats)m.dispose();root.clear()}
 };
}
