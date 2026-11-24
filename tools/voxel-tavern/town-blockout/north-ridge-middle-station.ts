import {BoxGeometry,CanvasTexture,Group,InstancedMesh,Matrix4,Mesh,MeshBasicMaterial,
  MeshLambertMaterial,PlaneGeometry,SRGBColorSpace,type Object3D} from 'three';
import {northRidgeCableAnchors,northRidgeMidStation} from './north-ridge-350-terrain';
import {STATION_BOARD_TEXTS} from './front-ridge-switchback-road';

const [east,north]=northRidgeCableAnchors[1];
export const middleStationFoot=Object.freeze({east,north,height:northRidgeMidStation.height});
const station=middleStationFoot;
export const middleStationWaitingPoints=Object.freeze({
  up:{east:station.east+4.2,north:station.north-2.4,height:station.height},
  down:{east:station.east-4.2,north:station.north-2.4,height:station.height},
});
const palette={stone:'#777b78',timber:'#725139',iron:'#4c606b',brass:'#b59669',
  snow:'#c6d7dc',glass:'#789d9d',sign:'#443426',light:'#e4b675',
  stoneDark:'#545c60',woodLight:'#a48564',snowShadow:'#a2b4bd'} as const;
type Finish=keyof typeof palette;
type Box={e:number;n:number;y:number;w:number;d:number;h:number};

