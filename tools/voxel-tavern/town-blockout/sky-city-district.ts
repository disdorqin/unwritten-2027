import {
  BoxGeometry, CanvasTexture, Color, CylinderGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, MeshLambertMaterial, OctahedronGeometry,
  MeshStandardMaterial, Object3D, PlaneGeometry, PointLight, SRGBColorSpace, type BufferGeometry,
} from 'three';
import {createSkyCitySurfaceGrain} from './sky-city-surface-grain';

type Solid = { x:number; z:number; y:number; w:number; d:number; h:number };
type Plot = { name:string; x:number; z:number; w:number; d:number; use:'home'|'clinic'|'seed'|'gallery'|'glasshouse' };
export const skyCityDistrictPlots: readonly Plot[] = [
  {name:'医务室',x:22,z:13,w:8,d:7,use:'clinic'},
  {name:'种子库',x:34,z:5,w:8,d:7,use:'seed'},
  {name:'东一民居',x:30,z:27,w:7,d:6,use:'home'},
  {name:'东二民居',x:43,z:18,w:7,d:6,use:'home'},
  {name:'东三民居',x:44,z:-6,w:7,d:6,use:'home'},
  {name:'北一民居',x:23,z:-30,w:7,d:6,use:'home'},
  {name:'船件陈列室',x:-32,z:-24,w:10,d:8,use:'gallery'},
  {name:'温室',x:39,z:-27,w:10,d:8,use:'glasshouse'},
];
export function insideSkyCityDistrictFootprint(x:number,z:number,margin=.55){
  return skyCityDistrictPlots.some(p=>Math.abs(x-p.x)<=p.w/2+margin&&Math.abs(z-p.z)<=p.d/2+margin);
}
const colors = {
  ivory:'#e4dfc7', stone:'#aaa992', dark:'#52645d', bronze:'#99835e',
  wood:'#886e52', copper:'#6c8e85', glass:'#b3cbb4', leaf:'#779e58',
  pale:'#d7d9a4', cloth:'#647d72', clay:'#b27c57', paper:'#ddd2ac', clearGlass:'#b3d5c9',
  sandstone:'#b9a78c', mortar:'#837b6a', brass:'#b89963', slate:'#566c73', rust:'#956d4c',
} as const;
type Finish = keyof typeof colors;

/** ZD-05 continuation: no new terrain, no player-domain or ignition authority.
 * Static geometry and solid envelopes share the same dimensions. Empty city
 * is the sole shipped presentation; dream lighting is reserved to its host.
 */
