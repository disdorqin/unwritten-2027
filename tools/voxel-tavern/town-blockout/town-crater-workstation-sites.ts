import {
  BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Ray, SRGBColorSpace, Vector3, type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import type { buildCraterRailExtension } from './town-crater-rail-extension';

export const craterWorkstationIds = ['bellows','calibration','sorting','weighing','turnout'] as const;
export type CraterWorkstationId = typeof craterWorkstationIds[number];
type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'heightAt'|'outerWorks'|'mouthWorks'>;
type Rails = Pick<ReturnType<typeof buildCraterRailExtension>, 'samples'|'narrowSamples'>;
type Point = {east:number; north:number; height:number};
type Box = {min:number[];max:number[]};
export type WorkstationSite = Readonly<{
  id:CraterWorkstationId; label:string; parentSite:string; center:Point; foot:Point; target:Point;
  yaw:number; footprint:Box; railClearance:number; bodyClearance:number;
}>;
/**
 * Batch 91: real interaction surfaces, not a second workshop reducer.
 * E/N surveyed against the batch-90 live B-01 road and real rail samples.
 * All five stay on the exterior; no opening a solid A-4 building by magic.
 */
const plans = [
  {id:'bellows',label:'风箱 · 冷炉',parentSite:'smelter-plant',east:-161,north:122,yaw:Math.PI,w:1.65,d:1.30,h:1.5},
  {id:'calibration',label:'校准台',parentSite:'instrument-plant',east:-64,north:139,yaw:-Math.PI/2,w:1.70,d:.85,h:1.75},
  {id:'sorting',label:'分拣台',parentSite:'ore-yard',east:-135,north:111,yaw:Math.PI,w:2.1,d:.95,h:1.45},
  {id:'weighing',label:'过秤',parentSite:'kengkou-freight-shed',east:-60,north:150,yaw:Math.PI,w:1.50,d:1.1,h:1.70},
  {id:'turnout',label:'道岔扳杆',parentSite:'kengkou-station',east:-48,north:179,yaw:Math.PI,w:1.15,d:.80,h:1.9},
] as const;

function gap(e:number,n:number,box:Box) {
  return Math.hypot(Math.max(box.min[0]-e,0,e-box.max[0]),Math.max(box.min[2]+n,0,-n-box.max[2]));
}
function railGap(e:number,n:number,rail:Rails) {
  let best=Infinity;
  for(const route of [rail.samples,rail.narrowSamples]){
    for(let i=1;i<route.length;i++){
      const a=route[i-1],b=route[i],dx=b.east-a.east,dn=b.north-a.north;
      const t=Math.max(0,Math.min(1,((e-a.east)*dx+(n-a.north)*dn)/(dx*dx+dn*dn||1)));
      best=Math.min(best,Math.hypot(e-a.east-t*dx,n-a.north-t*dn));
    }
  }
  return best;
}
/** Fail visibly if a later A/C scene change occupies a surveyed work pad. */
export function surveyCraterWorkstations(road:Road,rail:Rails): readonly WorkstationSite[] {
  const walls=[...road.outerWorks.colliders,...road.mouthWorks.colliders];
  return plans.map(p=>{
    const {east,north,yaw}=p;
    const height=road.heightAt(east,north);
    if(height===undefined||!Number.isFinite(height))throw Error('Missing surveyed ground for '+p.id);
    const forward={east:Math.sin(yaw),north:-Math.cos(yaw)};
    const foot={east:east+forward.east*1.55,north:north+forward.north*1.55,height:0};
    const ground=road.heightAt(foot.east,foot.north);
    if(ground===undefined||Math.abs(ground-height)>.18)throw Error('No flat operating foot for '+p.id);
    foot.height=ground;
    const hx=(Math.abs(Math.cos(yaw))*p.w+Math.abs(Math.sin(yaw))*p.d)/2;
    const hz=(Math.abs(Math.sin(yaw))*p.w+Math.abs(Math.cos(yaw))*p.d)/2;
    const footprint={min:[east-hx,height,-north-hz],max:[east+hx,height+p.h,-north+hz]};
    const relevant=walls.filter(b=>b.min[1]<height+2&&b.max[1]>height+.02);
    const bodyClearance=Math.min(...relevant.map(b=>Math.min(gap(east,north,b)-Math.hypot(hx,hz),gap(foot.east,foot.north,b))));
    const railClearance=Math.min(railGap(east,north,rail)-Math.hypot(hx,hz),railGap(foot.east,foot.north,rail));
    if(bodyClearance<.55||railClearance<1.65)throw Error('Occupied workshop pad: '+p.id+' '+bodyClearance+'/'+railClearance);
    const target={east:east+forward.east*(p.d/2),north:north+forward.north*(p.d/2),height:height+1.05};
    return Object.freeze({id:p.id,label:p.label,parentSite:p.parentSite,center:{east,north,height},foot,target,yaw,footprint,railClearance,bodyClearance});
  });
}

export type CraterWorkstationView = Readonly<{
  /** Read from the existing B rule leaf; normalized animation values only. */
  bellowsStroke:number; gaugeNeedle:number; sortingFill:readonly [number,number,number];
  weighingNeedle:number; turnout:'straight'|'branch';
}>;
const clamped=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;

/** Mount physical tools and animation pivots; there is intentionally no E
 * handler, progression counter, inventory, reward, or independent clock. */
export function mountCraterWorkstations(owner:Object3D,road:Road,rail:Rails){
  const sites=surveyCraterWorkstations(road,rail);
  const root=new Group(); root.name='b91-crater-workstations'; owner.add(root);
  const timber=new MeshStandardMaterial({color:0x73503a,roughness:.96});
  const iron=new MeshStandardMaterial({color:0x40434b,roughness:.83,metalness:.35});
  const rust=new MeshStandardMaterial({color:0x8d4d36,roughness:.94});
  const stone=new MeshStandardMaterial({color:0x8b8274,roughness:1});
  const brass=new MeshStandardMaterial({color:0xb49355,roughness:.65,metalness:.40});
  const paper=new MeshStandardMaterial({color:0xd3c4a0,roughness:.91});
  const dark=new MeshStandardMaterial({color:0x27252a,roughness:1});
  const ores=[0x3d3a44,0xa98a56,0x8a8378].map(color=>new MeshStandardMaterial({color,roughness:.98}));
  const allMaterials=[timber,iron,rust,stone,brass,paper,dark,...ores];
  const unit=new BoxGeometry(1,1,1);
  const wheel=new CylinderGeometry(1,1,1,12);
  const controls=new Map<CraterWorkstationId,Group>();
  const fills:Mesh[]=[];
  const needle=(group:Group,x:number,y:number,z:number)=>{
    const pivot=new Group();pivot.position.set(x,y,z);group.add(pivot);
    const pointer=new Mesh(unit,rust);pointer.position.y=.13;pointer.scale.set(.035,.26,.035);pivot.add(pointer);
    return pivot;
  };
  let bellowsHandle:Group|undefined, gauge:Group|undefined, weighNeedle:Group|undefined, lever:Group|undefined;
  let signal:MeshStandardMaterial|undefined;
  function sign(g:Group,label:string,y:number,z:number,w:number){
    const backing=new Mesh(unit,timber);backing.scale.set(w,.24,.045);backing.position.set(0,y,z);g.add(backing);
    if(typeof document==='undefined')return;
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const c=canvas.getContext('2d');if(!c)return;
    c.fillStyle='#4d3425';c.fillRect(0,0,512,128);c.strokeStyle='#967557';c.lineWidth=5;c.strokeRect(8,8,496,112);
    c.fillStyle='#ede0be';c.textAlign='center';c.textBaseline='middle';c.font='bold 70px sans-serif';c.fillText(label,256,65,470);
    const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;
    const mesh=new Mesh(new PlaneGeometry(w-.06,.21),new MeshBasicMaterial({map:tex}));
    mesh.position.set(0,y,z+.03);g.add(mesh);
  }
  for(const site of sites){
    const g=new Group();g.name='b91-'+site.id;g.position.set(site.center.east,site.center.height,-site.center.north);
    g.rotation.y=site.yaw;root.add(g);controls.set(site.id,g);
    const batches=new Map<MeshStandardMaterial,BoxGeometry[]>();
    const fixed=(mat:MeshStandardMaterial,x:number,y:number,z:number,w:number,h:number,d:number)=>{
      const b=new BoxGeometry(w,h,d);b.translate(x,y,z);
      const a=batches.get(mat)??[];a.push(b);batches.set(mat,a);
    };
    const moving=(mat:MeshStandardMaterial,host:Object3D,x:number,y:number,z:number,w:number,h:number,d:number)=>{
      const m=new Mesh(unit,mat);m.position.set(x,y,z);m.scale.set(w,h,d);host.add(m);return m;
    };
    const table=(w:number,d:number,y=.8)=>{
      fixed(stone,0,.075,0,w,.15,d);
      for(const x of [-w*.38,w*.38])for(const z of [-d*.35,d*.35])fixed(timber,x,y/2,z,.11,y,.11);
      fixed(timber,0,y,0,w,.12,d);
    };
    if(site.id==='bellows'){
      table(1.48,.87,.69);
      fixed(iron,0,.84,-.11,1.14,.13,.69);
      for(let i=0;i<5;i++)fixed(dark,0,.92+i*.055,-.12,1.04-i*.045,.043,.61-i*.035);
      fixed(rust,-.52,.96,-.32,.24,.23,.21);
      fixed(iron,-.65,1.02,-.39,.32,.10,.10);
      bellowsHandle=new Group();bellowsHandle.position.set(0,1.16,-.36);g.add(bellowsHandle);
      moving(timber,bellowsHandle,0,0,.41,1.16,.10,.12);
      moving(iron,bellowsHandle,0,0,.10,.16,.10,.70);
      // Actual cold iron outlet: no light, flame or invented fuel reward.
      fixed(iron,.63,.91,-.29,.28,.22,.26);
      sign(g,site.label,1.31,-.12,1.35);
    }else if(site.id==='calibration'){
      table(1.58,.76,.73);fixed(iron,0,1.22,-.22,1.48,.86,.15);
      for(const x of [-.43,0,.43]){
        const dial=new Mesh(wheel,paper);dial.scale.set(.18,.045,.18);dial.rotation.x=Math.PI/2;dial.position.set(x,1.30,-.115);g.add(dial);
        const p=needle(g,x,1.30,-.075);p.rotation.z=x*.9;
        if(x===0)gauge=p;
        const knob=new Mesh(wheel,brass);knob.scale.set(.095,.07,.095);knob.rotation.x=Math.PI/2;knob.position.set(x,.89,.29);g.add(knob);
      }
      sign(g,site.label,1.63,-.12,1.3);
    }else if(site.id==='sorting'){
      table(1.95,.84,.72);
      for(let i=0;i<3;i++){
        const x=(i-1)*.61;
        fixed(iron,x,.84,0,.56,.11,.66);
        for(const side of [-1,1])fixed(timber,x+side*.265,.96,0,.045,.27,.68);
        fixed(timber,x,.96,-.315,.55,.27,.045);
        const chunk=moving(ores[i],g,x,.92,0,.42,.10,.42);fills.push(chunk);
      }
      for(let i=0;i<3;i++)fixed(ores[i],(i-1)*.38,1.02,-.38,.17,.16,.12);
      sign(g,site.label,1.34,-.31,1.66);
    }else if(site.id==='weighing'){
      fixed(stone,0,.09,0,1.36,.18,.95);
      fixed(iron,0,.26,0,1.24,.16,.86);
      for(let i=0;i<5;i++)fixed(iron,(i-2)*.19,.37,0,.13,.06,.78);
      fixed(iron,0,.78,-.37,.13,1.19,.13);
      fixed(iron,0,1.36,-.30,.65,.36,.16);
      fixed(paper,0,1.36,-.205,.52,.28,.03);
      weighNeedle=needle(g,0,1.34,-.18);weighNeedle.scale.set(.52,.52,.52);
      sign(g,site.label,1.56,-.19,.62);
    }else{
      fixed(stone,0,.12,0,.91,.24,.64);
      fixed(iron,0,.35,0,.61,.27,.42);fixed(rust,-.30,.72,0,.11,.73,.15);
      lever=new Group();lever.position.set(0,.48,0);g.add(lever);
      moving(iron,lever,0,.39,0,.075,.78,.075);moving(timber,lever,0,.83,0,.34,.095,.095);
      fixed(iron,.43,.83,-.22,.10,1.6,.10);fixed(iron,.43,1.61,-.22,.26,.31,.25);
      signal=new MeshStandardMaterial({color:0xaa4c3f,emissive:0x68251b,emissiveIntensity:.23});
      moving(signal,g,.43,1.61,-.075,.13,.16,.055);
      sign(g,site.label,1.20,-.16,.84);
    }
    for(const [mat,parts] of batches){
      const joined=mergeGeometries(parts);for(const part of parts)part.dispose();
      if(!joined)throw Error('Cannot batch workshop geometry: '+site.id);
      joined.computeBoundingSphere();g.add(new Mesh(joined,mat));
    }
  }
  const ray=new Ray(),point=new Vector3(),delta=new Vector3();
  function aim(feet:Point,heading:number,pitch:number,eyeHeight:number):CraterWorkstationId|null{
    if(![feet.east,feet.north,feet.height,heading,pitch,eyeHeight].every(Number.isFinite))return null;
    ray.origin.set(feet.east,feet.height+eyeHeight,-feet.north);
    ray.direction.set(Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch));
    let hit:CraterWorkstationId|null=null,best=Infinity;
    for(const s of sites){
      // Approach from the visible tool face, never through its backing.
      const dx=feet.east-s.center.east,dn=feet.north-s.center.north;
      if(dx*Math.sin(s.yaw)-dn*Math.cos(s.yaw)<.38||
          Math.hypot(feet.east-s.foot.east,feet.north-s.foot.north)>1.2||
          Math.abs(feet.height-s.foot.height)>.45)continue;
      point.set(s.target.east,s.target.height,-s.target.north);delta.subVectors(point,ray.origin);
      if(delta.dot(ray.direction)<=0||delta.length()>2.5)continue;
      const miss=ray.distanceSqToPoint(point);
      if(miss<=.36**2&&miss<best){best=miss;hit=s.id;}
    }
    return hit;
  }
  function show(view:CraterWorkstationView){
    bellowsHandle!.rotation.x=-clamped(view.bellowsStroke)*.35;
    gauge!.rotation.z=(clamped(view.gaugeNeedle)-.5)*2.1;
    fills.forEach((m,i)=>{const h=.035+clamped(view.sortingFill[i])*.20;m.scale.y=h;m.position.y=.885+h/2;});
    weighNeedle!.rotation.z=(clamped(view.weighingNeedle)-.5)*2;
    lever!.rotation.z=view.turnout==='branch'?.44:-.44;
    signal!.color.set(view.turnout==='branch'?0x78ac7d:0xaa4c3f);
    signal!.emissive.set(view.turnout==='branch'?0x294e2d:0x68251b);
  }
  show({bellowsStroke:0,gaugeNeedle:0,sortingFill:[0,0,0],weighingNeedle:0,turnout:'straight'});
  function dispose(){
    root.removeFromParent();
    const geometries=new Set<import('three').BufferGeometry>();
    root.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);if(o.material instanceof MeshBasicMaterial){o.material.map?.dispose();o.material.dispose();}}});
    for(const geo of geometries)geo.dispose();
    for(const mat of allMaterials)mat.dispose();signal?.dispose();unit.dispose();wheel.dispose();
  }
  return {group:root,sites,colliders:sites.map(s=>s.footprint),aim,show,dispose};
}
