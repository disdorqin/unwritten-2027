import {
  BoxGeometry, CanvasTexture, Color, DoubleSide, Group, InstancedMesh, Mesh,
  MeshBasicMaterial, MeshLambertMaterial, Object3D, PlaneGeometry, PointLight,
  SRGBColorSpace,
} from 'three';

/**
 * D4 terrace dressing / ref-m03 and m36.
 *
 * These pieces stay outside the accepted ZA-22 N=-13.3 main walkway
 * and outside the E24/N-19 starport workbench. No second runway/rack
 * or teleport mechanic is added.
 */
export const terraceFurnishingLayout = Object.freeze({
  benches: [
    { east: -3.0, north: -20.1, height: 347 },
    { east: 1.8, north: -20.1, height: 347 },
    { east: 5.7, north: -20.1, height: 347 },
  ],
  lanterns: [
    { east: -4.0, north: -18.5, height: 347 },
    { east: 2.5, north: -18.5, height: 347 },
    { east: 6.3, north: -18.5, height: 347 },
  ],
  supply: { east: 8.5, north: -19.1, height: 347 },
});
export const cloudTerraceText = Object.freeze({
  title:'云海台 · 旅人歇脚处',
  look:'铜铃之后，是石木长凳和给过路人留的干粮箱。云在栏杆外缓缓移动。',
  listen:'风吹过木栏，暖灯下面有很轻的铃响。',
  touch:'箱上还系着今年的新绳结。里面的干粮只作陈设，不能领取。',
});
type Material='slate'|'wood'|'bronze'|'rust'|'cloth'|'snow'|'light';
type Piece=Readonly<{kind:Material;x:number;y:number;z:number;w:number;h:number;d:number;rot?:number}>;
const tones:Record<Material,readonly string[]>={
 slate:['#465356','#5e655f','#79796d','#899185'],
 wood:['#534134','#77543b','#976b4c','#bb8c61'],
 bronze:['#9d8054','#c6ab74','#e2c78c'],
 rust:['#805038','#9a5c37','#6f5448'],
 cloth:['#bb4635','#d6ab70','#47665f','#d0c3a3'],
 snow:['#c8d5d4','#e1e7db'],
 light:['#f1bf73','#ffe4ae'],
};

