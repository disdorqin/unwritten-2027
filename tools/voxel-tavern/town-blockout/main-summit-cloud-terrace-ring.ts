import {
  BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial,
  MeshLambertMaterial, Object3D,
} from 'three';

/**
 * D4 / ref-m03, m34, m82: fully built, genuinely hollow starport stone ring.
 *
 * The ring is an optically readable monument, not the separate ZD-05
 * transfer authority. It MUST NOT act as a teleport trigger.
 *
 * Surveyed host position (P-1 local):
 * E -8 / N -15 / Y 347  = world E292 N661 Y347.
 * West of the E310.5..351.5/N662 flight runway and west of the E324 starport.
 */
export const cloudStoneRingAnchor = Object.freeze({ east: -8, north: -15, height: 347 });
export const cloudStoneRingCopy = Object.freeze({
  title: '云海台 · 星港石环',
  look: '石环里盛着云。微弱的青辉，只沿着内侧旧刻槽流动。',
  listen: '风穿过断开的环顶，像远处有人拨了一下铜铃。',
  touch: '掌心是冷的。环上残存的刻纹没有回应，也没有打开任何通道。',
});

type Hue = 'bedrock'|'cut-stone'|'weathering'|'frost'|'copper'|'aqua'|'runes';
type Piece = Readonly<{
  material: Hue; x:number; y:number; z:number; w:number; h:number; d:number;
  yaw?:number; tilt?:number;
}>;
const palette: Readonly<Record<Hue,readonly string[]>> = {
  bedrock:['#424c49','#5e6b65','#68736c','#7f8476'],
  'cut-stone':['#716e61','#8a8b7a','#a39c86','#505e5a','#596769'],
  weathering:['#59654c','#5e7868','#8c896f'],
  frost:['#c5d0cd','#e4e7da','#a5b7ba'],
  copper:['#8e784e','#bc9c65','#cab586'],
  aqua:['#5c9392','#6caea6','#8bbfb4'],
  runes:['#346c70','#6c9f95'],
};