export function middleStationSurfaceAt(e:number,n:number,radius=.27){
  // The original cable anchor is also the surveyed T5 centreline.
  // No new height field: only the flat, actual 12x8m raised platform.
  if(Math.abs(e-station.east)<=6-radius&&Math.abs(n-station.north)<=4-radius)return station.height;
}
export function mountNorthRidgeMiddleStation(parent:Object3D){
  const group=new Group();group.name='north-ridge-middle-station';parent.add(group);
  const geom=new BoxGeometry();
  const parts=new Map<Finish,Matrix4[]>();
  const solids:Box[]=[];
  const materials=new Map<Finish,MeshLambertMaterial>();
  function add(f:Finish,e:number,n:number,y:number,w:number,d:number,h:number,solid=false){
    const matrix=new Matrix4().makeScale(w,h,d);
    matrix.setPosition(station.east+e,station.height+y,-station.north-n);
    const batch=parts.get(f)??[];batch.push(matrix);parts.set(f,batch);
    if(solid)solids.push({e:station.east+e,n:station.north+n,y:station.height+y,w,d,h});
  }
  // Same dark iron, wood and brass family as the existing cable terminal.
  // Keep both cable lanes and the T5 centreline unobstructed.
  add('stone',0,0,-.22,12,8,.44);
  for(let e=-5.5;e<=5.6;e+=.8)for(let n=-3.4;n<=3.5;n+=1.7){
    add(Math.round((e+6)*10+(n+4)*10)%3?'timber':'woodLight',e,n,.016,.77,1.65,.032);
    if(Math.abs(e)>4.7&&Math.round((e+6)*10+(n+4)*10)%4===0)add('snowShadow',e,n,.043,.51,.74,.019);
  }
  // Layered exposed stone foundation and timber edge beam, as in ref-m28.
  for(const side of [-1,1])for(let i=0;i<7;i++){
    const e=-5.2+i*1.73;
    add(i%2?'stone':'stoneDark',e,side*3.96,-.38,1.64,.18,.28);
    add('timber',e,side*3.94,-.06,1.69,.23,.18);
    add('iron',e,side*3.97,-.06,.075,.27,.24);
  }
  for(const s of [-1,1]){
    // Sheltered waiting bays on outer wings; not across cabin sweep.
    for(const n of [-3.35,3.35])for(const e of [s*3.6,s*5.5]){
      add('stone',e,n,.20,.58,.58,.40,true);
      add('iron',e,n,1.75,.19,.19,3.1,true);
      add('brass',e,n,3.18,.34,.34,.18);
    }
    add('timber',s*4.55,0,3.30,2.75,7.65,.24);
    for(let r=0;r<3;r++)add('snow',s*4.55,0,3.48+r*.12,2.76-r*.65,7.74-r*.1,.15);
    // Sheltered outer walls and narrow glazing do not cross the boarding lane.
    for(const n of [-2.5,2.5]){
      add('woodLight',s*5.72,n,1.09,.17,2.44,2.18,true);
      add('stone',s*5.72,n,.24,.25,2.54,.48,true);
      add('timber',s*5.73,n,2.78,.22,2.44,.21);
    }
    add('glass',s*5.72,0,1.86,.10,1.46,1.12,true);
    for(const n of [-.75,0,.75])add('iron',s*5.70,n,1.86,.16,.075,1.21);
    for(const y of [1.29,1.86,2.43])add('iron',s*5.70,0,y,.16,1.52,.075);
    for(let j=0;j<8;j++){
      const n=-3.5+j;
      add('timber',s*4.55,n,3.15,2.55,.095,.15);
      if(j%2===0)add('snowShadow',s*4.68,n,3.57,1.20,.64,.12);
    }
    // Low boarding platform edge markers. Opposing car centre lanes untouched.
    for(const n of [-2.7,2.7])add('brass',s*2.88,n,.045,.50,.22,.036);
    add('iron',s*5.64,0,3.16,.16,7.7,.18);
    for(let n=-2.9;n<=2.9;n+=.55)add('timber',s*5.34,n,.48,.38,.53,.13,true);
    add('stone',s*5.34,0,.24,.32,6,.38,true);
    for(const n of [-3.05,3.05]){
      add('brass',s*5.4,n,2.38,.35,.35,.45);
      add('light',s*5.4,n,2.34,.21,.22,.23);
    }
    // Mark direction pads by visible brass strips; centre walkway clear.
    for(let n=-2.4;n<=2.4;n+=1.2)add('brass',s*3.1,n,.04,.12,.75,.045);
  }
  // A sheltered bell and hardware cupboard at the outer rear of each bay.
  for(const s of [-1,1]){
    add('timber',s*5.27,2.95,1.19,.58,.55,1.19,true);
    add('iron',s*5.27,2.65,1.31,.42,.055,.58);
    add('brass',s*5.27,2.61,1.31,.07,.05,.08);
    add('iron',s*4.55,-3.21,2.79,.13,.13,.55);
    add('brass',s*4.55,-3.21,2.50,.33,.33,.24);
    add('brass',s*4.55,-3.21,2.34,.43,.43,.10);
  }
  for(const [f,matrices]of parts){
    const material=new MeshLambertMaterial({color:palette[f]});materials.set(f,material);
    const mesh=new InstancedMesh(geom,material,matrices.length);
    mesh.name='middle-station-'+f;matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));
    mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  let board:Mesh<PlaneGeometry,MeshBasicMaterial>|undefined;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=1152;canvas.height=576;
    const ctx=canvas.getContext('2d');
    if(ctx){
      const canonical=STATION_BOARD_TEXTS.find(b=>b.id==='S-16')!;
      ctx.fillStyle='#443426';ctx.fillRect(0,0,1152,576);ctx.strokeStyle='#515960';ctx.lineWidth=18;ctx.strokeRect(10,10,1132,556);
      ctx.fillStyle='#efe5cf';ctx.textAlign='center';ctx.font='bold 84px Microsoft YaHei,sans-serif';ctx.fillText(canonical.title,576,140,1060);
      ctx.font='48px Microsoft YaHei,sans-serif';canonical.lines.forEach((line,i)=>ctx.fillText(line,576,245+i*104,1040));
      const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
      // Put the printed face inside the east shelter, towards the waiting aisle.
      // A double-sided plane at the south eave was mirrored from inside and
      // occluded by its own bell; the wall-mounted face is front-facing.
      board=new Mesh(new PlaneGeometry(2.0,1.0),new MeshBasicMaterial({map:texture}));
      board.name='middle-station-direction-board';board.rotation.y=-Math.PI/2;
      board.position.set(station.east+5.60,station.height+2.08,-station.north-2.10);group.add(board);
    }
  }
  return {group,surfaceAt:middleStationSurfaceAt,waiting:middleStationWaitingPoints,
    blocked(e:number,n:number,feet:number,radius:number,bodyHeight=1.8){
      return solids.some(s=>feet+bodyHeight>s.y-s.h/2&&feet<s.y+s.h/2&&
        Math.hypot(Math.max(0,Math.abs(e-s.e)-s.w/2),Math.max(0,Math.abs(n-s.n)-s.d/2))<radius);
    },
    setNight(night:boolean){const light=materials.get('light');if(light){light.emissive.set(night?'#e4b675':'#000000');light.emissiveIntensity=night?.55:0}},
    dispose(){group.removeFromParent();geom.dispose();materials.forEach(m=>m.dispose());board?.material.map?.dispose();board?.material.dispose();board?.geometry.dispose();}
  };
}
