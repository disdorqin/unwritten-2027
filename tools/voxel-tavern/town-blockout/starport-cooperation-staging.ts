import {BoxGeometry,CanvasTexture,Group,InstancedMesh,Mesh,MeshBasicMaterial,MeshLambertMaterial,
  PlaneGeometry,SRGBColorSpace,type Object3D} from 'three';
import type {AircraftPoint} from '../../../src/shared/aircraft-flight';
import {sampleNorthRidge350} from './north-ridge-350-terrain';
import {mountStarportCarryFormation} from './starport-cooperation-procession';

/** D scene anchors consumed by B's authoritative event. Coordinates in the
 * existing town / front-ridge frame; no new client event or ignition clock. */
export const starportCooperationRouteAnchors=Object.freeze([
  {id:'plaza',east:226,north:223,domain:'town'},
  {id:'north-belt',east:270,north:400,domain:'town'},
  {id:'mountain-pass',east:290,north:300,domain:'town'},
  {id:'base-queue',east:526,north:329,domain:'town'},
  {id:'middle-platform',east:440,north:520,domain:'town'},
  {id:'cloud-terminal',east:336,north:640,domain:'summit'},
  {id:'cloud-approach',east:336,north:655,domain:'summit'},
  {id:'assembly',east:324,north:655,domain:'summit'},
] as const);
export const starportCrowdAnchors=Object.freeze(Array.from({length:12},(_,i)=>Object.freeze({
  east:337+(i%4)*2.05,north:655+(Math.floor(i/4))*.95,height:347,
})));
export const starportAssemblySignText='大烟花架 · 除夕用';

