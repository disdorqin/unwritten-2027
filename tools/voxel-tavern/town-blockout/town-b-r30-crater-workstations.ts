import {
  BoxGeometry, CanvasTexture, CylinderGeometry, DataTexture, DodecahedronGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, NearestFilter, PlaneGeometry, Ray, SRGBColorSpace, Vector3, type Object3D,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { mountWestCraterRoad } from './town-za22-crater-road';
import type { buildCraterRailExtension } from './town-crater-rail-extension';

export const craterWorkstationIds = ['bellows','calibration','sorting','weighing','turnout'] as const;
export type CraterWorkstationId = typeof craterWorkstationIds[number];
type Road = Pick<ReturnType<typeof mountWestCraterRoad>, 'heightAt'|'outerWorks'|'mouthWorks'> & {group?:Group};
type Rails = Pick<ReturnType<typeof buildCraterRailExtension>, 'samples'|'narrowSamples'>;
type Point = {east:number; north:number; height:number};
type Box = {min:number[];max:number[]};
export type WorkstationSite = Readonly<{
  id:CraterWorkstationId; label:string; parentSite:string; center:Point; foot:Point; target:Point;
  yaw:number; footprint:Box; railClearance:number; bodyClearance:number;
}>;
/**
 * R30 recovery from audited B93: real interaction surfaces, not a second workshop reducer.
 * E/N resurveyed against the live R30 road and real rail samples.
 * All five stay on the exterior; no opening a solid A-4 building by magic.
 */
const plans = [
  {id:'bellows',label:'风箱 · 冷炉',parentSite:'smelter-plant',east:-161,north:122,yaw:Math.PI,w:1.72,d:1.30,h:1.72,targetY:1.16,targetZ:.05},
  {id:'calibration',label:'校准台',parentSite:'instrument-plant',east:-64,north:139,yaw:-Math.PI/2,w:1.70,d:.85,h:1.75,targetY:.89,targetZ:.29},
  {id:'sorting',label:'分拣台',parentSite:'ore-yard',east:-135,north:111,yaw:Math.PI,w:2.1,d:.95,h:1.45,targetY:.99,targetZ:.13},
  {id:'weighing',label:'过秤',parentSite:'kengkou-freight-shed',east:-60,north:150,yaw:Math.PI,w:1.50,d:1.1,h:1.70,targetY:.40,targetZ:.20},
  {id:'turnout',label:'道岔扳杆',parentSite:'kengkou-station',east:-48,north:179,yaw:Math.PI,w:1.15,d:.80,h:1.9,targetY:1.26,targetZ:.06},
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
  const walls:Box[]=Array.isArray(road.group?.userData.colliders) ? road.group!.userData.colliders : [...road.outerWorks.colliders,...road.mouthWorks.colliders];
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
    for(const de of [-hx,0,hx])for(const dn of [-hz,0,hz]){
      const corner=road.heightAt(east+de,north+dn);
      if(corner===undefined||Math.abs(corner-height)>.18)throw Error('Uneven foundation: '+p.id);
    }
    const relevant=walls.filter(b=>b.min[1]<height+2&&b.max[1]>height+.02);
    const bodyClearance=Math.min(...relevant.map(b=>Math.min(gap(east,north,b)-Math.hypot(hx,hz),gap(foot.east,foot.north,b))));
    const railClearance=Math.min(railGap(east,north,rail)-Math.hypot(hx,hz),railGap(foot.east,foot.north,rail));
    if(bodyClearance<.55||railClearance<1.65)throw Error('Occupied workshop pad: '+p.id+' '+bodyClearance+'/'+railClearance);
    const target={east:east+forward.east*p.targetZ,north:north+forward.north*p.targetZ,height:height+p.targetY};
    return Object.freeze({id:p.id,label:p.label,parentSite:p.parentSite,center:{east,north,height},foot,target,yaw,footprint,railClearance,bodyClearance});
  });
}

export type CraterWorkstationView = Readonly<{
  /** Read from the existing B rule leaf; normalized animation values only. */
  bellowsStroke:number; gaugeNeedle:number; sortingFill:readonly [number,number,number];
  weighingNeedle:number; turnout:'straight'|'branch';
  /** All three actual instrument dial angles, supplied by the existing rule. */
  calibrationAngles?:readonly [number,number,number];
  calibrationLocked?:readonly [boolean,boolean,boolean];
  bellowsPressure?:number;
  calibrationTargets?:readonly [number,number,number];
  bellowsInBand?:boolean;
  bellowsHeld?:number;
  bellowsCast?:boolean;
}>;
const clamped=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;