export function buildSkyCityDistrict(supports:(x:number,z:number,radius?:number)=>boolean) {
  const group = new Group(); group.name='sky-city-residential-and-service-quarter';
  const solids:Solid[]=[];
  const box=new BoxGeometry(), column=new CylinderGeometry(.5,.5,1,8);
  const tmp=new Object3D();
  const batches=new Map<string,{geometry:BufferGeometry;material:MeshLambertMaterial; matrices:typeof tmp.matrix[];tints:Color[]}>();
  const opaque=new MeshLambertMaterial({color:'#ffffff',map:createSkyCitySurfaceGrain()});
  const translucent=new MeshLambertMaterial({color:'#ffffff',transparent:true,opacity:.32,depthWrite:false});
  const lanterns=new Group(); lanterns.name='sky-city-dream-street-lanterns'; lanterns.visible=false;
  group.add(lanterns);
  const glow = new MeshStandardMaterial({color:'#f2b375',emissive:'#f6a65d',emissiveIntensity:.8,roughness:.7});
  const anchorGroup=new Group(); anchorGroup.name='sky-city-soul-anchors'; group.add(anchorGroup);
  function part(f:Finish,x:number,y:number,z:number,w:number,h:number,d:number,solid=false,yaw=0,geo:BufferGeometry=box) {
    // Opaque colors share the same shader and geometry. Keep transparent
    // panes separate for sorting, and preserve every transform and tint.
    const key=(f==='clearGlass'?'translucent':'opaque')+'-'+geo.type;
    let batch=batches.get(key);
    if(!batch) batches.set(key,batch={geometry:geo,material:f==='clearGlass'?translucent:opaque,matrices:[],tints:[]});
    tmp.position.set(x,y,z);tmp.rotation.set(0,yaw,0);tmp.scale.set(w,h,d);tmp.updateMatrix();
    batch.matrices.push(tmp.matrix.clone());batch.tints.push(new Color(colors[f]));
    if(solid) solids.push({x,z,y,w,h,d});
  }
  function lamp(x:number,z:number) {
    part('stone',x,.18,z,.55,.36,.55,true);
    part('bronze',x,1.28,z,.15,2.2,.15,true);
    part('dark',x,2.44,z,.49,.18,.49);
    part('glass',x,2.19,z,.33,.32,.33);
    const bulb=new Mesh(box,glow);bulb.position.set(x,2.19,z);bulb.scale.set(.35,.34,.35);lanterns.add(bulb);
  }
  function furniture(p:Plot) {
    const {x,z,w,d,use}=p;
    const west=x-w/2+.72,north=z-d/2+.68;
    if(use==='clinic'){
      for(const a of [-1,1]){
        part('wood',x+a*1.7,.42,north+1.1,1.25,.75,2.1,true);
        part('paper',x+a*1.7,.85,north+1.1,1.15,.15,2);
        part('cloth',x+a*1.7,.98,north+1.4,1.12,.08,1.35);
      }
      part('wood',west+.35,1.05,z+1.2,.7,2.1,2.4,true);
      for(let i=0;i<6;i++){
        const by=.65+(i%3)*.55,bz=z+.7+Math.floor(i/3)*.62;
        part(i%2?'glass':'clay',west+.75,by,bz,.23,.34,.23,false,0,column);
        part('bronze',west+.75,by+.20,bz,.25,.07,.25,false,0,column);
      }
      // Individual pillows, folded bandage stacks and examination side tables.
      for(const a of [-1,1]){
        part('paper',x+a*1.7,1.03,north+.30,1.02,.16,.46);
        part('wood',x+a*1.7+a*.93,.46,north+1.62,.42,.92,.48,true);
        part('paper',x+a*1.7+a*.93,.95,north+1.62,.31,.12,.30);
      }
      part('wood',x+w/2-1.0,.57,z+.85,1.15,.98,1.4,true);
      part('paper',x+w/2-1.0,1.10,z+.85,.68,.045,.82);
      part('bronze',x+w/2-1.0,1.23,z+.40,.34,.12,.22);
    }else if(use==='seed'||use==='gallery'){
      for(const a of [-1,1]){
        part('wood',x+a*(w/2-1),1.15,z-.4,.65,2.3,d-2,true);
        for(let i=0;i<4;i++){
          part('bronze',x+a*(w/2-1.38),.35+i*.55,z-.4,.1,.09,d-2);
          for(let j=0;j<5;j++){
            const px=x+a*(w/2-1.45),py=.60+i*.55,pz=north+.55+j*.82;
            part(use==='seed'?(j%3===0?'glass':'clay'):'copper',px,py,pz,.32,.36,.3,false,0,column);
            part('bronze',px,py+.21,pz,.34,.07,.32,false,0,column);
            part('paper',px-a*.168,py,pz,.023,.15,.16);
          }
        }
      }
      if(use==='gallery'){
        part('stone',x,.35,z-1.7,2.5,.7,1.2,true);
        part('copper',x,1.15,z-1.7,1.65,.9,.94,false,0,column);
        part('bronze',x,1.66,z-1.7,1.8,.12,.99);
        // Exhibition: a retired hull section, brass instrument and six log slots.
        for(let i=0;i<7;i++){
          const a=Math.PI*i/6;
          part('bronze',x+Math.cos(a)*.93,1.08+Math.sin(a)*.78,z-1.7,.16,.18,1.1);
        }
        for(let i=0;i<6;i++){
          const px=x-1.6+i*.64;
          part('wood',px,1.04,z-d/2+.43,.6,1.95,.58,true);
          part('dark',px,1.35,z-d/2+.75,.48,.55,.07);
          if(i!==3)part('paper',px,1.35,z-d/2+.82,.29,.45,.14);
        }
      }
    }else if(use==='glasshouse'){
      for(const a of [-1,1]){
        part('wood',x+a*2.7,.32,z,1.5,.64,d-2,true);
        for(let i=0;i<6;i++){
          const px=x+a*2.7,pz=z-d/2+1.4+i*.83;
          part('mortar',px,.67,pz,.64,.14,.68);
          part('leaf',px,.91,pz,.54,.7,.54,false,.4);
          for(let j=0;j<3;j++){
            part('leaf',px+(j-1)*.19,1.11+j*.14,pz+.12,.30,.22,.28,false,j*.52);
            part('pale',px+(j-1)*.19,1.26+j*.14,pz+.12,.17,.14,.18);
          }
          if(i%2===0)part('copper',px,1.80,pz,.07,2.3,.07);
        }
      }
    }else{
      part('wood',west+.85,.45,north+1.05,1.45,.8,2.2,true);
      part('cloth',west+.85,.9,north+1.05,1.32,.13,2);
      part('wood',x+w/2-1.3,.56,z-.7,1.3,1.02,.85,true);
      part('paper',x+w/2-1.3,1.09,z-.7,.55,.04,.48);
    }
  }
  const accepted:string[]=[];
  for(const p of skyCityDistrictPlots){
    const {x,z,w,d,use}=p;
    if(!supports(x,z,Math.hypot(w/2,d/2)+.6))continue;
    accepted.push(p.name);
    const wall=use==='glasshouse'?'clearGlass':'ivory';
    part('stone',x,-.08,z,w+.28,.16,d+.28);
    // Finished ashlar floor sits just above spring turf. Thin tile joints
    // and a muted central runner are visible at player eye height.
    part('stone',x,.028,z,w-.35,.056,d-.35);
    for(let ex=x-w/2+.52;ex<x+w/2-.36;ex+=.72){
      for(let nz=z-d/2+.48;nz<z+d/2-.35;nz+=.72){
        part((Math.round(ex*4)+Math.round(nz*3))%5?'ivory':'pale',ex,.060,nz,.69,.020,.69);
      }
    }
    for(let nz=z-d/2+.55;nz<z+d/2-.35;nz+=.56)
      part('stone',x,.078,nz,1.16,.016,.53);
    for(const a of [-1,1]){
      part('stone',x+a*w/2,.25,z,.40,.5,d);
      part(wall,x+a*w/2,1.85,z,.35,2.7,d,true);
      for(let k=0;k<3;k++)part('bronze',x+a*w/2,1.2+k*.72,z,.42,.05,d+.12);
      for(const b of [-1,1])part('stone',x+a*w/2,1.75,z+b*d/2,.62,3.5,.62,true);
    }
    // Rear wall: genuine framed light openings rather than a single blank wall.
    // The thin glazing shares the same physical wall boundary.
    const back=z-d/2,win=1.26,windowXs=[x-w*.25,x+w*.25];
    part('stone',x,.44,back,w,.88,.34,true);
    part(wall,x,2.88,back,w,1,.34,true);
    let edge=x-w/2;
    for(const wx of windowXs){
      const left=wx-win/2;
      part(wall,(edge+left)/2,1.63,back,left-edge,1.5,.34,true);
      part('clearGlass',wx,1.63,back,win,1.5,.095,true);
      for(const a of [-1,1]){
        part('bronze',wx+a*win/2,1.63,back,.095,1.56,.42);
        part('bronze',wx,1.63+a*.75,back,win+.15,.095,.42);
      }
      part('dark',wx,1.63,back,.055,1.46,.11);
      part('dark',wx,1.63,back,win,.055,.11);
      part('stone',wx,.83,back,win+.3,.13,.65);
      edge=wx+win/2;
    }
    part(wall,(edge+x+w/2)/2,1.63,back,x+w/2-edge,1.5,.34,true);
    // 2.1m clear central doorway; ceiling crossbeams and stone skirting.
    for(let ex=x-w/2+.55;ex<x+w/2-.4;ex+=1.26)
      part('wood',ex,3.30,z,.14,.18,d-.34);
    const sideWidth=(w-2.1)/2;
    for(const a of [-1,1]){
      const dx=a*(1.05+sideWidth/2);
      part(wall,x+dx,1.67,z+d/2,sideWidth,3.05,.34,true);
      part('dark',x+dx,2.04,z+d/2+.19,Math.min(1.22,sideWidth-.12),1.05,.05);
      part('bronze',x+dx,2.04,z+d/2+.23,.08,1.12,.07);
    }
    // Window glow is a presentation overlay only, not extra geometry collision.
    for(const wx of windowXs){
      const lit=new Mesh(box,glow);lit.position.set(wx,1.63,back-.055);lit.scale.set(win-.12,1.38,.025);lanterns.add(lit);
    }
    for(const a of [-1,1]){
      const lit=new Mesh(box,glow);lit.position.set(x+a*(1.05+sideWidth/2),2.04,z+d/2+.225);lit.scale.set(Math.min(1.10,sideWidth-.22),.95,.02);lanterns.add(lit);
    }
    part('ivory',x,3.12,z+d/2,2.1,.48,.52,true);
    part('bronze',x,3.44,z+d/2+.25,w+.38,.20,.33);
    // Layered stepped metal roof; beams and vents convey ship-component construction.
    for(let i=0;i<4;i++){
      part(use==='glasshouse'?'clearGlass':'copper',x,3.55+i*.25,z,w+.56-i*.73,.25,d+.65);
      part('bronze',x,3.62+i*.25,z-d/2-.36,w+.58-i*.73,.085,.12);
      part('bronze',x,3.62+i*.25,z+d/2+.36,w+.58-i*.73,.085,.12);
    }
    if(use!=='glasshouse'){
      part('dark',x+w*.29,4.45,z-1.0,.52,1,.52);
      part('bronze',x+w*.29,4.98,z-1.0,.74,.15,.74);
      // Ship-plate vocabulary from sky-14: staggered sandstone plinths,
      // oxidized seams, visible rivets, vent grilles, and roof glazing.
      for(const s of [-1,1]){
        const ex=x+s*(w/2+.015);
        for(let k=0;k<3;k++)for(let j=0;j<Math.floor(d/.68);j++){
          const nz=z-d/2+.36+j*.68+(k%2)*.16;
          if(nz>=z+d/2-.19)continue;
          part((j+k)%5?'sandstone':'mortar',ex,.16+k*.21,nz,.11,.19,.63);
        }
        for(let j=0;j<5;j++){
          const nz=z-d/2+.44+j*(d-.88)/4;
          part('bronze',ex,2.76,nz,.095,.13,.13);
          part('bronze',ex,1.08,nz,.095,.13,.13);
        }
        const fx=x+s*(w/2-1.02),fz=z+d/2+.20;
        part('mortar',fx,1.03,fz,1.04,.62,.12);
        for(let j=0;j<4;j++)part('slate',fx,.83+j*.13,fz+.075,.89,.065,.04);
        part('brass',fx,1.40,fz,.99,.085,.19);
      }
      for(let j=0;j<5;j++){
        const nz=z-d*.30+j*d*.15;
        part('bronze',x,4.36,nz,2.4,.11,.47);
        part('slate',x,4.43,nz,2.17,.08,.39);
        part('brass',x,4.48,nz,.035,.04,.39);
      }
      for(const ex of [x-w/2+.22,x+w/2-.22]){
        part('rust',ex,3.51,z,.17,.15,d+.77);
        part('bronze',ex,2.13,z+d/2+.25,.105,2.76,.13);
      }
    }else{
      for(const s of [-1,1])for(let j=0;j<5;j++){
        const nz=z-d/2+.15+j*(d-.3)/4;
        part('bronze',x+s*w/2,1.8,nz,.11,3.4,.10);
        part('bronze',x,4.03,nz,w-1.1,.13,.105);
      }
    }
    if(use==='home'){
      part('wood',x,1.35,z+d/2,2.1,2.7,.22,true);
      // Four homes use a common ship-plate language but different silhouettes.
      const variant=skyCityDistrictPlots.indexOf(p)%4;
      for(let i=0;i<8;i++)part(i%3?'wood':'sandstone',x-.91+i*.26,1.35,z+d/2+.14,.23,2.57,.05);
      for(const yy of [.48,2.18])part('bronze',x,yy,z+d/2+.18,1.96,.11,.07);
      part('brass',x+.61,1.28,z+d/2+.20,.15,.12,.10);
      for(const s of [-1,1]){
        part('stone',x+s*1.12,.18,z+d/2+.48,.38,.36,.62);
        part('wood',x+s*1.24,1.72,z+d/2+.44,.13,3.0,.15);
      }
      part('copper',x,3.11,z+d/2+.62,2.8,.16,1.27);
      for(let i=0;i<5;i++)part(i%2?'bronze':'copper',x-1.04+i*.52,3.24,z+d/2+.62,.45,.14,1.22);
      if(variant===0){
        for(let k=0;k<4;k++)part('sandstone',x,4.42+k*.17,z,3.0-k*.5,.17,2.4-k*.35);
        part('brass',x,5.13,z,.23,.48,.23);
      }else if(variant===1){
        part('slate',x-1.55,4.58,z,1.55,.32,2.6);
        for(let k=0;k<5;k++)part('bronze',x-2.22+k*.33,4.78,z,.10,.08,2.61);
      }else if(variant===2){
        for(let i=0;i<3;i++)part('copper',x+w*.28,4.55+i*.16,z+1.45,.9-i*.18,.16,.85-i*.13);
      }else{
        part('bronze',x-1.4,4.64,z,.35,.75,.35);
        part('slate',x-1.4,5.02,z,.59,.16,.59);
      }
      // Occupied-looking but empty doorstep: varied crates, ceramic and
      // folded linen, outside the established entrance and circulation lane.
      const px=x+w/2-.80,pz=z+d/2+.51;
      part('wood',px,.29,pz,.80,.58,.63,true);
      for(const a of [-1,1])part('bronze',px+a*.24,.29,pz+.33,.07,.57,.04);
      part('cloth',px,.62,pz,.49,.08,.43);
    }
    furniture(p);
    if(use!=='home'&&typeof document!=='undefined'){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=160;
      const context=canvas.getContext('2d');if(context){
        context.fillStyle='#65563f';context.fillRect(0,0,512,160);context.strokeStyle='#bda575';context.lineWidth=10;context.strokeRect(6,6,500,148);
        context.textAlign='center';context.textBaseline='middle';context.fillStyle='#f1e4bf';context.font='bold 66px Microsoft YaHei,sans-serif';context.fillText(p.name,256,80,460);
        const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
        const face=new Mesh(new PlaneGeometry(1.84,.58),new MeshBasicMaterial({map:texture}));
        face.position.set(x,3.14,z+d/2+.22);face.name='sky-district-sign-'+p.name;group.add(face);
      }
    }
    for(const a of [-1,1]){
      part('clay',x+a*(w/2-.48),.25,z+d/2+1,.62,.5,.62,true,0,column);
      part('leaf',x+a*(w/2-.48),.68,z+d/2+1,.75,.53,.75,false,.6);
    }
    // Paving on same island floor; no second collision terrain.
    for(let i=1;i<=3;i++)part('stone',x,.025,z+d/2+i*.85,2.15,.05,.82);
    if(supports(x-w/2-1,z+d/2+1,1))lamp(x-w/2-1,z+d/2+1);
  }
  // Beacon tower and assembly storage rack are outside the south landing lane.
  const bx=-16,bz=-39;
  if(supports(bx,bz,2.5)){
    part('stone',bx,.3,bz,3.2,.6,3.2,true);
    part('ivory',bx,3.8,bz,1.7,7,1.7,true);
    for(let i=0;i<6;i++)part('stone',bx,1+i*1.1,bz,1.94,.15,1.94);
    part('bronze',bx,7.5,bz,2.6,.32,2.6);
    part('glass',bx,8.0,bz,1.55,.72,1.55);
    part('copper',bx,8.52,bz,2.18,.31,2.18);
    part('bronze',bx,8.9,bz,.22,.5,.22);
    // Ref-28: weathered narrow masonry shaft and exposed crystal crown.
    for(let j=0;j<10;j++){
      const y=.56+j*.64;
      for(const a of [-1,1])for(const b of [-1,1]){
        part((j+a+b)%3?'sandstone':'mortar',bx+a*.75,y,bz+b*.75,.29,.59,.29);
      }
      part('mortar',bx,.82+j*.64,bz+.861,1.68,.035,.06);
    }
    for(const a of [-1,1]){
      part('mortar',bx+a*.87,4.32,bz,.08,4.9,.37);
      for(let k=0;k<3;k++)part('bronze',bx+a*.94,2.4+k*1.6,bz,.09,.13,.39);
    }
    for(let j=0;j<4;j++){
      const a=j*Math.PI/2;
      part('bronze',bx+Math.cos(a)*.93,8.0,bz+Math.sin(a)*.93,.17,1.02,.17);
    }
    part('stone',bx,9.14,bz,1.54,.25,1.54);
    const crystal=new Mesh(new OctahedronGeometry(.65,0),new MeshStandardMaterial({color:'#b0dcd0',roughness:.38,metalness:.15,emissive:'#77a99c',emissiveIntensity:.035}));
    crystal.name='sky-beacon-crystal-crown';crystal.scale.set(.85,1.55,.85);crystal.position.set(bx,10.05,bz);group.add(crystal);
    for(const s of [-1,1])for(let k=0;k<3;k++){
      part(k%2?'leaf':'pale',bx+s*(1.45+k*.22),.24,bz+1.28,.40,.38,.36,false,k*.8);
    }
  }
  const rx=12,rz=36;
  if(supports(rx,rz,5.2)){
    part('stone',rx,.03,rz,9.6,.06,7.6);
    for(const a of [-1,1]){
      part('wood',rx+a*3.1,1.25,rz-1.3,.22,2.5,.26,true);
      part('wood',rx+a*3.1,1.25,rz+1.3,.22,2.5,.26,true);
      part('bronze',rx+a*3.1,2.1,rz,.19,.18,2.8);
    }
    part('wood',rx,2.12,rz,6.5,.18,.18);
    // Fixed wing in its rack, above player head; not an actual inventory item.
    for(const a of [-1,1]){
      part('paper',rx+a*1.9,2.6,rz,3.7,.13,1.4,false,a*.12);
      part('wood',rx+a*1.9,2.51,rz,3.7,.07,.12);
    }
    for(const a of [-1,1])part('bronze',rx+a*4.1,.44,rz+2.8,.28,.88,.28,true);
    // A wing-shaped fabric skin with ribs and rigging, not just two planks.
    for(const a of [-1,1])for(let j=0;j<6;j++){
      const ex=rx+a*(.42+j*.58),depth=1.41-j*.12;
      part(j%2?'paper':'pale',ex,2.69,rz,.54,.085,depth,false,a*.12);
      part('wood',ex,2.60,rz,.062,.08,depth+.07,false,a*.12);
    }
    part('bronze',rx,2.62,rz,.26,.14,1.50);
    // Tool cabinet and rigging on the rack's rear, not in the landing aisle.
    part('wood',rx-3.65,.50,rz+1.7,.94,1,.55,true);
    for(let j=0;j<3;j++){part('bronze',rx-3.65,.36+j*.30,rz+1.39,.75,.07,.10);part('brass',rx-3.65,.45+j*.30,rz+1.36,.22,.05,.07)}
    const px=rx+4.0,pz=rz-2.6;
    part('stone',px,.18,pz,.52,.36,.52,true);
    part('bronze',px,2.1,pz,.12,3.85,.12,true);
    part('bronze',px,4.01,pz,.20,.14,.20);
    for(let j=0;j<5;j++)part(j%2?'rust':'paper',px-.16-j*.24,3.74-j*.10,pz,.26,.40-j*.055,.32-j*.045,false,-.10);

  }
  for(const [name,x,z] of [['陈星垣',-31,-19],['罗望舒',-20,12],['沈望云',18,-17]] as const){
    const point=new Object3D();point.name='sky-soul-anchor-'+name;point.position.set(x,0,z);anchorGroup.add(point);
  }
  for(const [key,batch] of batches){
    const mesh=new InstancedMesh(batch.geometry,batch.material,batch.matrices.length);mesh.name='sky-district-'+key;
    batch.matrices.forEach((matrix,index)=>{mesh.setMatrixAt(index,matrix);mesh.setColorAt(index,batch.tints[index]!)});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();group.add(mesh);
  }
  // Window overlays have the same transform and emissive material. One
  // instanced draw replaces dozens of independent meshes in the future dream.
  const overlays=lanterns.children.filter((o):o is Mesh=>o instanceof Mesh&&o.geometry===box&&o.material===glow);
  if(overlays.length){const batch=new InstancedMesh(box,glow,overlays.length);
    overlays.forEach((o,i)=>{o.updateMatrix();batch.setMatrixAt(i,o.matrix);lanterns.remove(o)});batch.computeBoundingSphere();lanterns.add(batch);
  }
  const warm=new PointLight('#ffc38b',12,22,2);warm.position.set(18,4,14);lanterns.add(warm);
  return {group,accepted,anchors:anchorGroup,
    setDreamLighting(active:boolean){lanterns.visible=active},
    blocked(x:number,z:number,feet:number,radius:number){
      return solids.some(s=>feet<s.y+s.h/2&&feet+1.8>s.y-s.h/2&&Math.hypot(
        Math.max(0,Math.abs(x-s.x)-s.w/2),Math.max(0,Math.abs(z-s.z)-s.d/2))<radius);
    },
  };
}
