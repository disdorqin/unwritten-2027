import {
  BoxGeometry, Color, DataTexture, Group, InstancedMesh, Matrix4,
  MeshLambertMaterial, NearestFilter, RGBAFormat, SRGBColorSpace,
} from 'three';

/**
 * U-11 companion model: seven-pass palace environmental dressing.
 *
 * This module is a purely visual additive layer for Window D's existing
 * underground-palace-shell local frame (east, floorY, north). It deliberately
 * does NOT import or replace that shell, publish a domain, claim colliders,
 * open gates, award loot, spawn monsters, or register interactables.
 *
 * Shell reference: origin/lane-d underground-palace-shell.ts, 2026-11-21.
 * World location/depth comes from the U-4/U-15 authority, never from this file.
 * Decorative parts stay within existing rooms and above the walking envelope.
 */
export type PalaceDressingFamily =
  | 'stone' | 'shadow' | 'blue' | 'gold' | 'aged' | 'wood' | 'ash' | 'pale';
export type PalaceDressingZone =
  | 'broken-steps' | 'colonnade' | 'side-passage' | 'throne'
  | 'exit-shrine' | 'forecourt' | 'vault-antechamber' | 'vault-display';
type Triple = readonly [number, number, number];
export type PalaceDressingPiece = Readonly<{
  name: string; zone: PalaceDressingZone; family: PalaceDressingFamily;
  center: Triple; size: Triple;
}>;
const floor = -2.4;
const masonry: PalaceDressingPiece[] = [];
const palette: Record<PalaceDressingFamily, readonly [number, number, number]> = {
  stone: [0x686e7c, 0x777b88, 0x535e6b],
  shadow: [0x353b49, 0x464d59, 0x222d3d],
  blue: [0x435968, 0x546e7b, 0x374958],
  gold: [0x947346, 0xaa8753, 0x5e523f],
  aged: [0x74716b, 0x8b867b, 0x615d5b],
  wood: [0x5c4538, 0x6e5342, 0x463730],
  ash: [0x36363b, 0x484249, 0x242932],
  pale: [0x99979c, 0xb2b0aa, 0x777984],
};
const allFamilies = Object.keys(palette) as PalaceDressingFamily[];
function piece(
  zone: PalaceDressingZone, family: PalaceDressingFamily, name: string,
  e: number, y: number, n: number, width: number, height: number, depth: number,
) {
  if (![e,y,n,width,height,depth].every(Number.isFinite) ||
      width <= 0 || height <= 0 || depth <= 0) throw new Error('invalid palace part ' + name);
  masonry.push(Object.freeze({
    zone, family, name,
    center: [e, y, n] as const,
    size: [width, height, depth] as const,
  }));
}
function add(
  zone: PalaceDressingZone, family: PalaceDressingFamily, name: string,
  e: number, y: number, n: number, w: number, h: number, d: number,
) { piece(zone, family, name, e, y, n, w, h, d); }
function stairHall() {
  // First passage: 16 descending, individually worn carved steps. The shell
  // owns the actual tread/colliders: this model adds *side* courses only.
  for (let n = 0; n < 16; n++) {
    const y = -n * .15;
    for (const side of [-1, 1]) {
      for (let course = 0; course < 7; course++) {
        const e = side * (2.65 + course * .18);
        add('broken-steps', (n+course)%5===0?'aged':'stone',
          'u11/steps/side-block-'+n+'-'+side+'-'+course,
          e, y - .09 + course * .075, n + .5, .2,.16,.86);
      }
      // Ancient foundation segments, not columns blocking the center.
      if (n === 3 || n === 8 || n === 13) for (let tier=0;tier<8;tier++)
        add('broken-steps',tier%4?'blue':'aged',
          'u11/steps/pier-'+n+'-'+side+'-'+tier,
          side*3.75,y+tier*.19,n+.5, .52,.16,.8);
    }
    // Wear/ruts are at each side of the tread, flush with existing shell.
    for (const side of [-1,1]) for (let chip=0;chip<5;chip++)
      add('broken-steps','shadow','u11/steps/rut-'+n+'-'+side+'-'+chip,
        side*(1.0+chip*.14),y+.004,n+.46,.11,.008,.38);
  }
  // One first-appearance spiral ram-horn relief only on each pier foot.
  for(const e of [-3.76,3.76]) for(let i=0;i<10;i++){
    const a=i*.43, radius=.13+i*.014;
    add('broken-steps','aged','u11/steps/early-ram-'+e+'-'+i,
      e+Math.cos(a)*radius,-.24+Math.sin(a)*radius,8.8,
      .06,.065,.025);
  }
}
function buildColonnade() {
  // Window D's twelve structural columns already carry weight. Our flutes,
  // torus-like block capitals, wall fret and lamp niches make a real interior.
  for (const side of [-1,1]) for (const n of [20,25,30,35,40,45]) {
    const e=side*5.5, stem='u11/colonnade/'+side+'/'+n;
    for (let tier=0;tier<31;tier++) for (let k=0;k<4;k++) {
      const around = k * Math.PI/2;
      const rad=.61+(tier%7===0?.06:0);
      add('colonnade',tier%9===0?'gold':k===0?'aged':'blue',
        stem+'/flute-'+tier+'-'+k,
        e+Math.sin(around)*rad,floor+.76+tier*.224,n+Math.cos(around)*rad,
        .14,.205,.14);
    }
    for(let t=0;t<6;t++) for(let k=0;k<8;k++){
      const a=k*Math.PI/4, radius=.74+t*.025;
      add('colonnade',t%3===0?'aged':'stone',stem+'/cap-'+t+'-'+k,
        e+Math.sin(a)*radius,floor+7.72+t*.085,n+Math.cos(a)*radius,
        .19,.08,.19);
    }
    // Paired, non-lettered sheep-horn motifs belong to the original stone only.
    for(const flip of [-1,1]) for(let i=0;i<12;i++){
      const a=i*.39, radius=.20+i*.016;
      add('colonnade','aged',stem+'/ram-'+flip+'-'+i,
        e+flip*.4+Math.cos(a)*radius,floor+4.6+Math.sin(a)*radius,
        n-.62,.055,.064,.034);
    }
  }
  // Stepped coffered ceiling across the 34m hall (above nine-metre columns).
  for (let n=18;n<47;n+=1.25) for(let band=0;band<11;band++){
    const e=(band-5)*1.15;
    add('colonnade',(band+n)%5<1?'gold':'shadow',
      'u11/colonnade/coffer-'+n+'-'+band,
      e,floor+10.80+((band+20)%3)*.08,n,.82,.14,.78);
  }
  // Side-passage collapsed turn: exterior wall scorch rays, not writing,
  // and broken lintels hung above the approved passage. No fake doorway.
  for(let ray=0;ray<30;ray++){
    const a=ray*Math.PI*2/30;
    for(let step=1;step<12;step++){
      add('side-passage',step%3===0?'shadow':'ash',
        'u11/side/soot-'+ray+'-'+step,
        13.94,floor+3.5+Math.sin(a)*step*.27,
        56+Math.cos(a)*step*.27,
        .029,.18+(step%3)*.06,.20);
    }
  }
  for (let n=49;n<68;n+=1.2) {
    for(let k=0;k<5;k++)
      add('side-passage',k===0?'gold':'blue',
        'u11/side/roof-cassette-'+n+'-'+k,
        10.8+k*.65,floor+7.15+(k%2)*.06,n,.36,.15,.82);
    for(const edge of [10.3,13.65]) for(let c=0;c<5;c++)
      add('side-passage',c===2?'aged':'stone',
        'u11/side/fold-'+n+'-'+edge+'-'+c,
        edge,floor+.9+c*1.12,n,.17,.34,.56);
  }
}
function buildThrone() {
  // The main chamber is empty by story contract: no enemies, treasure or seat.
  // Ornament densely fills side walls/upper vault, never the 2m walk axis.
  for (const side of [-1,1]) for(let n=67;n<97;n+=.73){
    for(let tier=0;tier<13;tier++){
      add('throne',tier%5===0?'gold':tier%3===0?'aged':'blue',
        'u11/throne/wall-course-'+side+'-'+n+'-'+tier,
        side*14.52,floor+.78+tier*1.02,n,.18,.31,.62);
    }
  }
  for(let row=0;row<17;row++) for(let col=0;col<25;col++){
    const e=(col-12)*1.1, n=68+row*1.62;
    add('throne',(row+col)%11===0?'gold':'shadow',
      'u11/throne/ceiling-stars-'+row+'-'+col,
      e,floor+15.70+(col%3)*.04,n,.5,.12,.48);
  }
  // Base relief: group horns around ALL FOUR sides but no creatures in hall.
  for(const side of [-1,1]) for(let i=0;i<40;i++){
    const n=78.3+i*.14, e=side*4.25;
    add('throne',i%6===0?'gold':'aged',
      'u11/throne/plinth-face-'+side+'-'+i,
      e,floor+.52+(i%5)*.085,n,.08,.13,.11);
  }
  for(const side of [-1,1]) for(let i=0;i<36;i++){
    const e=-3.9+i*.22, n=81+side*3.47;
    add('throne',i%7===0?'gold':'aged',
      'u11/throne/plinth-rim-'+side+'-'+i,
      e,floor+.44+(i%5)*.07,n,.16,.1,.07);
  }
  // Only ONE five-finger hand mark, carved beside the empty seat imprint.
  // It is an unlabelled physical mark, never a pickup or lore caption.
  const palmE=-4.23, palmN=80.85;
  for(let i=0;i<5;i++) for(let j=0;j<5-i;j++)
    add('throne','shadow','u11/throne/one-hand/palm-'+i+'-'+j,
      palmE-.008,floor+.17+i*.055,palmN+(j-2)*.07,
      .017,.045,.05);
  for(let finger=0;finger<5;finger++) for(let j=0;j<6+(finger===2?2:0);j++)
    add('throne','shadow','u11/throne/one-hand/finger-'+finger+'-'+j,
      palmE-.008,floor+.31+j*.048,palmN+(finger-2)*.13,
      .017,.043,.044);
}
function buildExitShrine() {
  // Boundary between empty throne chamber and arena; stone tablet remains blank.
  for (let i=0;i<24;i++) {
    const edge=i%2?-1:1;
    add('exit-shrine',i%7===0?'gold':'blue','u11/exit/arch-'+i,
      edge*(3.42-(i%12)*.036),floor+4.05+Math.sin((i%12)/12*Math.PI)*2.0,
      98.25,.20,.29,.67);
  }
  for(let i=0;i<13;i++) for(let k=0;k<7;k++) {
    const e=2.15+(k-3)*.12;
    add('exit-shrine',i%3===0?'aged':'stone',
      'u11/exit/tablet-border-'+i+'-'+k,
      e,floor+.30+i*.105,101.14,.115,.09,.06);
  }
  // The tablet's centre intentionally has no inscriptions.
  for(let i=0;i<12;i++) for(let j=0;j<5;j++){
    const border = i===0||i===11||j===0||j===4;
    if(!border) continue;
    add('exit-shrine',j%2?'gold':'aged',
      'u11/exit/tablet-frame-'+i+'-'+j,
      2.55+(j-2)*.16,floor+.12+i*.145,101.5,
      .15,.135,.10);
  }
  // Fire reserve (-2.6,100.8) is ONLY unlit stone support; U-13 owns fire.
  for(let ring=0;ring<3;ring++) for(let k=0;k<16;k++){
    const a=k*Math.PI/8,r=1.1+ring*.18;
    add('exit-shrine','aged','u11/exit/firepit-border-'+ring+'-'+k,
      -2.6+Math.sin(a)*r,floor+.08+ring*.045,100.8+Math.cos(a)*r,
      .23,.12,.24);
  }
}
function buildForecourt() {
  const cx=0,cn=126;
  // Rim of the existing D shell semicircle: 80 low radial courses,
  // with a clean south open approach and no obstacle at arena centre.
  for(let radial=0;radial<80;radial++){
    const theta=(radial/79)*Math.PI;
    for(let ring=0;ring<7;ring++){
      const r=20.5+ring*.23;
      add('forecourt',radial%9===0?'gold':'stone',
        'u11/arena/apron-'+radial+'-'+ring,
        cx+Math.cos(theta)*r,floor-.11+ring*.006,
        cn-Math.sin(theta)*r,.19,.075,.19);
    }
  }
  // Six approved residual cover columns from D shell; only surface flutes,
  // not additional colliders or damageable gameplay.
  const cover=[
    {r:9,a:[-.86,-.30,.65],kind:'inner'},
    {r:16,a:[-1.04,.18,.96],kind:'outer'},
  ];
  for(const c of cover) for(let slot=0;slot<3;slot++){
    const e=Math.sin(c.a[slot]!)*c.r;
    const n=cn-Math.cos(c.a[slot]!)*c.r;
    const prefix='u11/arena/'+c.kind+'-'+slot;
    for(let row=0;row<12;row++) for(let side=0;side<8;side++){
      const a=side*Math.PI/4;
      add('forecourt',row%4===0?'gold':'blue',
        prefix+'/column-skin-'+row+'-'+side,
        e+Math.sin(a)*.75,floor+.12+row*.105,n+Math.cos(a)*.75,
        .13,.09,.14);
    }
  }
  // Rock-face facade frames the nine metre high gateway; stays out of passage.
  for(const edge of [-1,1]) for(let tier=0;tier<22;tier++){
    for(let band=0;band<3;band++)
      add('forecourt',tier%7===0?'gold':'blue',
        'u11/arena/gate-jamb-'+edge+'-'+tier+'-'+band,
        edge*(4.4+band*.34),floor+.22+tier*.43,
        125.35+band*.24,.25,.39,.32);
  }
  for(let band=0;band<31;band++)
    add('forecourt',band%3?'gold':'aged','u11/arena/gate-crown-'+band,
      -5.3+band*.353,floor+9.85+(band%3)*.03,125.3,.32,.16,.55);
}
function buildVaultReserve() {
  // Only a visual, optional vault-interior continuation beyond D's blind wall.
  // It is NOT attached until U-5 authorizes the door and the host opens it.
  // No collectable pages or minerals are registered here.
  for(let n=128;n<166;n++){
    for(let e=-9;e<=9;e++){
      add('vault-antechamber',(e+n)%13===0?'gold':'stone',
        'u11/vault/floor-'+e+'-'+n,e,floor-.15,n,.92,.26,.94);
      add('vault-antechamber',(e+n)%19===0?'gold':'shadow',
        'u11/vault/vaulted-ceiling-'+e+'-'+n,
        e,floor+11.8-Math.abs(e)*.17,n,.91,.2,.94);
    }
  }
  for(const side of [-1,1]) for(let n=127;n<167;n++){
    for(let tier=0;tier<13;tier++){
      add('vault-antechamber',tier%8===0?'gold':'blue',
        'u11/vault/wall-'+side+'-'+n+'-'+tier,
        side*9.5,floor+.5+tier*.83,n,.48,.73,.86);
    }
  }
  // Pedestals and sealed display frames only; no invented loot or text.
  for(const side of [-1,1]) for(let station=0;station<3;station++){
    const n=137+station*9, e=side*6.5;
    for(let step=0;step<12;step++){
      add('vault-display',step%4===0?'gold':'aged',
        'u11/vault/sealed-base-'+side+'-'+station+'-'+step,
        e,floor+step*.1,n,2.8-step*.09,.085,2.3-step*.07);
    }
    for(const edge of [-1,1]) for(let row=0;row<15;row++){
      add('vault-display','blue',
        'u11/vault/sealed-casket-'+side+'-'+station+'-'+edge+'-'+row,
        e+edge*.70,floor+1.2+row*.13,n,
        .14,.115,.54);
    }
  }
  // Gold-sheep DISPLAY PEDESTAL only; the canonical sheep model will be
  // provided by the shared collectible catalogue and remains unpickable.
  for(let tier=0;tier<17;tier++) for(let k=0;k<14;k++){
    const a=k*Math.PI/7, r=2.65-Math.min(tier,10)*.09;
    add('vault-display',tier%6===0?'gold':'aged',
      'u11/vault/central-dais-'+tier+'-'+k,
      Math.sin(a)*r,floor+.08+tier*.095,154+Math.cos(a)*r,
      .31,.085,.32);
  }
  // The core airlock itself is the authority-owned sealed gateway. A recessed
  // incomplete circle motif is purely physical and has NO open action.
  for(let i=0;i<44;i++){
    if(i===5||i===6||i===7)continue;
    const a=i*Math.PI/22;
    add('vault-display','pale','u11/vault/locked-ring-'+i,
      Math.cos(a)*1.10,floor+5.4+Math.sin(a)*1.10,165.55,.12,.12,.044);
  }
}
stairHall();
buildColonnade();
buildThrone();
buildExitShrine();
buildForecourt();
buildVaultReserve();