export function mountStarportCooperationStaging(parent:Object3D,anchor:AircraftPoint){
  const group=new Group();group.name='starport-cooperation-staging';parent.add(group);
  const geometry=new BoxGeometry();
  const wood=new MeshLambertMaterial({color:'#725037'}),iron=new MeshLambertMaterial({color:'#475961'}),
    brass=new MeshLambertMaterial({color:'#b59669'}),red=new MeshLambertMaterial({color:'#a74332'}),
    canvasMat=new MeshLambertMaterial({color:'#d9c9a8'});
  const darkWood=new MeshLambertMaterial({color:'#4d3e32'}),rope=new MeshLambertMaterial({color:'#b5a080'}),
    seed=new MeshLambertMaterial({color:'#9a7954'}),paper=new MeshLambertMaterial({color:'#ebe0bd'});
  const mats=[wood,iron,brass,red,canvasMat,darkWood,rope,seed,paper];
  const blockers:{east:number;north:number;width:number;depth:number;bottom:number;top:number}[]=[];
  function box(name:string,material:MeshLambertMaterial,e:number,n:number,y:number,w:number,d:number,h:number,solid=false){
    const mesh=new Mesh(geometry,material);mesh.name=name;
    mesh.position.set(e,y,-n);mesh.scale.set(w,h,d);group.add(mesh);
    if(solid)blockers.push({east:e,north:n,width:w,depth:d,bottom:y-h/2,top:y+h/2});
    return mesh;
  }
  const sign={east:anchor.east+6.3,north:anchor.north+.10,height:anchor.height};
  for(const x of [-.85,.85]){
    box('cooperation-sign-stake',wood,sign.east+x,sign.north,sign.height+.91,.15,.19,1.82,true);
    box('cooperation-sign-boot',iron,sign.east+x,sign.north,sign.height+.10,.35,.34,.20,true);
  }
  box('cooperation-sign-board',wood,sign.east,sign.north,sign.height+1.75,2.20,.14,.72,true);
  let face:Mesh<PlaneGeometry,MeshBasicMaterial>|undefined;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=960;canvas.height=288;
    const ctx=canvas.getContext('2d');
    if(ctx){
      ctx.fillStyle='#65432e';ctx.fillRect(0,0,960,288);
      ctx.strokeStyle='#d3a75d';ctx.lineWidth=12;ctx.strokeRect(10,10,940,268);
      ctx.fillStyle='#f3ddaa';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold 86px Microsoft YaHei,sans-serif';ctx.fillText(starportAssemblySignText,480,145,880);
      const tex=new CanvasTexture(canvas);tex.colorSpace=SRGBColorSpace;
      face=new Mesh(new PlaneGeometry(2.08,.64),new MeshBasicMaterial({map:tex,side:2}));
      face.name='starport-cooperation-sign-text';face.position.set(sign.east,sign.height+1.75,-sign.north+.078);group.add(face);
    }
  }
  // Tools and packing cases are outside the fitted rack's approach and
  // copper takeoff marks (N662). The three operation sockets are untouched.
  const crates=[{e:anchor.east-5.5,n:anchor.north+.5},{e:anchor.east-7.0,n:anchor.north+.5}];
  for(const {e,n}of crates){
    const y=sampleNorthRidge350(e,n);
    box('starport-packing-crate',wood,e,n,y+.36,1.15,.86,.72,true);
    for(const dx of [-.39,.39]){
      box('starport-crate-iron-strap',iron,e+dx,n,y+.36,.07,.88,.74);
      box('starport-crate-brass-corner',brass,e+dx,n-.44,y+.62,.13,.04,.14);
    }
    box('starport-crate-label',canvasMat,e,n-.445,y+.43,.52,.025,.27);
  }
  // Flat painted crowd markers are *scene anchors*, not NPC bodies and not
  // a new authority. The future B event controls occupancy and locomotion.
  for(const point of starportCrowdAnchors){
    if(sampleNorthRidge350(point.east,point.north)<346.99)continue;
    box('starport-crowd-mark',brass,point.east,point.north,point.height+.018,.54,.42,.036);
  }
  const anchorGroup=new Group();anchorGroup.name='starport-event-actor-anchors';group.add(anchorGroup);
  for(const [index,point]of starportCrowdAnchors.entries()){
    const marker=new Group();marker.name='starport-crowd-'+index;marker.position.set(point.east,point.height,-point.north);anchorGroup.add(marker);
  }
  // First-event-only rope, fabric, carrying handles, popcorn/seed baskets.
  // Prepared scenery is visible in the empty state; human actors are not.
  const propX=anchor.east-5.7,propN=anchor.north+1.75,propY=sampleNorthRidge350(propX,propN);
  box('starport-tool-bench',wood,propX,propN,propY+.47,1.95,.74,.94,true);
  box('starport-folded-red-cloth',red,propX-.42,propN,propY+.98,.58,.42,.11);
  box('starport-wrench',iron,propX+.24,propN,propY+.98,.55,.09,.07).rotation.y=.27;
  box('starport-cooperation-handle',brass,propX+.58,propN,propY+.98,.17,.36,.06);
  // Wooden carrying poles and coiled rope remain props (no inventory or
  // event authority). Keep the aisle immediately south of the rack open.
  for(const a of [-1,1]){
    box('starport-carry-pole',darkWood,propX,propN+a*.18,propY+1.05,1.74,.095,.095);
    for(let j=0;j<4;j++)box('starport-pole-strap',rope,propX-.5+j*.34,propN+a*.18,propY+1.10,.065,.11,.07);
  }
  for(let j=0;j<8;j++){
    const angle=j*Math.PI/4;
    box('starport-rope-coil',rope,propX-.54+Math.cos(angle)*.16,propN+.20+Math.sin(angle)*.16,propY+1.12,.14,.10,.065).rotation.y=-angle;
  }
  // Two seed baskets beyond the east end of the viewer line. Actual baskets
  // share ground support and collision; no actors are spawned by this layer.
  for(const [e,n]of [[345.1,655.8],[345.1,657.0]] as const){
    const y=sampleNorthRidge350(e,n);if(y<346.99)continue;
    box('starport-seed-basket-base',darkWood,e,n,y+.12,.48,.48,.24,true);
    for(const s of [-1,1]){
      box('starport-seed-basket-wall',wood,e+s*.21,n,y+.31,.07,.48,.26,true);
      box('starport-seed-basket-wall',wood,e,n+s*.21,y+.31,.48,.07,.26,true);
      for(let j=0;j<3;j++)box('starport-seed-basket-weave',rope,e+s*.25,n,y+.23+j*.075,.035,.49,.023);
    }
    box('starport-basket-paper',paper,e,n,y+.30,.35,.35,.045);
    for(let j=0;j<9;j++)box('starport-seed',seed,e+(j%3-1)*.11,n+(Math.floor(j/3)-1)*.11,y+.36,.065,.085,.048);
  }
  // All static wooden/iron props use one box geometry. Preserve transforms
  // and analytical collision; keep sign texture and actor anchors separate.
  for(const material of mats){
    const parts=group.children.filter((child):child is Mesh=>child instanceof Mesh&&child.geometry===geometry&&child.material===material);
    if(!parts.length)continue;
    const batch=new InstancedMesh(geometry,material,parts.length);
    batch.name='starport-staging-batch-'+material.color.getHexString();
    for(const [index,part]of parts.entries()){part.updateMatrix();batch.setMatrixAt(index,part.matrix);group.remove(part)}
    batch.instanceMatrix.needsUpdate=true;batch.computeBoundingSphere();group.add(batch);
  }
  const procession=mountStarportCarryFormation(group);
  return {group,anchors:anchorGroup,route:starportCooperationRouteAnchors,crowd:starportCrowdAnchors,procession,
    blocked(feet:AircraftPoint,radius:number,bodyHeight:number){
      return blockers.some(b=>feet.height+bodyHeight>b.bottom&&feet.height<b.top&&Math.hypot(
        Math.max(0,Math.abs(feet.east-b.east)-b.width/2),Math.max(0,Math.abs(feet.north-b.north)-b.depth/2))<radius);
    },
    dispose(){procession.dispose();group.removeFromParent();geometry.dispose();mats.forEach(m=>m.dispose());face?.material.map?.dispose();face?.material.dispose();face?.geometry.dispose()}
  };
}
