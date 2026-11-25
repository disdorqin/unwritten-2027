import {
  BoxGeometry, BufferGeometry, CylinderGeometry, DodecahedronGeometry, Group, Mesh,
  DataTexture, MeshStandardMaterial, NearestFilter, SRGBColorSpace,
} from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {mountWestCraterRoad} from './town-za22-crater-road';
import {surveyZa31CraterWinch} from './town-za31-crater-winch';
import {townC2CraterCentralMoundProtectedSites} from './town-c2-crater-central-mound';
import {craterFloorWorklightSites,craterFloorLampRockBufferM} from './meteor-crater-floor-worklight-sites';

type Road=Pick<ReturnType<typeof mountWestCraterRoad>,'anchor'|'heightAt'|'group'>;
type Box={min:number[];max:number[]};
type Point={east:number;north:number};
import {bR30WorkfacePads} from './town-b-r30-crater-workface-layout';
const pads=bR30WorkfacePads;
const gap=(e:number,n:number,b:Box)=>Math.hypot(Math.max(b.min[0]-e,e-b.max[0],0),Math.max(b.min[2]+n,-n-b.max[2],0));
function segmentGap(p:Point,a:Point,b:Point){
  const dx=b.east-a.east,dn=b.north-a.north;
  const t=Math.max(0,Math.min(1,((p.east-a.east)*dx+(p.north-a.north)*dn)/(dx*dx+dn*dn||1)));
  return Math.hypot(p.east-a.east-t*dx,p.north-a.north-t*dn);
}
export function surveyBR30Workface(road:Road){
  const a=road.anchor,c=Math.cos(a.yaw),s=Math.sin(a.yaw);
  const winch=surveyZa31CraterWinch(road);
  if(!winch)throw Error('R30 workface requires the C-owned surveyed winch');
  const reservations=[
    ...Object.values(townC2CraterCentralMoundProtectedSites),
    ...craterFloorWorklightSites.map(p=>({east:a.east+p.east*c+p.north*s,north:a.north+p.north*c-p.east*s,radius:craterFloorLampRockBufferM})),
    winch.snakeStoneReservation,{...winch.useFoot,radius:2},{...winch.crane,radius:1.5},
  ];
  const colliders=road.group.userData.colliders as Box[];
  if(!Array.isArray(colliders))throw Error('Workface requires the existing west collision channel');
  return pads.map(p=>{
    const extent=Math.hypot(p.w,p.d)/2;
    const h=road.heightAt(p.east,p.north);
    if(h===undefined||Math.abs(h-(a.rimHeight-35))>.08)throw Error('Missing flat floor: '+p.id);
    const clearance=Math.min(...reservations.map(r=>Math.hypot(p.east-r.east,p.north-r.north)-r.radius-extent));
    const routeClearance=Math.min(...winch.descentApproach.slice(1).map((q,i)=>segmentGap(p,winch.descentApproach[i],q)-extent));
    const solidClearance=Math.min(...colliders.filter(b=>b.min[1]<h+p.h&&b.max[1]>h).map(b=>gap(p.east,p.north,b)-extent));
    if(clearance<.65||routeClearance<2.6||solidClearance<.65)throw Error('Workface reservation conflict: '+p.id);
    const samples=[-1,0,1].flatMap(x=>[-1,0,1].map(z=>road.heightAt(p.east+x*p.w/2,p.north+z*p.d/2)));
    if(samples.some(y=>y===undefined||Math.abs(y-h)>.12))throw Error('Uneven pad: '+p.id);
    return {...p,height:h,clearance,routeClearance,solidClearance,
      box:{min:[p.east-p.w/2,h-.04,-p.north-p.d/2],max:[p.east+p.w/2,h+p.h,-p.north+p.d/2]}};
  });
}
const palette={
  stone:[0x81776b,0x605b55,0xaaa39a],iron:[0x454950,0x272c32,0x747675],
  rust:[0x855438,0x543327,0xb17a4d],wood:[0x76543a,0x4a3325,0x9c7951],
  ore:[0x3b4148,0x232832,0x71757a],cloth:[0x88795d,0x645843,0xb1a07a],
} as const;
type Family=keyof typeof palette;
function material(f:Family){
  const colors=palette[f],pixels=new Uint8Array(16*16*4);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const r=(Math.imul(x+13,733)^Math.imul(y+11,197)^Math.imul(x*y,31))>>>0;
    const v=colors[f==='wood'&&(y===4||y===11)?1:r%13<3?2:r%7===0?1:0];
    pixels.set([v>>16,v>>8&255,v&255,255],4*(y*16+x));
  }
  const map=new DataTexture(pixels,16,16);map.colorSpace=SRGBColorSpace;
  map.magFilter=map.minFilter=NearestFilter;map.generateMipmaps=false;map.needsUpdate=true;
  return new MeshStandardMaterial({map,roughness:.96,metalness:f==='iron'?.16:0});
}
/** B-owned static physical kit. No new item rewards, E handler, lamp clock
 * or underground authority. A attaches the colliders before building its
 * existing west collision index. */