export const undergroundPalaceDressing = Object.freeze({
  pieces: Object.freeze(masonry),
  zoneCounts: Object.freeze(Object.fromEntries(
    (['broken-steps','colonnade','side-passage','throne','exit-shrine','forecourt',
      'vault-antechamber','vault-display'] as const).map(zone =>
        [zone,masonry.filter(x=>x.zone===zone).length]))),
  vaultIsGated: true as const,
  motifs: Object.freeze({earlyRamPairs:1,colonnadePairs:12,uniqueHandMarks:1,coreClosed:1}),
  lightSockets: Object.freeze([
    { east:-5.7, height:floor+6.2, north:27 },
    { east:5.7, height:floor+6.2, north:40 },
    { east:-13, height:floor+8.2, north:82 },
    { east:13, height:floor+8.2, north:82 },
    { east:0, height:floor+9.6, north:125 },
  ]),
});
function pixelTexture(seed:number) {
  const raw=new Uint8Array(16*16*4);
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const i=(y*16+x)*4, noise=(x*41+y*71+seed*79+((x*y)%11)*13)%27;
    const shade=202+noise;
    raw[i]=shade; raw[i+1]=shade; raw[i+2]=shade; raw[i+3]=255;
  }
  const tex=new DataTexture(raw,16,16,RGBAFormat);
  tex.colorSpace=SRGBColorSpace;
  tex.magFilter=NearestFilter; tex.minFilter=NearestFilter;
  tex.generateMipmaps=false; tex.needsUpdate=true;
  return tex;
}