/** Same 16-pixel weathered palette as the crater's industrial belt. Grain is
 * generated once per family; no extra maps/lights per screw or plank. */
function workshopMaterial(colors:readonly [number,number,number],seed:number,wood=false){
  const size=16,rgba=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const hash=(Math.imul(x+17,733)^Math.imul(y+31,199)^seed)>>>0;
    const stripe=wood&&(y===4||y===11||((x+y*3)%23===0));
    const tone=colors[stripe?2:hash%17<4?1:0];
    rgba.set([(tone>>16)&255,(tone>>8)&255,tone&255,255],(y*size+x)*4);
  }
  const map=new DataTexture(rgba,size,size);
  map.magFilter=map.minFilter=NearestFilter;map.generateMipmaps=false;
  map.colorSpace=SRGBColorSpace;map.needsUpdate=true;
  return new MeshStandardMaterial({map,roughness:.93});
}

/** Mount physical tools and animation pivots; there is intentionally no E
 * handler, progression counter, inventory, reward, or independent clock. */
export function mountCraterWorkstations(owner:Object3D,road:Road,rail:Rails){
  const sites=surveyCraterWorkstations(road,rail);
  const root=new Group(); root.name='b-r30-crater-workstations'; owner.add(root);
  const timber=workshopMaterial([0x865c3f,0x674732,0x503529],71,true);
  const iron=workshopMaterial([0x51535a,0x353941,0x755244],113);
  const rust=workshopMaterial([0x95573a,0x683c2c,0xb8784c],131);
  const stone=workshopMaterial([0x958b78,0x73695e,0xa59d89],157);
  const brass=workshopMaterial([0xc6a15f,0x937243,0x72582e],191);
  const paper=workshopMaterial([0xd9c8a0,0xbcaa86,0x89754e],233);
  const dark=workshopMaterial([0x373239,0x26232a,0x52463c],251);
  const leather=workshopMaterial([0x62483c,0x3a302b,0x846350],279,true);
  const ores=[0x3d3a44,0xa98a56,0x8a8378].map(color=>new MeshStandardMaterial({color,roughness:.98}));
  const allMaterials=[timber,iron,rust,stone,brass,paper,dark,leather,...ores];
  const unit=new BoxGeometry(1,1,1);
  const wheel=new CylinderGeometry(1,1,1,12);
  const oreGeometry=new DodecahedronGeometry(1,0);
  const controls=new Map<CraterWorkstationId,Group>();
  const fills:Mesh[]=[];
  const orePiles:Mesh[][]=[[],[],[]];
  const dialKnobs:Mesh[]=[];
  const dialPointers:Group[]=[];
  const dialStatus:MeshStandardMaterial[]=[];
  const dialMarks:Group[]=[];
  const pressureStatus=new MeshStandardMaterial({color:0x69463a,roughness:.85});
  let pressurePointer:Group|undefined;
  let leverGrip:Mesh|undefined;
  const pressureSteps:Mesh[]=[];
  const pressureStepMaterial=new MeshStandardMaterial({color:0x82a987,roughness:.8});
  const pressureStepOff=new MeshStandardMaterial({color:0x483f36,roughness:.95});
  let bellowsFold:Group|undefined,scalePlatform:Group|undefined;
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
    const g=new Group();g.name='b-r30-'+site.id;g.position.set(site.center.east,site.center.height,-site.center.north);
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
      bellowsFold=new Group();bellowsFold.position.set(0,.87,-.12);g.add(bellowsFold);
      for(let i=0;i<5;i++){
        moving(leather,bellowsFold,0,.055+i*.049,0,1.06-i*.038,.042,.62-i*.028);
        moving(dark,bellowsFold,0,.079+i*.049,0,.99-i*.038,.012,.56-i*.028);
      }
      moving(timber,bellowsFold,0,.31,0,.91,.085,.54);
      for(const x of [-.39,.39])for(const z of [-.19,.19])moving(brass,bellowsFold,x,.36,z,.045,.026,.045);
      // Four iron strap ends and the leather chamber's stitched seams.
      for(const x of [-.53,.53])for(const z of [-.26,.04])fixed(rust,x,.84,z,.075,.10,.11);
      fixed(rust,-.52,.96,-.32,.24,.23,.21);
      fixed(iron,-.65,1.02,-.39,.32,.10,.10);
      bellowsHandle=new Group();bellowsHandle.position.set(0,1.16,-.36);g.add(bellowsHandle);
      moving(timber,bellowsHandle,0,0,.41,1.16,.10,.12);
      moving(iron,bellowsHandle,0,0,.10,.16,.10,.70);
      // Actual cold iron outlet: no light, flame or invented fuel reward.
      fixed(iron,.63,.91,-.29,.28,.22,.26);
      fixed(dark,.77,.91,-.29,.025,.14,.16);
      fixed(iron,-.62,.92,.27,.27,.08,.12);
      for(const x of [-.43,.43])fixed(brass,x,.72,.40,.055,.10,.05);
      // An actual pressure gauge and marked safe band, separate from handle stroke.
      fixed(iron,.53,1.37,-.25,.09,.66,.09);
      fixed(iron,.53,1.54,-.25,.39,.31,.11);
      fixed(paper,.53,1.54,-.185,.32,.24,.025);
      // The ruled 0.55–0.80 band is painted on the actual gauge face
      // with the same angular mapping as the pointer below.
      for(let i=0;i<=10;i++){
        const v=i/10,a=(.5-v)*2.2;
        const tick=moving(v>=.55&&v<=.8?pressureStepMaterial:dark,g,.53-Math.sin(a)*.115,1.48+Math.cos(a)*.115,-.164,.013,.027,.014);
        tick.rotation.z=a;
      }
      for(let i=0;i<5;i++){
        fixed(iron,.35+i*.09,1.397,-.15,.075,.058,.022);
        pressureSteps.push(moving(pressureStepOff,g,.35+i*.09,1.397,-.132,.052,.031,.018));
      }
      pressurePointer=needle(g,.53,1.48,-.15);pressurePointer.scale.set(.49,.49,.49);
      moving(pressureStatus,g,.53,1.68,-.19,.085,.045,.035);
      sign(g,site.label,1.31,-.12,1.35);
    }else if(site.id==='calibration'){
      table(1.58,.76,.73);fixed(iron,0,1.22,-.22,1.48,.86,.15);
      for(const x of [-.43,0,.43]){
        const dial=new Mesh(wheel,paper);dial.scale.set(.18,.045,.18);dial.rotation.x=Math.PI/2;dial.position.set(x,1.30,-.115);g.add(dial);
        // Raised bronze bezel, short tick marks and a physical centre spindle.
        const bezel=new Mesh(wheel,brass);bezel.scale.set(.205,.028,.205);bezel.rotation.x=Math.PI/2;bezel.position.set(x,1.30,-.145);g.add(bezel);
        for(let i=0;i<9;i++){
          const a=-2.3+i*.575;
          const tick=moving(dark,g,x+Math.sin(a)*.148,1.30+Math.cos(a)*.148,-.082,.014,.035,.015);
          tick.rotation.z=-a;
        }
        const p=needle(g,x,1.30,-.055);p.rotation.z=x*.9;dialPointers.push(p);
        const mark=new Group();mark.position.set(x,1.30,-.045);g.add(mark);dialMarks.push(mark);
        moving(brass,mark,0,.171,0,.032,.041,.027);
        const status=new MeshStandardMaterial({color:0x553b32,roughness:.8});
        dialStatus.push(status);moving(status,g,x,1.52,-.12,.07,.05,.025);
        moving(brass,g,x,1.30,-.025,.045,.045,.045);
        if(x===0)gauge=p;
        const knob=new Mesh(wheel,brass);knob.scale.set(.095,.07,.095);knob.rotation.x=Math.PI/2;knob.position.set(x,.89,.29);g.add(knob);dialKnobs.push(knob);
        moving(dark,knob,0,.56,0,.13,.40,.44);
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
        // Irregular individual fragments, not a flat solid block in the tray.
        for(let j=0;j<6;j++){
          const ore=new Mesh(oreGeometry,ores[i]);
          ore.name='sort-fragment-'+i+'-'+j;
          ore.position.set(x+((j%3)-1)*.125,.94+Math.floor(j/3)*.08,((j*7)%5-2)*.075);
          ore.scale.set(.065+(j%2)*.023,.054+(j%3)*.013,.066);
          ore.rotation.set(j*.73,i+j*1.1,j*.51);
          ore.visible=false;g.add(ore);orePiles[i].push(ore);
        }
        sign(g,['星尘','废料','碎石'][i],.79,.455,.49);
      }
      for(let i=0;i<3;i++)fixed(ores[i],(i-1)*.38,1.02,-.38,.17,.16,.12);
      sign(g,site.label,1.34,-.31,1.66);
    }else if(site.id==='weighing'){
      fixed(stone,0,.09,0,1.36,.18,.95);
      fixed(iron,0,.26,0,1.24,.16,.86);
      scalePlatform=new Group();scalePlatform.position.y=.37;g.add(scalePlatform);
      for(let i=0;i<5;i++)moving(iron,scalePlatform,(i-2)*.19,0,0,.13,.06,.78);
      for(const x of [-.57,.57])fixed(rust,x,.29,0,.06,.16,.84);
      for(const x of [-.48,.48])for(const z of [-.32,.32])fixed(brass,x,.41,z,.06,.035,.06);
      fixed(iron,0,.78,-.37,.13,1.19,.13);
      fixed(iron,0,1.36,-.30,.65,.36,.16);
      fixed(paper,0,1.36,-.205,.52,.28,.03);
      weighNeedle=needle(g,0,1.34,-.18);weighNeedle.scale.set(.52,.52,.52);
      for(let i=0;i<7;i++){
        const a=-1.25+i*.416;
        const tick=moving(dark,g,Math.sin(a)*.18,1.29+Math.cos(a)*.18,-.18,.012,.035,.015);
        tick.rotation.z=-a;
      }
      fixed(rust,0,.62,-.25,.26,.07,.23);
      sign(g,site.label,1.56,-.19,.62);
    }else{
      fixed(stone,0,.12,0,.91,.24,.64);
      fixed(iron,0,.35,0,.61,.27,.42);fixed(rust,-.30,.72,0,.11,.73,.15);
      lever=new Group();lever.position.set(0,.48,0);g.add(lever);
      moving(iron,lever,0,.39,0,.075,.78,.075);leverGrip=moving(timber,lever,0,.83,0,.34,.095,.095);
      fixed(rust,-.22,.42,.14,.20,.21,.12);fixed(rust,.22,.42,.14,.20,.21,.12);
      fixed(brass,0,.48,.23,.19,.19,.10);
      fixed(iron,-.35,.29,-.12,.25,.085,.35);
      fixed(iron,-.35,.29,-.29,.10,.085,.17);
      fixed(rust,.43,1.80,-.22,.32,.07,.31);
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
  type ControlTarget={station:CraterWorkstationId;index?:0|1|2;point:Point;radius:number};
  const targets:ControlTarget[]=sites.flatMap<ControlTarget>(s=>{
    if(s.id!=='calibration'&&s.id!=='sorting')return [{station:s.id,point:s.target,radius:.36}];
    const xStep=s.id==='calibration'?.43:.61;
    return ([0,1,2] as const).map(index=>{
      const x=(index-1)*xStep;
      return {station:s.id,index,point:{east:s.target.east+x*Math.cos(s.yaw),north:s.target.north+x*Math.sin(s.yaw),height:s.target.height},radius:s.id==='calibration'?.16:.22};
    });
  });
  function aimControl(feet:Point,heading:number,pitch:number,eyeHeight:number):ControlTarget|null{
    if(![feet.east,feet.north,feet.height,heading,pitch,eyeHeight].every(Number.isFinite))return null;
    ray.origin.set(feet.east,feet.height+eyeHeight,-feet.north);
    ray.direction.set(Math.sin(heading)*Math.cos(pitch),Math.sin(pitch),-Math.cos(heading)*Math.cos(pitch));
    let best:ControlTarget|null=null,score=Infinity;
    for(const t of targets){
      const s=sites.find(s=>s.id===t.station)!;
      const dx=feet.east-s.center.east,dn=feet.north-s.center.north;
      if(dx*Math.sin(s.yaw)-dn*Math.cos(s.yaw)<.38||
        Math.hypot(feet.east-s.foot.east,feet.north-s.foot.north)>1.2||
        Math.abs(feet.height-s.foot.height)>.45)continue;
      point.set(t.point.east,t.point.height,-t.point.north);delta.subVectors(point,ray.origin);
      if(delta.dot(ray.direction)<=0||delta.length()>2.5)continue;
      const miss=ray.distanceSqToPoint(point);
      if(miss<=t.radius*t.radius&&miss<score){best=t;score=miss;}
    }
    return best;
  }
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
    const stroke=clamped(view.bellowsStroke),gaugeValue=clamped(view.gaugeNeedle),weight=clamped(view.weighingNeedle);
    bellowsHandle!.rotation.x=-stroke*.35;
    bellowsFold!.scale.y=1-stroke*.53;
    gauge!.rotation.z=(gaugeValue-.5)*2.1;
    if(pressurePointer)pressurePointer.rotation.z=(.5-clamped(view.bellowsPressure??0))*2.2;
    pressureStatus.color.set(view.bellowsCast?0xd9ba72:view.bellowsInBand?0x83b47d:0x69463a);
    pressureSteps.forEach((step,i)=>{step.material=view.bellowsCast||clamped(view.bellowsHeld??0)>=(i+1)/pressureSteps.length?pressureStepMaterial:pressureStepOff;});
    dialMarks.forEach((m,i)=>{const a=view.calibrationTargets?.[i];m.visible=a!==undefined&&Number.isFinite(a);m.rotation.z=-(a??0);});
    if(view.calibrationAngles){
      dialPointers.forEach((p,i)=>{const a=view.calibrationAngles![i];p.rotation.z=Number.isFinite(a)?-a:0;});
      dialKnobs.forEach((k,i)=>{const a=view.calibrationAngles![i];k.rotation.set(Math.PI/2,0,0);k.rotateY(Number.isFinite(a)?a:0);});
    }else if(dialKnobs[1])dialKnobs[1].rotation.y=gaugeValue*3.4;
    dialStatus.forEach((m,i)=>{m.color.set(view.calibrationLocked?.[i]?0x78ac7d:0x553b32);});
    fills.forEach((m,i)=>{
      const fill=clamped(view.sortingFill[i]),h=.015+fill*.10;
      m.scale.y=h;m.position.y=.885+h/2;
      orePiles[i].forEach((ore,j)=>{ore.visible=(j+1)/orePiles[i].length<=fill;});
    });
    scalePlatform!.position.y=.37-weight*.035;
    weighNeedle!.rotation.z=(weight-.5)*2;
    lever!.rotation.z=view.turnout==='branch'?.44:-.44;
    if(leverGrip){
      // Match the real moved grip, not the old neutral-position sphere.
      // Object matrices are refreshed even before the next rendered frame.
      root.updateMatrixWorld(true);
      const v=leverGrip.getWorldPosition(new Vector3());
      const hit=targets.find(t=>t.station==='turnout');
      if(hit)hit.point={east:v.x,north:-v.z,height:v.y};
    }
    signal!.color.set(view.turnout==='branch'?0x78ac7d:0xaa4c3f);
    signal!.emissive.set(view.turnout==='branch'?0x294e2d:0x68251b);
  }
  show({bellowsStroke:0,gaugeNeedle:0,sortingFill:[0,0,0],weighingNeedle:0,turnout:'straight'});
  function dispose(){
    root.removeFromParent();
    const geometries=new Set<import('three').BufferGeometry>();
    root.traverse(o=>{if(o instanceof Mesh){geometries.add(o.geometry);if(o.material instanceof MeshBasicMaterial){o.material.map?.dispose();o.material.dispose();}}});
    for(const geo of geometries)geo.dispose();
    for(const mat of allMaterials){mat.map?.dispose();mat.dispose();}signal?.dispose();dialStatus.forEach(m=>m.dispose());pressureStatus.dispose();pressureStepMaterial.dispose();pressureStepOff.dispose();unit.dispose();wheel.dispose();oreGeometry.dispose();
  }
  return {group:root,sites,colliders:sites.map(s=>s.footprint),aim,aimControl,targets,show,dispose};
}