export function buildBR30Workface(road:Road){
  const sites=surveyBR30Workface(road);
  const group=new Group();group.name='b-r30-pit-workface';
  const materials=Object.fromEntries(Object.keys(palette).map(f=>[f,material(f as Family)])) as Record<Family,MeshStandardMaterial>;
  for(const site of sites){
    const host=new Group();host.name=site.id;host.position.set(site.east,site.height,-site.north);group.add(host);
    const batches=new Map<Family,BufferGeometry[]>();
    const part=(family:Family,src:BufferGeometry,x:number,y:number,z:number,rx=0,ry=0,rz=0)=>{
      const g=src.index?src.toNonIndexed():src;
      if(src!==g)src.dispose();
      g.rotateX(rx).rotateY(ry).rotateZ(rz).translate(x,y,z);
      const list=batches.get(family)??[];list.push(g);batches.set(family,list);
    };
    const box=(f:Family,x:number,y:number,z:number,w:number,h:number,d:number,rz=0)=>part(f,new BoxGeometry(w,h,d),x,y,z,0,0,rz);
    const cylinder=(f:Family,x:number,y:number,z:number,r:number,h:number,rx=0,rz=0)=>part(f,new CylinderGeometry(r,r,h,10),x,y,z,rx,0,rz);
    // Stone foundation and worn split sleeper deck; this pad is a solid
    // obstacle, not a second invisible walking surface.
    box('stone',0,.06,0,site.w-.12,.14,site.d-.12);
    if(site.id==='abandoned-ore-cart'){
      for(let z=-1;z<=1.001;z+=.4)box('wood',0,.19,z,2.25,.16,.19);
      for(const x of [-.65,.65]){box('iron',x,.32,0,.12,.15,2.25);box('rust',x,.39,0,.20,.06,2.25);}
      for(const z of [-.59,.59]){
        cylinder('iron',0,.52,z,.085,1.55,0,Math.PI/2);
        for(const x of [-.7,.7]){cylinder('iron',x,.52,z,.29,.13,0,Math.PI/2);cylinder('rust',x*1.08,.52,z,.13,.16,0,Math.PI/2);}
      }
      box('iron',0,.79,0,1.6,.15,1.66);
      box('rust',0,.94,0,1.37,.21,1.43);
      for(const x of [-.73,.73]){box('iron',x,1.14,0,.10,.52,1.62,x<0?.17:-.17);box('rust',x,1.39,0,.13,.08,1.69);}
      for(const z of [-.77,.77])box('rust',0,1.13,z,1.45,.50,.10);
      for(let i=0;i<9;i++)part('ore',new DodecahedronGeometry(.14+(i%3)*.03,0),((i%3)-1)*.38,1.12+Math.floor(i/3)*.035,((i*7)%5-2)*.22,0,i*.7);
      box('iron',0,.78,1.04,.26,.12,.31);
    }else if(site.id==='repair-rack'){
      for(const x of [-1,1])for(const z of [-.72,.70])box('wood',x,.52,z,.14,.92,.14);
      box('wood',0,.91,0,2.22,.15,1.65);
      for(const x of [-.98,.98]){box('iron',x,1.36,-.65,.11,.91,.10);box('wood',x,.44,0,.12,.13,1.55);}
      box('wood',0,1.71,-.65,2.08,.10,.18);
      box('wood',0,1.37,-.66,2.05,.16,.11);
      for(let i=0;i<5;i++){box('iron',-.76+i*.37,1.31,-.54,.055,.09,.24);box('wood',-.76+i*.37,1.14,-.44,.045,.39,.05);box('iron',-.76+i*.37,1.34,-.44,.23,.10,.085);}
      // Fixed bench vice with actual jaws and transverse handle.
      box('iron',.74,1.04,.43,.36,.17,.35);
      for(const z of [.30,.56])box('rust',.74,1.21,z,.38,.19,.10);
      cylinder('iron',.74,1.08,.55,.035,.50,0,Math.PI/2);
      box('cloth',-.52,1.02,.32,.51,.11,.40);
    }else{
      for(const x of [-.63,.63]){
        box('wood',x,.24,0,1.05,.17,1.73);
        for(const z of [-.77,.77])box('wood',x,.50,z,1.05,.40,.12);
        for(const dx of [-.46,.46])box('wood',x+dx,.50,0,.13,.40,1.62);
        for(const dx of [-.40,.40])for(const z of [-.65,.65])box('iron',x+dx,.66,z,.09,.09,.09);
        for(let i=0;i<6;i++)part(x<0?'ore':'rust',new DodecahedronGeometry(.17,0),x+((i%3)-1)*.28,.53,((i*3)%5-2)*.22,i*.37,i*.62);
      }
      box('wood',0,.86,-.63,2.08,.08,.17);
      for(const x of [-.94,.94])box('wood',x,.83,-.63,.10,.49,.10);
      box('cloth',0,.93,-.61,.8,.17,.12);
    }
    for(const [f,parts] of batches){
      const joined=mergeGeometries(parts);parts.forEach(p=>p.dispose());
      if(!joined)throw Error('Cannot batch workface '+site.id);
      joined.computeBoundingBox();joined.computeBoundingSphere();
      const mesh=new Mesh(joined,materials[f]);mesh.name=site.id+'/'+f;host.add(mesh);
    }
  }
  const colliders=sites.map(s=>s.box);
  return {group,sites,colliders,dispose(){
    group.removeFromParent();
    group.traverse(o=>{if(o instanceof Mesh)o.geometry.dispose();});
    Object.values(materials).forEach(m=>{m.map?.dispose();m.dispose();});
  }};
}
const attached=new WeakMap<Group,ReturnType<typeof buildBR30Workface>>();
export function installBR30Workface(road:Road){
  const existing=attached.get(road.group);if(existing)return existing;
  const kit=buildBR30Workface(road);
  road.group.add(kit.group);
  road.group.userData.colliders=[...road.group.userData.colliders,...kit.colliders];
  const result={...kit,dispose(){
    if(attached.get(road.group)!==result)return;
    road.group.userData.colliders=(road.group.userData.colliders as Box[]).filter(b=>!kit.colliders.includes(b));
    attached.delete(road.group);kit.dispose();
  }};
  attached.set(road.group,result);return result;
}