/** Mount explicitly as a visual sub-layer; canonical scene host handles physics. */
export function mountUndergroundPalaceDressing(parent: Group, includeVault=false) {
  const group=new Group();
  group.name='u11-palace-dressing-reviewable';
  const meshes:InstancedMesh[]=[];
  const owned:{geo:BoxGeometry;mat:MeshLambertMaterial;tex:DataTexture}[]=[];
  const root=new Group();
  group.add(root);
  for(const [index,family] of allFamilies.entries()){
    const entries=masonry.filter(p=>p.family===family &&
      (includeVault || (p.zone!=='vault-antechamber' && p.zone!=='vault-display')));
    if(entries.length===0) continue;
    const geo=new BoxGeometry(1,1,1);
    const tex=pixelTexture(index);
    const mat=new MeshLambertMaterial({map:tex,color:0xffffff});
    const mesh=new InstancedMesh(geo,mat,entries.length);
    const matrix=new Matrix4(), tint=new Color();
    for(const [j,p] of entries.entries()){
      const [e,y,n]=p.center, [w,h,d]=p.size;
      matrix.makeScale(w,h,d).setPosition(e,y,-n);
      mesh.setMatrixAt(j,matrix);
      mesh.setColorAt(j,tint.setHex(palette[family][j%3]!));
    }
    mesh.instanceMatrix.needsUpdate=true;
    mesh.instanceColor!.needsUpdate=true;
    mesh.computeBoundingSphere();
    mesh.name='u11-'+family;
    root.add(mesh);meshes.push(mesh);owned.push({geo,mat,tex});
  }
  parent.add(group);
  let disposed=false;
  return {
    group,meshes,visualPieceCount:meshes.reduce((sum,m)=>sum+m.count,0),
    isVaultPresent:includeVault,
    dispose(){
      if(disposed)return;
      disposed=true; group.removeFromParent();
      for(const mesh of meshes)mesh.dispose();
      for(const {geo,mat,tex} of owned){geo.dispose();mat.dispose();tex.dispose();}
      group.clear();
    },
  };
}