export function buildCloudStoneRing() {
  const group = new Group();
  group.name = 'cloud-terrace-starport-stone-ring';
  group.position.set(cloudStoneRingAnchor.east,cloudStoneRingAnchor.height,-cloudStoneRingAnchor.north);
  const pieces:Piece[]=[];
  const mats:(MeshLambertMaterial|MeshBasicMaterial)[]=[];
  const geometry=new BoxGeometry(1,1,1);
  const batches:InstancedMesh[]=[];
  const temp=new Object3D();
  const tint=new Color();
  function add(material:Hue,x:number,y:number,z:number,w:number,h:number,d:number,yaw=0,tilt=0){
    if(![x,y,z,w,h,d,yaw,tilt].every(Number.isFinite)||Math.min(w,h,d)<=0)throw Error('Bad stone ring facet');
    pieces.push({material,x,y,z,w,h,d,yaw,tilt});
  }
  // A real half-meter-high plinth of irregular chiseled blocks, supported
  // by the existing P-1 platform. Its east-west line is the readable rim
  // in front of the clouds in ref-m03.
  for(let xi=-14;xi<=14;xi++)for(let zi=-5;zi<=5;zi++){
    const x=xi*.27,z=zi*.27,edge=Math.pow(x/3.95,4)+Math.pow(z/1.65,4);
    if(edge>1.05)continue;
    const seed=Math.abs((xi*31+zi*47)%13);
    add('bedrock',x,-.17,z,.265,.35,.26);
    if(seed===1||seed===6) add('weathering',x,.016,z,.23,.035,.22);
    if(seed===9) add('frost',x,.045,z,.20,.06,.20);
  }
  // Two real foot blocks and three stabilization teeth flank the doorway.
  for(const side of [-1,1]){
    for(let x=0;x<3;x++){
      add('cut-stone',side*(2.42+x*.35),.32,0,.51,.58,1.12,.13*side);
      if(x===1)add('weathering',side*2.9,.665,-.2,.32,.08,.69);
    }
    add('bedrock',side*3.06,.10,-1.03,.86,.64,.88);
    add('frost',side*3.06,.48,-1.03,.72,.10,.68);
  }
  // Three-layer ring, stones with physical radial depth and irregular relief.
  // Forty-four measured slices; only 40 survive due to the broken crest.
  // Main material is intentionally dark: night ref-m82 inner edge is an
  // understated SINGLE turquoise line, never a neon billboard.
  const slices=48, radius=3.01;
  let blocks=0;
  let missing=0;
  for(let index=0;index<slices;index++){
    const a=index/slices*Math.PI*2;
    const upperRight=Math.cos(a)>.32&&Math.sin(a)>.84;
    if(upperRight){missing++;continue;}
    for(let layer=0;layer<3;layer++){
      const r=radius+(layer-1)*.33;
      const x=Math.cos(a)*r,y=3.53+Math.sin(a)*r;
      const chip=Math.abs(index*23+layer*17)%11;
      const core=palette['cut-stone'][chip%palette['cut-stone'].length]!;
      add('cut-stone',x,y,layer===1?0:(layer-1)*.28,
        .61,.36,.53,-a, a+Math.PI/2);
      if((index+layer)%4===0){
        add('weathering',x*1.014,y+.09,(layer-1)*.30+.31,
          .42,.10,.16,-a,a+Math.PI/2);
      }
      // Intricate radial chips and shaded bedding joints are actual blocks.
      if(layer===1&&index%3===0){
        add('bedrock',x+.06,y-.07,-.37,.18,.35,.12,-a,a+Math.PI/2);
      }
      if(chip===1&&layer===2){
        add('frost',x-.02,y+.21,.30,.44,.13,.17,-a,a+Math.PI/2);
      }
      blocks++;
      void core;
    }
    // One *inner* circle of cyan stone inlays. Individual short facets
    // prevent a giant glowing disc and preserve visible masonry joints.
    const inner=radius-.46;
    const x=Math.cos(a)*inner,y=3.53+Math.sin(a)*inner;
    add('runes',x,y,.38,.32,.075,.14,-a,a+Math.PI/2);
    if(index%4===0)
      add('copper',x*.995,y-.06,.43,.12,.17,.14,-a,a+Math.PI/2);
  }
  // Fragment lying beneath the top-right missing segment: the gap must
  // look intentionally weathered and carry a story, not like a mesh bug.
  for(let i=0;i<17;i++){
    const x=2.4+(i%5)*.24,z=-.75+Math.floor(i/5)*.24;
    add(i%3?'cut-stone':'weathering',x,.48+(i%2)*.1,z,.20,.31,.22,i*.27);
  }
  for(const family of Object.keys(palette)as Hue[]){
    const section=pieces.filter(p=>p.material===family);
    if(!section.length)continue;
    const material=family==='runes'
      ? new MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.53,depthWrite:false})
      : new MeshLambertMaterial({color:'#ffffff'});
    mats.push(material);
    const batch=new InstancedMesh(geometry,material,section.length);
    batch.name='cloud-stone-ring-'+family;
    section.forEach((p,i)=>{
      temp.position.set(p.x,p.y,p.z);
      temp.rotation.set(0,p.yaw||0,p.tilt||0);
      temp.scale.set(p.w,p.h,p.d);
      temp.updateMatrix();
      batch.setMatrixAt(i,temp.matrix);
      batch.setColorAt(i,tint.set(palette[family][Math.abs(i*7+section.length)%palette[family].length]!));
    });
    batch.computeBoundingSphere();
    group.add(batch);
    batches.push(batch);
  }
  const luminous=mats.find((m)=>m instanceof MeshBasicMaterial)as MeshBasicMaterial;
  let disposed=false;
  let touched=0;
  function blocked(east:number,north:number,feet:number,radius:number,height:number){
    if(disposed||![east,north,feet,radius,height].every(Number.isFinite))return false;
    const x=east-cloudStoneRingAnchor.east, z=-(north-cloudStoneRingAnchor.north);
    const relY=feet-cloudStoneRingAnchor.height;
    if(relY>7.6||relY+height<-.8)return false;
    // The chiseled plinth is a low step, not a solid invisible wall across
    // the entire opening; the player may step through the inner arch.
    // Only the true left/right massive stone feet stop a standing player.
    return Math.abs(x)>2.35&&Math.abs(x)<3.65&&Math.abs(z)<.76 &&
      relY<1.35&&relY+height>0;
  }
  function touch(player:Readonly<{east:number;north:number;height:number}>,authorized:boolean){
    if(disposed||!authorized)return {accepted:false as const,message:'石环没有回应。'};
    if(![player.east,player.north,player.height].every(Number.isFinite)||
      Math.hypot(player.east-cloudStoneRingAnchor.east,player.north-cloudStoneRingAnchor.north)>4.2||
      Math.abs(player.height-cloudStoneRingAnchor.height)>1.65)
      return {accepted:false as const,message:'先走近石环下方。'};
    touched++;
    return {accepted:true as const,message:cloudStoneRingCopy.touch};
  }
  return{
    group,anchor:cloudStoneRingAnchor,
    count:pieces.length,segmentCount:blocks,missingSlices:missing,
    draws:batches.length,
    touch,blocked,
    get touches(){return touched;},
    setNight(night:boolean){if(disposed)return;luminous.opacity=night ? .63 : .53;},
    dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.clear();
      geometry.dispose();mats.forEach(m=>m.dispose());batches.forEach(b=>b.dispose());},
  };
}