function labelTexture():CanvasTexture|undefined{
  if(typeof document==='undefined')return;
  const canvas=document.createElement('canvas');
  canvas.width=512;canvas.height=208;
  const context=canvas.getContext('2d');
  if(!context)return;
  context.fillStyle='#4b3426';context.fillRect(0,0,512,208);
  context.strokeStyle='#caa572';context.lineWidth=8;context.strokeRect(15,15,482,178);
  context.textAlign='center';context.textBaseline='middle';
  context.fillStyle='#f3dfbe';context.font='bold 53px sans-serif';
  context.fillText('云海台',256,77);
  context.font='27px sans-serif';context.fillText('休憩 · 观景 · 旅人留物',256,147);
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;
  return texture;
}
export function buildCloudTerraceFurnishings(){
  const group=new Group();group.name='cloud-terrace-seven-round-furnishings';
  const pieces:Piece[]=[];
  const colliders:{x:number;z:number;w:number;d:number;h:number}[]=[];
  const lanterns:PointLight[]=[];
  const materials:(MeshBasicMaterial|MeshLambertMaterial)[]=[];
  const geometries:(BoxGeometry|PlaneGeometry)[]=[];
  const batches:InstancedMesh[]=[];
  const temp=new Object3D();const tint=new Color();
  let disposed=false;
  function add(kind:Material,x:number,y:number,z:number,w:number,h:number,d:number,rot=0){
    pieces.push({kind,x,y,z,w,h,d,rot});
  }
  function obstacle(x:number,north:number,w:number,d:number,h:number){
    colliders.push({x,z:-north,w,d,h});
  }
  // R4 real screenshot correction. A scattering of tiny stones made m03
  // read as separate objects on a flat field, not a continuous, habitable
  // ancient plaza. Build individual 0.66m cut flags with hairline mortar
  // joints across the LEFT apron and ring court. This is visual resurfacing
  // only; the true feet remain the original ZA-22/P-1 slab at Y347.
  // Critically DO NOT pave over E>=310.5/N662 starport departure markings.
  let pavementCount=0;
  for(let row=0;row<17;row++)for(let column=0;column<34;column++){
    const east=-12.3+column*.645, north=-21.8+row*.645;
    const westRingCourt=east>=-11.8&&east<=-4.25&&north>=-19.7&&north<=-12.1;
    const gateApron=east>=-5.7&&east<=5.6&&north>=-21.5&&north<=-11.9;
    const safeRidge=east>5.6&&east<9.55&&north>=-15.8&&north<=-12.0;
    if(!(westRingCourt||gateApron||safeRidge))continue;
    const seed=Math.abs((row*31+column*47)%17);
    const faded=(seed===2||seed===14);
    const stoneWidth=faded?.53:.608;
    const stoneDepth=seed===7?.53:.608;
    // Keep foot surface at +0.08m, a shallow step well within normal walk.
    add('slate',east,347.035,-north,stoneWidth,.07,stoneDepth,seed%11===0?.025:0);
    pavementCount++;
    if(seed===4||seed===8){
      add('snow',east+.12,347.083,-north+.1,.19,.026,.21);
    }
    if(seed===6)add('rust',east-.14,347.078,-north-.10,.16,.018,.045);
  }
  // A thin strip of hand-cut border stone follows the right-of-way without
  // touching the bronze runway's centreline. 32m of visible paved edge.
  for(let i=0;i<44;i++){
    const east=9.9+i*.61;
    const north=-16.39;
    add('slate',east,347.035,-north,.58,.07,.31);
    if(i%3===0)add('snow',east,347.074,-north,.28,.028,.17);
  }
  if(pavementCount<300)throw Error('Cloud terrace stone plaza unexpectedly sparse');
  // R7 aircraft-sweep correction: benches all stand on the southwest
  // plaza, at least 3m outside the 4.4m wide eastbound flight runway.
  // The airplane surveys its entire half-width 2.2m, not a .27m walker.
  for(const [index,p]of terraceFurnishingLayout.benches.entries()){
    const z=-p.north;
    for(const side of [-.78,.78]){
      add('slate',p.east+side,347.20,z,.28,.45,.49);
      add('wood',p.east+side,347.50,z+.10,.22,.12,.64);
    }
    for(let plank=0;plank<4;plank++){
      add('wood',p.east,347.52+plank*.03,z-.16+plank*.18,1.85,.09,.17);
      if(plank%2===0)add('bronze',p.east,347.62,z-.12+plank*.18,.13,.035,.18);
    }
    for(let plank=0;plank<4;plank++)
      add('wood',p.east,347.9+plank*.25,z+.38,1.85,.20,.11);
    for(const side of [-.9,.9]){
      add('rust',p.east+side,347.44,z+.35,.13,.88,.10);
      add('bronze',p.east+side,348.27,z+.38,.20,.09,.19);
    }
    obstacle(p.east,p.north,1.9,1.2,1.55);
    // Small carved, unsymmetrical snow patches make the wood lived-in.
    if(index%2===0)add('snow',p.east+.37,348.40,z+.44,.55,.08,.17);
  }
  // Windbreak stone fence and rail along the edge; deliberately preserve
  // the E22..26 starport approach with an open 4m gap.
  // Short west-only rail: the earlier E10..33 fence crossed the flight
  // aircraft's 2.2m wing sweep although a walking player could pass.
  for(let e=-2;e<=7;e+=1.75){
    const north=-16.36;
    add('slate',e,347.34,-north,.63,.68,.58);
    add('slate',e,347.77,-north,.66,.19,.65);
    if(Math.abs(e%7)<2){
      add('wood',e,348.38,-north,.16,1.04,.14);
      add('bronze',e,348.92,-north,.25,.09,.22);
    }else{
      add('wood',e,348.13,-north,.18,.46,.16);
    }
    if(e<-1.8||e>31)add('snow',e,347.86,-north,.42,.09,.37);
    obstacle(e,north,.70,.70,1.3);
  }
  // Two kinds of boxes, an old cargo bundle and a folded textile awning
  // sheltered at the west gate spur; no collectible items are minted.
  const s=terraceFurnishingLayout.supply, z=-s.north;
  for(let i=0;i<8;i++){
    const x=s.east+(i%4)*.65,z1=z+Math.floor(i/4)*.65;
    const h=.43+(i%3)*.13;
    add('wood',x,347+h/2,z1,.56,h,.54);
    for(const side of [-.19,.19])
      add('bronze',x+side,347+h-.04,z1,.055,.08,.52);
    if(i%2===0)add('rust',x,347+h+.035,z1,.48,.055,.11);
    if(i%3===0)add('snow',x+.1,347+h+.08,z1,.27,.09,.23);
  }
  obstacle(s.east+.98,s.north-.33,3.2,1.5,1.05);
  // Fine ropes and weathered pennants provide three distinct material
  // families; the actual player route remains free of hanging curtains.
  for(const x of [-4.2,-1.5,2.4,5.4]){
    for(let k=0;k<5;k++)
      add('cloth',x+.33*k,348.31+.05*Math.sin(k),20.48,
        .34,.22,.08,k*.13);
  }
  // Lanterns are physically attached to the railing, not free-floating
  // point lights. Exactly three true small-radius lights, each has a core.
  for(const [index,p]of terraceFurnishingLayout.lanterns.entries()){
    const z=-p.north;
    add('slate',p.east,347.26,z,.44,.52,.44);
    for(let i=0;i<6;i++)
      add('wood',p.east,347.54+i*.28,z,.17,.31,.17);
    add('bronze',p.east,349.17,z,.51,.12,.48);
    add('light',p.east,349.40,z,.30,.35,.30);
    add('bronze',p.east,349.66,z,.52,.12,.51);
    for(const side of [-.22,.22])for(const end of [-.22,.22])
      add('bronze',p.east+side,349.42,z+end,.045,.48,.05);
    const light=new PointLight('#ffcb88',.5,7.8,2);
    light.position.set(p.east,349.4,z);
    light.name='cloud-terrace-physical-lantern-'+index;
    group.add(light);
    lanterns.push(light);
    obstacle(p.east,p.north,.40,.40,2.65);
  }
  const geometry=new BoxGeometry(1,1,1);geometries.push(geometry);
  for(const kind of Object.keys(tones)as Material[]){
    const subset=pieces.filter(piece=>piece.kind===kind);
    if(!subset.length)continue;
    const material=kind==='light'
      ?new MeshBasicMaterial({color:'#ffffff'})
      :new MeshLambertMaterial({color:'#ffffff'});
    materials.push(material);
    const mesh=new InstancedMesh(geometry,material,subset.length);
    mesh.name='cloud-terrace-dressing-'+kind;
    subset.forEach((p,i)=>{
      temp.position.set(p.x,p.y,p.z);
      temp.rotation.set(0,p.rot||0,0);
      temp.scale.set(p.w,p.h,p.d);
      temp.updateMatrix();
      mesh.setMatrixAt(i,temp.matrix);
      mesh.setColorAt(i,tint.set(tones[kind][Math.abs(i*19+subset.length)%tones[kind].length]!));
    });
    mesh.computeBoundingSphere();group.add(mesh);batches.push(mesh);
  }
  // A full-size readable inscription, unlike decorative placeholder text.
  const wood=new MeshLambertMaterial({color:'#6b4932'});materials.push(wood);
  const boardGeom=new BoxGeometry(2.7,1.26,.18);geometries.push(boardGeom);
  const board=new Mesh(boardGeom,wood);
  board.name='cloud-terrace-complete-story-board';
  board.position.set(-5.3,348.62,18.06);
  group.add(board);
  const texture=labelTexture();
  const textGeom=new PlaneGeometry(2.52,1.05);geometries.push(textGeom);
  const textMat=new MeshBasicMaterial({color:'#f5ecd9',side:DoubleSide,...(texture?{map:texture}:{})});
  materials.push(textMat);
  const inscription=new Mesh(textGeom,textMat);
  inscription.name='cloud-terrace-printed-chinese-inscription';
  inscription.position.set(-5.3,348.62,18.16);
  group.add(inscription);

  function blocked(east:number,north:number,feet:number,radius:number,height:number){
    if(disposed||![east,north,feet,radius,height].every(Number.isFinite))return false;
    if(feet+height<346.9||feet>351)return false;
    return colliders.some(c=>Math.abs(east-c.x)<radius+c.w/2&&
      Math.abs(-north-c.z)<radius+c.d/2&&feet<347+c.h);
  }
  function setNight(night:boolean){
    if(disposed)return;
    lanterns.forEach(light=>light.intensity=night?1.0:.18);
  }
  let inspectionCount=0;
  function interact(what:'view'|'listen'|'touch',
    player:Readonly<{east:number;north:number;height:number}>,authorized:boolean){
    if(disposed||!authorized)return {accepted:false as const,message:'先到云海台。'};
    if(![player?.east,player?.north,player?.height].every(Number.isFinite)||
      Math.hypot(player.east-s.east,player.north-s.north)>3.9||
      Math.abs(player.height-s.height)>1.75)return {accepted:false as const,message:'离旅人货箱还远。'};
    inspectionCount++;
    return {accepted:true as const,message:what==='view'?cloudTerraceText.look:
      what==='listen'?cloudTerraceText.listen:cloudTerraceText.touch};
  }
  return{
    group, lanterns,blocked,interact,setNight,
    count:pieces.length,
    draws:batches.length+2,
    layout:terraceFurnishingLayout,
    hasTextTexture:Boolean(texture),
    get inspections(){return inspectionCount;},
    dispose(){
      if(disposed)return;disposed=true;group.removeFromParent();group.clear();
      batches.forEach(batch=>batch.dispose());
      geometries.forEach(g=>g.dispose());
      materials.forEach(m=>m.dispose());
      texture?.dispose();
    },
  };
}