/** Production attachment for the A-window's sole viewer writer. Invoke once
 * AFTER real rail samples exist, BEFORE rebuilding westWalkGeometry. Models
 * and solid envelopes enter the same west road root; never add a second
 * collision index or attach duplicate props to the rail scene. */
type RoadRoot = Road & {group:Group};
type WorkshopMount = ReturnType<typeof mountCraterWorkstations>;
const attachedWorkshops=new WeakMap<Group,WorkshopMount>();
export function installCraterWorkshopWorld(road:RoadRoot,rail:Rails):WorkshopMount {
  const current=attachedWorkshops.get(road.group);
  if(current)return current;
  const old=road.group.userData.colliders;
  if(!Array.isArray(old))throw Error('The real ZA22 west collision list must be mounted first');
  const model=mountCraterWorkstations(road.group,road,rail);
  const colliders=[...model.colliders];
  road.group.userData.colliders=[...old,...colliders];
  const installed={...model,dispose(){
    if(attachedWorkshops.get(road.group)!==installed)return;
    road.group.userData.colliders=(road.group.userData.colliders as Box[]).filter(b=>!colliders.includes(b));
    attachedWorkshops.delete(road.group);
    model.dispose();
  }};
  attachedWorkshops.set(road.group,installed);
  return installed;
}
